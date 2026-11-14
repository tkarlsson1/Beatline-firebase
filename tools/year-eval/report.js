/**
 * report.js
 * Grades the rows from run-eval.js against facit.json and writes resultat.md. Makes no API calls.
 *
 * Usage:
 *   node tools/year-eval/report.js                  grade results/baseline
 *   node tools/year-eval/report.js --step web       grade the web step, writes web-resultat.md
 *   node tools/year-eval/report.js --run <name>     grade another run
 *   node tools/year-eval/report.js --selftest       check the grading itself with made-up answers
 *
 * Review step: three years are compared for every song that has a row:
 *   the game's year today, Spotify's year, and Spotify's year reviewed by Claude.
 * Web step: the year from the web search is accepted only when the source is one of the search
 *   results and Claude says the page clearly supports the year. Other songs go to manual review
 *   and keep Spotify's year meanwhile.
 * A gross error is a year more than grossErrorYears from every year in the answer key.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const FACIT_FILE = path.join(__dirname, "facit.json");

// USD per million tokens. Cache writes cost 1.25 x input and cache reads 0.1 x input.
const PRICES_PER_MTOK = {
  "claude-opus-5-5": { input: 4, output: 20 }
};
// Web search costs 10 USD per 1,000 searches on top of the tokens
const WEB_SEARCH_USD = 0.01;

function distanceToFacit(year, facitYears) {
  return Math.min(...facitYears.map(facitYear => Math.abs(year - facitYear)));
}

function isGrossError(year, facitYears, grossErrorYears) {
  return distanceToFacit(year, facitYears) > grossErrorYears;
}

// A song can have different years in different standard lists. The game is judged by its worst one.
function worstGameYear(gameYears, facitYears) {
  return gameYears.reduce((worst, year) =>
    distanceToFacit(year, facitYears) > distanceToFacit(worst, facitYears) ? year : worst);
}

function costUsd(row) {
  const price = PRICES_PER_MTOK[row.model];
  if (!price) return null;
  const usage = row.usage || {};
  const inputCost = (usage.input_tokens || 0) * price.input
    + (usage.cache_creation_input_tokens || 0) * price.input * 1.25
    + (usage.cache_read_input_tokens || 0) * price.input * 0.1;
  return (inputCost + (usage.output_tokens || 0) * price.output) / 1e6
    + (usage.web_search_requests || 0) * WEB_SEARCH_USD;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Grades every song that has a row.
 * Returns one entry per song with the three years and what the review did.
 */
function gradeSongs(cases, rows, grossErrorYears) {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const graded = [];
  for (const evalCase of cases) {
    const row = rowById.get(evalCase.id);
    if (!row) continue;

    const review = row.review || null;
    // Without a usable answer the year stays Spotify's, which is what the app would keep
    const reviewedYear = review ? review.year : evalCase.spotifyYear;
    const changed = review ? review.year !== evalCase.spotifyYear : false;
    const confidence = review ? review.confidence : null;
    const gameYear = worstGameYear(evalCase.gameYears, evalCase.facitYears);

    graded.push({
      evalCase,
      row,
      hasAnswer: !!review,
      gameYear,
      reviewedYear,
      changed,
      confidence,
      explanation: review ? review.explanation : "",
      gameGross: isGrossError(gameYear, evalCase.facitYears, grossErrorYears),
      spotifyGross: isGrossError(evalCase.spotifyYear, evalCase.facitYears, grossErrorYears),
      reviewedGross: isGrossError(reviewedYear, evalCase.facitYears, grossErrorYears),
      // Songs that would go on to a web search: the year was changed, or the answer is not certain.
      // Strict counts "medium" as uncertain, loose only "low". No answer counts as uncertain in both.
      flaggedStrict: !review || changed || confidence !== "high",
      flaggedLoose: !review || changed || confidence === "low"
    });
  }
  return graded;
}

function countVariant(graded, yearOf) {
  const result = { gross: 0, exact: 0, withinOne: 0 };
  for (const song of graded) {
    const distance = distanceToFacit(yearOf(song), song.evalCase.facitYears);
    if (distance === 0) result.exact++;
    if (distance <= 1) result.withinOne++;
  }
  return result;
}

