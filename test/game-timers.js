// ============================================
// NOTESTREAM - GAME TIMERS MODULE
// ============================================

// ============================================
// TIMER FUNCTIONS
// ============================================

// Counter for logging (to avoid spam with 100ms updates)
let timerUpdateCounter = 0;

function startTimer(type, duration, nextTeamId = null) {
  console.log('[Timer] startTimer called by', isHost ? 'HOST' : 'NON-HOST', '- type:', type);
  
  // Only host should start timers
  if (!isHost) {
    console.log('[Timer] Not host, skipping timer start');
    return;
  }
  
  console.log('[Timer] Starting timer:', type, 'duration:', duration, 'nextTeam:', nextTeamId);
  
  const updates = {};
  updates[`games/${gameId}/timerState`] = type;
  updates[`games/${gameId}/timerStartTime`] = Date.now();
  updates[`games/${gameId}/timerDuration`] = duration;
  
  if (nextTeamId) {
    updates[`games/${gameId}/nextTeam`] = nextTeamId;
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Timer] Timer started in Firebase');
    })
    .catch((error) => {
      console.error('[Timer] Error starting timer:', error);
    });
}

function stopTimer() {
  console.log('[Timer] Stopping timer');
  
  // Reset vibrate tracking
  lastVibrateSecond = null;
  
  // Only host should update Firebase
  if (!isHost) {
    console.log('[Timer] Not host, skipping Firebase update');
    return;
  }
  
  // Clear Firebase timer state (only host does this)
  const updates = {};
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  updates[`games/${gameId}/nextTeam`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Timer] Timer stopped in Firebase');
    })
    .catch((error) => {
      console.error('[Timer] Error stopping timer:', error);
    });
}

function updateTimer() {
  if (!currentGameData || !currentGameData.timerState || !currentGameData.timerStartTime || !currentGameData.timerDuration) {
    // No active timer - clear timer display but keep container
    const container = document.getElementById('turnIndicator');
    if (container) {
      let timerContainer = container.querySelector('.timer-container');
      if (!timerContainer) {
        timerContainer = document.createElement('div');
        timerContainer.className = 'timer-container';
        container.appendChild(timerContainer);
      }
      timerContainer.innerHTML = '';
    }
    return;
  }
  
  const elapsed = Date.now() - currentGameData.timerStartTime;
  const remaining = Math.max(0, currentGameData.timerDuration - elapsed);
  const remainingSeconds = Math.ceil(remaining / 1000);
  
  // Log every 100 updates (~5 seconds with 50ms interval) to avoid spam
  timerUpdateCounter++;
  if (timerUpdateCounter >= 100) {
    console.log('[Timer] Update:', remainingSeconds, 'seconds remaining, state:', currentGameData.timerState);
    timerUpdateCounter = 0;
  }
  
  // Render timer UI (pass remaining ms for smooth progress)
  renderTimer(remaining, currentGameData.timerDuration, remainingSeconds);
  
  // Vibrate warnings (only for active team during guessing timer)
  if (currentGameData.timerState === 'guessing' && currentGameData.currentTeam === teamId) {
    if (remainingSeconds <= 10 && remainingSeconds > 0 && remainingSeconds !== lastVibrateSecond) {
      vibrate([100]);
      lastVibrateSecond = remainingSeconds;
      console.log('[Timer] Vibrate at', remainingSeconds, 'seconds');
    }
  }
  
  // Check if timer expired - but only let appropriate clients handle it to avoid race conditions
  if (remaining <= 0) {
    console.log('[Timer] Timer expired!');
    
    // Only call if timer state still exists
    if (currentGameData.timerState) {
      const timerState = currentGameData.timerState;
      
      // For guessing timer: only current team (or host as backup) should handle
      if (timerState === 'guessing') {
        const isCurrentTeam = currentGameData.currentTeam === teamId;
        if (isCurrentTeam || isHost) {
          console.log('[Timer] Handling guessing timer expiry as', isCurrentTeam ? 'current team' : 'host backup');
          onTimerExpired();
        } else {
          console.log('[Timer] Not current team or host, ignoring guessing timer expiry');
        }
      }
      // For between_songs timer: only host should handle
      else if (timerState === 'between_songs') {
        if (isHost) {
          console.log('[Timer] Handling between_songs timer expiry as host');
          onTimerExpired();
        } else {
          console.log('[Timer] Not host, ignoring between_songs timer expiry');
        }
      }
      // For challenge_window timer: only host should handle
      else if (timerState === 'challenge_window') {
        if (isHost) {
          console.log('[Timer] Handling challenge_window timer expiry as host');
          onTimerExpired();
        } else {
          console.log('[Timer] Not host, ignoring challenge_window timer expiry');
        }
      }
      // For challenge_placement timer: only host should handle
      else if (timerState === 'challenge_placement') {
        if (isHost) {
          console.log('[Timer] Handling challenge_placement timer expiry as host');
          onTimerExpired();
        } else {
          console.log('[Timer] Not host, ignoring challenge_placement timer expiry');
        }
      }
    }
  }
}

