const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { MUSIC_YEAR_SYSTEM_PROMPT } = require("./prompts");

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

/**
 * Scheduled: cleanupOldGames
 * Runs every 6 hours to delete games older than 6 hours
 */
exports.cleanupOldGames = functions.region("europe-west1").pubsub
  .schedule('every 6 hours')
  .timeZone('Europe/Stockholm')
  .onRun(async (context) => {
    functions.logger.info('[Cleanup] Starting cleanup of old games...');
    
    const gamesRef = db.ref('games');
    
    // Hämta alla spel
    const snapshot = await gamesRef.once('value');
    const games = snapshot.val();
    
    if (!games) {
      functions.logger.info('[Cleanup] No games found');
      return null;
    }
    
    // Hitta spel äldre än 6 timmar
    const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
    const updates = {};
    let count = 0;
    
    Object.keys(games).forEach(gameId => {
      const game = games[gameId];
      
      // Kolla om spelet har createdAt och är äldre än 6h
      if (game.createdAt && game.createdAt < sixHoursAgo) {
        updates[`games/${gameId}`] = null;
        count++;
        const ageHours = Math.round((Date.now() - game.createdAt) / 3600000);
        functions.logger.info(`[Cleanup] Marking game ${gameId} for deletion (age: ${ageHours}h)`);
      }
    });
    
    // Radera gamla spel
    if (count > 0) {
      await db.ref().update(updates);
      functions.logger.info(`[Cleanup] Successfully deleted ${count} old games`);
    } else {
      functions.logger.info('[Cleanup] No old games to delete');
    }
    
    return null;
  });

/**
 * Callable: getSongYearAi
 * Uses OpenAI to estimate the release year of a song.
 * data: { title: string, artist: string }
 */
exports.getSongYearAi = functions.region("europe-west1").runWith({ timeoutSeconds: 120, memory: "256MB" }).https.onCall(async (data, context) => {
  const { title, artist } = data || {};
  if (!title || !artist) {
    throw new functions.https.HttpsError("invalid-argument", "Title and artist are required.");
  }

  const apiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key;
  if (!apiKey) {
    functions.logger.error("OpenAI API key is missing in Firebase environment!");
    throw new functions.https.HttpsError("failed-precondition", "AI configuration is missing.");
  }

  const userPrompt = `Analysera låten '${title}' av artisten '${artist}' och returnera ett JSON-objekt med nyckeln 'year' (heltal) eller null om du är osäker. Exempel: {"year": 1983} eller {"year": null}.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: MUSIC_YEAR_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      functions.logger.error("OpenAI API error:", response.status, errText);
      throw new functions.https.HttpsError("internal", `OpenAI API Error ${response.status}: ${errText}`);
    }

    const aiData = await response.json();
    const aiText = aiData.choices?.[0]?.message?.content?.trim() || "{}";
    functions.logger.info(`[getSongYearAi] Svar för '${title}' av '${artist}': ${aiText}`);

    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch (e) {
      functions.logger.warn(`[getSongYearAi] Kunde inte parsa JSON: ${aiText}`);
      return { year: null };
    }

    const year = parsed.year ? parseInt(parsed.year, 10) : null;
    return { year: isNaN(year) ? null : year };

  } catch (error) {
    functions.logger.error("Error during OpenAI fetch:", error);
    throw new functions.https.HttpsError("internal", "An error occurred while estimating the year.");
  }
});

/**
 * Callable: getSongYearsAiBatch
 * Uses OpenAI to estimate the release years for a batch of songs.
 * data: { songs: [{ id: string, title: string, artist: string }] }
 */
exports.getSongYearsAiBatch = functions.region("europe-west1").runWith({ timeoutSeconds: 540, memory: "512MB" }).https.onCall(async (data, context) => {
  const { songs } = data || {};
  if (!Array.isArray(songs) || songs.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "An array of songs is required.");
  }
  
  const apiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "AI configuration is missing.");
  }
  
  const systemPrompt = MUSIC_YEAR_SYSTEM_PROMPT;
  
  const userPrompt = `Analysera ALLA följande ${songs.length} låtar och returnera ett JSON-objekt med nyckeln 'songs' som innehåller en array med ${songs.length} objekt (ett per låt):\n` + songs.map(s => `ID: ${s.id} | Titel: ${s.title} | Artist: ${s.artist}`).join("\n");
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        // max_completion_tokens är borttagen för att tillåta obegränsade batchstorlekar
        response_format: { type: "json_object" }
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      functions.logger.error("OpenAI API error:", response.status, errText);
      throw new functions.https.HttpsError("internal", `OpenAI API Error ${response.status}: ${errText}`);
    }
    
    const aiData = await response.json();
    let aiText = aiData.choices?.[0]?.message?.content?.trim() || "{}";
    functions.logger.info(`[getSongYearsAiBatch] Rå AI-svar (${songs.length} låtar skickade): ${aiText.substring(0, 500)}`);
    
    // Parsa JSON-svaret och hitta songs-arrayen
    let parsedJson;
    try {
      parsedJson = JSON.parse(aiText);
      if (Array.isArray(parsedJson)) {
        // Top-level array (oväntat men hanterbart)
      } else if (parsedJson && typeof parsedJson === 'object') {
        // Leta efter en array-property (förväntat: { "songs": [...] })
        const arrProp = Object.values(parsedJson).find(Array.isArray);
        if (arrProp) {
          parsedJson = arrProp;
        } else {
          // Enstaka objekt - logga och returnera tomt
          functions.logger.warn("[getSongYearsAiBatch] AI returnerade ett enstaka objekt istället för array:", aiText);
          parsedJson = [];
        }
      }
    } catch (e) {
      functions.logger.error("Failed to parse JSON from AI:", aiText);
      return { results: [] };
    }
    
    return { results: parsedJson };
  } catch (error) {
    functions.logger.error("Error during OpenAI batch fetch:", error);
    throw new functions.https.HttpsError("internal", "An error occurred while estimating years.");
  }
});

/**
 * Callable: getSpotifyToken
 * Hämtar Spotify access token via Client Credentials flow.
 */
exports.getSpotifyToken = functions.region('europe-west1').https.onCall(async (data, context) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID || functions.config().spotify?.client_id;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || functions.config().spotify?.client_secret;

  if (!clientId || !clientSecret) {
    functions.logger.error('Spotify credentials are missing in environment.');
    throw new functions.https.HttpsError('failed-precondition', 'Spotify credentials missing.');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const errText = await response.text();
      functions.logger.error('Spotify API error:', response.status, errText);
      throw new functions.https.HttpsError('internal', 'Failed to fetch Spotify token.');
    }

    const json = await response.json();
    return {
      access_token: json.access_token,
      expires_in: json.expires_in
    };
  } catch (error) {
    functions.logger.error('Error during Spotify token fetch:', error);
    throw new functions.https.HttpsError('internal', 'Error fetching Spotify token.');
  }
});
