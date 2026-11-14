/**
 * year-review.js
 * Reviews the release year Spotify gives for a track.
 *
 * Spotify's year is the starting point. Claude gets the title, the artist and what Spotify says
 * about the album (name, type, release date) and answers whether that year is the year the song
 * was first released. If not, it gives the original year. Every answer carries a short explanation
 * in Swedish that can be shown in the game, and a confidence level.
 *
 * A second step, verifySongYearOnWeb, looks the year up with a web search and returns it with a
 * source. It runs for the songs where the first review changes the year.
 *
 * decideYear settles which year applies, and resolveSongYear runs the whole chain for one song.
 * The Cloud Function resolveSongYear in index.js calls it. tools/year-eval measures the steps
 * against an answer key.
 */

const REVIEW_MODEL = "claude-opus-5-5";
// Opus 5.5 always thinks; effort controls how much. Set explicitly so a changed default
// cannot change cost or behaviour unnoticed. Same level as the functions in index.js.
const REVIEW_EFFORT = "medium";
const REVIEW_MAX_TOKENS = 16000;

const CONFIDENCE_LEVELS = ["high", "medium", "low"];
const MIN_YEAR = 1900;

// The rules for covers, remixes, title suffixes and compilations are the same as in prompts.js.
// The differences: Spotify's album data is given as evidence, the answer is never null (an
// unknown song keeps Spotify's year with low confidence), and every answer has an explanation.
const YEAR_REVIEW_PROMPT = `Du granskar utgivningsår för låtar i ett musikspel där spelarna ska placera låtar i tidsordning. Ett fel årtal leder till diskussioner vid bordet, så varje år ska gå att försvara.

Rätt år är det år då låten först gavs ut på singel eller studioalbum av den angivna artisten.

För varje låt får du titel, artist och vad Spotify anger om albumet som spåret ligger på: albumets namn, albumtyp och utgivningsdatum. Spotifys datum gäller albumet, inte låten. Därför stämmer det ofta, men det blir fel när spåret ligger på en samlingsskiva, en remaster, en deluxe- eller jubileumsutgåva eller en annan senare nyutgåva. Då är Spotifys år för sent, ibland med flera decennier.

Gör så här:
1. Utgå från vad du själv vet om när just den här artisten först gav ut just den här låten.
2. Jämför med Spotifys år. Albumets namn och typ visar ofta om det är en nyutgåva.
3. Om Spotifys år är året för låtens första utgivning: behåll det.
4. Om Spotifys år kommer från en senare utgåva: svara med originalåret.

Regler:
- Artisten avgör. Använd alltid artist och titel tillsammans, och blanda inte ihop med en annan artists låt som har samma titel. Flera artister separerade med kommatecken betyder ett samarbete.
- Covers och remixer: om den angivna artisten har gjort en cover eller en remix av en äldre låt gäller året då just den versionen gavs ut, inte originalets år.
- Titeltillägg som "Remaster", "Radio Edit", "Single Version", "Live", "Acoustic", "Deluxe" eller ett årtal i titeln ändrar inte året. Det är originalinspelningens första utgivning som gäller.
- Ett år från en samlingsskiva, remaster eller nyutgåva är aldrig rätt svar om låten gavs ut tidigare.
- Blanda inte ihop året då artisten debuterade eller slog igenom med året då låten gavs ut.
- Om singeln och albumet kom olika år gäller det tidigaste.

Svaret:
- year: året du kommer fram till. Känner du inte igen låten behåller du Spotifys år.
- explanation: en kort mening på svenska som kan visas för spelarna och som förklarar varför året gäller. Nämn vad året bygger på, till exempel singeln eller albumet, och om du ändrar året även var Spotifys år kommer ifrån. Exempel på formen: "Singeln gavs ut 1984. Spotifys år 2009 kommer från en samlingsskiva."
- confidence:
  - "high": du känner säkert till när just den här artisten gav ut just den här låten.
  - "medium": du känner till låten men är osäker på det exakta året eller på vilken version spåret är.
  - "low": du känner inte igen just den här inspelningen, eller du gissar.

Var ärlig med säkerheten. Låtar med "medium" eller "low" kontrolleras mot andra källor efteråt, så ett osäkert svar som är markerat som osäkert gör ingen skada. Ett fel svar som är markerat som säkert gör det.`;

// Structured output: the API only returns JSON that matches this schema.
const YEAR_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    year: { type: "integer" },
    explanation: { type: "string" },
    confidence: { type: "string", enum: CONFIDENCE_LEVELS }
  },
  required: ["year", "explanation", "confidence"],
  additionalProperties: false
};