function renderTimer(remainingMs, totalDurationMs, remainingSeconds) {
  const container = document.getElementById('turnIndicator');
  const timerState = currentGameData.timerState;
  
  if (!timerState || timerState === 'paused') {
    // No timer active or game is paused - don't render timer UI
    return;
  }
  
  // Create timer HTML if it doesn't exist
  let timerContainer = container.querySelector('.timer-container');
  if (!timerContainer) {
    timerContainer = document.createElement('div');
    timerContainer.className = 'timer-container';
    container.appendChild(timerContainer);
  }
  
  // Calculate smooth progress based on milliseconds (0-100%)
  const progress = Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100));
  
  // Determine color based on remaining time
  let colorClass = '';
  if (progress <= 20) {
    colorClass = 'danger';
  } else if (progress <= 40) {
    colorClass = 'warning';
  }
  
  // Format time display (minutes:seconds)
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Timer label text
  let labelText = '';
  if (timerState === 'guessing') {
    labelText = 'Tid att gissa';
  } else if (timerState === 'challenge_window') {
    // Timer 2 - Challenge window
    const activeTeamId = currentGameData.currentTeam;
    const activeTeam = currentTeams[activeTeamId];
    if (activeTeam) {
      labelText = `Vill ni utmana ${escapeHtml(activeTeam.name)}?`;
    } else {
      labelText = 'Utmaningsfönster';
    }
  } else if (timerState === 'challenge_placement') {
    // Timer 3 - Challenge placement
    const challengeState = currentGameData.challengeState;
    if (challengeState && challengeState.challengingTeam) {
      const challengingTeam = currentTeams[challengeState.challengingTeam];
      if (challengingTeam) {
        labelText = `${escapeHtml(challengingTeam.name)} - Placera ditt kort!`;
      } else {
        labelText = 'Placera utmaningskort';
      }
    } else {
      labelText = 'Placera utmaningskort';
    }
  } else if (timerState === 'between_songs') {
    const nextTeamId = currentGameData.nextTeam;
    const nextTeam = currentTeams[nextTeamId];
    if (nextTeam) {
      labelText = `NÄSTA TUR: ${escapeHtml(nextTeam.name)}`;
    } else {
      labelText = 'Mellan låtar';
    }
  } else if (timerState === 'paused') {
    labelText = 'SPELET ÄR PAUSAT';
  }
  
  // Render timer UI as horizontal bar
  timerContainer.innerHTML = `
    <div class="timer-bar-wrapper">
      <div class="timer-bar-progress ${colorClass}" style="width: ${progress}%"></div>
      <span class="timer-bar-text">${timeDisplay}</span>
    </div>
    <div class="timer-label">${labelText}</div>
  `;
}

