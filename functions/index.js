const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const { MUSIC_YEAR_SINGLE_PROMPT } = require("./prompts");
const yearReview = require("./year-review");

// Test-RTDB (NOTESTREAM): inte live
admin.initializeApp({
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app"
});
const db = admin.database();

// The longest title or artist the older AI function getSongYearAi accepts
const MAX_TEXT_LENGTH = 300;

// The AI and Spotify functions cost money or rate limit, so only signed-in users may call them.
// The admin page and the playlist import both run while signed in, and the callable SDK sends
// the user's ID token automatically.
function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
}

// The admin account: the same uid that database.rules.json gives write access.
const ADMIN_UID = "rtEO2DAFwfM4KdujZrFblspbwpu1";

// resolveSongYear can run a web search for every song and has no daily limit, so only the admin
// may call it. Other signed-in users go through reviewImportedTracks, which is limited.
function requireAdmin(context) {
  requireAuth(context);
  if (context.auth.uid !== ADMIN_UID) {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }
}

// Accepts strings (and numbers, e.g. a song titled 1999) of 1 to maxLength characters
function isText(value, maxLength) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const length = String(value).length;
  return length > 0 && length <= maxLength;
}

// ─── Claude (Anthropic) ──────────────────────────────────────────────────────

// All year lookups use Claude Opus 5.5. The API key is a Secret Manager secret that each AI
// function binds with runWith({ secrets: [...] }), so only those functions can read it.
const AI_MODEL = "claude-opus-5-5";
const AI_SECRET = "ANTHROPIC_API_KEY";
// Opus 5.5 always thinks; effort controls how much. medium is the model's default, set explicitly
// so a changed default cannot change cost or behaviour unnoticed.
const AI_EFFORT = "medium";

