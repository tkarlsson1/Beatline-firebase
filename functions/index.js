/* eslint-disable no-console */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

try { admin.app(); } catch {
  admin.initializeApp({ databaseURL: 'https://notestreamfire.europe-west1.firebasedatabase.app' });
}

const db = admin.database();

function cors(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

function rng(seed){ let x = seed>>>0; return ()=>{ x^=x<<13; x>>>=0; x^=x>>>17; x>>>=0; x^=x<<5; x>>>=0; return (x>>>0)/0x100000000; }; }
function seededShuffle(arr, seedNum){ const a=arr.slice(); const R=rng(seedNum||123456); for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

exports.hostStartHttp = functions.region('europe-west1').https.onRequest(async (req, res) => {
  try {
    if (cors(req, res)) return;
    if (req.method !== 'POST') {
      return res.status(405).json({ error:{ status:'METHOD_NOT_ALLOWED', message:'Use POST' }});
    }

    // ---- Auth ----
    const authHeader = req.get('Authorization') || '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error:{ status:'UNAUTHENTICATED', message:'Missing Bearer token' }});
    let decoded; try { decoded = await admin.auth().verifyIdToken(m[1]); }
    catch { return res.status(401).json({ error:{ status:'UNAUTHENTICATED', message:'Invalid ID token' }}); }
    const callerUid = decoded.uid;

    // ---- Input ----
    const gameId = (req.query && req.query.gameId) || (req.body && req.body.gameId);
    const debug = (req.query && (req.query.debug==='1' || req.query.debug==='true')) || (req.body && !!req.body.debug);
    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error:{ status:'INVALID_ARGUMENT', message:'Missing gameId' }});
    }

    // ---- Read game ----
    const gameSnap = await db.ref(`games/${gameId}`).get();
    if (!gameSnap.exists()) {
      return res.status(404).json({ error:{ status:'NOT_FOUND', message:'game/not-found' }});
    }
    const game = gameSnap.val() || {};
    const settings = game.settings || {};
    const yearMin = Number(settings.yearMin ?? 1900);
    const yearMax = Number(settings.yearMax ?? 3000);
    const standardListIds = Array.isArray(settings.standardListIds) ? settings.standardListIds : [];
    const userPlaylistIds  = Array.isArray(settings.userPlaylistIds)  ? settings.userPlaylistIds  : [];
    const teams = game.teams ? Object.entries(game.teams) : [];

    // Pre-diag objekt
    const diag = {
      gameId,
      callerUid,
      phase: game.phase || null,
      hostId: game.hostId || null,
      teamsCount: teams.length,
      yearMin, yearMax,
      standardListIds,
      userPlaylistIds
    };
    functions.logger.info('hostStart diag', diag);

    if (debug) {
      // Returnera en ren diagnostikbild utan att starta spelet
      return res.status(200).json({ ok:true, debug:diag });
    }

    // ---- Valideringar ----
    if (game.phase !== 'lobby') {
      return res.status(400).json({ error:{ status:'INVALID_ARGUMENT', message:'phase/invalid (must be lobby)' }, details:diag });
    }
    if (!game.hostId || game.hostId !== callerUid) {
      return res.status(403).json({ error:{ status:'PERMISSION_DENIED', message:'host/forbidden' }, details:diag });
    }
    if (teams.length === 0) {
      return res.status(400).json({ error:{ status:'INVALID_ARGUMENT', message:'teams/empty' }, details:diag });
    }

    // välj första lag
    const sortedTeams = teams.sort((a,b)=>{
      const ta = (a[1] && a[1].joinedAt) || Number.MAX_SAFE_INTEGER;
      const tb = (b[1] && b[1].joinedAt) || Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return a[0].localeCompare(b[0]);
    });
    const firstTeamId = sortedTeams[0][0];

    // ---- Build deck ----
    const dedupe = new Set();
    const deck = [];
    const stats = { standard:[], user:[] };

    async function loadStandardList(listName){
      const path = `standardLists/${listName}/songs`;
      const snap = await db.ref(path).get();
      if (!snap.exists()) { functions.logger.warn('standard list missing/empty', { listName }); return { added:0, total:0 }; }
      const songs = snap.val() || {};
      let total=0, added=0;
      for (const spotifyId of Object.keys(songs)) {
        total++;
        const s = songs[spotifyId] || {};
        const yRaw = s.year;
        const y = typeof yRaw==='number' ? yRaw : Number(String(yRaw || '').replace(/[^\d]/g,''));
        if (!y || isNaN(y)) continue;
        if (y < yearMin || y > yearMax) continue;
        if (dedupe.has(spotifyId)) continue;
        dedupe.add(spotifyId);
        deck.push({ spotifyId, title:s.title||'', artist:s.artist||'', year:y, source:{ type:'standard', list:listName }});
        added++;
      }
      return { added, total };
    }

    async function loadUserPlaylist(uid, plId){
      const path = `userPlaylists/${uid}/${plId}/songs`;
      const snap = await db.ref(path).get();
      if (!snap.exists()) return { added:0, total:0 };
      const songs = snap.val() || {};
      let total=0, added=0;
      for (const spotifyId of Object.keys(songs)) {
        total++;
        const s = songs[spotifyId] || {};
        const yRaw = s.year;
        const y = typeof yRaw==='number' ? yRaw : Number(String(yRaw || '').replace(/[^\d]/g,''));
        if (!y || isNaN(y)) continue;
        if (y < yearMin || y > yearMax) continue;
        if (dedupe.has(spotifyId)) continue;
        dedupe.add(spotifyId);
        deck.push({ spotifyId, title:s.title||'', artist:s.artist||'', year:y, source:{ type:'user', playlist:plId, owner:uid }});
        added++;
      }
      return { added, total };
    }

    for (const name of standardListIds) {
      const st = await loadStandardList(name);
      stats.standard.push({ list:name, ...st });
    }
    for (const pl of userPlaylistIds) {
      const st = await loadUserPlaylist(settings.ownerUid || callerUid, pl);
      stats.user.push({ playlist:pl, ...st });
    }

    functions.logger.info('hostStart deck counts', { gameId, yearMin, yearMax, stats, deckCount: deck.length });

    if (deck.length === 0) {
      return res.status(400).json({ error:{ status:'INVALID_ARGUMENT', message:'deck/empty' }, details:{ stats, ...diag }});
    }

    // seed/blanda
    let seedNum = 0; for (let i=0;i<gameId.length;i++) seedNum = (seedNum*31 + gameId.charCodeAt(i))>>>0;
    const shuffled = seededShuffle(deck, seedNum);

    const teamStartYears = {};
    for (const [tid] of sortedTeams) {
      const r = rng(seedNum ^ tid.length);
      teamStartYears[tid] = Math.floor(yearMin + r()*(yearMax - yearMin + 1));
    }

    await db.ref().update({
      [`games/${gameId}/phase`]: 'playing',
      [`games/${gameId}/round`]: 1,
      [`games/${gameId}/turn`]: firstTeamId,
      [`games/${gameId}/drawIndex`]: 0,
      [`games/${gameId}/startYears`]: teamStartYears,
      [`games/${gameId}/deck`]: shuffled
    });

    return res.status(200).json({ ok:true, deckCount: shuffled.length, firstTurn:firstTeamId, stats });
  } catch (err) {
    functions.logger.error('hostStart fatal', { err:String(err), stack: err && err.stack });
    return res.status(500).json({ error:{ status:'INTERNAL', message:'internal/error' }});
  }
});
