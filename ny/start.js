// ============================================
// NOTESTREAM - START PAGE (index.html at the root of the site)
// Log in, open a new game (the choices are made in the lobby), and look after your own
// playlists. The playlist import itself is ../spotify.js. Helpers (generateGameId,
// TEAM_COLORS, validateTeamName, ...) come from ../lobby.js.
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

// The same public web configuration as ../firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west1");

// ../spotify.js reads these when a playlist is imported
window.firebaseDb = db;
window.firebaseRef = ref;
window.firebaseOnValue = onValue;
window.firebaseSet = set;
window.firebaseUpdate = update;
window.auth = auth;
window.firebaseFunctions = functions;
window.httpsCallable = httpsCallable;

// Questions and messages are shown in the page's own box (dialog.js)
const dialog = window.NotestreamDialog;

// ../spotify.js and ../spotify-auth.js report with alert(). They were written for the old
// start page and are not changed, so on this page alert() itself shows the page's own box.
// Unlike the browser's alert it does not wait for the user: the code after it carries on.
window.alert = message => { dialog.message({ text: String(message) }); };

const byId = id => document.getElementById(id);
const show = (id, display = "block") => { byId(id).style.display = display; };
const hide = id => { byId(id).style.display = "none"; };

let stopPlaylistListener = null;
let creatingGame = false;

// ============================================
// LOG IN
// ============================================
onAuthStateChanged(auth, user => {
  if (!user) {
    stopListeningToPlaylists();
    hide("mainContent");
    hide("registerModal");
    show("loginModal", "flex");
    return;
  }

  // The same login statistics as the current start page writes, for the admin tools
  try {
    const day = new Date().toISOString().split("T")[0];
    update(ref(db, `users/${user.uid}`), { email: user.email, lastLogin: new Date().toISOString() });
    set(ref(db, `users/${user.uid}/logins/${day}`), true);
  } catch (error) {
    console.error("[Start] Could not store the login statistics:", error);
  }

  hide("loginModal");
  hide("registerModal");
  show("mainContent");
  listenToPlaylists(user.uid);
  showSpotifyStatus();
});

byId("loginButton").addEventListener("click", () => {
  const email = byId("emailInput").value.trim();
  const password = byId("passwordInput").value;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => hide("loginError"))
    .catch(error => {
      console.error("[Start] Login failed:", error.code);
      show("loginError");
    });
});

byId("registerButton").addEventListener("click", () => {
  const email = byId("regEmail").value.trim();
  const password = byId("regPassword").value;
  createUserWithEmailAndPassword(auth, email, password)
    .then(() => hide("registerError"))
    .catch(error => {
      console.error("[Start] Registration failed:", error.code);
      byId("registerError").textContent = error.message;
      show("registerError");
    });
});

byId("showRegister").addEventListener("click", () => {
  hide("loginModal");
  show("registerModal", "flex");
});

byId("showLogin").addEventListener("click", () => {
  hide("registerModal");
  show("loginModal", "flex");
});

byId("forgotPasswordLink").addEventListener("click", event => {
  event.preventDefault();
  const email = byId("emailInput").value.trim();
  if (!email) {
    dialog.message({ text: "Ange din e-postadress för att återställa lösenordet." });
    return;
  }
  sendPasswordResetEmail(auth, email)
    .then(() => dialog.message({ text: "En återställningslänk har skickats till din e-post." }))
    .catch(error => dialog.message({ title: "Det gick inte", text: error.message }));
});

byId("logoutLink").addEventListener("click", event => {
  event.preventDefault();
  signOut(auth).catch(error => console.error("[Start] Could not log out:", error));
});

// ============================================
// NEW GAME
// ============================================
byId("newGameBtn").addEventListener("click", () => {
  byId("hostTeamNameError").textContent = "";
  show("newGameModal", "flex");
  byId("hostTeamNameInput").focus();
});

byId("cancelNewGameBtn").addEventListener("click", () => hide("newGameModal"));
byId("confirmNewGameBtn").addEventListener("click", createGame);
byId("hostTeamNameInput").addEventListener("keypress", event => {
  if (event.key === "Enter") createGame();
});

/**
 * The game as the current start page creates it, without playlists: they are chosen in
 * the lobby. The years start at the widest range and the timers at their usual values.
 */
function buildNewGame(userId, teamName, hostTeamId, now) {
  return {
    host: userId,
    status: "lobby",
    createdAt: now,
    pin: generatePIN(),
    settings: {
      yearRange: { min: 1950, max: new Date(now).getFullYear() },
      timers: { guess: 90, challenge: 10, placeChallenge: 20, pauseBetweenSongs: 5 }
    },
    teams: {
      [hostTeamId]: {
        name: teamName,
        host: true,
        userId: userId,
        tokens: 4,
        score: 0,
        timeline: {},
        color: TEAM_COLORS[0].name,
        joinedAt: now
      }
    },
    songs: null,
    currentSong: null,
    currentTeam: null,
    currentRound: 0
  };
}