function summarise(graded) {
  const spotifyWrong = graded.filter(song => song.spotifyGross);
  const spotifyRight = graded.filter(song => !song.spotifyGross);
  const missed = spotifyWrong.filter(song => song.reviewedGross);
  const broken = spotifyRight.filter(song => song.reviewedGross);

  const game = countVariant(graded, song => song.gameYear);
  game.gross = graded.filter(song => song.gameGross).length;
  const spotify = countVariant(graded, song => song.evalCase.spotifyYear);
  spotify.gross = spotifyWrong.length;
  const reviewed = countVariant(graded, song => song.reviewedYear);
  reviewed.gross = missed.length + broken.length;

  const costs = graded.map(song => costUsd(song.row));
  const pricedCosts = costs.filter(cost => cost !== null);

  return {
    total: graded.length,
    noAnswer: graded.filter(song => !song.hasAnswer).length,
    otherModel: graded.filter(song => !PRICES_PER_MTOK[song.row.model]).length,
    game,
    spotify,
    reviewed,
    spotifyWrong: spotifyWrong.length,
    fixed: spotifyWrong.length - missed.length,
    missed,
    missedUnflaggedStrict: missed.filter(song => !song.flaggedStrict).length,
    missedUnflaggedLoose: missed.filter(song => !song.flaggedLoose).length,
    spotifyRight: spotifyRight.length,
    kept: spotifyRight.filter(song => !song.changed).length,
    changedStillRight: spotifyRight.filter(song => song.changed && !song.reviewedGross).length,
    broken,
    flaggedStrict: graded.filter(song => song.flaggedStrict).length,
    flaggedLoose: graded.filter(song => song.flaggedLoose).length,
    confidence: {
      high: graded.filter(song => song.confidence === "high").length,
      medium: graded.filter(song => song.confidence === "medium").length,
      low: graded.filter(song => song.confidence === "low").length
    },
    changedSongs: graded.filter(song => song.changed),
    costTotal: pricedCosts.reduce((sum, cost) => sum + cost, 0),
    costMin: pricedCosts.length ? Math.min(...pricedCosts) : null,
    costMedian: median(pricedCosts),
    costMax: pricedCosts.length ? Math.max(...pricedCosts) : null,
    inputTokens: graded.reduce((sum, song) => sum + ((song.row.usage || {}).input_tokens || 0), 0),
    outputTokens: graded.reduce((sum, song) => sum + ((song.row.usage || {}).output_tokens || 0), 0),
    latencyMedianMs: median(graded.map(song => song.row.latencyMs).filter(Number.isFinite))
  };
}

// Text from the answer key and from Claude goes into a markdown table, so pipes and line breaks are removed
function cell(value) {
  return String(value === null || value === undefined ? "" : value).replace(/\|/g, "/").replace(/\s*\r?\n\s*/g, " ");
}