/**
 * Builds the user message for one song.
 * song: { title, artist, spotifyYear, albumName?, albumType?, releaseDate? }
 */
function buildYearReviewInput(song) {
  const lines = [
    `Titel: ${song.title}`,
    `Artist: ${song.artist}`,
    `Spotifys album: ${song.albumName || "okänt"}`,
    `Albumtyp enligt Spotify: ${song.albumType || "okänd"}`,
    `Utgivningsdatum enligt Spotify: ${song.releaseDate || song.spotifyYear}`,
    `Spotifys år: ${song.spotifyYear}`
  ];
  return lines.join("\n");
}

// Checks the parsed answer. Returns the cleaned review, or null if a field is missing or unreasonable.
function toValidReview(parsed, spotifyYear) {
  if (!parsed || typeof parsed !== "object") return null;

  const year = parsed.year;
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) return null;

  // Structured outputs do not guarantee the capitalisation of enum values
  const confidence = typeof parsed.confidence === "string" ? parsed.confidence.toLowerCase() : "";
  if (!CONFIDENCE_LEVELS.includes(confidence)) return null;

  const explanation = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
  if (!explanation) return null;

  return { year, changed: year !== spotifyYear, explanation, confidence };
}

/**
 * Asks Claude to review Spotify's year for one song.
 *
 * client: an Anthropic client (the caller sets the API key, timeout and retries)
 * song:   { title, artist, spotifyYear, albumName?, albumType?, releaseDate? }
 *
 * Returns { review, failure, meta }:
 *   review:  { year, changed, explanation, confidence }, or null when there is no usable answer
 *   failure: null, or why there is no review: "refusal" | "max_tokens" | "no_text" | "parse_error" | "invalid_answer"
 *   meta:    { model, stopReason, usage, rawText } from the response, for logging and cost
 * API errors are thrown to the caller.
 */
async function reviewSongYear(client, song) {
  const spotifyYear = parseInt(song.spotifyYear, 10);
  if (!Number.isInteger(spotifyYear)) {
    throw new Error("reviewSongYear needs a numeric spotifyYear.");
  }

  const response = await client.beta.messages.create({
    model: REVIEW_MODEL,
    max_tokens: REVIEW_MAX_TOKENS,
    // If a safety classifier declines, the API re-runs the request on the fallback model
    // Anthropic recommends for that category instead of returning the refusal
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: YEAR_REVIEW_PROMPT,
    messages: [{ role: "user", content: buildYearReviewInput({ ...song, spotifyYear }) }],
    output_config: {
      effort: REVIEW_EFFORT,
      format: { type: "json_schema", schema: YEAR_REVIEW_SCHEMA }
    }
  });

  const textBlock = response.content.find(block => block.type === "text");
  const meta = {
    model: response.model,
    stopReason: response.stop_reason,
    usage: response.usage,
    rawText: textBlock ? textBlock.text : null
  };

  if (response.stop_reason === "refusal") return { review: null, failure: "refusal", meta };
  if (response.stop_reason === "max_tokens") return { review: null, failure: "max_tokens", meta };
  if (!textBlock) return { review: null, failure: "no_text", meta };

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (e) {
    return { review: null, failure: "parse_error", meta };
  }

  const review = toValidReview(parsed, spotifyYear);
  if (!review) return { review: null, failure: "invalid_answer", meta };
  return { review, failure: null, meta };
}

// ─── Web step: look the year up on the web, with a source ────────────────────

const WEB_MAX_SEARCHES = 3;
// A long search turn can be paused by the API and has to be sent back to continue
const WEB_MAX_CONTINUATIONS = 3;
const SUPPORT_LEVELS = ["tydligt", "svagt", "saknas"];

