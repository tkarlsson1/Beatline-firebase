// ============================================
// NOTESTREAM - GAME INITIALIZATION MODULE
// ============================================

// ============================================
// GLOBAL VARIABLES
// ============================================
let gameId = null;
let teamId = null;
let isHost = false;
let currentGameData = null;
let currentTeams = {};
let myTeam = null;
let listeners = [];

// Drag and drop state
let isDragging = false;
let draggedCard = null;
let placementPosition = null; // Where the card will be placed
let currentCardElement = null;

// Timer state
let timerInterval = null;
let lastVibrateSecond = null;
let hasStartedInitialTimer = false; // Track if Timer 4 has started at game start
let hasInitializedScores = false; // Track if scores have been initialized based on revealed cards

// Timer expiry guard (BUGFIX v4: Prevent race conditions)
let isProcessingTimerExpiry = false;

// Timeline state
let previousCurrentTeam = null; // Track previous team to detect team changes for auto-scroll

// Spotify state
let spotifyInitialized = false;
let currentPlayingTrackId = null;
let previousTimerState = null; // Timer state at the last game update, to see when guessing time begins
let hasSeenFirstGameState = false; // False until the host page has handled its first game state

// NOTE: Timer durations should be set in Firebase by lobby.js when starting the game:
// - currentGameData.guessingTime (in seconds, default: 90)
// - currentGameData.betweenSongsTime (in seconds, default: 10)

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Game] Page loaded');
  
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  gameId = urlParams.get('gameId');
  teamId = urlParams.get('teamId');
  
  console.log('[Game] URL params:', { gameId, teamId });
  
  // Validate parameters
  if (!gameId || !teamId) {
    showError('Saknar gameId eller teamId i URL');
    return;
  }
  
  // Check if Firebase is available
  if (!window.firebaseDb || !window.firebaseRef) {
    showError('Firebase inte initialiserat');
    return;
  }
  
  // Initialize game
  initializeGame();
});

// Listen for Spotify player ready event (host only)
if (typeof window !== 'undefined') {
  window.addEventListener('spotifyPlayerReady', (event) => {
    console.log('[Spotify] Player ready event received:', event.detail);

    // A host page that is loaded in the middle of a turn has no player when its first game
    // state arrives, so the song in play is started here instead (see updateGameView)
    if (isHost && currentGameData && currentGameData.timerState === 'guessing') {
      playCurrentSong();
    }
    
    // Show Spotify status indicator for host
    const gameUrl = new URLSearchParams(window.location.search);
    const urlTeamId = gameUrl.get('teamId');
    const urlGameId = gameUrl.get('gameId');
    
    if (urlGameId && urlTeamId) {
      const gameRef = window.firebaseRef(window.firebaseDb, `games/${urlGameId}`);
      window.firebaseGet(gameRef).then(snapshot => {
        if (snapshot.exists()) {
          const gameData = snapshot.val();
          if (gameData.hostTeam === urlTeamId) {
            // This is the host - show Spotify indicator
            const spotifyStatus = document.getElementById('spotifyStatus');
            if (spotifyStatus) {
              spotifyStatus.style.display = 'block';
              document.getElementById('spotifyStatusText').textContent = 'Spotify kopplad';
              console.log('[Spotify] Status indicator shown');
            }
          }
        }
      });
    }
  });
}

// ============================================
// FULLSCREEN (Android)
// ============================================
// Browsers only allow requestFullscreen from a user gesture, so a touch on the game page
// enters fullscreen (hides the address bar and Android's status/navigation bars).
// Every touch checks again, so fullscreen comes back if the player leaves it.
// Touch only: a host using a mouse on a computer is not forced into fullscreen.
// iPhone Safari has no requestFullscreen for normal elements, so nothing happens there.
function enterFullscreenOnTouch() {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') {
    return;
  }
  root.requestFullscreen({ navigationUI: 'hide' }).catch((error) => {
    console.warn('[Game] Fullscreen request failed:', error);
  });
}

document.addEventListener('touchend', enterFullscreenOnTouch, { passive: true });

// ============================================
// KEEP THE SCREEN AWAKE
// ============================================
// A phone that goes to sleep during a game leaves fullscreen, and if it is the active team's
// phone nothing handles the turn when the time runs out. So the screen is kept on while the
// game is being played and the page is shown.
// The browser releases the lock by itself when the page is hidden, and a released lock cannot
// be used again, so a new one is requested when the page is shown again.
// A refusal (low battery, power saving, no support) is not an error: the game goes on as before.
const WAKE_LOCK_RETRY_MS = 60000;
let screenWakeLock = null;
let wakeLockRequestPending = false;
let wakeLockRefusedAt = 0;