function percent(part, whole) {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)} %`;
}

function usd(value) {
  return value === null ? "–" : `${value.toFixed(4)} USD`;
}

function songTable(songs) {
  const lines = [
    "| Artist | Titel | Facit | Spelet | Spotify | Opus | Säkerhet | Förklaring |",
    "|---|---|---|---|---|---|---|---|"
  ];
  for (const song of songs) {
    const c = song.evalCase;
    lines.push(`| ${cell(c.artist)} | ${cell(c.title)} | ${c.facitYears.join("/")} | ${song.gameYear} | ${c.spotifyYear} | ${song.hasAnswer ? song.reviewedYear : "inget svar"} | ${cell(song.confidence || "")} | ${cell(song.explanation)} |`);
  }
  return lines.join("\n");
}

function renderMarkdown(summary, runName, facit, errorCount) {
  const s = summary;
  const lines = [];
  lines.push(`# Mätning av årtal – ${runName}`);
  lines.push("");
  lines.push(`${s.total} av ${facit.cases.length} låtar i facit har ett svar. Grovt fel = mer än ${facit.grossErrorYears} år från facit.`);
  if (errorCount > 0) lines.push(`${errorCount} misslyckade anrop finns i errors.jsonl. De låtarna räknas inte här förrän de har körts om.`);
  if (s.noAnswer > 0) lines.push(`${s.noAnswer} låtar fick inget användbart svar. De behåller Spotifys år och räknas som osäkra.`);
  if (s.otherModel > 0) lines.push(`${s.otherModel} låtar besvarades av en annan modell än Opus 5.5. Deras kostnad saknas i summan.`);
  lines.push("");
  lines.push("## Jämförelse");
  lines.push("");
  lines.push("| Variant | Grova fel | Exakt rätt | Inom ±1 år |");
  lines.push("|---|---|---|---|");
  lines.push(`| Spelets år idag | ${s.game.gross} (${percent(s.game.gross, s.total)}) | ${s.game.exact} | ${s.game.withinOne} |`);
  lines.push(`| Spotifys år | ${s.spotify.gross} (${percent(s.spotify.gross, s.total)}) | ${s.spotify.exact} | ${s.spotify.withinOne} |`);
  lines.push(`| Spotify granskat av Opus | ${s.reviewed.gross} (${percent(s.reviewed.gross, s.total)}) | ${s.reviewed.exact} | ${s.reviewed.withinOne} |`);
  lines.push("");
  lines.push(`## De ${s.spotifyWrong} låtar där Spotify har grovt fel`);
  lines.push("");
  lines.push(`- Rättade av Opus: ${s.fixed}`);
  lines.push(`- Fortfarande grovt fel: ${s.missed.length}`);
  lines.push(`  - varav Opus behöll året och var säker (fångas inte av webbsökning): ${s.missedUnflaggedStrict}`);
  lines.push(`  - samma tal om bara "low" räknas som osäker: ${s.missedUnflaggedLoose}`);
  lines.push("");
  lines.push(`## De ${s.spotifyRight} låtar där Spotify ligger inom ${facit.grossErrorYears} år`);
  lines.push("");
  lines.push(`- Opus behöll året: ${s.kept}`);
  lines.push(`- Opus ändrade året, fortfarande inom ${facit.grossErrorYears} år: ${s.changedStillRight}`);
  lines.push(`- Opus förstörde ett rätt år: ${s.broken.length}`);
  lines.push("");
  lines.push("## Hur många låtar skulle gå vidare till webbsökning");
  lines.push("");
  lines.push(`- Året ändrat, eller säkerhet "medium" eller "low": ${s.flaggedStrict} (${percent(s.flaggedStrict, s.total)})`);
  lines.push(`- Året ändrat, eller säkerhet "low": ${s.flaggedLoose} (${percent(s.flaggedLoose, s.total)})`);
  lines.push(`- Säkerhet: ${s.confidence.high} high, ${s.confidence.medium} medium, ${s.confidence.low} low`);
  lines.push("");
  lines.push("## Kostnad");
  lines.push("");
  lines.push(`- Totalt: ${usd(s.costTotal)} för ${s.total} låtar (${s.inputTokens} tokens in, ${s.outputTokens} tokens ut)`);
  lines.push(`- Per låt: median ${usd(s.costMedian)}, lägst ${usd(s.costMin)}, högst ${usd(s.costMax)}`);
  lines.push(`- Svarstid per låt, median: ${s.latencyMedianMs === null ? "–" : (s.latencyMedianMs / 1000).toFixed(1) + " s"}`);
  lines.push("");
  lines.push(`## Låtar där Opus år är grovt fel (${s.missed.length + s.broken.length})`);
  lines.push("");
  lines.push(s.missed.length + s.broken.length > 0 ? songTable([...s.missed, ...s.broken]) : "Inga.");
  lines.push("");
  lines.push(`## Låtar där Opus ändrade året (${s.changedSongs.length})`);
  lines.push("");
  lines.push(s.changedSongs.length > 0 ? songTable(s.changedSongs) : "Inga.");
  lines.push("");
  return lines.join("\n");
}

