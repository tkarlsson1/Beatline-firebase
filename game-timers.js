// ============================================
// NOTESTREAM - GAME TIMERS MODULE
// BUGFIX v4: Guard mot race conditions + error handling + konsoliderade uppdateringar
// ============================================

// ============================================
// TIMER FUNCTIONS
// ============================================

// Counter for logging (to avoid spam with 100ms updates)
let timerUpdateCounter = 0;

function startTimer(type, duration, nextTeamId = null) {
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
  
  // Clear Firebase timer state
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
    console.log('[Timer] ⏱️ Timer expired! State:', currentGameData.timerState, 'Team:', teamId);
    
    // Only call if timer state still exists
    if (currentGameData.timerState) {
      const timerState = currentGameData.timerState;
      
      // For guessing timer: only current team should handle immediately
      // Host provides backup after delay if current team fails
      if (timerState === 'guessing') {
        const isCurrentTeam = currentGameData.currentTeam === teamId;
        if (isCurrentTeam) {
          console.log('[Timer] 🎯 Handling guessing timer expiry as current team');
          onTimerExpired();
        } else if (isHost) {
          // Host waits 2 seconds before handling (backup only if current team fails)
          console.log('[Timer] ⏰ Host scheduling backup in 2 seconds...');
          setTimeout(() => {
            // Re-check game state - current team may have handled it by now
            const freshData = currentGameData; // Updated by Firebase listener
            
            // Check if validation is already happening
            if (freshData.validationModal?.isVisible) {
              console.log('[Timer] ✅ Validation active, host backup not needed');
              return;
            }
            
            // Check if Timer 2 already started
            if (freshData.timerState === 'challenge_window') {
              console.log('[Timer] ✅ Timer 2 started, host backup not needed');
              return;
            }
            
            // Check if timer is still running (shouldn't happen, but safety check)
            if (freshData.timerState === 'guessing') {
              console.log('[Timer] ⚠️ Timer still running, host backup not needed');
              return;
            }
            
            // Timer stopped but nothing happened - current team failed
            if (freshData.timerState === null) {
              console.log('[Timer] 🚨 Host backup: current team failed, taking over');
              
              // Get current team data
              const currentTeamId = freshData.currentTeam;
              const teamRef = window.firebaseRef(window.firebaseDb, `games/${gameId}/teams/${currentTeamId}`);
              
              window.firebaseGet(teamRef).then(snapshot => {
                if (snapshot.exists()) {
                  const teamData = snapshot.val();
                  if (teamData.pendingCard) {
                    // Current team has a card - lock it in for them
                    placementPosition = teamData.pendingCard.position;
                    console.log('[Timer] 🚨 Host backup: locking card at position', placementPosition);
                    lockInPlacement(currentTeamId);
                  } else {
                    // No card - skip turn
                    console.log('[Timer] 🚨 Host backup: skipping turn');
                    skipTurn();
                  }
                }
              }).catch(error => {
                console.error('[Timer] ❌ Host backup error:', error);
              });
            } else {
              console.log('[Timer] ✅ Game state changed, host backup not needed');
            }
          }, 2000);
        } else {
          console.log('[Timer] ⏭️ Not current team or host, ignoring guessing timer expiry');
        }
      }
      // For challenge_window: active team should handle
      else if (timerState === 'challenge_window') {
        const isCurrentTeam = currentGameData.currentTeam === teamId;
        if (isCurrentTeam) {
          console.log('[Timer] 🎯 Handling challenge_window expiry as active team');
          onTimerExpired();
        } else {
          console.log('[Timer] ⏭️ Not active team, ignoring challenge_window expiry');
        }
      }
      // For challenge_placement: challenging team should handle immediately
      // Host provides backup after delay if challenging team fails
      else if (timerState === 'challenge_placement') {
        const challengingTeamId = currentGameData.challengeState?.challengingTeam;
        const isChallengingTeam = challengingTeamId === teamId;
        
        if (isChallengingTeam) {
          console.log('[Timer] 🎯 Handling challenge_placement expiry as challenging team');
          onTimerExpired();
        } else if (isHost) {
          // Host waits 2 seconds before handling (backup only if challenging team fails)
          console.log('[Timer] ⏰ Host scheduling challenge validation backup in 2 seconds...');
          setTimeout(() => {
            // Re-check game state - challenging team may have handled it by now
            const freshData = currentGameData; // Updated by Firebase listener
            
            // Check if validation is already happening
            if (freshData.validationModal?.isVisible) {
              console.log('[Timer] ✅ Validation active, host backup not needed');
              return;
            }
            
            // Check if Timer 4 already started
            if (freshData.timerState === 'between_songs') {
              console.log('[Timer] ✅ Timer 4 started, host backup not needed');
              return;
            }
            
            // Check if timer is still running (shouldn't happen, but safety check)
            if (freshData.timerState === 'challenge_placement') {
              console.log('[Timer] ⚠️ Timer still running, host backup not needed');
              return;
            }
            
            // Timer stopped but nothing happened - challenging team failed
            if (freshData.timerState === null && freshData.challengeState?.isActive) {
              console.log('[Timer] 🚨 Host backup: challenging team failed, validating challenge');
              
              // Temporarily set timer state for onTimerExpired validation check
              const originalState = currentGameData.timerState;
              currentGameData.timerState = 'challenge_placement';
              onTimerExpired();
              currentGameData.timerState = originalState;
            } else {
              console.log('[Timer] ✅ Game state changed, host backup not needed');
            }
          }, 2000);
        } else {
          console.log('[Timer] ⏭️ Not challenging team or host, ignoring challenge_placement expiry');
        }
      }
      // For between_songs timer: only host should handle
      else if (timerState === 'between_songs') {
        if (isHost) {
          console.log('[Timer] 🎯 Handling between_songs timer expiry as host');
          onTimerExpired();
        } else {
          console.log('[Timer] ⏭️ Not host, ignoring between_songs timer expiry');
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
    if (currentGameData.challengeState) {
      const challengingTeamId = currentGameData.challengeState.challengingTeam;
      const challengingTeam = currentTeams[challengingTeamId];
      if (challengingTeam) {
        labelText = `${escapeHtml(challengingTeam.name)} - Placera ditt kort!`;
      } else {
        labelText = 'Utmaning pågår';
      }
    } else {
      labelText = 'Utmaning pågår';
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
  console.log('[Timer] ========== TIMER EXPIRED ==========');
  console.log('[Timer] State:', currentGameData.timerState);
  console.log('[Timer] Called by:', isHost ? 'HOST' : 'NON-HOST', 'teamId:', teamId);
  console.log('[Timer] Current team:', currentGameData.currentTeam);
  console.log('[Timer] Challenge state:', currentGameData.challengeState);
  
  // ============================================
  // BUGFIX v4: GUARD AGAINST RACE CONDITIONS
  // ============================================
  if (isProcessingTimerExpiry) {
    console.log('[Timer] ⚠️ GUARD: Already processing expiry, skipping duplicate call');
    console.log('[Timer] This prevents multiple parallel Firebase updates');
    return;
  }
  
  console.log('[Timer] ✅ GUARD: Setting processing flag');
  isProcessingTimerExpiry = true;
  
  const timerState = currentGameData.timerState;
  
  // Determine if THIS client should handle the timer stop
  let shouldStopTimer = false;
  
  if (timerState === 'guessing') {
    // For guessing: current team or host can stop
    shouldStopTimer = (currentGameData.currentTeam === teamId) || isHost;
  } else if (timerState === 'challenge_window') {
    // For challenge_window: active team should handle (no one challenged)
    shouldStopTimer = (currentGameData.currentTeam === teamId);
  } else if (timerState === 'challenge_placement') {
    // For challenge_placement: challenging team (or host backup) should handle
    const challengingTeamId = currentGameData.challengeState?.challengingTeam;
    shouldStopTimer = (challengingTeamId === teamId) || isHost;
  } else if (timerState === 'between_songs') {
    // For between_songs: only host can stop
    shouldStopTimer = isHost;
  }
  
  console.log('[Timer] Should stop timer:', shouldStopTimer);
  
  if (!shouldStopTimer) {
    console.log('[Timer] ❌ Not authorized to stop this timer, skipping');
    isProcessingTimerExpiry = false;
    return;
  }
  
  // Reset vibrate tracking
  lastVibrateSecond = null;
  
  // ============================================
  // HANDLE DIFFERENT TIMER STATES
  // ============================================
  
  if (timerState === 'guessing') {
    // Timer 1 expired - guessing time is up
    console.log('[Timer] 🎲 Guessing timer expired');
    
    // Stop timer first
    stopTimer();
    
    // FRESH Firebase read for current team data
    const currentTeamId = currentGameData.currentTeam;
    console.log('[Timer] Fetching fresh team data from Firebase for:', currentTeamId);
    
    const teamRef = window.firebaseRef(window.firebaseDb, `games/${gameId}/teams/${currentTeamId}`);
    
    window.firebaseGet(teamRef).then(snapshot => {
      if (!snapshot.exists()) {
        console.error('[Timer] ❌ Team not found');
        isProcessingTimerExpiry = false;
        return;
      }
      
      const freshTeamData = snapshot.val();
      console.log('[Timer] Fresh data:', freshTeamData.name, 'pendingCard:', !!freshTeamData.pendingCard);
      
      if (freshTeamData.pendingCard) {
        // Has pending card - lock it in automatically
        console.log('[Timer] 🔒 Auto-locking pending card');
        
        placementPosition = freshTeamData.pendingCard.position;
        console.log('[Timer] Set placementPosition:', placementPosition);
        
        if (currentTeamId === teamId) {
          // Current team handles their own lock-in
          console.log('[Timer] 💚 Current team auto-locking');
          lockInPlacement();
        }
      } else {
        // No pending card - skip turn
        console.log('[Timer] ⏭️ No pending card, skipping turn');
        skipTurn();
      }
      
      // Reset guard
      setTimeout(() => {
        isProcessingTimerExpiry = false;
        console.log('[Timer] ✅ GUARD: Reset');
      }, 1000);
      
    }).catch(error => {
      console.error('[Timer] ❌ Error:', error);
      isProcessingTimerExpiry = false;
    });
    
  } else if (timerState === 'challenge_window') {
    // Timer 2 expired - no one challenged
    console.log('[Timer] ⏰ Challenge window expired - no challenge');
    
    // Stop timer first
    stopTimer();
    
    // Check if challenge state is set (someone challenged during timer)
    if (currentGameData.challengeState && currentGameData.challengeState.isActive) {
      console.log('[Timer] ⚠️ Challenge state active, Timer 3 should have started already');
      isProcessingTimerExpiry = false;
      return;
    }
    
    // No challenge - proceed with normal validation
    console.log('[Timer] ✅ No challenge detected, validating card normally');
    
    if (window.pendingValidationCard) {
      const { key, card } = window.pendingValidationCard;
      validateAndScoreCard(key, card);
      window.pendingValidationCard = null;
    } else {
      console.error('[Timer] ❌ No pending validation card found!');
    }
    
    // Reset guard after handling
    setTimeout(() => {
      isProcessingTimerExpiry = false;
      console.log('[Timer] ✅ GUARD: Reset after challenge window');
    }, 1000);
    
  } else if (timerState === 'challenge_placement') {
    // ============================================
    // TIMER 3: VALIDATE CHALLENGE
    // ============================================
    console.log('[Timer] 💥 Challenge placement timer expired');
    console.log('[Timer] 🎯 Validating challenge...');
    
    // Stop timer first
    stopTimer();
    
    // Call validateChallenge() which will:
    // - Find active team's unrevealed card
    // - Validate active team's card
    // - If wrong, validate challenging team's card (if placed)
    // - Update scores, tokens, timelines
    // - Clear challengeState and pendingCards
    // - Transition to next team
    // - Start Timer 4
    validateChallenge();
    
    console.log('[Timer] ✅ Challenge validation initiated');
    
    // Reset guard after handling
    setTimeout(() => {
      isProcessingTimerExpiry = false;
      console.log('[Timer] ✅ GUARD: Reset after challenge placement');
    }, 1000);
    
  } else if (timerState === 'between_songs') {
    // Timer 4 expired - pause between songs is over
    console.log('[Timer] ⏭️ Between songs timer expired');
    
    // Stop timer first
    stopTimer();
    
    if (isHost) {
      // Only host should transition to next turn
      transitionToNextTurn();
    }
    
    // Reset guard after handling
    setTimeout(() => {
      isProcessingTimerExpiry = false;
      console.log('[Timer] ✅ GUARD: Reset after between songs');
    }, 1000);
  }
  
  console.log('[Timer] ========== TIMER EXPIRED END ==========');
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

// Expose onTimerExpired globally for game-init.js to call
window.onTimerExpired = onTimerExpired;

console.log('[Game] Timers module loaded (BUGFIX v4)');
