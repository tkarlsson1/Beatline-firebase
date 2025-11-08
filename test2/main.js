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
const db = getDatabase(app);
const auth = getAuth(app);

// Exponera globalt
window.app = app;
window.firebaseDb = db;
window.firebaseRef = ref;
window.firebasePush = push;
window.firebaseOnValue = onValue;
window.firebaseSet = set;
window.firebaseUpdate = update;
window.auth = auth;

// Globala variabler
window.currentPlaylistName = null;
window.currentSpotifyID = null;

// Öppna redigeringsmodal
function openEditYearModal(playlistName, spotifyID, currentYear) {
  window.currentPlaylistName = playlistName;
  window.currentSpotifyID = spotifyID;
  document.getElementById("newYearInput").value = currentYear;
  document.getElementById("editYearModal").style.display = "flex";
}
window.openEditYearModal = openEditYearModal;

// Stäng redigeringsmodal
function closeEditYearModal() {
  document.getElementById("editYearModal").style.display = "none";
}
window.closeEditYearModal = closeEditYearModal;

// Uppdatera customYear i databasen
function updateCustomYear(playlistName, spotifyID, newYear) {
  const songRef = ref(db, `userPlaylists/${auth.currentUser.uid}/${playlistName}/songs/${spotifyID}`);
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

// Datalagring
let standardSongs = [];
let userPlaylistSongs = [];
let songs = [];
let sourceFilteredSongs = [];
let currentFilteredSongs = [];
let shownSongs = [];
let currentSong = null;
// Initiera datalyssnare när användaren är inloggad
function initDataListeners() {
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

  const userId = auth.currentUser.uid;
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
// Vänta tills DOM är laddad
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

  // Inloggning
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

  // Registrering
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

  // Växla mellan login och register
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

  // Glömt lösenord
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
function updateAllaCheckbox() {
  const nonAlla = document.querySelectorAll('input[name="source"]:not([value="alla"])');
  const allaBox = document.querySelector('input[name="source"][value="alla"]');
  let allChecked = true;
  nonAlla.forEach(chk => {
    if (!chk.checked) {
      allChecked = false;
    }
  });
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
  checkboxAll.addEventListener("change", function () {
    const allSourceCheckboxes = document.querySelectorAll('input[name="source"]');
    allSourceCheckboxes.forEach(chk => {
      chk.checked = this.checked;
    });
    updateYearSelection();
  });

  const labelAll = document.createElement("label");
  labelAll.setAttribute("for", "source-alla");
  labelAll.textContent = "Alla låtar";

  allDiv.appendChild(checkboxAll);
  allDiv.appendChild(labelAll);
  allHeader.appendChild(allDiv);
  container.appendChild(allHeader);

  // 👇 Dessa rader ska vara inuti funktionen
  const playlistSources = new Set();
  songs.forEach(song => {
    song.source.forEach(src => playlistSources.add(src));
  });

  playlistSources.forEach((sourceName) => {
    const div = document.createElement("div");
    div.classList.add("checkbox-pill");
    div.style.display = "inline-block";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "source";
    checkbox.value = sourceName;
    checkbox.id = "source-" + sourceName;
    checkbox.checked = true;
    checkbox.addEventListener("change", updateAllaCheckbox);

    const label = document.createElement("label");
    label.setAttribute("for", "source-" + sourceName);
    label.textContent = sourceName;

    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
  });

  updateAllaCheckbox();
  updateYearSelection();
} // ✅ korrekt avslutning
function renderSong(song) {
  const container = document.getElementById("song-display");
  container.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = song.title;

  const artist = document.createElement("p");
  artist.textContent = "Artist: " + song.artist;

  const year = document.createElement("p");
  year.textContent = "År: " + song.year;

  const source = document.createElement("p");
  source.textContent = "Källa: " + song.source.join(", ");

  const qrImage = document.createElement("img");
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(song.qr)}&size=150x150`;
  qrImage.alt = "QR-kod";

  const nextButton = document.createElement("button");
  nextButton.textContent = "Nästa låt";
  nextButton.className = "next-song-button";
  nextButton.addEventListener("click", showNextSong);

  container.appendChild(title);
  container.appendChild(artist);
  container.appendChild(year);
  container.appendChild(source);
  container.appendChild(qrImage);
  container.appendChild(nextButton);
}
function startQuiz() {
  if (!currentSong) {
    alert("Ingen låt är vald.");
    return;
  }

  const container = document.getElementById("song-display");
  container.innerHTML = "";

  const question = document.createElement("p");
  question.textContent = `Vilket år tror du att "${currentSong.title}" släpptes?`;

  const input = document.createElement("input");
  input.type = "number";
  input.id = "yearGuess";
  input.placeholder = "Ange årtal";

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "Gissa";
  submitBtn.className = "answer-button";
  submitBtn.addEventListener("click", checkAnswer);

  container.appendChild(question);
  container.appendChild(input);
  container.appendChild(submitBtn);
}

function checkAnswer() {
  const guess = parseInt(document.getElementById("yearGuess").value);
  const container = document.getElementById("song-display");

  if (isNaN(guess)) {
    alert("Ange ett giltigt årtal.");
    return;
  }

  const correctYear = currentSong.year;
  const result = document.createElement("p");

  if (guess === correctYear) {
    result.textContent = "Rätt gissat!";
    result.style.color = "green";
  } else {
    result.textContent = `Fel. Rätt årtal är ${correctYear}.`;
    result.style.color = "red";
  }

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Nästa låt";
  nextBtn.className = "next-song-button";
  nextBtn.addEventListener("click", showNextSong);

  container.appendChild(result);
  container.appendChild(nextBtn);
}
