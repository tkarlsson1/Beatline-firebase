/* module block #1 */
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
    
    const firebaseConfig = {
      apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
      authDomain: "beatlinefirebase.firebaseapp.com",
      databaseURL: "https://beatlinefirebase-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "beatlinefirebase",
      storageBucket: "beatlinefirebase.firebasestorage.app",
      messagingSenderId: "196231817325",
      appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
    };
    
    // Initiera Firebase
    const app = initializeApp(firebaseConfig);
    window.app = app;


const db = getDatabase(app);
// Expose Firebase APIs for non-module scripts
window.firebaseDb = db;
window.firebaseRef = ref;
window.firebasePush = push;

    window.firebaseOnValue = onValue;
window.firebaseSet = set;
window.firebaseUpdate = update;
const auth = getAuth(app);
      window.auth = auth;
// Gör de globala variablerna tillgängliga
    window.currentPlaylistName = null;
    window.currentSpotifyID = null;

    // Funktion för att öppna modal med redigeringsläge för customYear
    function openEditYearModal(playlistName, spotifyID, currentYear) {
      window.currentPlaylistName = playlistName;
      window.currentSpotifyID = spotifyID;
      document.getElementById("newYearInput").value = currentYear;
      document.getElementById("editYearModal").style.display = "flex";
    }
    // Exponera funktionen globalt
    window.openEditYearModal = openEditYearModal;
    
    // Funktion för att stänga redigeringsmodalen
    function closeEditYearModal() {
      document.getElementById("editYearModal").style.display = "none";
    }
    window.closeEditYearModal = closeEditYearModal;

    // Funktion för att uppdatera customYear i databasen
    function updateCustomYear(playlistName, spotifyID, newYear) {
      const songRef = ref(db, `userPlaylists/${window.auth.currentUser.uid}/${playlistName}/songs/${spotifyID}`);
      return update(songRef, { customYear: newYear })
        .then(() => {
          console.log("customYear uppdaterades till", newYear);
          mergeSongs(); // Uppdaterar låtlistan så att ändringen syns
        })
        .catch((error) => {
          console.error("Fel vid uppdatering av customYear:", error);
          alert("Något gick fel vid uppdatering: " + error.message);
          throw error;
        });
    }
    window.updateCustomYear = updateCustomYear;
    // Variabler för dataläsning
    let standardSongs = [];
    let userPlaylistSongs = [];
    let songs = [];
    let sourceFilteredSongs = [];
    let currentFilteredSongs = [];
    let shownSongs = [];
    let currentSong = null;
    
    // Funktion för att sätta fast databashanteringslyssnare – körs endast när en användare är inloggad.
    function initDataListeners() {
      // Läs standardspellistor (offentliga)
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
      
      // Läs användarspellistor endast för den inloggade användarens UID
      const userId = window.window.auth.currentUser.uid;
onValue(ref(db, 'userPlaylists/' + userId), (snapshot) => {
    console.log("Hämtar spellistor för användare:", userId);
    if (snapshot.exists()) {
        const userPlaylistsData = snapshot.val();
        userPlaylistSongs = [];

        for (const playlistName in userPlaylistsData) { // Iterera genom varje spellista
            const playlistData = userPlaylistsData[playlistName];
            if (playlistData.songs) {
                const tracks = playlistData.songs;
                for (const trackId in tracks) {
                    userPlaylistSongs.push({
                        qr: trackId,
                        ...tracks[trackId],
                        source: [playlistName] // Spara spellistans namn för filtrering
                    });
                }
            }
        }
        
        console.log("Hämtade användarspellistor:", userPlaylistSongs);
        mergeSongs(); // Uppdatera samtliga låtar
    } else {
        console.log("Inga användarspellistor hittades för UID:", userId);
        userPlaylistSongs = [];
        mergeSongs();
    }
});
    }
    
    // Vänta tills DOM är laddad
    document.addEventListener("DOMContentLoaded", () => {
      // Hantera autentiseringsstatus: om användaren är inloggad, initiera data, annars visa inloggningsmodal.
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
      
      // Inloggningsfunktion
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
      
      // Registreringsfunktion
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
      
      // Växla mellan modaler
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
      
      // Glömt lösenord-funktion
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
    
    // Funktioner för att hantera spellistor
   function mergeSongs() {
  const merged = {};
  
  // Först, bearbeta standardlistorna.
  standardSongs.forEach(song => {
    // Lägg in hela låtobjektet från standardlistor.
    // Här litar vi på att year-värdet är 100% korrekt.
    merged[song.qr] = { ...song, source: [...song.source] };
  });
  
  // Sedan, bearbeta användarspellistor.
  userPlaylistSongs.forEach(song => {
    if (merged[song.qr]) {
      // Låtens från standardlistor är betrodd – lägg till källan.
      merged[song.qr].source = [...new Set([...merged[song.qr].source, ...song.source])];
    } else {
      // Låten finns endast i användarspellistor.
      // Om användaren angett ett customYear, använd det; annars behåll inläst year.
      const yearToUse = song.customYear ? song.customYear : song.year;
      merged[song.qr] = { ...song, year: yearToUse, source: [...song.source] };
    }
  });
  
  songs = Object.values(merged);
  console.log("Sammankopplade låtar (unika spår):", songs.length);
  populateSourceCheckboxes();
}
    
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
      
      let divider = document.createElement("div");
      divider.className = "divider";
      container.appendChild(divider);
      
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
    
   function updateSongCount() {
    const startYear = parseInt(document.getElementById("startYear").value);
    const endYear = parseInt(document.getElementById("endYear").value);

    // Filtrera sourceFilteredSongs så att den endast räknar låtar inom årsspannet
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

        // Hover-effekt för individuella alternativ
        optionStart.addEventListener("mouseenter", function() {
            optionStart.style.backgroundColor = "#0b939c"; // Hover-färg
            optionStart.style.color = "#fff";
        });

        optionStart.addEventListener("mouseleave", function() {
            optionStart.style.backgroundColor = "#032934"; // Återställ färg
        });

        optionEnd.addEventListener("mouseenter", function() {
            optionEnd.style.backgroundColor = "#0b939c"; // Hover-färg
            optionEnd.style.color = "#fff";
        });

        optionEnd.addEventListener("mouseleave", function() {
            optionEnd.style.backgroundColor = "#032934"; // Återställ färg
        });
    }

    // Ändrar bakgrundsfärg på dropdown vid val och uppdaterar låträknaren direkt
    startYearDropdown.addEventListener("change", function() {
        updateSongCount(); // 🔥 Uppdatera låträknaren direkt vid ändring av årtal!
    });

    endYearDropdown.addEventListener("change", function() {
        updateSongCount(); // 🔥 Uppdatera låträknaren direkt vid ändring av årtal!
    });

    updateSongCount(); // ✅ Behåll detta här – säkerställer att låträknaren uppdateras vid spellisteval!
};



window.filterSongs = function() {
    const startYear = parseInt(document.getElementById("startYear").value);
    const endYear = parseInt(document.getElementById("endYear").value);
    
    currentFilteredSongs = sourceFilteredSongs.filter(song =>
        parseInt(song.year) >= startYear && parseInt(song.year) <= endYear
    );

    updateSongCount(); // ✅ Uppdatera låträknaren direkt efter att årsfiltreringen ändrats!

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
        updateSongCount(); // Uppdatera antalet valda låtar!
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

function displaySong(song) {
  // Bestäm vilket årtal som ska visas: customYear om det finns, annars song.year
  const displayYear = song.customYear ? song.customYear : song.year;
  
  // Hämta unika standardlistnamn från den globala variabeln standardSongs
  const standardListNames = (typeof standardSongs !== "undefined" && standardSongs.length)
    ? Array.from(new Set(standardSongs.map(s => s.source[0])))
    : [];
  
 // Pennikonen ska bara visas om ingen av låtens källor finns i standardlistorna
const isUserSong = !song.source.some(src => standardListNames.includes(src));

const songDisplay = document.getElementById("song-display");
songDisplay.innerHTML = `
  <div id="qrcode-${song.qr}" class="qrcode"></div>
  <button class="answer-button" onclick="revealDetails()">Visa svar</button>
  <div id="song-details" style="display: none; margin-top: 1rem; font-weight: bold;">
          <!-- Inline-container för att centrera årtalet -->
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
  
  let playlistInfoElement = document.getElementById("playlist-info");
  if (playlistInfoElement) {
    playlistInfoElement.innerText = "Spellistor: " + song.source.join(", ");
  }
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

    /***** NY SPOTIFY TOKEN OCH CACHING DEL *****/
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
    
    // Skriv användarspellistor under userPlaylists/<uid>/<playlistName>
      async function addPlaylistToFirebase(playlistName, playlistUrl) {
    try {
        console.log("Försöker hämta spellista:", playlistName);
        const tracks = await fetchSpotifyPlaylist(playlistUrl); // Hämta låtarna

        if (!tracks || Object.keys(tracks).length === 0) {
            alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
            return;
        }

        const userId = window.window.auth.currentUser.uid; // Endast lägga till i userPlaylists
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
      menuButton.innerHTML = "&#9776;"; // Hamburger-ikon
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
      
      // Menyalternativ
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
      
      
      const managePlaylistsLink = document.createElement("a");
      managePlaylistsLink.href = "#";
      managePlaylistsLink.textContent = "Hantera spellistor";
      managePlaylistsLink.addEventListener("click", (e) => {
        e.preventDefault();
        window.openManagePlaylists && window.openManagePlaylists();
        dropdownMenu.style.display = "none";
      });
      dropdownMenu.appendChild(managePlaylistsLink);
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
