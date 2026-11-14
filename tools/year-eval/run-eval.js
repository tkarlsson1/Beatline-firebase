/**
 * run-eval.js
 * Runs the year review (functions/year-review.js) on the songs in facit.json and writes one row
 * per song. The answer key is never sent to Claude: only title, artist and Spotify's album data.
 *
 * Two steps:
 *   review   Claude reviews Spotify's year from memory. Runs on every song in the answer key.
 *   web      Claude looks the year up with a web search. Runs on the songs where the review step
 *            changed the year without being certain (confidence medium or low), or with
 *            --select flagged on every song where it changed the year or was not certain.
 *
 * Usage:
 *   node tools/year-eval/run-eval.js --pilot           review: 10 songs, 5 where Spotify is grossly wrong and 5 where it is not
 *   node tools/year-eval/run-eval.js                   review: all songs
 *   node tools/year-eval/run-eval.js --step web        web: the songs where the review step changed the year without being certain
 *   node tools/year-eval/run-eval.js --step web --select flagged    web: every song where the review step changed the year or was not certain
 *   node tools/year-eval/run-eval.js --step web --ids <id,id,...>   web: only these songs
 *   node tools/year-eval/run-eval.js --step web --reparse   web: read the saved answers again, no API calls
 * Options:
 *   --run <name>          result folder under tools/year-eval/results (default "baseline")
 *   --concurrency <n>     parallel requests (default 4)
 *
 * A song that already has a row is skipped, so an interrupted run can be restarted and a pilot's
 * songs are not paid for twice. Failed attempts go to the step's errors file and are tried again
 * on the next run.
 *
 * The API key is read from the environment variable ANTHROPIC_API_KEY if it is set, otherwise from
 * Secret Manager through the Firebase CLI. It is kept in memory only and never printed or saved.
 *
 * Summarise the result with: node tools/year-eval/report.js [--step web]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { createRequire } = require("module");

const REPO_ROOT = path.join(__dirname, "..", "..");
const FUNCTIONS_DIR = path.join(REPO_ROOT, "functions");
const FACIT_FILE = path.join(__dirname, "facit.json");

// Load the SDK from functions/node_modules, the same copy the Cloud Functions use
const requireFromFunctions = createRequire(path.join(FUNCTIONS_DIR, "package.json"));
const Anthropic = requireFromFunctions("@anthropic-ai/sdk");
const yearReview = require(path.join(FUNCTIONS_DIR, "year-review.js"));

const AI_SECRET = "ANTHROPIC_API_KEY";
const MAX_RETRIES = 2;
const PILOT_PER_GROUP = 5;

// What differs between the two steps. caseTimeoutMs is a hard ceiling per song, on top of the
// SDK's own timeout and retries. A web search takes longer than an answer from memory.
const STEPS = {
  review: {
    resultsFile: "results.jsonl",
    errorsFile: "errors.jsonl",
    tracesDir: "traces",
    runFile: "run.json",
    requestTimeoutMs: 90000,
    caseTimeoutMs: 300000,
    systemPrompt: yearReview.YEAR_REVIEW_PROMPT,
    run: (client, song) => yearReview.reviewSongYear(client, song)
  },
  web: {
    resultsFile: "web-results.jsonl",
    errorsFile: "web-errors.jsonl",
    tracesDir: "web-traces",
    runFile: "web-run.json",
    requestTimeoutMs: 180000,
    caseTimeoutMs: 600000,
    systemPrompt: yearReview.YEAR_WEB_PROMPT,
    run: (client, song) => yearReview.verifySongYearOnWeb(client, song)
  }
};

function parseArgs(argv) {
  const args = { pilot: false, run: "baseline", concurrency: 4, step: "review", ids: null, reparse: false, select: "uncertain-changes" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pilot") args.pilot = true;
    else if (argv[i] === "--reparse") args.reparse = true;
    else if (argv[i] === "--select") args.select = argv[++i];
    else if (argv[i] === "--run") args.run = argv[++i];
    else if (argv[i] === "--concurrency") args.concurrency = parseInt(argv[++i], 10);
    else if (argv[i] === "--step") args.step = argv[++i];
    else if (argv[i] === "--ids") args.ids = String(argv[++i] || "").split(",").map(id => id.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!/^[a-z0-9-]+$/i.test(args.run || "")) throw new Error("--run needs a name with letters, digits or hyphens.");
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) throw new Error("--concurrency needs a positive number.");
  if (!STEPS[args.step]) throw new Error(`--step must be one of: ${Object.keys(STEPS).join(", ")}`);
  if (args.pilot && args.step !== "review") throw new Error("--pilot is only for the review step. Use --ids to pick songs for the web step.");
  if (args.ids && args.ids.length === 0) throw new Error("--ids needs at least one id.");
  if (args.reparse && args.step !== "web") throw new Error("--reparse is only for the web step.");
  if (!WEB_SELECTIONS[args.select]) throw new Error(`--select must be one of: ${Object.keys(WEB_SELECTIONS).join(", ")}`);
  if (args.select !== "uncertain-changes" && args.step !== "web") throw new Error("--select is only for the web step.");
  return args;
}

/**
 * Rebuilds the review in every web row from the saved answer text and search results, after a
 * change to how the answer is read. Makes no API calls, so usage and cost stay as they were.
 */