// JSON schema for structured output: the API only returns JSON that matches it, so the answer
// does not have to be searched for a year.
const NULLABLE_YEAR = { anyOf: [{ type: "integer" }, { type: "null" }] };
const SINGLE_YEAR_SCHEMA = {
  type: "object",
  properties: { year: NULLABLE_YEAR },
  required: ["year"],
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
// (Claude declined, or the answer was cut off). The caller then treats the song as unknown.
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
  if (!isText(title, MAX_TEXT_LENGTH) || !isText(artist, MAX_TEXT_LENGTH)) {
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

// ─── Spotify ─────────────────────────────────────────────────────────────────

/**
 * Asks Spotify for an app token (Client Credentials flow).
 * Returns { access_token, expires_in }. Throws an HttpsError when it fails.
 */
async function requestSpotifyAppToken() {
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
      throw new Error(`Spotify token request failed with status ${response.status}`);
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
}

// The server's own app token, reused until shortly before it expires
let cachedSpotifyToken = null;

async function getSpotifyAppToken() {
  if (cachedSpotifyToken && Date.now() < cachedSpotifyToken.expiresAt) return cachedSpotifyToken.token;
  const { access_token: token, expires_in: expiresIn } = await requestSpotifyAppToken();
  cachedSpotifyToken = { token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return token;
}

// A Spotify track id is 22 letters and digits. Checked before the id is put into an address.
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;

/**
 * Reads one track from Spotify.
 * Returns { title, artist, albumName, albumType, releaseDate, spotifyYear }, or null when Spotify
 * has no track with that id. spotifyYear is null when the album has no release date.
 */
async function fetchSpotifyTrack(trackId) {
  const token = await getSpotifyAppToken();
  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 404 || response.status === 400) return null;
  // A rejected token is dropped, so the next call asks for a new one
  if (response.status === 401) cachedSpotifyToken = null;
  if (!response.ok) throw new Error(`Spotify answered ${response.status} for track ${trackId}`);

  const track = await response.json();
  const album = track.album || {};
  const releaseDate = album.release_date || null;
  const spotifyYear = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : NaN;
  return {
    title: track.name,
    artist: (track.artists || []).map(artist => artist.name).join(", "),
    albumName: album.name || null,
    albumType: album.album_type || null,
    releaseDate,
    spotifyYear: Number.isInteger(spotifyYear) ? spotifyYear : null
  };
}

/**
 * Callable: getSpotifyToken
 * Hämtar Spotify access token via Client Credentials flow.
 */
exports.getSpotifyToken = functions.region('europe-west1').https.onCall(async (data, context) => {
  requireAuth(context);
  return requestSpotifyAppToken();
});

// ─── Year review: Spotify's year checked by Claude, with a web search when it changes ───

const MAX_TRACKS_PER_RESOLVE = 10;
const RESOLVE_CONCURRENCY = 3;
// A web search answer can take a while, so each request gets more time than in getSongYearAi
const REVIEW_REQUEST_TIMEOUT_MS = 150000;

// Throws unless trackIds is a list of 1 to 10 Spotify track ids
function requireTrackIds(trackIds) {
  if (!Array.isArray(trackIds) || trackIds.length === 0 || trackIds.length > MAX_TRACKS_PER_RESOLVE) {
    throw new functions.https.HttpsError("invalid-argument", `Between 1 and ${MAX_TRACKS_PER_RESOLVE} track ids are required.`);
  }
  if (trackIds.some(id => typeof id !== "string" || !SPOTIFY_TRACK_ID.test(id))) {
    throw new functions.https.HttpsError("invalid-argument", "Every track id must be a Spotify track id.");
  }
}

// Writes one result from resolveTrack to yearReviews. The id is the key, so it is left out of
// the stored value.
async function storeYearReview(result) {
  const { id, ...review } = result;
  await db.ref(`yearReviews/${id}`).set({ ...review, checkedAt: admin.database.ServerValue.TIMESTAMP });
}

// Runs the chain for one track. A failure for one track does not stop the others: it is logged
// and returned as status "error". A configuration error stops the whole call.
async function resolveTrack(client, trackId, options) {
  try {
    const track = await fetchSpotifyTrack(trackId);
    if (!track) return { id: trackId, status: "notFound" };
    if (track.spotifyYear === null) {
      return { id: trackId, status: "noSpotifyYear", title: track.title, artist: track.artist };
    }

    const resolved = await yearReview.resolveSongYear(client, track, options);
    const decision = resolved.decision;
    functions.logger.info(
      `[resolveSongYear] ${trackId} '${track.title}': Spotify ${track.spotifyYear} -> ${decision.year} (${decision.source}, ${decision.status})`,
      { usage: resolved.usage, reviewFailure: resolved.reviewFailure, webFailure: resolved.webFailure }
    );

    return {
      id: trackId,
      title: track.title,
      artist: track.artist,
      albumName: track.albumName,
      albumType: track.albumType,
      releaseDate: track.releaseDate,
      spotifyYear: track.spotifyYear,
      year: decision.year,
      source: decision.source,
      status: decision.status,
      reason: decision.reason,
      explanation: decision.explanation,
      sourceUrl: decision.sourceUrl,
      sourceTitle: decision.sourceTitle,
      // What each step answered, shown when a song needs review
      memory: resolved.review ? { year: resolved.review.year, confidence: resolved.review.confidence } : null,
      web: resolved.webReview ? {
        year: resolved.webReview.year,
        support: resolved.webReview.support,
        sourceVerified: resolved.webReview.sourceVerified,
        sourceUrl: resolved.webReview.sourceUrl,
        explanation: resolved.webReview.explanation
      } : null
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof Anthropic.APIError) {
      functions.logger.error(`[resolveSongYear] ${trackId}: Anthropic API error ${error.status}:`, error.message);
    } else {
      functions.logger.error(`[resolveSongYear] ${trackId}: unexpected error:`, error);
    }
    return { id: trackId, status: "error" };
  }
}

/**
 * Callable: resolveSongYear
 * Finds the release year for tracks: reads each track from Spotify, lets Claude review Spotify's
 * year, runs a web search when Claude changes it, and decides which year applies.
 *
 * Without store, nothing is written to the database and the caller decides what to save. With
 * store: true, each result is written to yearReviews/<track id> as soon as the track is done, so
 * a long run over many tracks keeps its results if the browser tab is closed. yearReviews is
 * beside the data the game reads: verifiedTracks and standardLists are never touched here.
 * A track that fails (status "error") is not stored, so the next run tries it again.
 *
 * With forceWeb: true the web search also runs for tracks where Claude keeps Spotify's year. The
 * admin page uses it for tracks where the review was not certain, or where the result differs
 * from the year the game has. With webWhenUncertain: true it runs when Claude keeps the year
 * without being certain; the playlist import uses that for new tracks.
 *
 * data:    { trackIds: [Spotify track id], store?: boolean, forceWeb?: boolean,
 *            webWhenUncertain?: boolean }, at most 10 ids
 * returns: { results: [{ id, status, ... }] } in the same order as trackIds (duplicates removed).
 *          status is "ok", "needsReview", "notFound", "noSpotifyYear" or "error".
 */
exports.resolveSongYear = functions.region("europe-west1").runWith({ timeoutSeconds: 540, memory: "512MB", secrets: [AI_SECRET] }).https.onCall(async (data, context) => {
  requireAdmin(context);

  const { trackIds, store, forceWeb, webWhenUncertain } = data || {};
  requireTrackIds(trackIds);
  if (store !== undefined && typeof store !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "store must be true or false.");
  }
  if (forceWeb !== undefined && typeof forceWeb !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "forceWeb must be true or false.");
  }
  if (webWhenUncertain !== undefined && typeof webWhenUncertain !== "boolean") {
    throw new functions.https.HttpsError("invalid-argument", "webWhenUncertain must be true or false.");
  }
  const resolveOptions = { forceWeb: forceWeb === true, webWhenUncertain: webWhenUncertain === true };

  const uniqueIds = [...new Set(trackIds)];
  const client = createAnthropicClient(REVIEW_REQUEST_TIMEOUT_MS);

  const results = new Array(uniqueIds.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < uniqueIds.length) {
      const index = nextIndex++;
      let result = await resolveTrack(client, uniqueIds[index], resolveOptions);
      if (store === true && result.status !== "error") {
        try {
          await storeYearReview(result);
        } catch (error) {
          // A result that could not be stored is reported as failed, so the caller runs it again
          functions.logger.error(`[resolveSongYear] ${result.id}: could not store the result:`, error);
          result = { id: result.id, status: "error" };
        }
      }
      results[index] = result;
    }
  };
  await Promise.all(Array.from({ length: Math.min(RESOLVE_CONCURRENCY, uniqueIds.length) }, worker));

  return { results };
});

