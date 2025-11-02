// functions/index.js
/* eslint-disable no-console */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// === Viktigt: peka Admin SDK på rätt RTDB-instans (notestreamfire) ===
const RTDB_URL = 'https://notestreamfire.europe-west1.firebasedatabase.app';

try {
  admin.app();
} catch {
  admin.initializeApp({
    databaseURL: RTDB_URL,
  });
}

const db = admin.database();
const REGION = 'europe-west1';

/* ---------------------------------- CORS ---------------------------------- */
const ALLOWED_ORIGINS = new Set([
  'https://www.notestream.se',
  'https://notestream.se',
  'http://localhost:5173',
]);

function withCors(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }
    return handler(req, res);
  };
}

/* ------------------------------ Auth helper ------------------------------- */
async function verifyAuth(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new functions.https.HttpsError('unauthenticated', 'Missing Authorization header');
  const idToken = m[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded; // { uid, ... }
}

/* ------------------------------ RTDB helper ------------------------------- */
async function getVal(path) {
  const snap = await db.ref(path).get();
  return snap.exists() ? snap.val() : null;
}

/* ============================== hostStartHttp ============================= */
/** POST ?gameId=...  (endast host, phase=lobby)
 *  - bygger deck från settings.standardListIds (+ev userPlaylistIds)
 *  - filtrerar på yearMin/yearMax
 *  - shufflar, sätter phase=playing, turn, drawIndex, startYears
 */
exports.hostStartHttp = functions
  .region(REGION)
  .https.onRequest(
    withCors(async (req, res) => {
      try {
        if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
        const { uid } = await verifyAuth(req);

        const gameId = (req.query.gameId || req.body?.gameId || '').trim();
        if (!gameId) return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'Missing gameId' } });

        const gamePath = `games/${gameId}`;
        const g = await getVal(gamePath);
        if (!g) return res.status(404).json({ error: { status: 'NOT_FOUND', message: 'game not found' } });
        if (g.hostId !== uid) return res.status(403).json({ error: { status: 'PERMISSION_DENIED', message: 'not host' } });
        if (g.phase && g.phase !== 'lobby') return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'not in lobby' } });

        const settings = g.settings || {};
        const yearMin = Number(settings.yearMin ?? 1900);
        const yearMax = Number(settings.yearMax ?? 2100);

        const standardIds = Array.isArray(settings.standardListIds) ? settings.standardListIds : [];
        const userIds     = Array.isArray(settings.userPlaylistIds) ? settings.userPlaylistIds : [];

        // Bygg deck med dedupe på spotifyId
        const deckMap = new Map(); // spotifyId -> track

        async function addStandard(id) {
          const songs = await getVal(`standardLists/${id}/songs`);
          if (!songs) return;
          for (const [sid, t] of Object.entries(songs)) {
            const y = Number(t.year);
            if (!Number.isFinite(y)) continue;
            if (y < yearMin || y > yearMax) continue;
            if (!deckMap.has(sid)) {
              deckMap.set(sid, {
                spotifyId: sid,
                title: t.title || '',
                artist: t.artist || '',
                year: y,
              });
            }
          }
        }

        async function addUser(ownerUid, pid) {
          const songs = await getVal(`userPlaylists/${ownerUid}/${pid}/songs`);
          if (!songs) return;
          for (const [sid, t] of Object.entries(songs)) {
            const y = Number(t.customYear ?? t.year);
            if (!Number.isFinite(y)) continue;
            if (y < yearMin || y > yearMax) continue;
            if (!deckMap.has(sid)) {
              deckMap.set(sid, {
                spotifyId: sid,
                title: t.title || '',
                artist: t.artist || '',
                year: y,
              });
            }
          }
        }

        for (const id of standardIds) await addStandard(id);
        // userPlaylistIds kan vara [{ownerUid, playlistId}] – stöds när formatet används
        for (const u of userIds) {
          if (u && typeof u === 'object' && u.ownerUid && u.playlistId) {
            await addUser(u.ownerUid, u.playlistId);
          }
        }

        const deck = Array.from(deckMap.values());
        if (!deck.length) {
          return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'deck/empty' } });
        }

        // Fisher–Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        const teams = g.teams ? Object.keys(g.teams) : [];
        const turn = teams[0] || uid;

        // Slumpa startår inom intervallet
        const yMin = Number.isFinite(yearMin) ? yearMin : 1900;
        const yMax = Number.isFinite(yearMax) ? yearMax : 2100;
        const startYears = {};
        for (const tid of teams) {
          startYears[tid] = Math.floor(yMin + Math.random() * (yMax - yMin + 1));
        }

        await db.ref(gamePath).update({
          phase: 'playing',
          deck,
          drawIndex: 0,
          round: 1,
          turn,
          startYears,
        });

        return res.status(200).json({ ok: true, deckCount: deck.length });
      } catch (e) {
        console.error('hostStartHttp error', e);
        const code = e.code === 'unauthenticated' ? 401 : 500;
        return res.status(code).json({ error: { status: e.code || 'UNKNOWN', message: String(e.message || e) } });
      }
    })
  );

