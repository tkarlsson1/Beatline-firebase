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
  
  // Check if validation modal is active
  if (currentGameData.validationModal && currentGameData.validationModal.isVisible) {
    console.log('[Host] ⚠️ Validation modal is active');
    showNotification('Stäng valideringsrutan först!', 'error');
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
  
  // Check win condition (handles round increment internally)
  window.checkAndApplyWinCondition(updates, nextIndex).then(isGameOver => {
    return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates).then(() => isGameOver);
  })
    .then((isGameOver) => {
      console.log('[Host] Forced next team');
      
      if (!isGameOver) {
        // Start Timer 4 (pause between songs)
        startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
      }
    })
    .catch((error) => {
      console.error('[Host] Error forcing next team:', error);
    });
}

// Continue playing after game over
function continuePlaying() {
  console.log('[Host] Continuing game after win');
  
  if (!isHost) {
    console.warn('[Host] Not host, cannot continue');
    return;
  }
  
  // Calculate next team and song
  const teamIds = Object.keys(currentTeams);
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.warn('[Host] No more songs in deck!');
    showNotification('Inga fler låtar!', 'error');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  const newRound = (currentGameData.currentRound || 0) + 1;
  
  const updates = {};
  updates[`games/${gameId}/phase`] = 'playing';
  updates[`games/${gameId}/winner`] = null;
  updates[`games/${gameId}/settings/gameOverDisabled`] = true;
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  updates[`games/${gameId}/currentRound`] = newRound;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game continued, win condition disabled');
      // Start Timer 4 (pause between songs)
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
    })
    .catch((error) => {
      console.error('[Host] Error continuing game:', error);
    });
}

// Restart game – keep songs deck, continue from where we left off
function restartGame() {
  console.log('[Host] Restarting game');

  if (!isHost) {
    console.warn('[Host] Not host, cannot restart');
    return;
  }

  const songs = currentGameData.songs || [];
  const teamIds = Object.keys(currentTeams);
  const numTeams = teamIds.length;

  // New start: one past the last played song
  const newStartIndex = (currentGameData.currentSongIndex || 0) + 1;

  // Each team gets the next sequential song as their starting card
  const firstGameplayIndex = newStartIndex + numTeams;

  if (firstGameplayIndex >= songs.length) {
    showNotification('Inga fler låtar kvar i leken för en omstart!', 'error');
    return;
  }

  // Pick a new random starting team
  const newStartingTeamId = teamIds[Math.floor(Math.random() * numTeams)];

  const updates = {};

  // Reset game state
  updates[`games/${gameId}/status`] = 'playing';
  updates[`games/${gameId}/winner`] = null;
  updates[`games/${gameId}/phase`] = null;
  updates[`games/${gameId}/currentRound`] = 1;
  updates[`games/${gameId}/currentTeam`] = newStartingTeamId;
  updates[`games/${gameId}/startingTeam`] = newStartingTeamId;
  updates[`games/${gameId}/currentSongIndex`] = firstGameplayIndex;
  updates[`games/${gameId}/currentSong`] = songs[firstGameplayIndex];
  updates[`games/${gameId}/challengeState`] = null;
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  updates[`games/${gameId}/settings/gameOverDisabled`] = false;

  // Reset each team: new starting card + clear score and pending
  teamIds.forEach((tId, i) => {
    const startingCard = songs[newStartIndex + i];
    updates[`games/${gameId}/teams/${tId}/score`] = 0;
    updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
    updates[`games/${gameId}/teams/${tId}/timeline`] = {
      0: {
        spotifyId: startingCard.spotifyId,
        title: startingCard.title,
        artist: startingCard.artist,
        year: startingCard.year,
        position: 0,
        revealed: true
      }
    };
  });

  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Host] Game restarted from song index', firstGameplayIndex);
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, newStartingTeamId);
    })
    .catch((error) => {
      console.error('[Host] Error restarting game:', error);
      showNotification('Kunde inte starta om spelet', 'error');
    });
}

console.log('[Game] Host module loaded');