// ─── Year review for playlists that signed-in users import ───────────────────

// How many songs may get a paid review per calendar day in Sweden: for one user, and for all
// users together. A review costs about 4 cents on average and about 12 cents when it needs a
// web search, so the total limit caps a day at roughly 12 to 37 dollars. A song over a limit is
// imported with Spotify's year and is reviewed the next time the playlist is imported.
// The admin account is not limited.
const IMPORT_DAILY_LIMIT_PER_USER = 150;
const IMPORT_DAILY_LIMIT_TOTAL = 300;

// The calendar day in Sweden as "2026-11-15", so the limits start over at Swedish midnight
function swedishDay(now) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

/**
 * How many of `wanted` reviews fit in what is left of the day's limits. Pure function.
 * usage: { total, users: { uid: count } } for the day, or null when nothing is used yet
 */
function importReviewsThatFit(usage, uid, wanted) {
  const total = (usage && usage.total) || 0;
  const mine = (usage && usage.users && usage.users[uid]) || 0;
  const room = Math.min(IMPORT_DAILY_LIMIT_TOTAL - total, IMPORT_DAILY_LIMIT_PER_USER - mine);
  return Math.max(0, Math.min(wanted, room));
}

/**
 * Reserves up to `wanted` reviews for the user in the day's limits and returns how many were
 * reserved. It is one transaction on the day's node, so calls that run at the same time cannot
 * pass a limit together. importUsage has no rule in database.rules.json, so only the server can
 * read or write it.
 */