function reparseWebRows(facit, resultsFile, tracesDir) {
  const caseById = new Map(facit.cases.map(c => [c.id, c]));
  const rows = readJsonLines(resultsFile);
  let changedCount = 0;
  const updatedRows = rows.map(row => {
    // A refusal, a cut-off answer or a paused turn has no answer text to read again
    if (row.failure && row.failure !== "invalid_answer" && row.failure !== "no_text") return row;
    const trace = JSON.parse(fs.readFileSync(path.join(tracesDir, `${row.id}.json`), "utf8"));
    const { review, failure } = yearReview.buildWebReview(trace.responseText, trace.searchResults, caseById.get(row.id).spotifyYear);
    if (JSON.stringify(review) !== JSON.stringify(row.review) || failure !== row.failure) changedCount++;
    return { ...row, review, failure };
  });
  fs.writeFileSync(resultsFile, updatedRows.map(row => JSON.stringify(row)).join("\n") + "\n");
  console.log(`Read ${rows.length} saved answers again; ${changedCount} rows changed.`);
}

function getApiKey() {
  if (process.env[AI_SECRET]) return process.env[AI_SECRET];

  let output;
  try {
    output = execSync(`firebase functions:secrets:access ${AI_SECRET}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (e) {
    // The CLI output is not included, so a key can never end up in an error message
    throw new Error(`Could not read ${AI_SECRET} through the Firebase CLI (exit code ${e.status}).`);
  }
  const key = output.split(/\r?\n/).map(line => line.trim()).find(line => /^sk-ant-\S+$/.test(line));
  if (!key) throw new Error(`The Firebase CLI did not return a value that looks like an API key for ${AI_SECRET}.`);
  return key;
}

function isGrossError(year, facitYears, grossErrorYears) {
  return facitYears.every(facitYear => Math.abs(year - facitYear) > grossErrorYears);
}

// The pilot takes the first songs by id from each side, so it is the same ten songs every time
function selectPilotCases(cases, grossErrorYears) {
  const spotifyWrong = cases.filter(c => isGrossError(c.spotifyYear, c.facitYears, grossErrorYears));
  const spotifyRight = cases.filter(c => !isGrossError(c.spotifyYear, c.facitYears, grossErrorYears));
  return [...spotifyWrong.slice(0, PILOT_PER_GROUP), ...spotifyRight.slice(0, PILOT_PER_GROUP)];
}

// Which songs the web step runs on, judged from the review step's answer for the song.
// A song without a usable review answer counts as flagged.
const WEB_SELECTIONS = {
  "uncertain-changes": (review, evalCase) => !!review && review.year !== evalCase.spotifyYear && review.confidence !== "high",
  "flagged": (review, evalCase) => !review || review.year !== evalCase.spotifyYear || review.confidence !== "high"
};

function selectWebCases(cases, reviewRows, selection) {
  const reviewById = new Map(reviewRows.map(row => [row.id, row.review]));
  // A song the review step has not run on is not selected
  return cases.filter(c => reviewById.has(c.id) && WEB_SELECTIONS[selection](reviewById.get(c.id), c));
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const step = STEPS[args.step];
  const facit = JSON.parse(fs.readFileSync(FACIT_FILE, "utf8"));

  const runDir = path.join(__dirname, "results", args.run);
  const tracesDir = path.join(runDir, step.tracesDir);
  const resultsFile = path.join(runDir, step.resultsFile);
  const errorsFile = path.join(runDir, step.errorsFile);
  fs.mkdirSync(tracesDir, { recursive: true });

  if (args.reparse) {
    reparseWebRows(facit, resultsFile, tracesDir);
    return;
  }

  let selected;
  if (args.step === "web") {
    const reviewRows = readJsonLines(path.join(runDir, STEPS.review.resultsFile));
    if (reviewRows.length === 0) throw new Error("The web step needs the review step's results. Run the review step first.");
    selected = selectWebCases(facit.cases, reviewRows, args.select);
  } else {
    selected = args.pilot ? selectPilotCases(facit.cases, facit.grossErrorYears) : facit.cases;
  }
  if (args.ids) {
    const unknownIds = args.ids.filter(id => !selected.some(c => c.id === id));
    if (unknownIds.length > 0) throw new Error(`These ids are not among the songs for the ${args.step} step: ${unknownIds.join(", ")}`);
    selected = selected.filter(c => args.ids.includes(c.id));
  }

  const doneIds = new Set(readJsonLines(resultsFile).map(row => row.id));
  const todo = selected.filter(c => !doneIds.has(c.id));
  console.log(`Step ${args.step}: ${selected.length} songs selected, ${selected.length - todo.length} already done, ${todo.length} to run.`);
  if (todo.length === 0) return;

  // The prompt and settings this run used, so a later run with a changed prompt can be told apart
  fs.writeFileSync(path.join(runDir, step.runFile), JSON.stringify({
    updatedAt: new Date().toISOString(),
    step: args.step,
    model: yearReview.REVIEW_MODEL,
    effort: yearReview.REVIEW_EFFORT,
    systemPrompt: step.systemPrompt
  }, null, 1) + "\n");

  const client = new Anthropic({ apiKey: getApiKey(), timeout: step.requestTimeoutMs, maxRetries: MAX_RETRIES });

  let okCount = 0;
  let noAnswerCount = 0;
  let errorCount = 0;

  async function runCase(evalCase) {
    const song = {
      title: evalCase.title,
      artist: evalCase.artist,
      spotifyYear: evalCase.spotifyYear,
      albumName: evalCase.albumName,
      albumType: evalCase.albumType,
      releaseDate: evalCase.releaseDate
    };
    const startedAt = Date.now();
    try {
      const { review, failure, meta } = await withTimeout(step.run(client, song), step.caseTimeoutMs);
      const latencyMs = Date.now() - startedAt;

      if (!meta.model || !meta.usage || !Number.isInteger(meta.usage.output_tokens)) {
        throw new Error("The response lacks model or usage, so cost cannot be calculated.");
      }

      // rawText goes into the trace under a clearer name; everything else in meta is kept as it is.
      // For the web step that includes the search queries, the search results and the citations.
      const { rawText, ...traceMeta } = meta;
      fs.writeFileSync(path.join(tracesDir, `${evalCase.id}.json`), JSON.stringify({
        id: evalCase.id,
        userMessage: yearReview.buildYearReviewInput(song),
        responseText: rawText,
        ...traceMeta
      }, null, 1) + "\n");

      // Written as soon as the song is done, so a crash does not lose finished songs
      const row = {
        id: evalCase.id,
        review,
        failure,
        model: meta.model,
        stopReason: meta.stopReason,
        usage: meta.usage,
        latencyMs
      };
      if (args.step === "web") {
        row.requests = meta.requests;
        row.searchResultCount = meta.searchResults.length;
        row.searchErrors = meta.searchErrors;
      }
      fs.appendFileSync(resultsFile, JSON.stringify(row) + "\n");

      if (review) okCount++; else noAnswerCount++;
    } catch (error) {
      errorCount++;
      fs.appendFileSync(errorsFile, JSON.stringify({
        id: evalCase.id,
        at: new Date().toISOString(),
        status: error instanceof Anthropic.APIError ? error.status : null,
        message: String(error.message).substring(0, 500)
      }) + "\n");
    }
    process.stdout.write(`\r${okCount + noAnswerCount + errorCount} / ${todo.length}`);
  }

  const queue = [...todo];
  const workers = Array.from({ length: Math.min(args.concurrency, queue.length) }, async () => {
    while (queue.length > 0) await runCase(queue.shift());
  });
  await Promise.all(workers);

  console.log(`\nDone: ${okCount} answered, ${noAnswerCount} without a usable answer, ${errorCount} failed (see ${step.errorsFile}).`);
  console.log(`Results in ${path.relative(REPO_ROOT, runDir)}`);
  if (errorCount > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