function screenShouldStayAwake() {
  return !!currentGameData &&
    currentGameData.status === 'playing' &&
    currentGameData.phase !== 'gameOver' &&
    document.visibilityState === 'visible';
}

async function updateScreenWakeLock() {
  if (!('wakeLock' in navigator)) return;

  if (!screenShouldStayAwake()) {
    if (screenWakeLock) {
      const lock = screenWakeLock;
      screenWakeLock = null;
      lock.release().catch(() => {});
    }
    return;
  }

  // Called on every change in the game, so a refusal is not asked about again at once
  if (screenWakeLock || wakeLockRequestPending) return;
  if (Date.now() - wakeLockRefusedAt < WAKE_LOCK_RETRY_MS) return;

  wakeLockRequestPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      if (screenWakeLock === lock) screenWakeLock = null;
    });
    screenWakeLock = lock;
    console.log('[Game] Screen wake lock held');
  } catch (error) {
    wakeLockRefusedAt = Date.now();
    console.warn('[Game] Screen wake lock not granted:', error.name);
  } finally {
    wakeLockRequestPending = false;
  }

  // The game can have ended or the page been hidden while the request was waiting
  if (screenWakeLock && !screenShouldStayAwake()) updateScreenWakeLock();
}

// Coming back to the page is a new chance, also after a refusal
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wakeLockRefusedAt = 0;
  updateScreenWakeLock();
});

// ============================================
// GAME INITIALIZATION
// ============================================
function initializeGame() {
  console.log('[Game] Initializing game...');
  
  // Load game data
  const gameRef = window.firebaseRef(window.firebaseDb, `games/${gameId}`);
  
  window.firebaseOnValue(gameRef, (snapshot) => {
    if (!snapshot.exists()) {
      showError('Spel finns inte');
      return;
    }
    
    const gameData = snapshot.val();
    currentGameData = gameData;
    currentTeams = gameData.teams || {};
    
    console.log('[Game] Game data loaded:', gameData);
    
    // Check if game is finished (truly over)
    if (gameData.status === 'finished' || gameData.status === 'ended') {
      showError('Spelet är avslutat');
      return;
    }
    
    // Game not started yet – keep spinner and wait for next update
    if (gameData.status !== 'playing') {
      document.getElementById('loadingState').style.display = 'block';
      document.getElementById('loadingState').querySelector('p').textContent = 'Väntar på att spelet startar...';
      return;
    }
    
    // Find my team
    myTeam = currentTeams[teamId];
    if (!myTeam) {
      showError('Ditt lag finns inte i spelet');
      return;
    }
    
    // Check if host
    isHost = myTeam.host === true;
    
    console.log('[Game] My team:', myTeam);
    console.log('[Game] Is host:', isHost);
    
    // Hide loading, show game
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('gameView').style.display = 'block';
    
    // Show host controls for host
    if (isHost) {
      document.getElementById('hostControls').style.display = 'flex';
    }
    
    // Initial render
    updateGameView();
    updateScreenWakeLock();

  }, { onlyOnce: true });
  
  // Setup real-time listeners
  setupListeners();
  
  // Setup global timer interval that runs every 50ms for smooth progress bar (20 updates/sec)
  console.log('[Game] Setting up timer interval');
  timerInterval = setInterval(() => {
    if (currentGameData && currentGameData.timerState) {
      updateTimer();
    }
  }, 50);
}

// ============================================
// FIREBASE LISTENERS
// ============================================
function setupListeners() {
  console.log('[Game] Setting up Firebase listeners');
  
  // Listen to entire game state for simplicity (optimize later if needed)
  const gameRef = window.firebaseRef(window.firebaseDb, `games/${gameId}`);
  
  window.firebaseOnValue(gameRef, (snapshot) => {
    if (snapshot.exists()) {
      currentGameData = snapshot.val();
      currentTeams = currentGameData.teams || {};
      myTeam = currentTeams[teamId];
      
      console.log('[Game] Game state updated');

      updateGameView();
      updateScreenWakeLock();
    }
  });
}