function onTimerExpired() {
  console.log('[Timer] onTimerExpired called, state:', currentGameData.timerState);
  console.log('[Timer] Called by:', isHost ? 'HOST' : 'NON-HOST', 'teamId:', teamId);
  console.log('[Timer] Current team:', currentGameData.currentTeam);
  
  const timerState = currentGameData.timerState;
  
  // Determine if THIS client should handle the timer stop
  let shouldStopTimer = false;
  
  if (timerState === 'guessing') {
    // For guessing: current team or host can stop
    shouldStopTimer = (currentGameData.currentTeam === teamId) || isHost;
  } else if (timerState === 'between_songs' || timerState === 'challenge_window' || timerState === 'challenge_placement') {
    // For between_songs, challenge_window, and challenge_placement: only host can stop
    shouldStopTimer = isHost;
  }
  
  if (!shouldStopTimer) {
    console.log('[Timer] Not authorized to stop this timer, skipping');
    return;
  }
  
  // Stop timer by clearing Firebase
  console.log('[Timer] Stopping timer in Firebase');
  const timerUpdates = {};
  timerUpdates[`games/${gameId}/timerState`] = null;
  timerUpdates[`games/${gameId}/timerStartTime`] = null;
  timerUpdates[`games/${gameId}/timerDuration`] = null;
  timerUpdates[`games/${gameId}/nextTeam`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), timerUpdates)
    .then(() => {
      console.log('[Timer] Timer stopped in Firebase');
    })
    .catch((error) => {
      console.error('[Timer] Error stopping timer:', error);
    });
  
  // Reset vibrate tracking
  lastVibrateSecond = null;
  
  if (timerState === 'guessing') {
    // Timer 1 expired - guessing time is up
    console.log('[Timer] Guessing timer expired');
    
    // Check if current team has placed a card
    const currentTeam = currentTeams[currentGameData.currentTeam];
    
    if (currentTeam && currentTeam.pendingCard) {
      // Has pending card - lock it in automatically
      console.log('[Timer] Auto-locking pending card');
      if (currentGameData.currentTeam === teamId) {
        // Only the current team should lock in
        lockInPlacement();
      }
    } else {
      // No pending card - skip this team's turn
      console.log('[Timer] No pending card - skipping turn');
      if (isHost) {
        // Only host should call skipTurn to avoid race conditions
        skipTurn();
      }
    }
  } else if (timerState === 'challenge_window') {
    // Timer 2 expired - challenge window is over, no one challenged
    console.log('[Timer] Challenge window expired, no challenge made');
    
    if (isHost) {
      // No one challenged - validate the active team's card directly
      console.log('[Timer] No challenge, validating active team card');
      
      // Check if there's a card to validate in active team's timeline
      const activeTeamId = currentGameData.currentTeam;
      const activeTeam = currentTeams[activeTeamId];
      
      if (activeTeam && activeTeam.timeline) {
        // Find unrevealed cards (should be just one - the most recent)
        const timelineCards = Object.entries(activeTeam.timeline);
        const unrevealedCards = timelineCards.filter(([key, card]) => card && !card.revealed);
        
        if (unrevealedCards.length > 0) {
          console.log('[Timer] Found unrevealed card to validate');
          // Call validateCard which is in game-cards.js
          // validateCard() will handle the validation and start Timer 4
          if (typeof validateCard === 'function') {
            validateCard();
          } else {
            console.error('[Timer] validateCard function not found!');
          }
        } else {
          console.warn('[Timer] No unrevealed cards found to validate');
          // Skip to next team
          skipTurn();
        }
      } else {
        console.warn('[Timer] Active team has no timeline');
        // Skip to next team
        skipTurn();
      }
    }
  } else if (timerState === 'challenge_placement') {
    // Timer 3 expired - challenge placement time is up
    console.log('[Timer] Challenge placement timer expired');
    
    if (isHost) {
      // Validate both cards (active team + challenging team)
      console.log('[Timer] Validating challenge');
      
      // Call validateChallenge which will be in game-cards.js
      // validateChallenge() will handle validation of both cards and start Timer 4
      if (typeof validateChallenge === 'function') {
        validateChallenge();
      } else {
        console.error('[Timer] validateChallenge function not found!');
        // Fallback: clear challenge state and skip to next team
        const updates = {};
        updates[`games/${gameId}/challengeState`] = null;
        window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
          .then(() => {
            skipTurn();
          });
      }
    }
  } else if (timerState === 'between_songs') {
    // Timer 4 expired - pause between songs is over
    console.log('[Timer] Between songs timer expired');
    
    if (isHost) {
      // Only host should transition to next turn
      transitionToNextTurn();
    }
  }
}

function skipTurn() {
  console.log('[Timer] Skipping turn for team:', currentGameData.currentTeam);
  
  showNotification('⏱️ Tiden är ute! Turen hoppar över', 'info');
  
  // Move to next team immediately, but start with Timer 4 (pause)
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
    console.warn('[Timer] No more songs in deck!');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  
  // Update Firebase
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Increment round if we wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Timer] Turn skipped, starting pause timer');
      
      // Start Timer 4 (pause) - show who's next
      
      startTimer("between_songs", (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
    })
    .catch((error) => {
      console.error('[Timer] Error skipping turn:', error);
    });
}

function transitionToNextTurn() {
  console.log('[Timer] Transitioning to next turn');
  
  // Just start Timer 1 for the current team
  startTimer('guessing', (currentGameData.guessingTime || 90) * 1000);
}

function vibrate(pattern) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

console.log('[Game] Timers module loaded');