async function reserveImportReviews(uid, day, wanted) {
  if (wanted <= 0) return 0;
  let granted = 0;
  const outcome = await db.ref(`importUsage/${day}`).transaction(usage => {
    granted = importReviewsThatFit(usage, uid, wanted);
    if (granted === 0) return undefined; // nothing to write: the transaction is aborted
    const users = { ...((usage && usage.users) || {}) };
    users[uid] = (users[uid] || 0) + granted;
    return { total: ((usage && usage.total) || 0) + granted, users };
  });
  return outcome.committed ? granted : 0;
}

// Gives back reservations that were not used, because the review failed
async function releaseImportReviews(uid, day, count) {
  if (count <= 0) return;
  await db.ref(`importUsage/${day}`).transaction(usage => {
    const users = { ...((usage && usage.users) || {}) };
    users[uid] = Math.max(0, (users[uid] || 0) - count);
    return { total: Math.max(0, ((usage && usage.total) || 0) - count), users };
  });
}

/**
 * The cache record for a reviewed song, with the same fields the admin page writes when it
 * applies a review. Pure function. review is a result from resolveTrack or a stored year review.
 */
function buildImportCacheRecord(review, checkedAt, appliedAt) {
  return {
    title: review.title,
    artist: review.artist,
    year: String(review.year),
    manuallyVerified: false,
    source: review.source || null,
    explanation: review.explanation || null,
    sourceUrl: review.sourceUrl || null,
    sourceTitle: review.sourceTitle || null,
    spotifyYear: Number.isInteger(review.spotifyYear) ? review.spotifyYear : null,
    albumName: review.albumName || null,
    albumType: review.albumType || null,
    releaseDate: review.releaseDate || null,
    checkedAt: checkedAt,
    appliedAt: appliedAt
  };
}

// Creates the cache record unless the song already has one. An existing record is never
// replaced here: it may be locked by the admin, and an import by a user must not change a year
// the game already uses.
async function createCacheRecordIfAbsent(trackId, record) {
  await db.ref(`verifiedTracks/${trackId}`).transaction(current => (current === null ? record : undefined));
}

// What an import gets back for one song: the status and the year, never the review's details
function importResult(trackId, status, year) {
  return Number.isInteger(year) ? { id: trackId, status, year } : { id: trackId, status };
}

/**
 * Turns a year review into the import's answer. A review that settled the year also gives the
 * song its cache record. Returns null for a review with a status this code does not know.
 */
async function useYearReview(trackId, review, checkedAt) {
  if (review.status === "ok" && Number.isInteger(review.year)) {
    await createCacheRecordIfAbsent(trackId, buildImportCacheRecord(review, checkedAt, Date.now()));
    return importResult(trackId, "reviewed", review.year);
  }
  if (review.status === "needsReview" || review.status === "notFound" || review.status === "noSpotifyYear") {
    return importResult(trackId, review.status);
  }
  return null;
}

/**
 * Answers for a song the server already knows, which costs nothing: from the cache, or from a
 * review stored earlier. Returns null when the song has to be reviewed.
 */
async function knownImportYear(trackId) {
  const cached = (await db.ref(`verifiedTracks/${trackId}`).once("value")).val();
  if (cached && cached.year !== undefined && cached.year !== null && cached.year !== "") {
    return importResult(trackId, "cached", parseInt(cached.year, 10));
  }
  const review = (await db.ref(`yearReviews/${trackId}`).once("value")).val();
  if (!review || typeof review.status !== "string") return null;
  return useYearReview(trackId, review, typeof review.checkedAt === "number" ? review.checkedAt : null);
}