// ============================================
// GAME OVER LOGIC
// ============================================
window.checkAndApplyWinCondition = async function(updates, nextIndex) {
  if (nextIndex !== 0) return false;
  
  if (currentGameData.settings?.gameOverDisabled) {
    // Round still increments
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
    return false;
  }
  
  const pointsToWin = currentGameData.settings?.pointsToWin || 11;
  
  // Fetch latest teams to be 100% sure we have correct timelines
  const snapshot = await window.firebaseGet(window.firebaseRef(window.firebaseDb, `games/${gameId}/teams`));
  if (!snapshot.exists()) return false;
  
  const teamsData = snapshot.val();
  
  let maxScore = -1;
  let teamsWithMax = [];
  
  Object.keys(teamsData).forEach(tId => {
    const team = teamsData[tId];
    // Score is number of cards in timeline
    const score = team.timeline ? Object.keys(team.timeline).length : 0;
    
    if (score > maxScore) {
      maxScore = score;
      teamsWithMax = [tId];
    } else if (score === maxScore) {
      teamsWithMax.push(tId);
    }
  });
  
  console.log(`[Game] Win Check: maxScore=${maxScore}, pointsToWin=${pointsToWin}`);
  
  if (maxScore >= pointsToWin && teamsWithMax.length === 1) {
    // We have a unique winner!
    console.log(`[Game] 🏆 GAME OVER! Winner: ${teamsWithMax[0]}`);
    updates[`games/${gameId}/phase`] = 'gameOver';
    updates[`games/${gameId}/winner`] = teamsWithMax[0];
    updates[`games/${gameId}/timerState`] = null; // stop any timers
    
    // We should NOT advance the turn or song if game is over
    delete updates[`games/${gameId}/currentTeam`];
    delete updates[`games/${gameId}/currentSongIndex`];
    delete updates[`games/${gameId}/currentSong`];
    
    return true; // Game is over
  }
  
  // No winner yet (or tie -> sudden death)
  if (maxScore >= pointsToWin && teamsWithMax.length > 1) {
    console.log(`[Game] ⚔️ SUDDEN DEATH! Tie between: ${teamsWithMax.join(', ')}`);
  }
  
  // Advance round as normal
  const newRound = (currentGameData.currentRound || 0) + 1;
  updates[`games/${gameId}/currentRound`] = newRound;
  console.log('[Game] New round:', newRound);

  return false;
};

// ============================================
// THE SONGS HAVE RUN OUT
// ============================================
// <out-of-songs>
/**
 * Who has won when the game ends because there are no more songs: the team with the most
 * revealed cards. A card that has not been turned has not been approved, so it is not counted.
 * Pure function.
 *
 * teams: games/<id>/teams
 * Returns { winner, tiedTeams }: winner is the team's id, or null when several teams share
 * the lead, and tiedTeams then lists their ids.
 */
function outOfSongsResult(teams) {
  let mostCards = -1;
  let leaders = [];
  Object.entries(teams || {}).forEach(([id, team]) => {
    const timeline = team && team.timeline ? Object.values(team.timeline) : [];
    const cards = timeline.filter(card => card && card.revealed === true).length;
    if (cards > mostCards) {
      mostCards = cards;
      leaders = [id];
    } else if (cards === mostCards) {
      leaders.push(id);
    }
  });
  return leaders.length === 1
    ? { winner: leaders[0], tiedTeams: null }
    : { winner: null, tiedTeams: leaders };
}

/**
 * How far the songs that are left reach, for the buttons on the game over screen.
 * Pure function. Continuing takes one more song; starting over takes a new starting card
 * for every team and a first song.
 */
function songsLeftFor(gameData, teamCount) {
  const nextSongIndex = ((gameData && gameData.currentSongIndex) || 0) + 1;
  const songCount = ((gameData && gameData.songs) || []).length;
  return {
    canContinue: nextSongIndex < songCount,
    canRestart: nextSongIndex + teamCount < songCount
  };
}
// </out-of-songs>

/**
 * Ends the game because the deck is used up. Every place that would take the next song calls
 * this when there is none, instead of giving up and leaving the game standing still.
 *
 * One update: the game over screen is shown on every phone, and the timer, the validation
 * box, the challenge and the cards waiting to be placed are cleared, so nothing is left half
 * done.
 *
 * Returns a promise for true ("the game is over"), the same answer checkAndApplyWinCondition
 * gives, so a caller can use it in the same place.
 */
window.endGameOutOfSongs = async function() {
  console.log('[Game] No more songs: ending the game');

  // The latest teams, read the same way as in the win check
  const snapshot = await window.firebaseGet(window.firebaseRef(window.firebaseDb, `games/${gameId}/teams`));
  const teams = snapshot.exists() ? snapshot.val() : currentTeams;
  const result = outOfSongsResult(teams);
  console.log('[Game] Result when the songs ran out:', result);

  const updates = {};
  updates[`games/${gameId}/phase`] = 'gameOver';
  updates[`games/${gameId}/gameOverReason`] = 'outOfSongs';
  updates[`games/${gameId}/winner`] = result.winner;
  updates[`games/${gameId}/tiedTeams`] = result.tiedTeams;
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  updates[`games/${gameId}/nextTeam`] = null;
  updates[`games/${gameId}/validationModal`] = null;
  updates[`games/${gameId}/challengeState`] = null;
  Object.keys(teams || {}).forEach(id => {
    updates[`games/${gameId}/teams/${id}/pendingCard`] = null;
  });

  await window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates);
  return true;
};

console.log('[Game] Init module loaded');
