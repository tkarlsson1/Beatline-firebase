// ============================================
// NOTESTREAM - JOIN A GAME (new lobby)
// A player scans the QR code in the new lobby, chooses a team name and lands in the new
// lobby's waiting view. The team is stored exactly as the current join page stores it.
// Helpers (validateTeamName, getNextAvailableColor, ...) come from ../lobby.js.
// ============================================

(function () {
  "use strict";

  let gameId = null;
  let joining = false;

  const byId = id => document.getElementById(id);
  const dbRef = path => window.firebaseRef(window.firebaseDb, path);

  document.addEventListener("DOMContentLoaded", () => {
    gameId = new URLSearchParams(window.location.search).get("game");
    if (!gameId) return showError("Länken saknar spel. Skanna QR-koden i lobbyn igen.");
    if (!window.firebaseDb || !window.firebaseRef) return showError("Kunde inte ansluta till databasen. Ladda om sidan.");

    const input = byId("teamNameInput");
    const button = byId("joinButton");
    input.addEventListener("input", () => {
      byId("teamNameError").textContent = "";
      button.disabled = joining || input.value.trim().length === 0;
    });
    input.addEventListener("keypress", event => {
      if (event.key === "Enter" && !button.disabled) joinGame();
    });
    button.addEventListener("click", joinGame);

    readGame().then(game => {
      if (!game) return;
      const teamCount = Object.keys(game.teams || {}).length;
      byId("teamCountDisplay").textContent = `${teamCount} / ${MAX_TEAMS} lag i lobbyn`;
      byId("loadingState").style.display = "none";
      byId("joinForm").style.display = "block";
    });
  });

  function showError(message) {
    console.error("[Join] Error:", message);
    byId("loadingState").style.display = "none";
    byId("joinForm").style.display = "none";
    byId("errorMessage").textContent = message;
    byId("errorState").style.display = "block";
  }

  // Reads the game and checks that it can be joined. Returns the game, or null after
  // showing why it cannot.
  async function readGame() {
    let snapshot;
    try {
      snapshot = await window.firebaseGet(dbRef(`games/${gameId}`));
    } catch (error) {
      console.error("[Join] Could not read the game:", error);
      showError("Kunde inte läsa spelet. Kontrollera uppkopplingen och försök igen.");
      return null;
    }
    if (!snapshot.exists()) {
      showError("Spelet finns inte. Skanna QR-koden i lobbyn igen.");
      return null;
    }
    const game = snapshot.val();
    if (game.status !== "lobby") {
      showError("Det här spelet har redan startat eller är avslutat.");
      return null;
    }
    if (isLobbyFull(game.teams || {})) {
      showError(`Lobbyn är full (max ${MAX_TEAMS} lag).`);
      return null;
    }
    return game;
  }

  async function joinGame() {
    if (joining) return;
    const input = byId("teamNameInput");
    const button = byId("joinButton");
    const errorElement = byId("teamNameError");
    const teamName = input.value.trim();

    joining = true;
    button.disabled = true;
    button.textContent = "GÅR MED...";
    const giveUp = message => {
      if (message) errorElement.textContent = message;
      joining = false;
      button.disabled = input.value.trim().length === 0;
      button.textContent = "GÅ MED I SPEL";
    };

    // The teams are read again now, so that a name or colour taken while the form was open
    // is seen
    const game = await readGame();
    if (!game) return;
    const teams = game.teams || {};

    const validation = validateTeamName(teamName, teams);
    if (!validation.valid) return giveUp(validation.error);

    const color = getNextAvailableColor(teams);
    if (!color) return giveUp(`Lobbyn är full (max ${MAX_TEAMS} lag).`);

    const teamId = generateTeamId();
    const team = {
      name: teamName,
      host: false,
      userId: null,
      tokens: 4,
      score: 0,
      timeline: {},
      color: color.name,
      joinedAt: Date.now()
    };

    try {
      await window.firebaseSet(dbRef(`games/${gameId}/teams/${teamId}`), team);
      window.location.href = `lobby.html?gameId=${encodeURIComponent(gameId)}&teamId=${encodeURIComponent(teamId)}`;
    } catch (error) {
      console.error("[Join] Could not add the team:", error);
      giveUp("Kunde inte gå med i spelet. Försök igen.");
    }
  }
})();