// ─── Web step ────────────────────────────────────────────────────────────────

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (e) {
    return null;
  }
}

/**
 * Grades every song that has a row from the web step.
 * accepted: the source is one of the search results and Claude says it clearly supports the year.
 * A song that is not accepted goes to manual review and keeps Spotify's year meanwhile.
 */
function gradeWebSongs(cases, reviewRows, webRows, grossErrorYears) {
  const reviewById = new Map(reviewRows.map(row => [row.id, row.review]));
  const webById = new Map(webRows.map(row => [row.id, row]));
  const graded = [];
  for (const evalCase of cases) {
    const row = webById.get(evalCase.id);
    if (!row) continue;

    const web = row.review || null;
    const memory = reviewById.get(evalCase.id) || null;
    const accepted = !!web && web.sourceVerified === true && web.support === "tydligt";
    const finalYear = accepted ? web.year : evalCase.spotifyYear;

    let queueReason = null;
    if (!web) queueReason = "inget svar";
    else if (web.support === "saknas") queueReason = "ingen källa hittad";
    else if (!web.sourceVerified) queueReason = "källan fanns inte bland sökträffarna";
    else if (web.support === "svagt") queueReason = "svagt stöd";

    // What the review step did with the song decides which group it belongs to
    const memoryChanged = !!memory && memory.year !== evalCase.spotifyYear;
    const memoryCertain = !!memory && memory.confidence === "high";
    let group = "inget svar ur minnet";
    if (memory && memoryChanged && !memoryCertain) group = "ändrat, osäker";
    else if (memory && memoryChanged) group = "ändrat, säker";
    else if (memory && !memoryCertain) group = "behållet, osäker";
    else if (memory) group = "behållet, säker";

    graded.push({
      evalCase,
      row,
      web,
      accepted,
      queueReason,
      finalYear,
      group,
      memoryConfidence: memory ? memory.confidence : null,
      // How far the search's year is from the year Claude gave from memory
      webVsMemory: web && memory ? Math.abs(web.year - memory.year) : null,
      memoryYear: memory ? memory.year : null,
      memoryGross: memory ? isGrossError(memory.year, evalCase.facitYears, grossErrorYears) : null,
      spotifyGross: isGrossError(evalCase.spotifyYear, evalCase.facitYears, grossErrorYears),
      // The search's own year, whether or not it is accepted, shows how good the search is
      webGross: web ? isGrossError(web.year, evalCase.facitYears, grossErrorYears) : null,
      finalGross: isGrossError(finalYear, evalCase.facitYears, grossErrorYears),
      sourceHost: web && web.sourceUrl ? hostOf(web.sourceUrl) : null
    });
  }
  return graded;
}

