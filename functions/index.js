const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Peka på TEST-RTDB: notestreamfire (inte live)
admin.initializeApp({
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app"
});

const db = admin.database();

/**
 * Callable: hostStart
 * data: { gameId: string }
 * auth: kräver inloggning (anon auth räcker)
 */
exports.hostStart = functions.region("europe-west1").https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  const gameId = data?.gameId;
  if (!uid || !gameId) {
    throw new functions.https.HttpsError("failed-precondition", "auth/gameId required");
  }

  const gameRef = db.ref(`games/${gameId}`);
  const snap = await gameRef.get();
  if (!snap.exists()) {
    throw new functions.https.HttpsError("not-found", "game/not-found");
  }
  const game = snap.val();

  if (game.hostId !== uid) {
    throw new functions.https.HttpsError("permission-denied", "permission/only-host");
  }
  if (game.phase !== "lobby") {
    throw new functions.https.HttpsError("failed-precondition", "state/not-lobby");
  }

  const teamsObj = game.teams || {};
  const teamIds = Object.keys(teamsObj);
  if (teamIds.length < 1) {
    throw new functions.https.HttpsError("failed-precondition", "teams/empty");
  }

  const settings = game.settings || {};
  const yearMin = Number.isFinite(settings.yearMin) ? settings.yearMin : 1900;
  const yearMax = Number.isFinite(settings.yearMax) ? settings.yearMax : 2100;
  const tokensPerTeam = Number.isFinite(settings.tokensPerTeam) ? settings.tokensPerTeam : 4;

  // ---- 1) Läs spellistor och bygg pool ----
  function coerceYear(y) {
    if (y == null) return NaN;
    if (typeof y === "number") return y;
    if (typeof y === "string") {
      const n = parseInt(y, 10);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  async function readTracksFromListNode(refPathToListRoot) {
    const s = await db.ref(refPathToListRoot).get();
    if (!s.exists()) return [];
    const node = s.val() || {};
    // Stöd tre varianter: /list/songs, /list/tracks, eller direkt /list
    const tracksNode = node.songs || node.tracks || node;

    const out = [];
    for (const k of Object.keys(tracksNode)) {
      const t = tracksNode[k];
      if (!t || typeof t !== "object") continue;
      const spotifyId = t.spotifyId || t.id || k;
      const yearRaw = (t.customYear != null ? t.customYear : t.year);
      const year = coerceYear(yearRaw);
      const title = t.title || t.name || "";
      const artist = t.artist || (Array.isArray(t.artists) && t.artists[0]?.name) || t.artistName || "";

      out.push({ spotifyId, title, artist, year });
    }
    return out;
  }

  const pool = [];

  // Standardlistor (om angivna)
  if (Array.isArray(settings.standardListIds)) {
    for (const listId of settings.standardListIds) {
      const items = await readTracksFromListNode(`standardLists/${listId}`);
      pool.push(...items);
    }
  }

  // Egna listor (om angivna – kräver ownerUid)
  if (Array.isArray(settings.userPlaylistIds) && settings.ownerUid) {
    for (const listId of settings.userPlaylistIds) {
      const items = await readTracksFromListNode(`userPlaylists/${settings.ownerUid}/${listId}`);
      pool.push(...items);
    }
  }

  // 📌 Fallback: om inga listor angavs → läs ALLA standardLists/<listId>
  if (pool.length === 0) {
    const stdRoot = await db.ref(`standardLists`).get();
    if (stdRoot.exists()) {
      const lists = stdRoot.val() || {};
      for (const listId of Object.keys(lists)) {
        const items = await readTracksFromListNode(`standardLists/${listId}`);
        pool.push(...items);
      }
    }
  }

  // ---- 2) Filtrera + dedupe ----
  const inRange = pool.filter(t =>
    t &&
    t.spotifyId &&
    Number.isFinite(t.year) &&
    t.year >= yearMin && t.year <= yearMax
  );

  const seen = new Set();
  const deduped = [];
  for (const t of inRange) {
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    deduped.push(t);
  }

  if (deduped.length === 0) {
    throw new functions.https.HttpsError("failed-precondition", "deck/empty");
  }

  // ---- 3) Deterministisk shuffle på gameId (Fisher–Yates) ----
  let seed = 0;
  for (const c of String(gameId)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;

  const deck = deduped.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // ---- 4) Startår per lag ----
  const startYears = {};
  for (const tid of teamIds) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = yearMin + (seed % (yearMax - yearMin + 1));
    startYears[tid] = y;
  }

  // ---- 5) Init-state ----
  const firstTeam = teamIds[0];
  const updates = {};

  updates[`games/${gameId}/phase`] = "playing";
  updates[`games/${gameId}/drawIndex`] = 0;
  updates[`games/${gameId}/turn`] = firstTeam;
  updates[`games/${gameId}/round`] = 1;

  updates[`games/${gameId}/deck`] = deck.map(t => ({
    spotifyId: t.spotifyId, year: t.year, title: t.title, artist: t.artist
  }));
  updates[`games/${gameId}/current`] = null;
  updates[`games/${gameId}/startYears`] = startYears;

  // säkerställ tokens enligt settings om ej satta/annorlunda
  for (const tid of teamIds) {
    if (!teamsObj[tid]?.tokens || teamsObj[tid].tokens !== tokensPerTeam) {
      updates[`games/${gameId}/teams/${tid}/tokens`] = tokensPerTeam;
    }
  }

  await db.ref().update(updates);

  return {
    ok: true,
    deckCount: deck.length,
    firstTeam,
    startYears
  };
});
