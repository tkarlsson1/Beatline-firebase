// ============================================
// FIREBASE CONFIGURATION AND INITIALIZATION
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Expose Firebase to global scope
window.app = app;
window.firebaseDb = db;
window.firebaseRef = ref;
window.firebasePush = push;
window.firebaseOnValue = onValue;
window.firebaseSet = set;
window.firebaseUpdate = update;
window.auth = auth;
window.firebaseSignOut = signOut;

// Global variables for playlist management
window.currentPlaylistName = null;
window.currentSpotifyID = null;

// Variables for data reading
let standardSongs = [];
let userPlaylistSongs = [];
let songs = [];
let sourceFilteredSongs = [];
let currentFilteredSongs = [];
let shownSongs = [];
let currentSong = null;

// ========== EDIT YEAR MODAL FUNCTIONS ==========
function openEditYearModal(playlistName, spotifyID, currentYear) {
  window.currentPlaylistName = playlistName;
  window.currentSpotifyID = spotifyID;
  document.getElementById("newYearInput").value = currentYear;
  document.getElementById("editYearModal").style.display = "flex";
}
window.openEditYearModal = openEditYearModal;

function closeEditYearModal() {
  document.getElementById("editYearModal").style.display = "none";
}
window.closeEditYearModal = closeEditYearModal;

function updateCustomYear(playlistName, spotifyID, newYear) {
  const songRef = ref(db, `userPlaylists/${window.auth.currentUser.uid}/${playlistName}/songs/${spotifyID}`);
  return update(songRef, { customYear: newYear })
    .then(() => {
      console.log("customYear uppdaterades till", newYear);
      mergeSongs();
    })
    .catch((error) => {
      console.error("Fel vid uppdatering av customYear:", error);
      alert("Något gick fel vid uppdatering: " + error.message);
      throw error;
    });
}
window.updateCustomYear = updateCustomYear;

// ========== DATA LISTENERS ==========
function initDataListeners() {
  // Read standard playlists
  onValue(ref(db, 'standardLists'), (snapshot) => {
    if (snapshot.exists()) {
      const rawPlaylists = snapshot.val();
      standardSongs = [];
      for (const playlistName in rawPlaylists) {
        const playlistData = rawPlaylists[playlistName];
        if (playlistData.songs) {
          const tracks = playlistData.songs;
          for (const trackId in tracks) {
            standardSongs.push({
              qr: trackId,
              ...tracks[trackId],
              source: [playlistName]
            });
          }
        }
      }
      mergeSongs();
    } else {
      console.error("Inga standardspellistor hittades i 'standardLists'.");
      standardSongs = [];
      mergeSongs();
    }
  });
  
  // Read user playlists
  const userId = window.auth.currentUser.uid;
  onValue(ref(db, 'userPlaylists/' + userId), (snapshot) => {
    console.log("Hämtar spellistor för användare:", userId);
    if (snapshot.exists()) {
      const userPlaylistsData = snapshot.val();
      userPlaylistSongs = [];
      
      for (const playlistName in userPlaylistsData) {
        const playlistData = userPlaylistsData[playlistName];
        if (playlistData.songs) {
          const tracks = playlistData.songs;
          for (const trackId in tracks) {
            userPlaylistSongs.push({
              qr: trackId,
              ...tracks[trackId],
              source: [playlistName]
            });
          }
        }
      }
      
      console.log("Hämtade användarspellistor:", userPlaylistSongs);
      mergeSongs();
    } else {
      console.log("Inga användarspellistor hittades för UID:", userId);
      userPlaylistSongs = [];
      mergeSongs();
    }
  });
}

// ========== SONG MERGING ==========
function mergeSongs() {
  const merged = {};
  
  // Process standard lists first
  standardSongs.forEach(song => {
    merged[song.qr] = { ...song, source: [...song.source] };
  });
  
  // Then process user playlists
  userPlaylistSongs.forEach(song => {
    if (merged[song.qr]) {
      merged[song.qr].source = [...new Set([...merged[song.qr].source, ...song.source])];
    } else {
      const yearToUse = song.customYear ? song.customYear : song.year;
      merged[song.qr] = { ...song, year: yearToUse, source: [...song.source] };
    }
  });
  
  songs = Object.values(merged);
  console.log("Sammankopplade låtar (unika spår):", songs.length);
  populateSourceCheckboxes();
}