function summariseWeb(graded) {
  const accepted = graded.filter(song => song.accepted);
  const queued = graded.filter(song => !song.accepted);
  const memoryWrong = graded.filter(song => song.memoryGross === true);
  const memoryRight = graded.filter(song => song.memoryGross === false);

  const hostCounts = {};
  for (const song of accepted) hostCounts[song.sourceHost] = (hostCounts[song.sourceHost] || 0) + 1;
  const queueReasons = {};
  for (const song of queued) queueReasons[song.queueReason] = (queueReasons[song.queueReason] || 0) + 1;

  const costs = graded.map(song => costUsd(song.row)).filter(cost => cost !== null);
  const searches = graded.map(song => (song.row.usage || {}).web_search_requests || 0);

  const groups = [];
  for (const name of ["ändrat, osäker", "ändrat, säker", "behållet, osäker", "behållet, säker", "inget svar ur minnet"]) {
    const songs = graded.filter(song => song.group === name);
    if (songs.length === 0) continue;
    groups.push({
      name,
      total: songs.length,
      memoryGross: songs.filter(song => song.memoryGross === true).length,
      webGross: songs.filter(song => song.webGross === true).length,
      accepted: songs.filter(song => song.accepted).length,
      acceptedGross: songs.filter(song => song.accepted && song.finalGross).length,
      queued: songs.filter(song => !song.accepted).length,
      sameAsMemory: songs.filter(song => song.webVsMemory === 0).length
    });
  }

  return {
    groups,
    // Songs where the search and the memory step are far apart: one of them is wrong
    disagreements: graded.filter(song => song.webVsMemory !== null && song.webVsMemory > 2),
    total: graded.length,
    noAnswer: graded.filter(song => !song.web).length,
    otherModel: graded.filter(song => !PRICES_PER_MTOK[song.row.model]).length,
    memoryGross: memoryWrong.length,
    webGross: graded.filter(song => song.webGross === true).length,
    accepted: accepted.length,
    acceptedGross: accepted.filter(song => song.finalGross),
    queued: queued.length,
    queuedSpotifyGross: queued.filter(song => song.spotifyGross).length,
    queueReasons,
    memoryWrong: memoryWrong.length,
    memoryWrongFixed: memoryWrong.filter(song => song.accepted && !song.finalGross).length,
    memoryWrongQueued: memoryWrong.filter(song => !song.accepted).length,
    memoryWrongStillWrong: memoryWrong.filter(song => song.accepted && song.finalGross).length,
    memoryRight: memoryRight.length,
    memoryRightKept: memoryRight.filter(song => song.accepted && !song.finalGross).length,
    memoryRightQueued: memoryRight.filter(song => !song.accepted).length,
    memoryRightBroken: memoryRight.filter(song => song.accepted && song.finalGross).length,
    hostCounts,
    costTotal: costs.reduce((sum, cost) => sum + cost, 0),
    costMin: costs.length ? Math.min(...costs) : null,
    costMedian: median(costs),
    costMax: costs.length ? Math.max(...costs) : null,
    searchesTotal: searches.reduce((sum, count) => sum + count, 0),
    searchesMedian: median(searches),
    inputTokens: graded.reduce((sum, song) => sum + ((song.row.usage || {}).input_tokens || 0), 0),
    outputTokens: graded.reduce((sum, song) => sum + ((song.row.usage || {}).output_tokens || 0), 0),
    latencyMedianMs: median(graded.map(song => song.row.latencyMs).filter(Number.isFinite))
  };
}