/* =========================== resolveRoundHttp ============================ */
/** POST ?gameId=...  (endast host, phase=playing)
 *  - hämtar lock för g.turn
 *  - beräknar korrekt slot baserat på stigande år
 *  - uppdaterar timelines/score vid träff
 *  - bump: drawIndex och turn, rensar lock och skriver roundState/result
 */
exports.resolveRoundHttp = functions
  .region(REGION)
  .https.onRequest(
    withCors(async (req, res) => {
      try {
        if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
        const { uid } = await verifyAuth(req);

        const gameId = (req.query.gameId || req.body?.gameId || '').trim();
        if (!gameId) return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'Missing gameId' } });

        const gamePath = `games/${gameId}`;
        const g = await getVal(gamePath);
        if (!g) return res.status(404).json({ error: { status: 'NOT_FOUND', message: 'game not found' } });
        if (g.hostId !== uid) return res.status(403).json({ error: { status: 'PERMISSION_DENIED', message: 'not host' } });
        if (g.phase !== 'playing') return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'not playing' } });

        const turnTeam = g.turn;
        if (!turnTeam) return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'no turn team' } });

        const lock = g.roundState?.locks?.[turnTeam];
        if (!lock) return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'no lock for current team' } });

        const drawIndex = Number(g.drawIndex || 0);
        const deck = Array.isArray(g.deck) ? g.deck : [];
        if (!(drawIndex >= 0 && drawIndex < deck.length)) {
          return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'drawIndex out of range' } });
        }

        const card = deck[drawIndex];
        const year = Number(card.year);
        if (!Number.isFinite(year)) {
          return res.status(400).json({ error: { status: 'FAILED_PRECONDITION', message: 'card has no year' } });
        }

        // korrekt index enligt stigande år
        const placed = Array.isArray(g.timelines?.[turnTeam]) ? g.timelines[turnTeam] : [];
        const placedYears = placed.map(p => Number(p.year)).filter(Number.isFinite).sort((a, b) => a - b);
        let correctIndex = 0;
        for (const y of placedYears) if (y < year) correctIndex++;

        const submittedIndex = Number(lock.slotIndex);
        const hit = submittedIndex === correctIndex;

        const updates = {};
        updates[`${gamePath}/roundState/result`] = {
          teamId: turnTeam,
          drawIndex,
          spotifyId: card.spotifyId || null,
          year,
          submittedIndex,
          correctIndex,
          hit,
          ts: Date.now(),
        };
        updates[`${gamePath}/roundState/locks/${turnTeam}`] = null;

        if (hit) {
          const newEntry = {
            year,
            spotifyId: card.spotifyId || null,
            title: card.title || '',
            artist: card.artist || '',
            placedAt: Date.now(),
          };
          const newTimeline = placed.slice();
          newTimeline.splice(correctIndex, 0, newEntry);
          updates[`${gamePath}/timelines/${turnTeam}`] = newTimeline;

          const curScore = Number(g.teams?.[turnTeam]?.score || 0);
          updates[`${gamePath}/teams/${turnTeam}/score`] = curScore + 1;
        }

        // turordning
        const allTeams = g.teams ? Object.keys(g.teams) : [];
        const curIdx = Math.max(0, allTeams.indexOf(turnTeam));
        const nextTeam = allTeams.length ? allTeams[(curIdx + 1) % allTeams.length] : turnTeam;

        updates[`${gamePath}/drawIndex`] = drawIndex + 1;
        updates[`${gamePath}/turn`] = nextTeam;

        await db.ref().update(updates);

        return res.status(200).json({
          ok: true,
          hit,
          correctIndex,
          submittedIndex,
          next: { drawIndex: drawIndex + 1, turn: nextTeam },
        });
      } catch (e) {
        console.error('resolveRoundHttp error', e);
        const code = e.code === 'unauthenticated' ? 401 : 500;
        return res.status(code).json({ error: { status: e.code || 'UNKNOWN', message: String(e.message || e) } });
      }
    })
  );