/**
 * Reviews one song for an import. Returns { result, counted }. counted is false when the review
 * failed, so that its place in the day's limits is given back.
 */
async function reviewImportedTrack(client, trackId) {
  const result = await resolveTrack(client, trackId, { forceWeb: false, webWhenUncertain: true });
  if (result.status === "error") return { result: importResult(trackId, "error"), counted: false };
  try {
    // Stored like the admin's reviews, so the song is never paid for twice and the admin page
    // can settle a song the review could not
    await storeYearReview(result);
    const answer = await useYearReview(trackId, result, Date.now());
    return { result: answer || importResult(trackId, "error"), counted: true };
  } catch (error) {
    functions.logger.error(`[reviewImportedTracks] ${trackId}: could not store the result:`, error);
    return { result: importResult(trackId, "error"), counted: true };
  }
}

/**
 * Callable: reviewImportedTracks
 * Finds the year for tracks in a playlist that a signed-in user imports.
 *
 * A track that is in the cache, or that was reviewed before, is answered from what is stored
 * and costs nothing. Every other track is reviewed like in resolveSongYear, with a web search
 * when the year changes or the review is not certain, as long as the day's limits have room.
 * The server stores the review and creates the cache record itself, so no user can write a
 * year to the cache, and a record that exists is never replaced.
 *
 * data:    { trackIds: [Spotify track id] }, at most 10 ids
 * returns: { results: [{ id, status, year? }] } in the same order as trackIds (duplicates removed).
 *          status is "cached" or "reviewed" (both with year), "needsReview", "overLimit",
 *          "notFound", "noSpotifyYear" or "error". Without a year the caller keeps Spotify's.
 */
exports.reviewImportedTracks = functions.region("europe-west1").runWith({ timeoutSeconds: 540, memory: "512MB", secrets: [AI_SECRET] }).https.onCall(async (data, context) => {
  requireAuth(context);
  const { trackIds } = data || {};
  requireTrackIds(trackIds);

  const uid = context.auth.uid;
  const uniqueIds = [...new Set(trackIds)];
  const results = new Array(uniqueIds.length);

  // What the server already knows is answered first, and never counts against the limits
  const unknown = [];
  await Promise.all(uniqueIds.map(async (trackId, index) => {
    try {
      const known = await knownImportYear(trackId);
      if (known) results[index] = known; else unknown.push(index);
    } catch (error) {
      functions.logger.error(`[reviewImportedTracks] ${trackId}: could not read what is stored:`, error);
      results[index] = importResult(trackId, "error");
    }
  }));
  unknown.sort((a, b) => a - b);

  const day = swedishDay(new Date());
  const limited = uid !== ADMIN_UID;
  const granted = limited ? await reserveImportReviews(uid, day, unknown.length) : unknown.length;
  for (const index of unknown.slice(granted)) results[index] = importResult(uniqueIds[index], "overLimit");
  const toReview = unknown.slice(0, granted);

  let counted = 0;
  try {
    if (toReview.length > 0) {
      const client = createAnthropicClient(REVIEW_REQUEST_TIMEOUT_MS);
      let next = 0;
      const worker = async () => {
        while (next < toReview.length) {
          const index = toReview[next++];
          const outcome = await reviewImportedTrack(client, uniqueIds[index]);
          if (outcome.counted) counted++;
          results[index] = outcome.result;
        }
      };
      await Promise.all(Array.from({ length: Math.min(RESOLVE_CONCURRENCY, toReview.length) }, worker));
    }
  } finally {
    // Reservations that were not used are given back, also when the call fails as a whole
    if (limited && granted > counted) {
      try {
        await releaseImportReviews(uid, day, granted - counted);
      } catch (error) {
        functions.logger.error(`[reviewImportedTracks] could not give back ${granted - counted} reservations:`, error);
      }
    }
  }

  const statusCounts = {};
  for (const result of results) statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  functions.logger.info(`[reviewImportedTracks] ${uniqueIds.length} tracks for ${uid}`, { statusCounts, day, limited });

  return { results };
});