// ========== CHECKBOX MANAGEMENT ==========
function updateAllaCheckbox() {
  const nonAlla = document.querySelectorAll('input[name="source"]:not([value="alla"])');
  const allaBox = document.querySelector('input[name="source"][value="alla"]');
  let allChecked = true;
  nonAlla.forEach(chk => { if (!chk.checked) { allChecked = false; } });
  allaBox.checked = allChecked;
}

function populateSourceCheckboxes() {
  const container = document.getElementById("source-checkbox-container");
  container.innerHTML = "";
  
  // "Alla låtar" checkbox
  const allHeader = document.createElement("div");
  allHeader.className = "allHeader";
  
  const allDiv = document.createElement("div");
  allDiv.classList.add("checkbox-pill");
  allDiv.style.display = "inline-block";
  const checkboxAll = document.createElement("input");
  checkboxAll.type = "checkbox";
  checkboxAll.name = "source";
  checkboxAll.value = "alla";
  checkboxAll.id = "source-alla";
  checkboxAll.addEventListener("change", function() {
    const allSourceCheckboxes = document.querySelectorAll('input[name="source"]');
    allSourceCheckboxes.forEach(chk => { chk.checked = this.checked; });
    updateYearSelection();
  });
  const labelAll = document.createElement("label");
  labelAll.setAttribute("for", "source-alla");
  labelAll.textContent = "Alla låtar";
  allDiv.appendChild(checkboxAll);
  allDiv.appendChild(labelAll);
  allHeader.appendChild(allDiv);
  container.appendChild(allHeader);
  
  // Standard playlists heading
  const standardHeading = document.createElement("p");
  standardHeading.className = "subheading";
  standardHeading.textContent = "Standardlistor";
  container.appendChild(standardHeading);
  
  let standardSources = Array.from(new Set(standardSongs.map(song => song.source[0])));
  standardSources.sort();
  if (standardSources.length > 0) {
    standardSources.forEach(source => {
      const div = document.createElement("div");
      div.classList.add("checkbox-pill");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "source";
      checkbox.value = source;
      const id = "standard-" + source.replace(/\s+/g, '-').toLowerCase();
      checkbox.id = id;
      checkbox.addEventListener("change", function() {
        updateAllaCheckbox();
        updateYearSelection();
      });
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = source;
      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }
  
  // Divider
  let divider = document.createElement("div");
  divider.className = "divider";
  container.appendChild(divider);
  
  // User playlists heading
  const userHeading = document.createElement("p");
  userHeading.className = "subheading";
  userHeading.textContent = "Egna spellistor";
  container.appendChild(userHeading);
  
  let userSources = Array.from(new Set(userPlaylistSongs.map(song => song.source[0])));
  userSources = userSources.filter(src => !standardSources.includes(src));
  userSources.sort();
  if (userSources.length > 0) {
    userSources.forEach(source => {
      const div = document.createElement("div");
      div.classList.add("checkbox-pill");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "source";
      checkbox.value = source;
      const id = "user-" + source.replace(/\s+/g, '-').toLowerCase();
      checkbox.id = id;
      checkbox.addEventListener("change", function() {
        updateAllaCheckbox();
        updateYearSelection();
      });
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = source;
      div.appendChild(checkbox);
      div.appendChild(label);
      container.appendChild(div);
    });
  }
}

// ========== SONG COUNT UPDATE ==========
function updateSongCount() {
  const startYear = parseInt(document.getElementById("startYear").value);
  const endYear = parseInt(document.getElementById("endYear").value);
  
  const filteredSongCount = sourceFilteredSongs.filter(song =>
    parseInt(song.year) >= startYear && parseInt(song.year) <= endYear
  ).length;
  
  const songCountElement = document.getElementById("selectedSongCount");
  if (songCountElement) {
    songCountElement.textContent = `Valda låtar: ${filteredSongCount}`;
  } else {
    console.error("Elementet 'selectedSongCount' hittades inte i DOM.");
  }
}

// ========== YEAR SELECTION ==========
window.updateYearSelection = function() {
  const checkedBoxes = document.querySelectorAll('input[name="source"]:checked');
  let selectedSources = Array.from(checkedBoxes).map(cb => cb.value);
  
  if (selectedSources.includes("alla")) {
    const allStandard = Array.from(new Set(standardSongs.map(song => song.source[0])));
    const allUser = Array.from(new Set(userPlaylistSongs.map(song => song.source[0])));
    selectedSources = [...new Set([...allStandard, ...allUser, "alla"])];
  }
  
  sourceFilteredSongs = songs.filter(song =>
    song.source.some(src => selectedSources.includes(src))
  );
  
  const startYearDropdown = document.getElementById("startYear");
  const endYearDropdown = document.getElementById("endYear");
  
  startYearDropdown.innerHTML = "";
  endYearDropdown.innerHTML = "";
  
  const thisYear = new Date().getFullYear();
  for (let year = 1950; year <= thisYear; year++) {
    const optionStart = document.createElement("option");
    optionStart.value = year;
    optionStart.textContent = year;
    if (year === 1950) optionStart.selected = true;
    startYearDropdown.appendChild(optionStart);
    
    const optionEnd = document.createElement("option");
    optionEnd.value = year;
    optionEnd.textContent = year;
    if (year === 2025) optionEnd.selected = true;
    endYearDropdown.appendChild(optionEnd);
    
    // Hover effects
    optionStart.addEventListener("mouseenter", function() {
      optionStart.style.backgroundColor = "#0b939c";
      optionStart.style.color = "#fff";
    });
    
    optionStart.addEventListener("mouseleave", function() {
      optionStart.style.backgroundColor = "#032934";
    });
    
    optionEnd.addEventListener("mouseenter", function() {
      optionEnd.style.backgroundColor = "#0b939c";
      optionEnd.style.color = "#fff";
    });
    
    optionEnd.addEventListener("mouseleave", function() {
      optionEnd.style.backgroundColor = "#032934";
    });
  }
  
  startYearDropdown.addEventListener("change", function() {
    updateSongCount();
  });
  
  endYearDropdown.addEventListener("change", function() {
    updateSongCount();
  });
  
  updateSongCount();
};

// ========== FILTER AND GAME FUNCTIONS ==========
window.filterSongs = function() {
  const startYear = parseInt(document.getElementById("startYear").value);
  const endYear = parseInt(document.getElementById("endYear").value);
  
  currentFilteredSongs = sourceFilteredSongs.filter(song =>
    parseInt(song.year) >= startYear && parseInt(song.year) <= endYear
  );
  
  updateSongCount();
  
  shownSongs = [];
  if (currentFilteredSongs.length > 0) {
    nextSong();
    return true;
  } else {
    alert("Inga låtar hittades i den valda perioden.");
    document.getElementById("song-display").innerHTML = "";
    return false;
  }
};

window.applyFilter = function() {
  if (filterSongs()) {
    document.getElementById("filter-page").style.display = "none";
    document.getElementById("result-page").style.display = "block";
    updateSongCount();
  }
};

window.nextSong = function() {
  const remainingSongs = currentFilteredSongs.filter(song => !shownSongs.includes(song));
  if (remainingSongs.length === 0) {
    alert("Inga fler låtar, tryck på menyvalet 'Startsida' för att börja om.");
    return;
  }
  const randomIndex = Math.floor(Math.random() * remainingSongs.length);
  currentSong = remainingSongs[randomIndex];
  shownSongs.push(currentSong);
  let playlistInfo = document.getElementById("playlist-info");
  if (playlistInfo) {
    playlistInfo.style.display = "none";
  }
  displaySong(currentSong);
};

window.restart = function() {
  shownSongs = [];
  currentSong = null;
  document.getElementById("song-display").innerHTML = "";
};

async function displaySong(song) {
  const displayYear = song.customYear ? song.customYear : song.year;

  const standardListNames = (typeof standardSongs !== "undefined" && standardSongs.length)
    ? Array.from(new Set(standardSongs.map(s => s.source[0])))
    : [];

  const isUserSong = !song.source.some(src => standardListNames.includes(src));

  // Check if Spotify Web Playback is available
  const hasSpotifyPlayer = window.spotifyPlayer && window.spotifyPlayer.getDeviceId();

  console.log('🎵 displaySong() called');
  console.log('  Song ID:', song.qr);
  console.log('  Spotify Player available:', !!window.spotifyPlayer);
  console.log('  Device ID:', hasSpotifyPlayer || 'not available');

  const songDisplay = document.getElementById("song-display");

  if (hasSpotifyPlayer) {
    // USE SPOTIFY WEB PLAYBACK
    console.log('✅ Using Spotify Web Playback');

    songDisplay.innerHTML = `
      <div id="now-playing-indicator" style="
        background: rgba(29, 185, 84, 0.1);
        width: 60%;
        color: white;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        margin: 0 auto 1.5rem auto;
        box-shadow: 0 4px 12px rgba(29, 185, 84, 0.2);
        animation: pulse 2s ease-in-out infinite;
      ">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">♪</div>
        <div style="font-size: 1.2rem; font-weight: bold; text-shadow: 0 0 10px rgba(0,0,0,0.8);">Nu spelar...</div>
        <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 5px; text-shadow: 0 0 8px rgba(0,0,0,0.8);">Lyssna på Spotify</div>
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.95; }
        }
      </style>
      <button class="answer-button" onclick="revealDetails()">Visa svar</button>
      <div id="song-details" style="display: none; margin-top: 1rem; font-weight: bold;">
        <div class="year-container" style="text-align: center; width: 100%;">
          <span style="display: inline-block; position: relative;">
            <span class="year-text" style="font-size: 4em; color: #fff; text-shadow: 0 0 8px #000;">
              ${displayYear}
            </span>
            ${
              isUserSong
                ? `<i class="edit-icon" style="position: absolute; right: -2em; top: 50%; transform: translateY(-50%) scale(1.5) scaleX(-1); color: #0a6e73; cursor: pointer;"
                     onclick="openEditYearModal('${song.source[0]}', '${song.qr}', '${displayYear}')">✎</i>`
                : ``
            }
          </span>
        </div>
        <div class="info" style="font-size: 1.4em; color: #fff; text-shadow: 0 0 8px #000;">
          ${song.artist}<br>${song.title}
        </div>
      </div>
    `;

    // Play the track via Spotify Web Playback SDK
    try {
      console.log('  Calling spotifyPlayer.play()...');
      const success = await window.spotifyPlayer.play(song.qr);

      if (success) {
        console.log('  ✅ Playback started successfully');
      } else {
        console.error('  ❌ Playback failed, falling back to QR code');
        // Fallback to QR code if playback fails
        showQRCodeFallback(song, displayYear, isUserSong);
      }
    } catch (error) {
      console.error('  ❌ Error playing track:', error);
      // Fallback to QR code on error
      showQRCodeFallback(song, displayYear, isUserSong);
    }

  } else {
    // FALLBACK TO QR CODE
    console.log('ℹ️ Using QR code fallback (Spotify player not available)');
    showQRCodeFallback(song, displayYear, isUserSong);
  }

  let playlistInfoElement = document.getElementById("playlist-info");
  if (playlistInfoElement) {
    playlistInfoElement.innerText = "Spellistor: " + song.source.join(", ");
  }
}

// Helper function to show QR code fallback
function showQRCodeFallback(song, displayYear, isUserSong) {
  const songDisplay = document.getElementById("song-display");
  songDisplay.innerHTML = `
    <div id="qrcode-${song.qr}" class="qrcode"></div>
    <button class="answer-button" onclick="revealDetails()">Visa svar</button>
    <div id="song-details" style="display: none; margin-top: 1rem; font-weight: bold;">
      <div class="year-container" style="text-align: center; width: 100%;">
        <span style="display: inline-block; position: relative;">
          <span class="year-text" style="font-size: 4em; color: #fff; text-shadow: 0 0 8px #000;">
            ${displayYear}
          </span>
          ${
            isUserSong
              ? `<i class="edit-icon" style="position: absolute; right: -2em; top: 50%; transform: translateY(-50%) scale(1.5) scaleX(-1); color: #0a6e73; cursor: pointer;"
                   onclick="openEditYearModal('${song.source[0]}', '${song.qr}', '${displayYear}')">✎</i>`
              : ``
          }
        </span>
      </div>
      <div class="info" style="font-size: 1.4em; color: #fff; text-shadow: 0 0 8px #000;">
        ${song.artist}<br>${song.title}
      </div>
    </div>
  `;
  generateQRCode(song.qr);
  console.log('  QR code generated for track:', song.qr);
}

window.generateQRCode = function(qr) {
  const spotifyUrl = `https://open.spotify.com/track/${qr}`;
  const qrElement = document.getElementById(`qrcode-${qr}`);
  qrElement.innerHTML = "";
  new QRCode(qrElement, { text: spotifyUrl, width: 160, height: 160 });
};

window.revealDetails = function() {
  document.getElementById("song-details").style.display = "block";
  let playlistInfo = document.getElementById("playlist-info");
  if (playlistInfo) {
    playlistInfo.style.display = "block";
  }
};

window.goToFilter = function() {
  const checkboxes = document.querySelectorAll('input[name="source"]');
  checkboxes.forEach(checkbox => { checkbox.checked = false; });
  updateYearSelection();
  restart();
  document.getElementById("result-page").style.display = "none";
  document.getElementById("filter-page").style.display = "block";
};

// ========== AUTHENTICATION HANDLERS ==========
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("Inloggad användare:", user.email);
      document.getElementById("loginModal").style.display = "none";
      document.getElementById("registerModal").style.display = "none";
      initDataListeners();
    } else {
      console.log("Ingen användare inloggad.");
      document.getElementById("loginModal").style.display = "flex";
    }
  });
  
  const loginButton = document.getElementById("loginButton");
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      const email = document.getElementById("emailInput").value.trim();
      const password = document.getElementById("passwordInput").value;
      signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
          console.log("Inloggning lyckades:", userCredential.user.email);
          document.getElementById("loginError").style.display = "none";
        })
        .catch((error) => {
          console.error("Inloggningsfel:", error);
          document.getElementById("loginError").style.display = "block";
        });
    });
  }
  
  const registerButton = document.getElementById("registerButton");
  if (registerButton) {
    registerButton.addEventListener("click", () => {
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
          console.log("Registrering lyckades:", userCredential.user.email);
          document.getElementById("registerError").style.display = "none";
          document.getElementById("registerModal").style.display = "none";
        })
        .catch((error) => {
          console.error("Registreringsfel:", error);
          document.getElementById("registerError").style.display = "block";
          document.getElementById("registerError").textContent = error.message;
        });
    });
  }
  
  const showRegisterBtn = document.getElementById("showRegister");
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", () => {
      document.getElementById("loginModal").style.display = "none";
      document.getElementById("registerModal").style.display = "flex";
    });
  }
  
  const showLoginBtn = document.getElementById("showLogin");
  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => {
      document.getElementById("registerModal").style.display = "none";
      document.getElementById("loginModal").style.display = "flex";
    });
  }
  
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      const email = document.getElementById("emailInput").value.trim();
      if (!email) {
        alert("Ange din e-postadress för att återställa lösenordet.");
        return;
      }
      sendPasswordResetEmail(auth, email)
        .then(() => {
          alert("En återställningslänk har skickats till din e-post.");
        })
        .catch((error) => {
          console.error("Fel vid återställning av lösenord:", error);
          alert("Fel: " + error.message);
        });
    });
  }
});
