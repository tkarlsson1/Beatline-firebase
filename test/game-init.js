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
let previousTimerState = null; // Track previous timer state to detect changes

// Timeline state
let previousCurrentTeam = null; // Track previous team to detect team changes for auto-scroll

// Spotify state
let spotifyInitialized = false;
let currentPlayingTrackId = null;

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
    
    // Check if game is in playing status
    if (gameData.status !== 'playing') {
      showError('Spelet har inte startat eller är avslutat');
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
    }
  });
}

console.log('[Game] Init module loaded');