// The song's year from the first review is deliberately not given, so the search is an
// independent check and not a confirmation of a guess.
const YEAR_WEB_PROMPT = `Du tar reda på utgivningsår för låtar i ett musikspel där spelarna ska placera låtar i tidsordning. Varje år ska kunna visas tillsammans med en källa, så att en diskussion vid bordet går att avgöra.

Rätt år är det år då låten först gavs ut på singel eller studioalbum av den angivna artisten.

För varje låt får du titel, artist och vad Spotify anger om albumet som spåret ligger på. Spotifys datum gäller albumet, inte låten, och det är ofta för sent när spåret ligger på en samlingsskiva, en remaster eller en annan nyutgåva.

Sök på webben efter en sida som anger när låten, singeln eller albumet där den först fanns med gavs ut. Gå efter vad sidorna säger och inte efter vad du tror dig minnas: de här låtarna är just sådana där minnet inte räcker. Bra källor är Wikipedia på svenska eller engelska, Discogs, officiella topplistor och artistens eller skivbolagets egna sidor. Sidor med låttexter eller ackord anger sällan utgivningsår. Sök gärna på svenska när artisten är svensk.

Regler:
- Artisten avgör. Använd alltid artist och titel tillsammans, och blanda inte ihop med en annan artists låt som har samma titel. Flera artister separerade med kommatecken betyder ett samarbete.
- Covers och remixer: om den angivna artisten har gjort en cover eller en remix av en äldre låt gäller året då just den versionen gavs ut, inte originalets år.
- Titeltillägg som "Remaster", "Radio Edit", "Single Version", "Live", "Acoustic", "Deluxe" eller ett årtal i titeln ändrar inte året. Det är originalinspelningens första utgivning som gäller.
- Ett år från en samlingsskiva, remaster eller nyutgåva är aldrig rätt svar om låten gavs ut tidigare.
- Om singeln och albumet kom olika år gäller det tidigaste.

Avsluta med exakt de här fyra raderna:
år: <årtalet med fyra siffror>
källa: <webbadressen till den sökträff som bäst stöder året>
förklaring: <en kort mening på svenska som kan visas för spelarna och som säger vad året bygger på>
stöd: <tydligt, svagt eller saknas>

Vad stöd betyder:
- tydligt: sidan anger uttryckligen när låten, singeln eller albumet gavs ut.
- svagt: sidan stöder året bara indirekt, eller så säger källorna olika.
- saknas: du hittade ingen sida som stöder något år. Svara då med Spotifys år och skriv ett bindestreck som källa.

Källan måste vara en adress du fick som sökträff. En påhittad adress upptäcks och förkastas, och då går låten till manuell granskning. Det är bättre att svara "saknas" än att ange en källa som inte stöder året.`;

// Makes two spellings of the same address compare equal: no scheme, no "www.", no fragment,
// no trailing slash, and percent-encoded letters decoded (Wikipedia links come in both forms).
function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    let pathAndQuery = parsed.pathname.replace(/\/+$/, "") + parsed.search;
    try {
      pathAndQuery = decodeURIComponent(pathAndQuery);
    } catch (e) {
      // Keep the encoded form if it cannot be decoded
    }
    return parsed.hostname.toLowerCase().replace(/^www\./, "") + pathAndQuery;
  } catch (e) {
    return null;
  }
}

/**
 * Finds the search result that the address Claude wrote refers to, or null.
 *
 * Where an address ends cannot be guessed from the text: it may be followed by a full stop or a
 * markdown bracket that is not part of it, and real addresses end with such characters too
 * (".../Blue_(Da_Ba_Dee)", ".../Boom,_Boom,_Boom,_Boom!!"). So the text is compared with the search
 * results as written, and then with one trailing punctuation character removed at a time.
 */
function findSearchResult(writtenUrl, searchResults) {
  let candidate = String(writtenUrl || "");
  while (candidate) {
    const normalized = normalizeUrl(candidate);
    const match = normalized ? searchResults.find(result => normalizeUrl(result.url) === normalized) : null;
    if (match) return match;
    if (!/[)\].,;:!?]$/.test(candidate)) return null;
    candidate = candidate.slice(0, -1);
  }
  return null;
}

/**
 * Reads the four answer lines out of Claude's text. The last line of each kind wins, so text
 * written before the searches cannot be mistaken for the answer.
 * Returns { year, sourceUrl, explanation, support }, or null if a line is missing or unreasonable.
 * sourceUrl is the address as written, which may have punctuation after it.
 */
