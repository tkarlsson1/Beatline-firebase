const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { MUSIC_YEAR_SINGLE_PROMPT, MUSIC_YEAR_BATCH_PROMPT } = require("./prompts");

// Test-RTDB (NOTESTREAM): inte live
admin.initializeApp({
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app"
});
const db = admin.database();

// Limits for the paid AI functions. 500 songs matches the highest batch size the admin
// cleanup allows (batchSizeInput max="500"); the imports send 25 at a time.
const MAX_SONGS_PER_BATCH = 500;
const MAX_TEXT_LENGTH = 300;
const MAX_ID_LENGTH = 100;

// The AI and Spotify functions cost money or rate limit, so only signed-in users may call them.
// The admin page and the playlist import both run while signed in, and the callable SDK sends
// the user's ID token automatically.
function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
}

// Accepts strings (and numbers, e.g. a song titled 1999) up to maxLength characters.
// allowEmpty is used for batch songs, so one track with an empty artist does not reject the whole batch.
function isText(value, maxLength, allowEmpty) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const length = String(value).length;
  return length <= maxLength && (allowEmpty || length > 0);
}

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
  requireAuth(context);

  const { title, artist } = data || {};
  if (!isText(title, MAX_TEXT_LENGTH, false) || !isText(artist, MAX_TEXT_LENGTH, false)) {
    throw new functions.https.HttpsError("invalid-argument", `Title and artist are required (max ${MAX_TEXT_LENGTH} characters).`);
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
          { role: "system", content: MUSIC_YEAR_SINGLE_PROMPT },
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
  requireAuth(context);

  const { songs } = data || {};
  if (!Array.isArray(songs) || songs.length === 0) {
    throw new functions.https.HttpsError("invalid-argument", "An array of songs is required.");
  }
  if (songs.length > MAX_SONGS_PER_BATCH) {
    throw new functions.https.HttpsError("invalid-argument", `At most ${MAX_SONGS_PER_BATCH} songs per call.`);
  }
  const hasInvalidSong = songs.some(s =>
    !s ||
    !isText(s.id, MAX_ID_LENGTH, false) ||
    !isText(s.title, MAX_TEXT_LENGTH, true) ||
    !isText(s.artist, MAX_TEXT_LENGTH, true)
  );
  if (hasInvalidSong) {
    throw new functions.https.HttpsError("invalid-argument", `Every song needs an id, and title/artist may be at most ${MAX_TEXT_LENGTH} characters.`);
  }

  const apiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key;
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "AI configuration is missing.");
  }
  
  const systemPrompt = MUSIC_YEAR_BATCH_PROMPT;
  
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
  requireAuth(context);

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
