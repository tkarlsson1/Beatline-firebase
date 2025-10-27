console.log("Using TEST RTDB:", "https://notestreamfire.europe-west1.firebasedatabase.app");
// Importera Firebase-moduler och initiera appen
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://beatlinefirebase-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

const app = initializeApp(firebaseConfig);
window.app = app;
\1
// === DEBUG DIAGNOSTICS (TEST) ===
try {
  console.log("Firebase app options", app?.options);
  console.log("Resolved databaseURL", app?.options?.databaseURL);
} catch(e){ console.warn("App options inspect failed", e); }
// === END DEBUG ===
const auth = getAuth(app);

// Globala variabler för låtdatabasen
let standardSongs = [];
let userPlaylistSongs = [];
let songs = [];
let sourceFilteredSongs = [];
let currentFilteredSongs = [];
let shownSongs = [];
let currentSong = null;

// Funktion för att lyssna på databasändringar (både standard- och användarspellistor)
function initDataListeners() {
  // Läs standardspellistor (offentliga)
  console.log("RTDB READ path:", \1);
onValue(ref(db, \1), (snapshot) => {
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
  
  // Läs användarspellistor baserat på aktuell användares UID
  const userId = auth.currentUser.uid;
  console.log("RTDB READ path:", \1);
onValue(ref(db, \1), (snapshot) => {
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

// Funktion för att slå samman låtarna från standard- och användarspellistor
function mergeSongs() {
  const merged = {};
  standardSongs.forEach(song => { merged[song.qr] = song; });
  userPlaylistSongs.forEach(song => {
    if (merged[song.qr]) {
      merged[song.qr].source = [...new Set([...merged[song.qr].source, ...song.source])];
    } else {
      merged[song.qr] = song;
    }
  });
  songs = Object.values(merged);
  console.log("? Sammankopplad låtsamling (unika spår):", songs.length);
  populateSourceCheckboxes();
}

// Uppdatera checkbox för "alla"
function updateAllaCheckbox() {
  const nonAlla = document.querySelectorAll('input[name="source"]:not([value="alla"])');
  const allaBox = document.querySelector('input[name="source"][value="alla"]');
  let allChecked = true;
  nonAlla.forEach(chk => { if (!chk.checked) { allChecked = false; } });
  allaBox.checked = allChecked;
}

// Populera checkboxarna baserat på låtdata
function populateSourceCheckboxes() {
  const container = document.getElementById("source-checkbox-container");
  container.innerHTML = "";

  // Checkbox för "Alla låtar"
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

  // Checkboxar för standardspellistor
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
  const divider = document.createElement("div");
  divider.className = "divider";
  container.appendChild(divider);

  // Checkboxar för användarspellistor
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

// Uppdatera låträknaren
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

// Globala funktioner för att filtrera och visa låtar
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

  for (let year = 1950; year <= 2025; year++) {
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
  displaySong(currentSong);
};

window.restart = function() {
  shownSongs = [];
  currentSong = null;
  document.getElementById("song-display").innerHTML = "";
};

function displaySong(song) {
  const songDisplay = document.getElementById("song-display");
  songDisplay.innerHTML = `
    <div id="qrcode-${song.qr}" class="qrcode"></div>
    <button class="answer-button" onclick="revealDetails()">Visa svar</button>
    <div id="song-details" style="display: none; margin-top: 1rem; font-weight: bold;">
      <div class="year" style="font-size: 4em; color: #fff; text-shadow: 0 0 8px #000;">${song.year}</div>
      <div class="info" style="font-size: 1.4em; color: #fff; text-shadow: 0 0 8px #000;">
        ${song.artist}<br>${song.title}
      </div>
    </div>
  `;
  generateQRCode(song.qr);
}

window.generateQRCode = function(qr) {
  const spotifyUrl = `https://open.spotify.com/track/${qr}`;
  const qrElement = document.getElementById(`qrcode-${qr}`);
  qrElement.innerHTML = "";
  new QRCode(qrElement, { text: spotifyUrl, width: 160, height: 160 });
};

window.revealDetails = function() {
  document.getElementById("song-details").style.display = "block";
};

window.goToFilter = function() {
  const checkboxes = document.querySelectorAll('input[name="source"]');
  checkboxes.forEach(checkbox => { checkbox.checked = false; });
  updateYearSelection();
  restart();
  document.getElementById("result-page").style.display = "none";
  document.getElementById("filter-page").style.display = "block";
};

// Spotify-token och caching
async function getBackendSpotifyToken() {
  console.log("getBackendSpotifyToken: Kontrollerar om cachat token finns...");
  const cachedToken = localStorage.getItem('spotifyToken');
  const tokenExpiry = localStorage.getItem('spotifyTokenExpiry');
  if (cachedToken && tokenExpiry && Date.now() < Number(tokenExpiry)) {
    console.log("Använder cachad token från backend:", cachedToken);
    return cachedToken;
  }
  try {
    console.log("Begär nytt token via backend...");
    const response = await fetch('https://api-grl2mze3sa-uc.a.run.app/getSpotifyToken', {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`HTTP-fel: ${response.status}`);
    }
    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in;
    const expiryTime = Date.now() + (expiresIn * 1000) - (60 * 1000);
    localStorage.setItem('spotifyToken', token);
    localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());
    console.log("Hämtat nytt token via backend:", token);
    return token;
  } catch (error) {
    console.error("Fel vid hämtning av token via backend:", error);
    return null;
  }
}

async function fetchSpotifyPlaylist(playlistUrl) {
  console.log("fetchSpotifyPlaylist: Playlist URL mottagen:", playlistUrl);
  const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
  console.log("fetchSpotifyPlaylist: Extraherat playlist-ID:", playlistId);
  const token = await getBackendSpotifyToken();
  let tracks = {};
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await response.json();
    data.items.forEach(item => {
      const trackId = item.track.id;
      tracks[trackId] = {
        title: item.track.name,
        artist: item.track.artists.map(artist => artist.name).join(", "),
        year: item.track.album.release_date ? item.track.album.release_date.substring(0, 4) : null
      };
    });
    nextUrl = data.next;
  }
  return tracks;
}

async function addPlaylistToFirebase(playlistName, playlistUrl) {
  try {
    console.log("Försöker hämta spellista:", playlistName);
    const tracks = await fetchSpotifyPlaylist(playlistUrl);
    if (!tracks || Object.keys(tracks).length === 0) {
      alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
      return;
    }
    const userId = auth.currentUser.uid;
    const userPlaylistsRef = ref(db, `userPlaylists/${userId}/${playlistName}`);
    await set(userPlaylistsRef, { songs: tracks });
    alert(`Spellistan "${playlistName}" har lagts till i dina spellistor!`);
  } catch (error) {
    console.error("Fel vid lagring av spellista:", error);
    alert("Något gick fel vid lagring av spellistan.");
  }
}

document.getElementById("addPlaylistButton").addEventListener("click", async () => {
  const playlistName = document.getElementById("playlistNameInput").value.trim();
  const playlistLink = document.getElementById("playlistLinkInput").value.trim();
  if (!playlistName || !playlistLink) {
    alert("Fyll i både spellistans namn och länk!");
    return;
  }
  await addPlaylistToFirebase(playlistName, playlistLink);
});

/***** MENY: Skapa en hamburgermeny i högra hörnet *****/
document.addEventListener("DOMContentLoaded", function() {
  const menuContainer = document.createElement("div");
  menuContainer.id = "menuContainer";
  menuContainer.style.position = "fixed";
  menuContainer.style.top = "10px";
  menuContainer.style.right = "2vw";
  menuContainer.style.zIndex = "9999";
  menuContainer.style.width = "60px";

  const menuButton = document.createElement("button");
  menuButton.id = "menuButton";
  menuButton.innerHTML = "&#9776;";
  menuButton.style.background = "none";
  menuButton.style.border = "none";
  menuButton.style.color = "#fff";
  menuButton.style.fontSize = "2rem";
  menuButton.style.cursor = "pointer";
  menuButton.style.zIndex = "9999";
  menuContainer.appendChild(menuButton);

  const dropdownMenu = document.createElement("div");
  dropdownMenu.id = "dropdownMenu";
  dropdownMenu.style.display = "none";
  dropdownMenu.style.position = "absolute";
  dropdownMenu.style.right = "0";
  dropdownMenu.style.top = "2.5rem";
  dropdownMenu.style.background = "#032934";
  dropdownMenu.style.border = "1px solid #fff";
  dropdownMenu.style.borderRadius = "4px";
  dropdownMenu.style.zIndex = "9999";
  dropdownMenu.style.width = "max-content";

  const lasForstLink = document.createElement("a");
  lasForstLink.href = "#";
  lasForstLink.textContent = "Läs först";
  lasForstLink.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("readmeModal").style.display = "block";
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(lasForstLink);

  const startpageLink = document.createElement("a");
  startpageLink.href = "#";
  startpageLink.textContent = "Startsida";
  startpageLink.addEventListener("click", (e) => {
    e.preventDefault();
    goToFilter();
    dropdownMenu.style.display = "none";
  });
  dropdownMenu.appendChild(startpageLink);

  const logoutLink = document.createElement("a");
  logoutLink.href = "#";
  logoutLink.textContent = "Logga ut";
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    signOut(auth)
      .then(() => {
        console.log("Utloggad!");
        document.getElementById("loginModal").style.display = "flex";
        dropdownMenu.style.display = "none";
      })
      .catch((error) => {
        console.error("Fel vid utloggning:", error);
      });
  });
  dropdownMenu.appendChild(logoutLink);

  menuContainer.appendChild(dropdownMenu);
  document.body.appendChild(menuContainer);

  menuButton.addEventListener("click", () => {
    dropdownMenu.style.display = dropdownMenu.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (event) => {
    if (!menuContainer.contains(event.target)) {
      dropdownMenu.style.display = "none";
    }
  });
});