async function createGame() {
  if (creatingGame) return;
  const errorElement = byId("hostTeamNameError");
  const teamName = byId("hostTeamNameInput").value.trim();

  if (!auth.currentUser) {
    errorElement.textContent = "Du måste vara inloggad för att öppna ett spel.";
    return;
  }
  const validation = validateTeamName(teamName, null);
  if (!validation.valid) {
    errorElement.textContent = validation.error;
    return;
  }

  creatingGame = true;
  const button = byId("confirmNewGameBtn");
  button.disabled = true;
  button.textContent = "ÖPPNAR...";

  try {
    const gameId = generateGameId();
    const game = buildNewGame(auth.currentUser.uid, teamName, generateTeamId(), Date.now());
    await set(ref(db, `games/${gameId}`), game);
    // The lobby lies beside the start page
    const lobbyUrl = new URL("lobby.html", window.location.href);
    lobbyUrl.search = `?gameId=${encodeURIComponent(gameId)}&host=true`;
    window.location.href = lobbyUrl.href;
  } catch (error) {
    console.error("[Start] Could not create the game:", error);
    errorElement.textContent = "Kunde inte öppna spelet. Försök igen.";
    creatingGame = false;
    button.disabled = false;
    button.textContent = "ÖPPNA LOBBYN";
  }
}

// ============================================
// SPOTIFY CONNECTION
// ============================================
// getToken renews the token when it has run out, so a connection made earlier keeps working
async function showSpotifyStatus() {
  const line = byId("spotifyStatus");
  let token = null;
  try {
    token = window.spotifyAuth ? await window.spotifyAuth.getToken() : null;
  } catch (error) {
    console.warn("[Start] Could not check the Spotify connection:", error);
  }

  if (token) {
    line.textContent = "Spotify är kopplat";
    line.classList.add("ok");
    hide("spotifyConnect");
  } else {
    line.textContent = "Spotify är inte kopplat. Utan det spelas ingen musik i spelet.";
    line.classList.remove("ok");
    show("spotifyConnect");
  }
}

byId("connectSpotifyBtn").addEventListener("click", () => {
  if (window.spotifyAuth) window.spotifyAuth.authorize();
});

// ============================================
// MY PLAYLISTS
// ============================================
byId("myPlaylistsBtn").addEventListener("click", () => {
  const panel = byId("playlistsPanel");
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "block" : "none";
  if (opening) panel.scrollIntoView({ behavior: "smooth", block: "start" });
});

function listenToPlaylists(userId) {
  stopListeningToPlaylists();
  stopPlaylistListener = onValue(ref(db, `userPlaylists/${userId}`), snapshot => {
    renderPlaylists(userId, snapshot.val() || {});
  }, error => {
    console.error("[Start] Could not read the playlists:", error);
    const container = byId("myPlaylistsList");
    container.innerHTML = "";
    const message = document.createElement("p");
    message.className = "hint";
    message.textContent = "Kunde inte hämta dina spellistor just nu.";
    container.appendChild(message);
  });
}

function stopListeningToPlaylists() {
  if (stopPlaylistListener) stopPlaylistListener();
  stopPlaylistListener = null;
}

function renderPlaylists(userId, playlists) {
  const container = byId("myPlaylistsList");
  container.innerHTML = "";

  const names = Object.keys(playlists).sort((a, b) => a.localeCompare(b, "sv"));
  if (names.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Du har inga egna spellistor än.";
    container.appendChild(empty);
    return;
  }

  for (const name of names) {
    const songCount = playlists[name] && playlists[name].songs ? Object.keys(playlists[name].songs).length : 0;

    const row = document.createElement("div");
    row.className = "playlist-row";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = name;
    const meta = document.createElement("div");
    meta.className = "playlist-meta";
    meta.textContent = songCount === 1 ? "1 låt" : `${songCount} låtar`;
    text.appendChild(title);
    text.appendChild(meta);

    const remove = document.createElement("button");
    remove.className = "kick-btn";
    remove.textContent = "Ta bort";
    remove.addEventListener("click", async () => {
      const confirmed = await dialog.confirm({
        title: "Ta bort spellistan?",
        text: `"${name}" tas bort. Det går inte att ångra.`,
        confirmLabel: "Ta bort",
        danger: true
      });
      if (!confirmed) return;
      try {
        await set(ref(db, `userPlaylists/${userId}/${name}`), null);
      } catch (error) {
        console.error("[Start] Could not remove the playlist:", error);
        dialog.message({ text: "Kunde inte ta bort spellistan. Kontrollera uppkopplingen och försök igen." });
      }
    });

    row.appendChild(text);
    row.appendChild(remove);
    container.appendChild(row);
  }
}