function parseWebAnswer(text) {
  const fields = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^[\s*_-]*(år|källa|förklaring|stöd)[\s*_]*:\s*(.*)$/i);
    if (match) fields[match[1].toLowerCase()] = match[2].replace(/[*_]+$/, "").trim();
  }

  const yearMatch = (fields["år"] || "").match(/\b(\d{4})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : NaN;
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) return null;

  const supportMatch = (fields["stöd"] || "").toLowerCase().match(/tydligt|svagt|saknas/);
  if (!supportMatch) return null;

  const explanation = fields["förklaring"] || "";
  if (!explanation) return null;

  const urlMatch = (fields["källa"] || "").match(/https?:\/\/[^\s<>"]+/i);
  const sourceUrl = urlMatch ? urlMatch[0] : null;

  return { year, sourceUrl, explanation, support: supportMatch[0] };
}

/**
 * Turns Claude's text and the search results into the web review.
 * Returns { review, failure }: failure is "no_text" or "invalid_answer" when there is no usable answer.
 * The source counts as verified only if it is one of the pages the search actually returned.
 */
function buildWebReview(rawText, searchResults, spotifyYear) {
  if (!rawText) return { review: null, failure: "no_text" };

  const answer = parseWebAnswer(rawText);
  if (!answer) return { review: null, failure: "invalid_answer" };

  const hasSource = answer.support !== "saknas" && !!answer.sourceUrl;
  const matchingResult = hasSource ? findSearchResult(answer.sourceUrl, searchResults) : null;

  // A verified source is stored with the search result's own address, not Claude's spelling of it
  let sourceUrl = null;
  if (matchingResult) sourceUrl = matchingResult.url;
  else if (hasSource) sourceUrl = answer.sourceUrl;

  const review = {
    year: answer.year,
    changed: answer.year !== spotifyYear,
    explanation: answer.explanation,
    support: answer.support,
    sourceUrl,
    sourceTitle: matchingResult ? matchingResult.title : null,
    sourceVerified: !!matchingResult
  };
  return { review, failure: null };
}

function addUsage(total, usage) {
  if (!usage) return;
  for (const key of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) {
    total[key] += usage[key] || 0;
  }
  total.web_search_requests += (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
}

/**
 * Looks one song's release year up on the web.
 *
 * client: an Anthropic client (the caller sets the API key, timeout and retries)
 * song:   { title, artist, spotifyYear, albumName?, albumType?, releaseDate? }
 *
 * Returns { review, failure, meta }:
 *   review:  { year, changed, explanation, support, sourceUrl, sourceTitle, sourceVerified },
 *            or null when there is no usable answer. sourceVerified is true only when the address
 *            Claude gave is one of the search results in the same answer.
 *   failure: null, or "refusal" | "max_tokens" | "paused" | "no_text" | "invalid_answer"
 *   meta:    { model, stopReason, usage, requests, rawText, queries, searchResults, searchErrors, citations }
 *            usage is summed over all requests and includes web_search_requests
 * API errors are thrown to the caller.
 */
async function verifySongYearOnWeb(client, song) {
  const spotifyYear = parseInt(song.spotifyYear, 10);
  if (!Number.isInteger(spotifyYear)) {
    throw new Error("verifySongYearOnWeb needs a numeric spotifyYear.");
  }

  const tools = [{
    type: "web_search_20260318",
    name: "web_search",
    max_uses: WEB_MAX_SEARCHES,
    // Direct calls return the search results in the response, which the source check needs
    allowed_callers: ["direct"],
    user_location: { type: "approximate", country: "SE", timezone: "Europe/Stockholm" }
  }];
  const messages = [{ role: "user", content: buildYearReviewInput({ ...song, spotifyYear }) }];

  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0 };
  const blocks = [];
  let response = null;
  let requests = 0;

  while (requests <= WEB_MAX_CONTINUATIONS) {
    response = await client.beta.messages.create({
      model: REVIEW_MODEL,
      max_tokens: REVIEW_MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: YEAR_WEB_PROMPT,
      messages,
      tools,
      output_config: { effort: REVIEW_EFFORT }
    });
    requests++;
    addUsage(usage, response.usage);
    blocks.push(...response.content);

    if (response.stop_reason !== "pause_turn") break;
    // Send the paused answer back unchanged so Claude can continue the same turn
    messages.push({ role: "assistant", content: response.content });
  }

  const searchResults = [];
  const searchErrors = [];
  const queries = [];
  const citations = [];
  let rawText = "";
  for (const block of blocks) {
    if (block.type === "server_tool_use" && block.input && block.input.query) {
      queries.push(block.input.query);
    } else if (block.type === "web_search_tool_result") {
      // A failed search has an error object as content instead of a list of results
      if (Array.isArray(block.content)) {
        for (const result of block.content) {
          searchResults.push({ url: result.url, title: result.title, pageAge: result.page_age || null });
        }
      } else if (block.content && block.content.error_code) {
        searchErrors.push(block.content.error_code);
      }
    } else if (block.type === "text") {
      rawText += block.text;
      for (const citation of block.citations || []) {
        if (citation.url) citations.push({ url: citation.url, title: citation.title || null, citedText: citation.cited_text || null });
      }
    }
  }

  const meta = {
    model: response.model,
    stopReason: response.stop_reason,
    usage,
    requests,
    rawText: rawText || null,
    queries,
    searchResults,
    searchErrors,
    citations
  };

  if (response.stop_reason === "refusal") return { review: null, failure: "refusal", meta };
  if (response.stop_reason === "max_tokens") return { review: null, failure: "max_tokens", meta };
  if (response.stop_reason === "pause_turn") return { review: null, failure: "paused", meta };

  const { review, failure } = buildWebReview(rawText, searchResults, spotifyYear);
  return { review, failure, meta };
}

// ─── Decision: which year applies ────────────────────────────────────────────

/**
 * Decides the year from Spotify's year, the review from memory and the web review.
 * Pure function: tools/year-eval/report.js replays it over the saved measurement answers.
 *
 * review:    the answer from reviewSongYear, or null when there was no usable answer
 * webReview: the answer from verifySongYearOnWeb, or null when the web step did not run or failed
 *
 * Returns { year, source, status, reason, explanation, sourceUrl, sourceTitle }:
 *   source: "spotify" (Spotify's year stands), "web" (the search's year, with a verified source that
 *           clearly supports it) or "opus" (memory and search agree, but the source is weak)
 *   status: "ok", or "needsReview" when the song has to be settled by hand. A song that needs
 *           review keeps Spotify's year meanwhile; reason says why.
 */
function decideYear(spotifyYear, review, webReview) {
  const keepSpotify = (status, reason, explanation) => ({
    year: spotifyYear, source: "spotify", status, reason, explanation, sourceUrl: null, sourceTitle: null
  });

  if (!review) return keepSpotify("needsReview", "no_review", "");
  if (!review.changed) return keepSpotify("ok", null, review.explanation);

  // The review from memory changed the year. That is never accepted on its own: every gross error
  // in the measurement was a year changed from memory.
  if (!webReview) return keepSpotify("needsReview", "no_web_answer", "");

  if (webReview.sourceVerified && webReview.support === "tydligt") {
    return {
      year: webReview.year, source: "web", status: "ok", reason: null,
      explanation: webReview.explanation, sourceUrl: webReview.sourceUrl, sourceTitle: webReview.sourceTitle
    };
  }

  if (webReview.year === review.year) {
    // Two independent answers agree, so the year is accepted although the source is weak.
    // The address is kept only if it really was one of the search results.
    return {
      year: webReview.year, source: "opus", status: "ok", reason: null,
      explanation: webReview.explanation,
      sourceUrl: webReview.sourceVerified ? webReview.sourceUrl : null,
      sourceTitle: webReview.sourceVerified ? webReview.sourceTitle : null
    };
  }

  return keepSpotify("needsReview", "weak_support", "");
}

/**
 * Runs the whole chain for one song: review from memory, a web search if the year was changed,
 * and the decision.
 *
 * client: an Anthropic client (the caller sets the API key, timeout and retries)
 * song:   { title, artist, spotifyYear, albumName?, albumType?, releaseDate? }
 *
 * Returns { decision, review, reviewFailure, webReview, webFailure, usage }:
 *   decision: the result of decideYear
 *   usage:    { review, web } with the token usage of each step (web is null when it did not run)
 * API errors are thrown to the caller.
 */
async function resolveSongYear(client, song) {
  const spotifyYear = parseInt(song.spotifyYear, 10);
  if (!Number.isInteger(spotifyYear)) {
    throw new Error("resolveSongYear needs a numeric spotifyYear.");
  }

  const memory = await reviewSongYear(client, song);
  const web = memory.review && memory.review.changed ? await verifySongYearOnWeb(client, song) : null;

  return {
    decision: decideYear(spotifyYear, memory.review, web ? web.review : null),
    review: memory.review,
    reviewFailure: memory.failure,
    webReview: web ? web.review : null,
    webFailure: web ? web.failure : null,
    usage: { review: memory.meta.usage, web: web ? web.meta.usage : null }
  };
}

module.exports = {
  REVIEW_MODEL,
  REVIEW_EFFORT,
  YEAR_REVIEW_PROMPT,
  YEAR_REVIEW_SCHEMA,
  YEAR_WEB_PROMPT,
  SUPPORT_LEVELS,
  buildYearReviewInput,
  toValidReview,
  reviewSongYear,
  normalizeUrl,
  parseWebAnswer,
  buildWebReview,
  verifySongYearOnWeb,
  decideYear,
  resolveSongYear
};
