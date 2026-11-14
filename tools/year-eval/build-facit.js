/**
 * build-facit.js
 * Builds facit.json, the answer key for the year measurement.
 *
 * Three groups of songs, all of them in today's standard lists:
 *   hand        years verified by hand in the old validation tool (listor/validation-results*.json, verifiedYear)
 *   hard-case   rows in svara-fall.csv where ratt_ar is filled in
 *   two-source  songs where MusicBrainz and iTunes agree (at most one year apart) and at least one
 *               standard list has a year more than 2 years from both
 * A song that is in several groups keeps the hand-checked year (hand, then hard-case).
 *
 * facit-rattelser.json holds years in the answer key that turned out to be wrong when they were
 * looked up, each with a reason and a source. A corrected year replaces the song's year here.
 *
 * The Spotify album data comes from the old validation files. The game's years are read from the
 * standard lists in the database (public read, nothing is written).
 *
 * Run: node tools/year-eval/build-facit.js
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const LISTOR_DIR = path.join(REPO_ROOT, "listor");
const HARD_CASES_FILE = path.join(__dirname, "svara-fall.csv");
const CORRECTIONS_FILE = path.join(__dirname, "facit-rattelser.json");
const OUTPUT_FILE = path.join(__dirname, "facit.json");
const STANDARD_LISTS_URL = "https://notestreamfire.europe-west1.firebasedatabase.app/standardLists.json";

// A year more than this many years from the answer key counts as a gross error
const GROSS_ERROR_YEARS = 2;
const TWO_SOURCE_MAX_GAP = 1;

function isGross(year, otherYear) {
  return Math.abs(year - otherYear) > GROSS_ERROR_YEARS;
}

// Reads every validation file and keeps one row per track, preferring a row with a verified year
function loadValidationRows() {
  const rows = new Map();
  const files = fs.readdirSync(LISTOR_DIR).filter(name => /^validation-results.*\.json$/.test(name));
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(LISTOR_DIR, file), "utf8"));
    for (const row of content) {
      const existing = rows.get(row.spotifyId);
      if (!existing || (row.verifiedYear != null && existing.verifiedYear == null)) {
        rows.set(row.spotifyId, row);
      }
    }
  }
  return rows;
}

// Returns Map(trackId -> year) for the rows in svara-fall.csv that have ratt_ar filled in.
// Only the first and last columns are read, so quoted titles do not need parsing.
function loadHardCaseYears() {
  const years = new Map();
  const lines = fs.readFileSync(HARD_CASES_FILE, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const id = line.substring(0, line.indexOf(";"));
    const year = parseInt(line.substring(line.lastIndexOf(";") + 1), 10);
    if (id && Number.isInteger(year)) years.set(id, year);
  }
  return years;
}

// Returns Map(trackId -> corrected year) from facit-rattelser.json
function loadCorrections() {
  const corrections = new Map();
  if (!fs.existsSync(CORRECTIONS_FILE)) return corrections;
  for (const entry of JSON.parse(fs.readFileSync(CORRECTIONS_FILE, "utf8"))) {
    if (!entry.id || !Number.isInteger(entry.year) || !entry.source) {
      throw new Error(`A correction needs id, year and source: ${JSON.stringify(entry)}`);
    }
    corrections.set(entry.id, entry.year);
  }
  return corrections;
}

// Returns Map(trackId -> { title, artist, years: sorted distinct years across all standard lists })
async function loadGameSongs() {
  const response = await fetch(STANDARD_LISTS_URL);
  if (!response.ok) throw new Error(`Could not read the standard lists: HTTP ${response.status}`);
  const lists = await response.json();

  const songs = new Map();
  for (const list of Object.values(lists)) {
    for (const [id, song] of Object.entries(list.songs || {})) {
      if (!song) continue;
      const year = parseInt(song.year, 10);
      if (!Number.isInteger(year)) continue;
      if (!songs.has(id)) songs.set(id, { title: song.title, artist: song.artist, years: new Set() });
      songs.get(id).years.add(year);
    }
  }
  for (const song of songs.values()) song.years = [...song.years].sort((a, b) => a - b);
  return songs;
}

async function main() {
  const validationRows = loadValidationRows();
  const hardCaseYears = loadHardCaseYears();
  const corrections = loadCorrections();
  const gameSongs = await loadGameSongs();

  const cases = [];
  const skipped = [];
  for (const row of validationRows.values()) {
    const gameSong = gameSongs.get(row.spotifyId);
    if (!gameSong) continue;

    let group = null;
    let facitYears = null;
    const handYear = row.verifiedYear != null ? parseInt(row.verifiedYear, 10) : NaN;
    if (Number.isInteger(handYear)) {
      group = "hand";
      facitYears = [handYear];
    } else if (hardCaseYears.has(row.spotifyId)) {
      group = "hard-case";
      facitYears = [hardCaseYears.get(row.spotifyId)];
    } else if (
      Number.isInteger(row.mbYear) && Number.isInteger(row.itunesYear) &&
      Math.abs(row.mbYear - row.itunesYear) <= TWO_SOURCE_MAX_GAP &&
      gameSong.years.some(year => isGross(year, row.mbYear) && isGross(year, row.itunesYear))
    ) {
      group = "two-source";
      facitYears = [...new Set([row.mbYear, row.itunesYear])].sort((a, b) => a - b);
    }
    if (!group) continue;

    const corrected = corrections.has(row.spotifyId);
    if (corrected) facitYears = [corrections.get(row.spotifyId)];

    const spotifyYear = parseInt(row.spotifyYear, 10);
    if (!Number.isInteger(spotifyYear) || !row.album || !row.albumType || !row.releaseDate) {
      skipped.push(row.spotifyId);
      continue;
    }

    cases.push({
      id: row.spotifyId,
      group,
      title: gameSong.title,
      artist: gameSong.artist,
      albumName: row.album,
      albumType: row.albumType,
      releaseDate: row.releaseDate,
      spotifyYear,
      gameYears: gameSong.years,
      facitYears,
      corrected
    });
  }

  const unusedCorrections = [...corrections.keys()].filter(id => !cases.some(c => c.id === id));
  if (unusedCorrections.length > 0) {
    throw new Error(`Corrections for songs that are not in the answer key: ${unusedCorrections.join(", ")}`);
  }

  if (skipped.length > 0) {
    throw new Error(`Songs in the answer key lack Spotify album data: ${skipped.join(", ")}`);
  }
  const missingHardCases = [...hardCaseYears.keys()].filter(id => !cases.some(c => c.id === id));
  if (missingHardCases.length > 0) {
    throw new Error(`Filled-in hard cases that are not in the validation files or the game: ${missingHardCases.join(", ")}`);
  }

  cases.sort((a, b) => a.id.localeCompare(b.id));
  const output = {
    generatedAt: new Date().toISOString(),
    grossErrorYears: GROSS_ERROR_YEARS,
    cases
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 1) + "\n");

  const countByGroup = {};
  for (const c of cases) countByGroup[c.group] = (countByGroup[c.group] || 0) + 1;
  console.log(`Wrote ${cases.length} songs to ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log("Per group:", JSON.stringify(countByGroup));
  console.log(`Corrected years: ${cases.filter(c => c.corrected).length}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
