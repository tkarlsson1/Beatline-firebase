const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Test-RTDB (NOTESTREAM): inte live
admin.initializeApp({
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app"
});
const db = admin.database();

/**
 * Callable: hostStart
 * data: { gameId: string }
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

  // ---------- Helpers ----------
  function coerceYear(y) {
    if (y == null) return NaN;
    if (typeof y === "number") return y;
    if (typeof y === "string") {
      const n = parseInt(y, 10);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  // Försök extrahera spår från en list-nod som kan se ut:
  //  - { songs: { <id>: {artist,title,year} } }
  //  - { tracks: { <id>: {...} } }
  //  - { <id>: {artist,title,year}, name: '...', ... }  (platt node)
  function extractTracksFromNode(listNode) {
    const container = listNode?.songs || listNode?.tracks || listNode;
    const out = [];
    for (const key of Object.keys(container || {})) {
      const v = container[key];
      if (!v || typeof v !== "object") continue;
      // hoppa över uppenbara metadata-fält i en platt node
      if ("name" in v && !("artist" in v) && !("title" in v)) continue;

      const spotifyId = v.spotifyId || v.id || key;
      const yearRaw = v.customYear != null ? v.customYear : v.year;
      const year = coerceYear(yearRaw);
      const title = v.title || v.name || "";
      const artist =
        v.artist ||
        (Array.isArray(v.artists) && v.artists[0]?.name) ||
        v.artistName ||
        "";

      // minst SpotifyID + år för att vara relevant
      out.push({ spotifyId, title, artist, year });
    }
    return out;
  }

  async function readListAt(path) {
    const s = await db.ref(path).get();
    return s.exists() ? s.val() : null;
  }

  // ---------- Bygg pool ----------
  const pool = [];

  // A) Om list-ID:n är angivna i settings, lås till dem
  if (Array.isArray(settings.standardListIds) && settings.standardListIds.length) {
    functions.logger.info("Using provided standardListIds", settings.standardListIds);
    for (const listId of settings.standardListIds) {
      const node = await readListAt(`standardLists/${listId}`);
      if (!node) continue;
      const items = extractTracksFromNode(node);
      functions.logger.info(`standardLists/${listId}: extracted`, items.length);
      pool.push(...items);
    }
  }

  if (Array.isArray(settings.userPlaylistIds) && settings.ownerUid) {
    functions.logger.info("Using provided userPlaylistIds", settings.userPlaylistIds);
    for (const listId of settings.userPlaylistIds) {
      const node = await readListAt(`userPlaylists/${settings.ownerUid}/${listId}`);
      if (!node) continue;
      const items = extractTracksFromNode(node);
      functions.logger.info(`userPlaylists/${settings.ownerUid}/${listId}: extracted`, items.length);
      pool.push(...items);
    }
  }

  // B) Fallback: läs ALLA standardLists om inget lades i poolen
  if (pool.length === 0) {
    const stdRootSnap = await db.ref("standardLists").get();
    if (!stdRootSnap.exists()) {
      functions.logger.warn("standardLists root missing");
    } else {
      const stdRoot = stdRootSnap.val() || {};
      const listIds = Object.keys(stdRoot);
      functions.logger.info("Fallback: scanning all standardLists", { count: listIds.length, listIds: listIds.slice(0, 10) });

      for (const listId of listIds) {
        const node = stdRoot[listId];
        const items = extractTracksFromNode(node);
        functions.logger.info(`fallback standardLists/${listId}: extracted`, items.length);
        pool.push(...items);
      }
    }
  }

  functions.logger.info("Pool size before filter", pool.length);

  // ---------- Filtrera + dedupe ----------
  const inRange = pool.filter(
    (t) => t && t.spotifyId && Number.isFinite(t.year) && t.year >= yearMin && t.year <= yearMax
  );

  const seen = new Set();
  const deduped = [];
  for (const t of inRange) {
    if (seen.has(t.spotifyId)) continue;
    seen.add(t.spotifyId);
    deduped.push(t);
  }

  functions.logger.info("After filter/dedupe", { inRange: inRange.length, deduped: deduped.length, yearMin, yearMax });

  if (deduped.length === 0) {
    // Logga sampling av första 5 från pool för felsökning
    functions.logger.warn("deck/empty — sample", pool.slice(0, 5));
    throw new functions.https.HttpsError("failed-precondition", "deck/empty");
  }

  // ---------- Deterministisk shuffle ----------
  let seed = 0;
  for (const c of String(gameId)) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;

  const deck = deduped.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // ---------- Startår per lag ----------
  const startYears = {};
  for (const tid of teamIds) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = yearMin + (seed % (yearMax - yearMin + 1));
    startYears[tid] = y;
  }

  // ---------- Init-state ----------
  const firstTeam = teamIds[0];
  const updates = {};

  updates[`games/${gameId}/phase`] = "playing";
  updates[`games/${gameId}/drawIndex`] = 0;
  updates[`games/${gameId}/turn`] = firstTeam;
  updates[`games/${gameId}/round`] = 1;

  updates[`games/${gameId}/deck`] = deck.map((t) => ({
    spotifyId: t.spotifyId,
    year: t.year,
    title: t.title,
    artist: t.artist,
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
    startYears,
  };
});
