// ============================================
// NOTESTREAM - GAME HOST MODULE
// Host-only administrative controls
// ============================================

// ============================================
// HOST CONTROLS
// ============================================
function forceNextTeam() {
  if (!isHost) {
    console.error('[Host] Only host can force next team');
    return;
  }
  
  console.log('[Host] Force switching to next team');
  
  // Stop current timer
  stopTimer();
  
  // Get list of team IDs
  const teamIds = Object.keys(currentTeams);
  
  if (teamIds.length === 0) {
    console.error('[Host] No teams in game');
    return;
  }
  
  // Find current team index
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  
  // Get next team (wrap around)
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  console.log('[Host] Next team:', nextTeamId);
  
  // Get next song from deck
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.warn('[Host] No more songs in deck!');
    showNotification('Inga fler låtar kvar!', 'error');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  console.log('[Host] Next song:', nextSong.title, 'by', nextSong.artist);
  
  // Update Firebase
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Increment round if we wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
    console.log('[Host] New round:', newRound);
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Team switched successfully');
      // Start Timer 4 (between songs) showing the next team
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
    })
    .catch((error) => {
      console.error('[Host] Error switching team:', error);
    });
}

function pauseGame() {
  if (!isHost) {
    console.error('[Host] Only host can pause');
    return;
  }
  
  console.log('[Host] Pausing game');
  
  // Save current timer state before pausing
  const updates = {};
  updates[`games/${gameId}/pausedTimerState`] = currentGameData.timerState;
  updates[`games/${gameId}/pausedTimerRemaining`] = null; // Will calculate on resume
  
  if (currentGameData.timerStartTime && currentGameData.timerDuration) {
    const elapsed = Date.now() - currentGameData.timerStartTime;
    const remaining = Math.max(0, currentGameData.timerDuration - elapsed);
    updates[`games/${gameId}/pausedTimerRemaining`] = remaining;
  }
  
  // Set timer to paused state
  updates[`games/${gameId}/timerState`] = 'paused';
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game paused');
      showNotification('⏸️ Spelet är pausat', 'info');
      
      // Toggle buttons
      document.getElementById('pauseBtn').style.display = 'none';
      document.getElementById('resumeBtn').style.display = 'inline-block';
    })
    .catch((error) => {
      console.error('[Host] Error pausing game:', error);
    });
}

function resumeGame() {
  if (!isHost) {
    console.error('[Host] Only host can resume');
    return;
  }
  
  console.log('[Host] Resuming game');
  
  const pausedState = currentGameData.pausedTimerState;
  const pausedRemaining = currentGameData.pausedTimerRemaining;
  
  if (!pausedState) {
    console.warn('[Host] No paused state to resume from');
    return;
  }
  
  // Restore timer state
  const updates = {};
  updates[`games/${gameId}/pausedTimerState`] = null;
  updates[`games/${gameId}/pausedTimerRemaining`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game resumed');
      showNotification('▶️ Spelet fortsätter!', 'success');
      
      // Toggle buttons
      document.getElementById('pauseBtn').style.display = 'inline-block';
      document.getElementById('resumeBtn').style.display = 'none';
      
      // Restart timer with remaining time
      if (pausedRemaining && pausedRemaining > 0) {
        const nextTeamId = currentGameData.nextTeam;
        startTimer(pausedState, pausedRemaining, nextTeamId);
      } else {
        // No remaining time or invalid state - start fresh based on current state
        if (currentGameData.currentTeam) {
          startTimer('guessing', (currentGameData.guessingTime || 90) * 1000);
        }
      }
    })
    .catch((error) => {
      console.error('[Host] Error resuming game:', error);
    });
}

console.log('[Game] Host module loaded');