// ─── A report from the game starts a new check ───────────────────────────────

// The database the game uses. It is a named instance, not the project's default one, so the
// trigger has to name it.
const GAME_DATABASE_INSTANCE = "notestreamfire";

// A report can be written by anyone, signed in or not, and a check with a web search costs about
// 12 cents. So at most this many checks are run per calendar day in Sweden, and a song that had
// a web search recently is not searched again.
const REPORT_CHECKS_PER_DAY = 20;
const REPORT_RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// Reserves one report check in the day's limit. One transaction, so reports that arrive at the
// same time cannot pass the limit together. reportUsage has no rule in database.rules.json, so
// only the server can read or write it.
async function reserveReportCheck(day) {
  const outcome = await db.ref(`reportUsage/${day}`).transaction(count => {
    const used = typeof count === "number" ? count : 0;
    return used >= REPORT_CHECKS_PER_DAY ? undefined : used + 1;
  });
  return outcome.committed;
}

// Gives back a reservation that was not used, because the check failed
async function releaseReportCheck(day) {
  await db.ref(`reportUsage/${day}`).transaction(count => Math.max(0, (typeof count === "number" ? count : 0) - 1));
}

/**
 * Runs a new check for a reported song, always with a web search, and stores it in yearReviews.
 * Nothing the game reads is changed: the admin settles the report in the review queue, with
 * this check in front of them. The stored review replaces the earlier one, also a decision made
 * by hand, so that the song can be settled again.
 *
 * Returns what happened: "invalidId", "recentCheck" (searched within the last 30 days),
 * "overLimit", "error" or "checked". The same report delivered twice is searched once, because
 * the second run finds the recent check.
 */
async function checkReportedSong(trackId) {
  if (typeof trackId !== "string" || !SPOTIFY_TRACK_ID.test(trackId)) return "invalidId";

  const review = (await db.ref(`yearReviews/${trackId}`).once("value")).val();
  const searchedAt = review && review.web && typeof review.checkedAt === "number" ? review.checkedAt : null;
  if (searchedAt !== null && Date.now() - searchedAt < REPORT_RECHECK_AFTER_MS) return "recentCheck";

  const day = swedishDay(new Date());
  if (!(await reserveReportCheck(day))) return "overLimit";

  let stored = false;
  try {
    const client = createAnthropicClient(REVIEW_REQUEST_TIMEOUT_MS);
    const result = await resolveTrack(client, trackId, { forceWeb: true, webWhenUncertain: false });
    if (result.status !== "error") {
      await storeYearReview(result);
      stored = true;
    }
  } finally {
    if (!stored) {
      try {
        await releaseReportCheck(day);
      } catch (error) {
        functions.logger.error("[checkReportedTrack] could not give back the reservation:", error);
      }
    }
  }
  return stored ? "checked" : "error";
}

/**
 * Database trigger: checkReportedTrack
 * Runs when a player reports a year from the game, which creates reportedTracks/<track id>.
 * A report that is written again while it exists does not start a new check.
 */
exports.checkReportedTrack = functions.region("europe-west1")
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: [AI_SECRET] })
  .database.instance(GAME_DATABASE_INSTANCE).ref("/reportedTracks/{trackId}")
  .onCreate(async (snapshot, context) => {
    const trackId = context.params.trackId;
    try {
      const outcome = await checkReportedSong(trackId);
      functions.logger.info(`[checkReportedTrack] ${trackId}: ${outcome}`);
    } catch (error) {
      // Nothing is thrown on: the report stays in the admin's queue either way
      functions.logger.error(`[checkReportedTrack] ${trackId}: the check failed:`, error);
    }
    return null;
  });
