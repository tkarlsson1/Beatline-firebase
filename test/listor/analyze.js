const fs = require('fs');
const path = require('path');

// Load all validation files
const dir = path.join(__dirname);
const files = fs.readdirSync(dir).filter(f => f.startsWith('validation-results') && f.endsWith('.json'));

let allTracks = [];
files.forEach(f => {
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log(`${f}: ${data.length} tracks`);
  allTracks = allTracks.concat(data);
});

// Filter out pre-verified
const tracks = allTracks.filter(t => !t.previouslyVerified);
const preVerified = allTracks.filter(t => t.previouslyVerified);

console.log(`\n=== TOTAL: ${allTracks.length} tracks (${tracks.length} new, ${preVerified.length} pre-verified) ===\n`);

// Status breakdown
const byStatus = { green: 0, yellow: 0, red: 0 };
tracks.forEach(t => byStatus[t.status]++);
console.log('--- STATUS ---');
console.log(`Green: ${byStatus.green} (${Math.round(byStatus.green/tracks.length*100)}%)`);
console.log(`Yellow: ${byStatus.yellow} (${Math.round(byStatus.yellow/tracks.length*100)}%)`);
console.log(`Red: ${byStatus.red} (${Math.round(byStatus.red/tracks.length*100)}%)`);

// Auto-approve
const autoApprove = tracks.filter(t => t.autoApproveCandidate);
console.log(`\nAuto-approve candidates: ${autoApprove.length} / ${tracks.length} = ${Math.round(autoApprove.length/tracks.length*100)}%`);

// iTunes analysis
const withItunes = tracks.filter(t => t.itunesYear);
const noItunes = tracks.filter(t => !t.itunesYear);
console.log(`\n--- ITUNES COVERAGE ---`);
console.log(`Has iTunes data: ${withItunes.length} (${Math.round(withItunes.length/tracks.length*100)}%)`);
console.log(`No iTunes data: ${noItunes.length}`);

// Title match quality
function normalize(str) {
  return (str || '').toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/ - .*remaster.*/i, '')
    .replace(/remaster.*/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let titleMatch = 0, titleMismatch = 0;
const mismatches = [];

withItunes.forEach(t => {
  const searchTitle = normalize(t.title);
  const itunesTitle = normalize(t.itunesData?.title || '');
  
  // Check if titles share significant overlap
  const shorter = searchTitle.length < itunesTitle.length ? searchTitle : itunesTitle;
  const longer = searchTitle.length >= itunesTitle.length ? searchTitle : itunesTitle;
  
  if (shorter.length >= 3 && longer.includes(shorter.substring(0, Math.min(8, shorter.length)))) {
    titleMatch++;
  } else {
    titleMismatch++;
    mismatches.push({
      searched: t.title,
      found: t.itunesData?.title,
      searchedYear: t.spotifyYear,
      itunesYear: t.itunesYear
    });
  }
});

console.log(`\n--- ITUNES TITLE MATCH ---`);
console.log(`Correct title: ${titleMatch} (${Math.round(titleMatch/withItunes.length*100)}%)`);
console.log(`Wrong title: ${titleMismatch} (${Math.round(titleMismatch/withItunes.length*100)}%)`);

if (mismatches.length > 0) {
  console.log(`\nWrong iTunes matches:`);
  mismatches.forEach(m => {
    console.log(`  "${m.searched}" → iTunes: "${m.found}" (${m.itunesYear})`);
  });
}

// iTunes vs MusicBrainz agreement
const withBoth = tracks.filter(t => t.itunesYear && t.earliestRecordingYear);
const bothAgree = withBoth.filter(t => t.itunesYear === t.earliestRecordingYear);
const itunesOlder = withBoth.filter(t => t.itunesYear < t.earliestRecordingYear);
const mbOlder = withBoth.filter(t => t.earliestRecordingYear < t.itunesYear);

console.log(`\n--- ITUNES vs MUSICBRAINZ ---`);
console.log(`Both have data: ${withBoth.length}`);
console.log(`Agree: ${bothAgree.length} (${Math.round(bothAgree.length/withBoth.length*100)}%)`);
console.log(`iTunes older: ${itunesOlder.length}`);
console.log(`MB older: ${mbOlder.length}`);

// Flag analysis for non-green tracks
console.log(`\n--- FLAG PATTERNS (yellow+red tracks) ---`);
const flagged = tracks.filter(t => t.status !== 'green');
const flagCounts = {};
flagged.forEach(t => {
  (t.flags || []).forEach(f => {
    flagCounts[f.type] = (flagCounts[f.type] || 0) + 1;
  });
});
Object.entries(flagCounts).sort((a,b) => b[1]-a[1]).forEach(([flag, count]) => {
  console.log(`  ${flag}: ${count} (${Math.round(count/flagged.length*100)}%)`);
});

// Key insight: tracks that are red but have correct recommended year
const redTracks = tracks.filter(t => t.status === 'red');
const redWithCorrectItunes = redTracks.filter(t => t.itunesYear && t.itunesYear === t.recommendedYear);
console.log(`\n--- RED TRACKS ANALYSIS ---`);
console.log(`Total red: ${redTracks.length}`);
console.log(`Red where iTunes confirms recommended year: ${redWithCorrectItunes.length}`);
console.log(`Red where autoApprove=true but status=red: ${redTracks.filter(t => t.autoApproveCandidate).length}`);

// Year difference distribution
console.log(`\n--- YEAR DIFF DISTRIBUTION (non-green) ---`);
const diffs = { '0': 0, '1': 0, '2-3': 0, '4-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
flagged.forEach(t => {
  const diff = Math.abs(t.spotifyYear - t.recommendedYear);
  if (diff === 0) diffs['0']++;
  else if (diff === 1) diffs['1']++;
  else if (diff <= 3) diffs['2-3']++;
  else if (diff <= 5) diffs['4-5']++;
  else if (diff <= 10) diffs['6-10']++;
  else if (diff <= 20) diffs['11-20']++;
  else diffs['21+']++;
});
Object.entries(diffs).forEach(([range, count]) => {
  console.log(`  ${range} years: ${count}`);
});
