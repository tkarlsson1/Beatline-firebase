const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
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

// ─── Claude (Anthropic) ──────────────────────────────────────────────────────

// All year lookups use Claude Opus 5.5. The API key is a Secret Manager secret that each AI
// function binds with runWith({ secrets: [...] }), so only those functions can read it.
const AI_MODEL = "claude-opus-5-5";
const AI_SECRET = "ANTHROPIC_API_KEY";
// Opus 5.5 always thinks; effort controls how much. medium is the model's default, set explicitly
// so a changed default cannot change cost or behaviour unnoticed.
const AI_EFFORT = "medium";

// JSON schemas for structured output: the API only returns JSON that matches them, so the
// answers no longer have to be searched for a year or an array.
const NULLABLE_YEAR = { anyOf: [{ type: "integer" }, { type: "null" }] };
const SINGLE_YEAR_SCHEMA = {
  type: "object",
  properties: { year: NULLABLE_YEAR },
  required: ["year"],
  additionalProperties: false
};
const BATCH_YEARS_SCHEMA = {
  type: "object",
  properties: {
    songs: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, year: NULLABLE_YEAR },
        required: ["id", "year"],
        additionalProperties: false
      }
    }
  },
  required: ["songs"],
  additionalProperties: false
};

function createAnthropicClient(timeoutMs) {
  const apiKey = process.env[AI_SECRET];
  if (!apiKey) {
    functions.logger.error(`${AI_SECRET} is not available to this function.`);
    throw new functions.https.HttpsError("failed-precondition", "AI configuration is missing.");
  }
  // One retry, with a timeout that lets both attempts finish before the function's own timeout
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
}

// Asks Claude once and returns the parsed JSON object, or null when there is no usable answer
// (Claude declined, or the answer was cut off). The caller then treats the song(s) as unknown.
async function askClaudeForJson(client, systemPrompt, userPrompt, schema, logLabel) {
  const response = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, the API re-runs the request on the fallback model
    // Anthropic recommends for that category instead of returning the refusal
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      effort: AI_EFFORT,
      format: { type: "json_schema", schema }
    }
  });

  if (response.model !== AI_MODEL) {
    functions.logger.warn(`[${logLabel}] Answered by fallback model ${response.model}`);
  }
  if (response.stop_reason === "refusal") {
    functions.logger.warn(`[${logLabel}] Claude declined`, response.stop_details || null);
    return null;
  }
  if (response.stop_reason === "max_tokens") {
    functions.logger.warn(`[${logLabel}] Answer was cut off at max_tokens`);
    return null;
  }

  const textBlock = response.content.find(block => block.type === "text");
  if (!textBlock) {
    functions.logger.warn(`[${logLabel}] No text block in the answer (stop_reason: ${response.stop_reason})`);
    return null;
  }
  try {
    return JSON.parse(textBlock.text);
  } catch (e) {
    functions.logger.warn(`[${logLabel}] Could not parse JSON: ${textBlock.text.substring(0, 500)}`);
    return null;
  }
}

// Logs the real error and returns a generic one for the client, so API details never reach the browser
function toAiHttpsError(error, logLabel, clientMessage) {
  if (error instanceof functions.https.HttpsError) return error;
  if (error instanceof Anthropic.APIError) {
    functions.logger.error(`[${logLabel}] Anthropic API error ${error.status}:`, error.message);
  } else {
    functions.logger.error(`[${logLabel}] Unexpected error:`, error);
  }
  return new functions.https.HttpsError("internal", clientMessage);
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
 * Uses Claude to estimate the release year of a song.
 * data: { title: string, artist: string }
 */
exports.getSongYearAi = functions.region("europe-west1").runWith({ timeoutSeconds: 120, memory: "256MB", secrets: [AI_SECRET] }).https.onCall(async (data, context) => {
  requireAuth(context);

  const { title, artist } = data || {};
  if (!isText(title, MAX_TEXT_LENGTH, false) || !isText(artist, MAX_TEXT_LENGTH, false)) {
    throw new functions.https.HttpsError("invalid-argument", `Title and artist are required (max ${MAX_TEXT_LENGTH} characters).`);
  }

  const userPrompt = `Analysera låten '${title}' av artisten '${artist}' och returnera ett JSON-objekt med nyckeln 'year' (heltal) eller null om du är osäker. Exempel: {"year": 1983} eller {"year": null}.`;

  try {
    // Two attempts of at most 55 s each fit inside the function's 120 s timeout
    const client = createAnthropicClient(55000);
    const parsed = await askClaudeForJson(client, MUSIC_YEAR_SINGLE_PROMPT, userPrompt, SINGLE_YEAR_SCHEMA, "getSongYearAi");
    functions.logger.info(`[getSongYearAi] Svar för '${title}' av '${artist}': ${JSON.stringify(parsed)}`);

    const year = parsed && Number.isInteger(parsed.year) ? parsed.year : null;
    return { year };
  } catch (error) {
    throw toAiHttpsError(error, "getSongYearAi", "An error occurred while estimating the year.");
  }
});

/**
 * Callable: getSongYearsAiBatch
 * Uses Claude to estimate the release years for a batch of songs.
 * data: { songs: [{ id: string, title: string, artist: string }] }
 */
exports.getSongYearsAiBatch = functions.region("europe-west1").runWith({ timeoutSeconds: 540, memory: "512MB", secrets: [AI_SECRET] }).https.onCall(async (data, context) => {
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

  const userPrompt = `Analysera ALLA följande ${songs.length} låtar och returnera ett JSON-objekt med nyckeln 'songs' som innehåller en array med ${songs.length} objekt (ett per låt):\n` + songs.map(s => `ID: ${s.id} | Titel: ${s.title} | Artist: ${s.artist}`).join("\n");

  try {
    // Two attempts of at most 250 s each fit inside the function's 540 s timeout
    const client = createAnthropicClient(250000);
    const parsed = await askClaudeForJson(client, MUSIC_YEAR_BATCH_PROMPT, userPrompt, BATCH_YEARS_SCHEMA, "getSongYearsAiBatch");

    // Same shape as before ({ results: [{ id, year }] }), so the admin page and the import are unchanged
    const results = parsed && Array.isArray(parsed.songs) ? parsed.songs : [];
    functions.logger.info(`[getSongYearsAiBatch] ${results.length} svar för ${songs.length} skickade låtar: ${JSON.stringify(results).substring(0, 500)}`);
    return { results };
  } catch (error) {
    throw toAiHttpsError(error, "getSongYearsAiBatch", "An error occurred while estimating years.");
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