function renderWebMarkdown(summary, graded, runName, facit, errorCount) {
  const s = summary;
  const lines = [];
  lines.push(`# Mätning av webbsteget – ${runName}`);
  lines.push("");
  lines.push(`${s.total} låtar har ett svar från webbsteget. Grovt fel = mer än ${facit.grossErrorYears} år från facit.`);
  lines.push("Ett år godtas bara när källan finns bland sökträffarna och Opus anger att sidan tydligt stöder året. Övriga låtar går till manuell granskning och behåller Spotifys år så länge.");
  if (errorCount > 0) lines.push(`${errorCount} misslyckade anrop finns i web-errors.jsonl. De låtarna räknas inte här förrän de har körts om.`);
  if (s.otherModel > 0) lines.push(`${s.otherModel} låtar besvarades av en annan modell än Opus 5.5. Deras kostnad saknas i summan.`);
  lines.push("");
  lines.push("## Resultat");
  lines.push("");
  lines.push(`- Grova fel före webbsteget (Opus ur minnet): ${s.memoryGross} av ${s.total}`);
  lines.push(`- Grova fel i sökningens år, oavsett om det godtas: ${s.webGross} av ${s.total - s.noAnswer}`);
  lines.push(`- Godtagna år: ${s.accepted}, varav grovt fel: ${s.acceptedGross.length}`);
  lines.push(`- Till manuell granskning: ${s.queued}, varav Spotifys år är grovt fel: ${s.queuedSpotifyGross}`);
  for (const [reason, count] of Object.entries(s.queueReasons)) lines.push(`  - ${reason}: ${count}`);
  lines.push("");
  lines.push("## Per grupp");
  lines.push("");
  lines.push("Gruppen säger vad Opus gjorde ur minnet: ändrade eller behöll Spotifys år, och om säkerheten var high (säker) eller inte (osäker).");
  lines.push("");
  lines.push("| Grupp | Låtar | Grova fel ur minnet | Grova fel i sökningens år | Godtagna | Godtagna med grovt fel | Till granskning | Samma år som ur minnet |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const group of s.groups) {
    lines.push(`| ${group.name} | ${group.total} | ${group.memoryGross} | ${group.webGross} | ${group.accepted} | ${group.acceptedGross} | ${group.queued} | ${group.sameAsMemory} |`);
  }
  lines.push("");
  lines.push(`## Låtar där sökningen och minnet skiljer mer än ${facit.grossErrorYears} år (${s.disagreements.length})`);
  lines.push("");
  if (s.disagreements.length > 0) {
    lines.push("| Artist | Titel | Facit | Spotify | Opus ur minnet | Säkerhet | Sökning | Stöd | Vem har grovt fel |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const song of s.disagreements) {
      const c = song.evalCase;
      let wrong = "ingen";
      if (song.memoryGross && song.webGross) wrong = "båda";
      else if (song.memoryGross) wrong = "minnet";
      else if (song.webGross) wrong = "sökningen";
      lines.push(`| ${cell(c.artist)} | ${cell(c.title)} | ${c.facitYears.join("/")} | ${c.spotifyYear} | ${song.memoryYear} | ${cell(song.memoryConfidence)} | ${song.web.year} | ${cell(song.web.support)} | ${wrong} |`);
    }
  } else {
    lines.push("Inga.");
  }
  lines.push("");
  lines.push(`## De ${s.memoryWrong} låtar där Opus ur minnet hade grovt fel`);
  lines.push("");
  lines.push(`- Rättade med godtagen källa: ${s.memoryWrongFixed}`);
  lines.push(`- Till manuell granskning: ${s.memoryWrongQueued}`);
  lines.push(`- Godtagna men fortfarande grovt fel: ${s.memoryWrongStillWrong}`);
  lines.push("");
  lines.push(`## De ${s.memoryRight} låtar där Opus ur minnet hade rätt`);
  lines.push("");
  lines.push(`- Fortfarande rätt med godtagen källa: ${s.memoryRightKept}`);
  lines.push(`- Till manuell granskning: ${s.memoryRightQueued}`);
  lines.push(`- Förstörda (godtagna men grovt fel): ${s.memoryRightBroken}`);
  lines.push("");
  lines.push("## Källor som godtogs");
  lines.push("");
  const hosts = Object.entries(s.hostCounts).sort((a, b) => b[1] - a[1]);
  lines.push(hosts.length > 0 ? hosts.map(([host, count]) => `- ${cell(host)}: ${count}`).join("\n") : "Inga.");
  lines.push("");
  lines.push("## Kostnad");
  lines.push("");
  lines.push(`- Totalt: ${usd(s.costTotal)} för ${s.total} låtar (${s.searchesTotal} sökningar, ${s.inputTokens} tokens in, ${s.outputTokens} tokens ut)`);
  lines.push(`- Per låt: median ${usd(s.costMedian)}, lägst ${usd(s.costMin)}, högst ${usd(s.costMax)}`);
  lines.push(`- Sökningar per låt, median: ${s.searchesMedian === null ? "–" : s.searchesMedian}`);
  lines.push(`- Svarstid per låt, median: ${s.latencyMedianMs === null ? "–" : (s.latencyMedianMs / 1000).toFixed(1) + " s"}`);
  lines.push("");
  lines.push("## Alla låtar");
  lines.push("");
  lines.push("| Grupp | Artist | Titel | Facit | Spotify | Opus ur minnet | Sökning | Stöd | Utfall | Källa | Förklaring |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const song of graded) {
    const c = song.evalCase;
    const outcome = song.accepted ? (song.finalGross ? "godtagen, GROVT FEL" : "godtagen") : `granskning: ${song.queueReason}`;
    // Angle brackets make the address a link without letting its characters break the table
    const source = song.web && song.web.sourceUrl ? `<${cell(song.web.sourceUrl).replace(/[<>]/g, "")}>` : "";
    lines.push(`| ${song.group} | ${cell(c.artist)} | ${cell(c.title)} | ${c.facitYears.join("/")} | ${c.spotifyYear} | ${song.memoryYear === null ? "" : song.memoryYear} | ${song.web ? song.web.year : "inget svar"} | ${song.web ? cell(song.web.support) : ""} | ${outcome} | ${source} | ${song.web ? cell(song.web.explanation) : ""} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(line => line.trim()).map(line => JSON.parse(line));
}

// Runs made-up answers through the grading: the answer key itself must give no gross errors,
// a constant wrong year must give only gross errors, and a missing answer must keep Spotify's year.
function selfTest(facit) {
  const usage = { input_tokens: 1000, output_tokens: 500 };
  const makeRows = makeReview => facit.cases.map(c => ({
    id: c.id, review: makeReview(c), failure: null, model: "claude-opus-5-5", usage, latencyMs: 1000
  }));
  const run = makeReview => summarise(gradeSongs(facit.cases, makeRows(makeReview), facit.grossErrorYears));

  const oracle = run(c => ({ year: c.facitYears[0], changed: c.facitYears[0] !== c.spotifyYear, explanation: "x", confidence: "high" }));
  const constant = run(() => ({ year: 1900, changed: true, explanation: "x", confidence: "high" }));
  const noAnswer = run(() => null);
  const keptSpotify = run(c => ({ year: c.spotifyYear, changed: false, explanation: "x", confidence: "high" }));

  const expectedCost = facit.cases.length * (1000 * 4 + 500 * 20) / 1e6;
  const checks = [
    ["answer key as answer gives 0 gross errors", oracle.reviewed.gross === 0],
    ["answer key as answer is exact for every song", oracle.reviewed.exact === oracle.total],
    ["answer key as answer fixes every song where Spotify is grossly wrong", oracle.fixed === oracle.spotifyWrong && oracle.broken.length === 0],
    ["constant year 1900 gives a gross error for every song", constant.reviewed.gross === constant.total],
    ["constant year 1900 breaks every song where Spotify was right", constant.broken.length === constant.spotifyRight],
    ["missing answers are counted as missing", noAnswer.noAnswer === noAnswer.total],
    ["missing answers keep Spotify's year", noAnswer.reviewed.gross === noAnswer.spotify.gross],
    ["missing answers all go on to web search", noAnswer.flaggedStrict === noAnswer.total && noAnswer.flaggedLoose === noAnswer.total],
    ["keeping Spotify's year with high confidence leaves every gross error unflagged", keptSpotify.missedUnflaggedStrict === keptSpotify.spotifyWrong && keptSpotify.flaggedStrict === 0],
    ["cost is calculated from tokens", Math.abs(oracle.costTotal - expectedCost) < 1e-9]
  ];

  // Web step: the same kind of made-up answers. The memory step is given a constant wrong year.
  const memoryRows = makeRows(() => ({ year: 1900, changed: true, explanation: "x", confidence: "low" }));
  const webUsage = { input_tokens: 10000, output_tokens: 500, web_search_requests: 2 };
  const runWeb = makeWeb => {
    const webRows = facit.cases.map(c => ({ id: c.id, review: makeWeb(c), failure: null, model: "claude-opus-5-5", usage: webUsage, latencyMs: 1000 }));
    return summariseWeb(gradeWebSongs(facit.cases, memoryRows, webRows, facit.grossErrorYears));
  };
  const webAnswer = (year, support, sourceVerified) => ({ year, changed: true, explanation: "x", support, sourceUrl: "https://example.org/a", sourceTitle: "A", sourceVerified });

  const webOracle = runWeb(c => webAnswer(c.facitYears[0], "tydligt", true));
  const webWrongAccepted = runWeb(() => webAnswer(1900, "tydligt", true));
  const webUnverified = runWeb(c => webAnswer(c.facitYears[0], "tydligt", false));
  const webWeak = runWeb(c => webAnswer(c.facitYears[0], "svagt", true));
  const webNoAnswer = runWeb(() => null);
  const expectedWebCost = facit.cases.length * ((10000 * 4 + 500 * 20) / 1e6 + 2 * 0.01);

  checks.push(
    ["web: answer key with a verified clear source is accepted for every song", webOracle.accepted === webOracle.total && webOracle.acceptedGross.length === 0],
    ["web: answer key fixes every song the memory step got wrong", webOracle.memoryWrongFixed === webOracle.memoryWrong && webOracle.memoryWrong === webOracle.total],
    ["web: a wrong year with a verified clear source is accepted and counted as a gross error", webWrongAccepted.acceptedGross.length === webWrongAccepted.total],
    ["web: a source that is not among the search results is never accepted", webUnverified.accepted === 0 && webUnverified.queued === webUnverified.total],
    ["web: weak support is never accepted", webWeak.accepted === 0 && webWeak.queueReasons["svagt stöd"] === webWeak.total],
    ["web: missing answers go to manual review", webNoAnswer.noAnswer === webNoAnswer.total && webNoAnswer.queued === webNoAnswer.total],
    ["web: cost includes the searches", Math.abs(webOracle.costTotal - expectedWebCost) < 1e-9]
  );

  let failed = 0;
  for (const [name, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
    if (!passed) failed++;
  }
  console.log(`${facit.cases.length} songs: Spotify grossly wrong on ${oracle.spotifyWrong}, within the limit on ${oracle.spotifyRight}; the game grossly wrong on ${oracle.game.gross}.`);
  if (failed > 0) process.exitCode = 1;
}

function main() {
  const argv = process.argv.slice(2);
  const facit = JSON.parse(fs.readFileSync(FACIT_FILE, "utf8"));

  if (argv.includes("--selftest")) {
    selfTest(facit);
    return;
  }

  const runIndex = argv.indexOf("--run");
  const runName = runIndex >= 0 ? argv[runIndex + 1] : "baseline";
  if (!/^[a-z0-9-]+$/i.test(runName || "")) throw new Error("--run needs a name with letters, digits or hyphens.");

  const runDir = path.join(__dirname, "results", runName);
  const rows = readJsonLines(path.join(runDir, "results.jsonl"));
  if (rows.length === 0) throw new Error(`No rows in ${path.relative(REPO_ROOT, runDir)}. Run run-eval.js first.`);

  const stepIndex = argv.indexOf("--step");
  const stepName = stepIndex >= 0 ? argv[stepIndex + 1] : "review";
  if (stepName !== "review" && stepName !== "web") throw new Error("--step must be review or web.");

  if (stepName === "web") {
    const webRows = readJsonLines(path.join(runDir, "web-results.jsonl"));
    if (webRows.length === 0) throw new Error(`No web rows in ${path.relative(REPO_ROOT, runDir)}. Run run-eval.js --step web first.`);
    const webDoneIds = new Set(webRows.map(row => row.id));
    const webErrorIds = new Set(readJsonLines(path.join(runDir, "web-errors.jsonl")).map(row => row.id).filter(id => !webDoneIds.has(id)));

    const gradedWeb = gradeWebSongs(facit.cases, rows, webRows, facit.grossErrorYears);
    const webMarkdown = renderWebMarkdown(summariseWeb(gradedWeb), gradedWeb, runName, facit, webErrorIds.size);
    const webOutputFile = path.join(runDir, "web-resultat.md");
    fs.writeFileSync(webOutputFile, webMarkdown);
    console.log(webMarkdown);
    console.log(`Written to ${path.relative(REPO_ROOT, webOutputFile)}`);
    return;
  }

  const doneIds = new Set(rows.map(row => row.id));
  // A song that failed earlier and later got a row is no longer an error
  const errorIds = new Set(readJsonLines(path.join(runDir, "errors.jsonl")).map(row => row.id).filter(id => !doneIds.has(id)));

  const summary = summarise(gradeSongs(facit.cases, rows, facit.grossErrorYears));
  const markdown = renderMarkdown(summary, runName, facit, errorIds.size);
  const outputFile = path.join(runDir, "resultat.md");
  fs.writeFileSync(outputFile, markdown);

  console.log(markdown);
  console.log(`Written to ${path.relative(REPO_ROOT, outputFile)}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
