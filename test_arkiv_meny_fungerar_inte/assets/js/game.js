
/**
 * game.js — core game logic for the test build
 * - Merges standard + user playlists + customYears
 * - Rebuilds source checkboxes
 * - Global functions used by HTML: applyFilter, nextSong, revealDetails, goToFilter, updateYearSelection
 */
import { auth, db, ref, get } from './firebase.js';
import { ensureAuthed, updateCustomYear as fbUpdateCustomYear } from './firebase.js';

if (!window.ns) window.ns = {};

// ---------- State ----------
let standardSongs = [];
let userPlaylistSongs = [];
let customYearMap = {};   // { spotifyId: {year, ...meta} }
let songs = [];           // merged unique by qr (spotify track id)
let sourceFilteredSongs = [];
let currentFilteredSongs = [];
let shownSongs = [];
let currentSong = null;

function toKey(str){ return String(str).replace(/[.#$/[\]]/g, '_'); }
function escapeHTML(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
const $ = (sel)=>document.querySelector(sel);
const $id = (id)=>document.getElementById(id);

// Build year dropdowns once
function buildYearDropdowns(start=1950, end=(new Date().getFullYear())){
  const startSel = $id('startYear');
  const endSel = $id('endYear');
  if (!startSel || !endSel) return;

  const prevStart = parseInt(startSel.value || start, 10);
  const prevEnd = parseInt(endSel.value || end, 10);

  startSel.innerHTML = '';
  endSel.innerHTML = '';

  for (let y=start; y<=end; y++){
    const o1 = document.createElement('option');
    o1.value = y; o1.textContent = y;
    const o2 = document.createElement('option');
    o2.value = y; o2.textContent = y;
    startSel.appendChild(o1);
    endSel.appendChild(o2);
  }
  startSel.value = Number.isFinite(prevStart) ? prevStart : start;
  endSel.value = Number.isFinite(prevEnd) ? prevEnd : end;

  startSel.addEventListener('change', updateSongCount);
  endSel.addEventListener('change', updateSongCount);
}

// Checkbox helpers
function updateAllaCheckbox(){
  const nonAlla = document.querySelectorAll('input[name="source"]:not([value="alla"])');
  const allaBox = document.querySelector('input[name="source"][value="alla"]');
  if (!allaBox) return;
  let allChecked = true;
  nonAlla.forEach(chk => { if (!chk.checked) allChecked = false; });
  allaBox.checked = allChecked;
}

function populateSourceCheckboxes(){
  const container = $id('source-checkbox-container');
  if (!container) return;
  container.innerHTML = '';

  // "Alla låtar"
  const allDiv = document.createElement('div');
  allDiv.className = 'checkbox-pill';
  const checkboxAll = document.createElement('input');
  checkboxAll.type = 'checkbox'; checkboxAll.name = 'source'; checkboxAll.value = 'alla'; checkboxAll.id = 'source-alla';
  const labelAll = document.createElement('label'); labelAll.setAttribute('for','source-alla'); labelAll.textContent = 'Alla låtar';
  checkboxAll.addEventListener('change', function(){
    const allSourceCheckboxes = document.querySelectorAll('input[name="source"]');
    allSourceCheckboxes.forEach(chk => { chk.checked = this.checked; });
    updateYearSelection();
  });
  allDiv.appendChild(checkboxAll); allDiv.appendChild(labelAll);
  container.appendChild(allDiv);

  // Standardlistor
  const standardHeading = document.createElement('p');
  standardHeading.className = 'subheading'; standardHeading.textContent = 'Standardlistor';
  container.appendChild(standardHeading);
  let standardSources = Array.from(new Set(standardSongs.map(song => song.source[0]))).sort();
  standardSources.forEach(source => {
    const div = document.createElement('div');
    div.className = 'checkbox-pill';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.name = 'source'; checkbox.value = source;
    const id = 'standard-' + source.replace(/\s+/g,'-').toLowerCase();
    checkbox.id = id;
    const label = document.createElement('label'); label.setAttribute('for', id); label.textContent = source;
    checkbox.addEventListener('change', function(){ updateAllaCheckbox(); updateYearSelection(); });
    div.appendChild(checkbox); div.appendChild(label);
    container.appendChild(div);
  });

  const divider = document.createElement('div'); divider.className = 'divider'; container.appendChild(divider);

  const userHeading = document.createElement('p');
  userHeading.className = 'subheading'; userHeading.textContent = 'Egna spellistor';
  container.appendChild(userHeading);
  let userSources = Array.from(new Set(userPlaylistSongs.map(song => song.source[0]))).filter(s => !standardSources.includes(s)).sort();
  userSources.forEach(source => {
    const div = document.createElement('div');
    div.className = 'checkbox-pill';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.name = 'source'; checkbox.value = source;
    const id = 'user-' + source.replace(/\s+/g,'-').toLowerCase();
    checkbox.id = id;
    const label = document.createElement('label'); label.setAttribute('for', id); label.textContent = source;
    checkbox.addEventListener('change', function(){ updateAllaCheckbox(); updateYearSelection(); });
    div.appendChild(checkbox); div.appendChild(label);
    container.appendChild(div);
  });
}

// --- Data merge ---
function mergeSongs(){
  const merged = {}; // key: qr (spotify id)

  // Standard first (trusted year)
  standardSongs.forEach(song => {
    merged[song.qr] = { ...song, source: [...song.source] };
  });

  // Then user lists (respect customYearMap only if not already in standard)
  userPlaylistSongs.forEach(song => {
    if (merged[song.qr]){
      merged[song.qr].source = [...new Set([...merged[song.qr].source, ...song.source])];
    } else {
      const override = customYearMap[song.qr]?.year;
      const yearToUse = Number.isFinite(parseInt(override,10)) ? parseInt(override,10) : song.year;
      merged[song.qr] = { ...song, year: yearToUse, source: [...song.source] };
    }
  });

  songs = Object.values(merged);
  sourceFilteredSongs = songs.slice();
  populateSourceCheckboxes();
  updateSongCount();
}

// --- Year selection (does NOT rebuild dropdowns) ---
function updateYearSelection(){
  const checked = Array.from(document.querySelectorAll('input[name="source"]:checked'));
  let selectedSources = checked.map(cb => cb.value);
  if (selectedSources.includes('alla')){
    const allStandard = [...new Set(standardSongs.map(s => s.source[0]))];
    const allUser = [...new Set(userPlaylistSongs.map(s => s.source[0]))];
    selectedSources = [...new Set([...allStandard, ...allUser])];
  }
  sourceFilteredSongs = songs.filter(song => song.source.some(src => selectedSources.includes(src)));
  updateSongCount();
}
window.updateYearSelection = updateYearSelection;

// --- Count visible songs within year span ---
function updateSongCount(){
  const startYear = parseInt($id('startYear')?.value || '1950',10);
  const endYear = parseInt($id('endYear')?.value || String(new Date().getFullYear()),10);
  const count = sourceFilteredSongs.filter(song => {
    const y = parseInt(song.year, 10);
    return Number.isFinite(y) && y >= startYear && y <= endYear;
  }).length;
  const el = $id('selectedSongCount');
  if (el) el.textContent = `Valda låtar: ${count}`;
}
window.updateSongCount = updateSongCount;

// --- Filtering + navigation ---
function filterSongs(){
  const startYear = parseInt($id('startYear').value, 10);
  const endYear = parseInt($id('endYear').value, 10);
  currentFilteredSongs = sourceFilteredSongs.filter(song => {
    const y = parseInt(song.year, 10);
    return Number.isFinite(y) && y >= startYear && y <= endYear;
  });
  shownSongs = [];
  updateSongCount();
  if (currentFilteredSongs.length > 0){
    nextSong();
    return true;
  } else {
    alert('Inga låtar hittades i den valda perioden.');
    $id('song-display').innerHTML = '';
    return false;
  }
}

function applyFilter(){
  if (filterSongs()){
    $id('filter-page').style.display = 'none';
    $id('result-page').style.display = 'block';
    updateSongCount();
  }
}
window.applyFilter = applyFilter;

function nextSong(){
  const remaining = currentFilteredSongs.filter(song => !shownSongs.includes(song));
  if (remaining.length === 0){
    alert("Inga fler låtar, tryck på menyvalet 'Startsida' för att börja om.");
    return;
  }
  const randomIndex = Math.floor(Math.random()*remaining.length);
  currentSong = remaining[randomIndex];
  shownSongs.push(currentSong);
  const pi = $id('playlist-info'); if (pi) pi.style.display = 'none';
  displaySong(currentSong);
}
window.nextSong = nextSong;

function revealDetails(){
  const el = $id('song-details');
  if (el) el.style.display = 'block';
  const pi = $id('playlist-info'); if (pi) pi.style.display = 'block';
}
window.revealDetails = revealDetails;

function goToFilter(){
  shownSongs = [];
  currentSong = null;
  $id('song-display').innerHTML = '';
  $id('result-page').style.display = 'none';
  $id('filter-page').style.display = 'block';
  updateSongCount();
}
window.goToFilter = goToFilter;

// --- Display ---
function generateQRCode(qr){
  const spotifyUrl = `https://open.spotify.com/track/${qr}`;
  const el = $id(`qrcode-${qr}`);
  if (!el) return;
  el.innerHTML = '';
  // QRCode is loaded globally from CDN in index.html
  new QRCode(el, { text: spotifyUrl, width: 160, height: 160 });
}
window.generateQRCode = generateQRCode;

function openEditYearModal(playlistName, spotifyID, currentYear){
  window.ns.currentPlaylistName = playlistName;
  window.ns.currentSpotifyID = spotifyID;
  const input = $id('newYearInput');
  if (input) input.value = String(currentYear || '');
  $id('editYearModal').style.display = 'flex';
}
window.openEditYearModal = openEditYearModal;

function closeEditYearModal(){
  $id('editYearModal').style.display = 'none';
}
window.closeEditYearModal = closeEditYearModal;

async function handleSaveYear(){
  const input = $id('newYearInput');
  const newYear = (input?.value || '').trim();
  if (!/^\d{4}$/.test(newYear)){
    alert('Ange ett giltigt årtal med 4 siffror.');
    return;
  }
  const name = window.ns.currentPlaylistName;
  const id = window.ns.currentSpotifyID;
  try {
    await fbUpdateCustomYear(name, id, newYear);
    customYearMap[id] = { year: parseInt(newYear,10) };
    mergeSongs();
    closeEditYearModal();
  } catch (e){
    console.error('Fel vid uppdatering av customYear:', e);
    alert('Något gick fel vid uppdatering: ' + (e?.message || e));
  }
}

function displaySong(song){
  const displayYear = (song.customYear ? song.customYear : song.year);
  const yearSafe = escapeHTML(String(displayYear ?? ''));
  const artistSafe = escapeHTML(String(song.artist ?? ''));
  const titleSafe = escapeHTML(String(song.title ?? ''));
  const qrSafe = escapeHTML(String(song.qr ?? ''));
  const standardListNames = Array.from(new Set(standardSongs.map(s => s.source[0])));
  const isUserSong = !song.source.some(src => standardListNames.includes(src));

  const songDisplay = $id('song-display');
  songDisplay.innerHTML = `
    <div id="qrcode-${qrSafe}" class="qrcode"></div>
    <button class="answer-button" onclick="revealDetails()">Visa svar</button>
    <div id="song-details" style="display: none; margin-top: 1rem; font-weight: bold;">
      <div class="year-container" style="text-align: center; width: 100%;">
        <span style="display: inline-block; position: relative;">
          <span class="year-text" style="font-size: 4em; color: #fff; text-shadow: 0 0 8px #000;">${yearSafe}</span>
          ${isUserSong
            ? `<i class="edit-icon" style="position: absolute; right: -2em; top: 50%; transform: translateY(-50%) scale(1.5) scaleX(-1); color: #0a6e73; cursor: pointer;"
                 onclick="openEditYearModal(${JSON.stringify(song.source[0] || '')}, ${JSON.stringify(song.qr || '')}, ${JSON.stringify(displayYear || '')})">✎</i>`
            : ``}
        </span>
      </div>
      <div class="info" style="font-size: 1.4em; color: #fff; text-shadow: 0 0 8px #000;">
        ${artistSafe}<br>${titleSafe}
      </div>
    </div>
  `;
  generateQRCode(song.qr);
  const pi = $id('playlist-info');
  if (pi) pi.innerText = 'Spellistor: ' + (song.source || []).join(', ');
}

// ---------- Data fetch ----------
async function fetchStandardLists(){
  const snap = await get(ref(db, 'standardLists'));
  return snap.exists() ? snap.val() : {};
}
async function fetchCustomYears(){
  const snap = await get(ref(db, 'customYears'));
  return snap.exists() ? snap.val() : {};
}
async function fetchUserListsAnyPath(uid){
  let snap = await get(ref(db, `userPlaylists/${uid}`));
  if (snap.exists()) return snap.val();
  snap = await get(ref(db, `users/${uid}/playlists`));
  if (snap.exists()) return snap.val();
  return {};
}
function flattenPlaylistsToSongs(map){
  const out = [];
  if (!map) return out;
  for (const pname of Object.keys(map)){
    const p = map[pname] || {};
    const tracks = p.songs || p.tracks || {};
    for (const id of Object.keys(tracks)){
      const t = tracks[id] || {};
      out.push({
        qr: id,
        title: t.title,
        artist: t.artist,
        year: parseInt(t.customYear || t.year, 10),
        source: [pname]
      });
    }
  }
  return out;
}

// ---------- Init ----------
async function init(){
  buildYearDropdowns();
  const saveBtn = $id('saveYearButton');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveYear);
  const closeBtn = $id('closeModal');
  if (closeBtn) closeBtn.addEventListener('click', () => window.closeEditYearModal());

  await ensureAuthed();
  const uid = auth.currentUser?.uid || null;
  const [stdMap, customMap, userMap] = await Promise.all([
    fetchStandardLists(),
    fetchCustomYears(),
    uid ? fetchUserListsAnyPath(uid) : Promise.resolve({})
  ]);

  customYearMap = {};
  Object.keys(customMap || {}).forEach(id => {
    const y = parseInt((customMap[id] || {}).year, 10);
    if (Number.isFinite(y)) customYearMap[id] = { year: y };
  });

  standardSongs = flattenPlaylistsToSongs(stdMap);
  userPlaylistSongs = flattenPlaylistsToSongs(userMap).map(s => {
    if (customYearMap[s.qr] && !standardSongs.find(o => o.qr === s.qr)){
      return { ...s, year: customYearMap[s.qr].year, customYear: customYearMap[s.qr].year };
    }
    return s;
  });

  mergeSongs();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
