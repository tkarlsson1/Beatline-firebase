// ============================================
// NOTESTREAM - GAME HOST MODULE
// ============================================

// ============================================
// HOST CONTROLS
// ============================================

// Host controls auto-collapse timeout
let hostControlsTimeout = null;

// Toggle host controls visibility
function toggleHostControls() {
  const hostButtons = document.getElementById('hostButtons');
  const isExpanding = !hostButtons.classList.contains('expanded');
  
  hostButtons.classList.toggle('expanded');
  
  // Clear any existing timeout
  if (hostControlsTimeout) {
    clearTimeout(hostControlsTimeout);
    hostControlsTimeout = null;
  }
  
  // If expanding, set timeout to auto-collapse after 5 seconds
  if (isExpanding) {
    hostControlsTimeout = setTimeout(() => {
      hostButtons.classList.remove('expanded');
      hostControlsTimeout = null;
    }, 5000);
  }
}

// Pause game
function pauseGame() {
  console.log('[Host] Pausing game');
  
  if (!isHost) {
    console.warn('[Host] Not host, cannot pause');
    return;
  }
  
  const updates = {};
  updates[`games/${gameId}/timerState`] = 'paused';
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game paused');
      document.getElementById('pauseBtn').style.display = 'none';
      document.getElementById('resumeBtn').style.display = 'inline-block';
    })
    .catch((error) => {
      console.error('[Host] Error pausing game:', error);
    });
}

// Resume game
function resumeGame() {
  console.log('[Host] Resuming game');
  
  if (!isHost) {
    console.warn('[Host] Not host, cannot resume');
    return;
  }
  
  const updates = {};
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game resumed');
      document.getElementById('pauseBtn').style.display = 'inline-block';
      document.getElementById('resumeBtn').style.display = 'none';
      
      // Restart Timer 1 for current team
      startTimer('guessing', (currentGameData.guessingTime || 90) * 1000);
    })
    .catch((error) => {
      console.error('[Host] Error resuming game:', error);
    });
}

// Force next team
function forceNextTeam() {
  console.log('[Host] Forcing next team');
  
  if (!isHost) {
    console.warn('[Host] Not host, cannot force next team');
    return;
  }
  
  // Stop current timer
  stopTimer();
  
  // Move to next team
  const teamIds = Object.keys(currentTeams);
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  // Get next song
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.warn('[Host] No more songs in deck!');
    showNotification('Inga fler låtar!', 'error');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  
  // Update Firebase
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Clear challenge state and all pending cards
  updates[`games/${gameId}/challengeState`] = null;
  Object.keys(currentTeams).forEach(tId => {
    updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
  });
  
  // Increment round if we wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Forced next team');
      
      // Start Timer 4 (pause between songs)
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
    })
    .catch((error) => {
      console.error('[Host] Error forcing next team:', error);
    });
}

console.log('[Game] Host module loaded');
