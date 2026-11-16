// ============================================
// NOTESTREAM - NEW LOBBY
// The host chooses playlists, years, points and timers here while the teams join, and the
// players see what has been chosen. Starting writes the same game data as the current
// lobby, so game.html is the same for both.
// Helpers (TEAM_COLORS, validateTimer, showNotification) come from ../lobby.js.
// ============================================

(function () {
  "use strict";

  const songPool = window.NotestreamSongPool;
  const THIS_YEAR = new Date().getFullYear();
  const DEFAULT_POINTS_TO_WIN = 11;
  const MAX_POINTS_TO_WIN = 50;
  // The value shown when the game has no stored value for the timer
  const TIMER_INPUTS = [
    { id: "timerGuess", type: "guess", fallback: 90 },
    { id: "timerChallenge", type: "challenge", fallback: 10 },
    { id: "timerPlace", type: "placeChallenge", fallback: 20 },
    { id: "timerPause", type: "pauseBetweenSongs", fallback: 5 }
  ];

  let gameId = null;
  let isHost = false;
  let teamId = null;
  let hostUid = null;
  let currentTeams = {};
  let currentSettings = {};

  // The lists and the verified years, read once when the host opens the lobby
  let songData = null;
  let songDataFailed = false;
  let ownListsUnavailable = false;
  let poolCount = 0;
  let starting = false;
  let leaving = false;

  const byId = id => document.getElementById(id);
  const dbRef = path => window.firebaseRef(window.firebaseDb, path);

  // ============================================
  // START
  // ============================================
  document.addEventListener("DOMContentLoaded", () => {
    byId("errorBackBtn").addEventListener("click", () => { window.location.href = "index.html"; });

    const params = new URLSearchParams(window.location.search);
    gameId = params.get("gameId");
    isHost = params.get("host") === "true";
    teamId = params.get("teamId");

    if (!gameId) return showError("Inget spel angivet.");
    if (!isHost && !teamId) return showError("Inget lag angivet.");
    if (!window.firebaseDb || !window.firebaseRef || !window.firebaseOnValue) {
      return showError("Kunde inte ansluta till databasen. Ladda om sidan.");
    }

    window.firebaseOnValue(dbRef(`games/${gameId}`), snapshot => {
      if (!snapshot.exists()) return showError("Spelet finns inte.");

      const game = snapshot.val();
      hostUid = game.host || null;
      currentTeams = game.teams || {};
      currentSettings = game.settings || {};

      if (game.status !== "lobby") return goToGame();
      if (!isHost && !currentTeams[teamId]) return showError("Ditt lag finns inte i lobbyn.");

      byId("loadingState").style.display = "none";
      if (isHost) showHostView(); else showPlayerView();
      setupListeners();
    }, { onlyOnce: true });
  });

  function showError(message) {
    console.error("[Lobby] Error:", message);
    for (const id of ["loadingState", "hostView", "playerView"]) byId(id).style.display = "none";
    byId("errorMessage").textContent = message;
    byId("errorState").style.display = "block";
  }

  function hostTeamId() {
    const entry = Object.entries(currentTeams).find(([, team]) => team && team.host === true);
    return entry ? entry[0] : null;
  }

  // The game page is shared with the current lobby and lies one level up
  function goToGame() {
    if (leaving) return;
    if (!isHost && !currentTeams[teamId]) return;
    const id = isHost ? hostTeamId() : teamId;
    if (!id) return showError("Hittar inte värdens lag i spelet.");
    leaving = true;
    window.location.href = `../game.html?gameId=${encodeURIComponent(gameId)}&teamId=${encodeURIComponent(id)}`;
  }

  function setupListeners() {
    window.firebaseOnValue(dbRef(`games/${gameId}/teams`), snapshot => {
      currentTeams = snapshot.exists() ? snapshot.val() : {};
      if (!isHost && !leaving && !currentTeams[teamId]) return showError("Ditt lag har tagits bort ur lobbyn.");
      renderTeams();
      if (isHost) updateStartButton();
    });

    window.firebaseOnValue(dbRef(`games/${gameId}/status`), snapshot => {
      if (snapshot.val() === "playing") return goToGame();
      // A game without a status has been removed. Nothing more may be written to it:
      // a write would create the game again as an empty shell.
      if (!snapshot.exists() && !leaving) {
        leaving = true;
        showError("Spelet finns inte längre.");
      }
    });

    window.firebaseOnValue(dbRef(`games/${gameId}/settings`), snapshot => {
      if (leaving) return;
      currentSettings = snapshot.exists() ? snapshot.val() : {};
      if (isHost) renderHostSettings(); else renderGameSummary();
    });
  }

  function currentYearRange() {
    return songPool.normalizeYearRange(currentSettings.yearRange, THIS_YEAR);
  }

  // ============================================
  // TEAMS
  // ============================================
  function renderTeams() {
    const container = byId(isHost ? "teamListHost" : "teamListPlayer");
    const entries = Object.entries(currentTeams).filter(([, team]) => !!team);
    byId(isHost ? "teamCountHost" : "teamCountPlayer").textContent = entries.length;
    container.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Inga lag än...";
      container.appendChild(empty);
      return;
    }

    for (const [teamIdKey, team] of entries) {
      const isOwnTeam = isHost ? team.host === true : teamIdKey === teamId;
      const color = TEAM_COLORS.find(c => c.name === team.color);
      const colorHex = color ? color.hex : "#FFFFFF";

      const item = document.createElement("div");
      item.className = "team-item" + (isOwnTeam ? " own-team" : "");
      item.style.borderLeftColor = colorHex;

      const info = document.createElement("div");
      info.className = "team-info";
      const dot = document.createElement("div");
      dot.className = "team-color-indicator";
      dot.style.background = colorHex;
      const name = document.createElement("div");
      name.className = "team-name";
      name.textContent = String(team.name) + (isOwnTeam ? " (Du)" : "");
      info.appendChild(dot);
      info.appendChild(name);
      item.appendChild(info);

      if (isHost && !team.host) {
        const kick = document.createElement("button");
        kick.className = "kick-btn";
        kick.textContent = "Kicka";
        kick.addEventListener("click", () => kickTeam(teamIdKey));
        item.appendChild(kick);
      }
      container.appendChild(item);
    }

    if (!isHost) {
      const ownTeam = currentTeams[teamId];
      byId("playerTeamName").textContent = ownTeam ? String(ownTeam.name) : "Väntar på start";
    }
  }

  function kickTeam(kickTeamId) {
    const team = currentTeams[kickTeamId];
    if (!team) return;
    if (!confirm(`Är du säker på att du vill kicka "${team.name}"?`)) return;

    window.firebaseSet(dbRef(`games/${gameId}/teams/${kickTeamId}`), null)
      .then(() => showNotification("Lag borttaget", "success"))
      .catch(error => {
        console.error("[Lobby] Error kicking team:", error);
        showNotification("Kunde inte ta bort lag", "error");
      });
  }

  // ============================================
  // HOST
  // ============================================
  function showHostView() {
    byId("hostView").style.display = "block";

    const url = new URL("join.html?game=" + encodeURIComponent(gameId), window.location.href).href;
    byId("joinUrl").textContent = url;
    renderQrCode(url);
    byId("copyLinkBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(url)
        .then(() => showNotification("Länken är kopierad", "success"))
        .catch(() => showNotification("Kunde inte kopiera länken", "error"));
    });

    fillYearSelects();
    setupSettingInputs();
    byId("startGameBtn").addEventListener("click", startGame);

    renderTeams();
    renderHostSettings();
    updateStartButton();
    loadSongData();
    checkSpotify();
  }

  function renderQrCode(url) {
    const element = byId("qrCodeElement");
    element.innerHTML = "";
    if (typeof QRCode === "undefined") {
      element.textContent = "QR-koden kunde inte skapas";
      return;
    }
    new QRCode(element, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  function saveSetting(key, value) {
    // Nothing is written once the game has started or has been removed
    if (leaving) return Promise.resolve();
    return window.firebaseSet(dbRef(`games/${gameId}/settings/${key}`), value).catch(error => {
      console.error("[Lobby] Could not save the setting", key, error);
      showNotification("Kunde inte spara inställningen", "error");
    });
  }

  // The first answer about who is signed in. The host's own playlists can only be read by
  // the host's own account.
  function signedInUser() {
    return new Promise(resolve => {
      let stop = null;
      let done = false;
      stop = window.auth.onAuthStateChanged(user => {
        if (done) return;
        done = true;
        if (stop) stop();
        resolve(user);
      });
      if (done && stop) stop();
    });
  }

  async function loadSongData() {
    try {
      const user = await signedInUser();
      const canReadOwnLists = !!user && user.uid === hostUid;
      ownListsUnavailable = !canReadOwnLists;
      const read = path => window.firebaseGet(dbRef(path)).then(snapshot => snapshot.val() || {});

      const [standardLists, verified, userLists] = await Promise.all([
        read("standardLists"),
        read("verifiedTracks"),
        canReadOwnLists
          ? read(`userPlaylists/${user.uid}`).catch(error => {
              console.warn("[Lobby] Could not read the host's own playlists:", error);
              ownListsUnavailable = true;
              return {};
            })
          : Promise.resolve({})
      ]);
      songData = { standardLists, userLists, verified };
    } catch (error) {
      console.error("[Lobby] Could not read the playlists:", error);
      songDataFailed = true;
    }
    renderHostSettings();
    updateStartButton();
  }

  // ---------- What to play ----------
  function fillYearSelects() {
    for (const id of ["yearFrom", "yearTo"]) {
      const select = byId(id);
      select.innerHTML = "";
      for (let year = songPool.DEFAULT_MIN_YEAR; year <= THIS_YEAR; year++) {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        select.appendChild(option);
      }
    }
    byId("yearFrom").addEventListener("change", () => saveYearRange("from"));
    byId("yearTo").addEventListener("change", () => saveYearRange("to"));
  }

  // The year that was changed stands; the other end follows if the range would be backwards
  function saveYearRange(changed) {
    let min = parseInt(byId("yearFrom").value, 10);
    let max = parseInt(byId("yearTo").value, 10);
    if (min > max) {
      if (changed === "from") max = min; else min = max;
    }
    saveSetting("yearRange", { min, max });
  }

  function togglePlaylist(name, checked) {
    const names = songPool.normalizePlaylists(currentSettings.playlists).filter(chosen => chosen !== name);
    if (checked) names.push(name);
    saveSetting("playlists", names);
  }

  function appendListGroup(container, title, names, counts, selected, emptyText) {
    const heading = document.createElement("p");
    heading.className = "list-group-title";
    heading.textContent = title;
    container.appendChild(heading);

    if (names.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.textAlign = "left";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    for (const name of names) {
      const row = document.createElement("label");
      row.className = "list-row";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = selected.has(name);
      box.addEventListener("change", () => togglePlaylist(name, box.checked));

      const nameEl = document.createElement("span");
      nameEl.className = "list-name";
      nameEl.textContent = name;

      const countEl = document.createElement("span");
      countEl.className = "list-count";
      countEl.textContent = counts[name] === 1 ? "1 låt" : `${counts[name]} låtar`;

      row.appendChild(box);
      row.appendChild(nameEl);
      row.appendChild(countEl);
      container.appendChild(row);
    }
  }

  function renderListPicker() {
    const container = byId("listPicker");
    if (!songData) {
      container.innerHTML = "";
      const message = document.createElement("p");
      message.className = "hint";
      message.textContent = songDataFailed ? "Listorna kunde inte läsas. Ladda om sidan." : "Läser in listor...";
      container.appendChild(message);
      return;
    }

    const names = songPool.listNames(songData);
    const counts = songPool.countSongsPerList(songData, currentYearRange());
    const selected = new Set(songPool.normalizePlaylists(currentSettings.playlists));

    container.innerHTML = "";
    appendListGroup(container, "Standardlistor", names.standard, counts, selected, "Det finns inga standardlistor.");
    appendListGroup(container, "Egna spellistor", names.user, counts, selected,
      ownListsUnavailable
        ? "Logga in på startsidan på den här enheten för att välja bland dina egna spellistor."
        : "Du har inga egna spellistor än. Lägg till dem under Mina spellistor på startsidan.");
  }

  function updateSongCount() {
    const line = byId("songCountLine");
    if (!songData) {
      poolCount = 0;
      line.textContent = "";
      return;
    }

    poolCount = songPool.buildSongPool(songData, currentSettings.playlists, currentYearRange()).length;
    const chosenLists = songPool.normalizePlaylists(currentSettings.playlists).length;
    if (chosenLists === 0) line.textContent = "Välj minst en lista";
    else line.textContent = poolCount === 1 ? "1 låt vald" : `${poolCount} låtar valda`;

    // The players' view shows the number, and they have not read the lists. Saved after this
    // round of rendering, because saving makes the settings listener render again.
    const count = poolCount;
    setTimeout(() => {
      if (!leaving && count === poolCount && currentSettings.songCount !== count) saveSetting("songCount", count);
    }, 0);
  }

  // ---------- Points and timers ----------
  function setupSettingInputs() {
    const pointsInput = byId("pointsToWin");
    const savePoints = () => {
      let value = parseInt(pointsInput.value, 10);
      if (isNaN(value) || value < 1) value = DEFAULT_POINTS_TO_WIN;
      if (value > MAX_POINTS_TO_WIN) value = MAX_POINTS_TO_WIN;
      pointsInput.value = value;
      if (currentSettings.pointsToWin !== value) saveSetting("pointsToWin", value);
    };
    pointsInput.addEventListener("change", savePoints);
    pointsInput.addEventListener("blur", savePoints);

    TIMER_INPUTS.forEach(({ id, type }) => {
      const input = byId(id);
      const saveTimer = () => {
        const validation = validateTimer(type, input.value);
        const errorElement = byId(id + "Error");
        if (!validation.valid) {
          errorElement.textContent = validation.error;
          return;
        }
        errorElement.textContent = "";
        const stored = currentSettings.timers ? currentSettings.timers[type] : undefined;
        if (stored !== validation.value) saveSetting(`timers/${type}`, validation.value);
      };
      input.addEventListener("change", saveTimer);
      input.addEventListener("blur", saveTimer);
    });
  }

  // Shows the stored settings in the controls. A field the host is typing in is left alone.
  function renderHostSettings() {
    const setUnlessFocused = (element, value) => {
      if (document.activeElement !== element) element.value = String(value);
    };

    const yearRange = currentYearRange();
    setUnlessFocused(byId("yearFrom"), yearRange.min);
    setUnlessFocused(byId("yearTo"), yearRange.max);
    setUnlessFocused(byId("pointsToWin"), currentSettings.pointsToWin || DEFAULT_POINTS_TO_WIN);

    const timers = currentSettings.timers || {};
    TIMER_INPUTS.forEach(({ id, type, fallback }) => {
      setUnlessFocused(byId(id), timers[type] !== undefined ? timers[type] : fallback);
    });

    renderListPicker();
    updateSongCount();
    updateStartButton();
  }

  // ---------- Starting ----------
  function updateStartButton() {
    if (starting) return;
    const button = byId("startGameBtn");
    const teamCount = Object.keys(currentTeams).length;

    let text = "STARTA SPEL";
    let ready = true;
    if (teamCount < 2) {
      text = "BEHÖVER MINST 2 LAG";
      ready = false;
    } else if (!songData) {
      text = songDataFailed ? "LISTORNA KUNDE INTE LÄSAS" : "LÄSER IN LISTOR...";
      ready = false;
    } else if (poolCount === 0) {
      text = "VÄLJ LISTOR FÖRST";
      ready = false;
    }
    button.textContent = text;
    button.disabled = !ready;
  }

  async function startGame() {
    if (starting) return;
    const teamCount = Object.keys(currentTeams).length;
    if (teamCount < 2 || !songData || poolCount === 0) return;
    if (!confirm(`Starta spelet med ${teamCount} lag och ${poolCount} låtar?`)) return;

    starting = true;
    const button = byId("startGameBtn");
    button.disabled = true;
    button.textContent = "FÖRBEREDER LÅTAR...";

    try {
      // game.html only starts the music if the Spotify token is valid when the page loads,
      // so it is renewed here if it has run out while the lobby was open
      if (window.spotifyAuth) {
        try {
          await window.spotifyAuth.getToken();
        } catch (error) {
          console.warn("[Lobby] Could not renew the Spotify token:", error);
        }
      }

      const songs = songPool.shuffleSongs(songPool.buildSongPool(songData, currentSettings.playlists, currentYearRange()));
      const teamIds = Object.keys(currentTeams);
      if (songs.length === 0 || teamIds.length < 2) throw new Error("Nothing to start the game with.");

      const updates = songPool.buildGameStart(gameId, teamIds, songs, currentSettings);
      await window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates);
      // The status listener sends everyone on to the game
    } catch (error) {
      console.error("[Lobby] Error starting game:", error);
      showNotification("Kunde inte starta spelet", "error");
      starting = false;
      updateStartButton();
    }
  }

  // The music is played by the host's device. The script is only loaded for the host.
  function checkSpotify() {
    const script = document.createElement("script");
    script.src = "../spotify-auth.js?v=0.799";
    script.onload = async () => {
      let token = null;
      try {
        token = window.spotifyAuth ? await window.spotifyAuth.getToken() : null;
      } catch (error) {
        console.warn("[Lobby] Could not check the Spotify connection:", error);
      }
      byId("spotifyWarning").style.display = token ? "none" : "block";
    };
    document.body.appendChild(script);
  }

  // ============================================
  // PLAYER
  // ============================================
  function showPlayerView() {
    byId("playerView").style.display = "block";
    renderTeams();
    renderGameSummary();
  }

  function renderGameSummary() {
    const names = songPool.normalizePlaylists(currentSettings.playlists);
    const yearRange = currentYearRange();
    const rows = [
      ["Listor", names.length > 0 ? names.join(", ") : "Inte valt än"],
      ["Årtal", `${yearRange.min} – ${yearRange.max}`],
      ["Poäng för att vinna", String(currentSettings.pointsToWin || DEFAULT_POINTS_TO_WIN)]
    ];
    if (names.length > 0 && Number.isInteger(currentSettings.songCount)) {
      rows.push(["Antal låtar", String(currentSettings.songCount)]);
    }

    const container = byId("gameSummary");
    container.innerHTML = "";
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "summary-row";
      const labelEl = document.createElement("span");
      labelEl.className = "summary-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "summary-value";
      valueEl.textContent = value;
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      container.appendChild(row);
    }
  }
})();
