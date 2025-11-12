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
      
      // For guessing timer: only current team (or host as backup) should handle
      if (timerState === 'guessing') {
        const isCurrentTeam = currentGameData.currentTeam === teamId;
        if (isCurrentTeam || isHost) {
          console.log('[Timer] 🎯 Handling guessing timer expiry as', isCurrentTeam ? 'current team' : 'host backup');
          onTimerExpired();
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
      // For challenge_placement: active team should handle
      else if (timerState === 'challenge_placement') {
        const isCurrentTeam = currentGameData.currentTeam === teamId;
        if (isCurrentTeam) {
          console.log('[Timer] 🎯 Handling challenge_placement expiry as active team');
          onTimerExpired();
        } else {
          console.log('[Timer] ⏭️ Not active team, ignoring challenge_placement expiry');
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
      <div class="timer-bar ${colorClass}" style="width: ${progress}%"></div>
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
    // For challenge_placement: active team should handle (will validate both cards)
    shouldStopTimer = (currentGameData.currentTeam === teamId);
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
    
    // Check if current team has placed a card
    const currentTeam = currentTeams[currentGameData.currentTeam];
    
    if (currentTeam && currentTeam.pendingCard) {
      // Has pending card - lock it in automatically
      console.log('[Timer] 🔒 Auto-locking pending card');
      if (currentGameData.currentTeam === teamId) {
        // Only the current team should lock in
        lockInPlacement();
      }
    } else {
      // No pending card - skip this team's turn
      console.log('[Timer] ⏭️ No pending card - skipping turn');
      if (isHost) {
        // Only host should call skipTurn to avoid race conditions
        skipTurn();
      }
    }
    
    // Reset guard after handling
    setTimeout(() => {
      isProcessingTimerExpiry = false;
      console.log('[Timer] ✅ GUARD: Reset after guessing timer');
    }, 1000);
    
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
    // BUGFIX v4: KONSOLIDERADE FIREBASE-UPPDATERINGAR + ERROR HANDLING
    // ============================================
    console.log('[Timer] 💥 Challenge placement timer expired');
    console.log('[Timer] 🔍 DEBUG: Current game state:');
    console.log('  - currentTeam:', currentGameData.currentTeam);
    console.log('  - currentSongIndex:', currentGameData.currentSongIndex);
    console.log('  - challengeState:', currentGameData.challengeState);
    console.log('  - Available teams:', Object.keys(currentTeams));
    console.log('  - Total songs:', currentGameData.songs ? currentGameData.songs.length : 0);
    
    // Calculate next team and song FIRST (before any Firebase operations)
    console.log('[Timer] 📊 Calculating next team...');
    const teamIds = Object.keys(currentTeams);
    const currentIndex = teamIds.indexOf(currentGameData.currentTeam);
    const nextIndex = (currentIndex + 1) % teamIds.length;
    const nextTeamId = teamIds[nextIndex];
    
    console.log('[Timer] Current index:', currentIndex, 'Next index:', nextIndex, 'Next team:', nextTeamId);
    
    const currentSongIndex = currentGameData.currentSongIndex || 0;
    const nextSongIndex = currentSongIndex + 1;
    const songs = currentGameData.songs || [];
    
    console.log('[Timer] Current song index:', currentSongIndex, 'Next song index:', nextSongIndex, 'Total songs:', songs.length);
    
    if (nextSongIndex >= songs.length) {
      console.error('[Timer] ❌ No more songs in deck!');
      showNotification('Inga fler låtar!', 'error');
      isProcessingTimerExpiry = false;
      return;
    }
    
    const nextSong = songs[nextSongIndex];
    console.log('[Timer] ✅ Next song:', nextSong ? nextSong.title : 'null');
    
    // ============================================
    // ONE ATOMIC FIREBASE UPDATE WITH EVERYTHING
    // ============================================
    console.log('[Timer] 🚀 Creating consolidated Firebase update...');
    const allUpdates = {};
    
    // 1. Stop timer
    allUpdates[`games/${gameId}/timerState`] = null;
    allUpdates[`games/${gameId}/timerStartTime`] = null;
    allUpdates[`games/${gameId}/timerDuration`] = null;
    allUpdates[`games/${gameId}/nextTeam`] = null;
    console.log('[Timer]   ✓ Added timer stop to update batch');
    
    // 2. Clear challenge state
    allUpdates[`games/${gameId}/challengeState`] = null;
    console.log('[Timer]   ✓ Added challengeState clear to update batch');
    
    // 3. Clear all pending cards
    Object.keys(currentTeams).forEach(tId => {
      allUpdates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
    });
    console.log('[Timer]   ✓ Added pendingCard clears for', Object.keys(currentTeams).length, 'teams');
    
    // 4. Update game state
    allUpdates[`games/${gameId}/currentTeam`] = nextTeamId;
    allUpdates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
    allUpdates[`games/${gameId}/currentSong`] = nextSong;
    console.log('[Timer]   ✓ Added game state updates (team, song)');
    
    // 5. Increment round if wrapped around
    if (nextIndex === 0) {
      const newRound = (currentGameData.currentRound || 0) + 1;
      allUpdates[`games/${gameId}/currentRound`] = newRound;
      console.log('[Timer]   ✓ Added round increment to', newRound);
    }
    
    console.log('[Timer] 📦 Total updates in batch:', Object.keys(allUpdates).length);
    console.log('[Timer] 🔄 Applying atomic Firebase update...');
    
    // Apply all updates in ONE transaction
    window.firebaseUpdate(window.firebaseRef(window.firebaseDb), allUpdates)
      .then(() => {
        console.log('[Timer] ✅ SUCCESS: All updates applied atomically');
        showNotification('⏱️ Utmaningstiden är ute!', 'info');
        
        // Small delay to let Firebase propagate
        console.log('[Timer] ⏳ Waiting 200ms for Firebase propagation...');
        return new Promise(resolve => setTimeout(resolve, 200));
      })
      .then(() => {
        console.log('[Timer] 🎬 Starting Timer 4 (between_songs)...');
        const betweenSongsTime = (currentGameData.betweenSongsTime || 10) * 1000;
        console.log('[Timer] Timer 4 duration:', betweenSongsTime, 'ms for team:', nextTeamId);
        startTimer('between_songs', betweenSongsTime, nextTeamId);
        console.log('[Timer] ✅ Timer 4 started successfully');
      })
      .catch((error) => {
        // ============================================
        // COMPREHENSIVE ERROR HANDLING WITH RECOVERY
        // ============================================
        console.error('[Timer] ❌❌❌ CRITICAL ERROR in Timer 3 expiry ❌❌❌');
        console.error('[Timer] Error details:', error);
        console.error('[Timer] Error message:', error.message);
        console.error('[Timer] Error code:', error.code);
        console.error('[Timer] Stack trace:', error.stack);
        
        showNotification('⚠️ Timer-fel, försöker återställa...', 'error');
        
        // RECOVERY ATTEMPT
        console.log('[Timer] 🔧 Attempting recovery...');
        console.log('[Timer] Recovery strategy: Simplified update with just essentials');
        
        const recoveryUpdates = {};
        recoveryUpdates[`games/${gameId}/timerState`] = null;
        recoveryUpdates[`games/${gameId}/challengeState`] = null;
        recoveryUpdates[`games/${gameId}/currentTeam`] = nextTeamId;
        
        console.log('[Timer] 🔄 Applying recovery update...');
        return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), recoveryUpdates)
          .then(() => {
            console.log('[Timer] ✅ Recovery update successful');
            console.log('[Timer] 🎬 Starting Timer 4 (recovery mode)...');
            startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
            showNotification('⚠️ Återställt - fortsätter spelet', 'info');
          })
          .catch((recoveryError) => {
            console.error('[Timer] ❌❌❌ RECOVERY FAILED ❌❌❌');
            console.error('[Timer] Recovery error:', recoveryError);
            showNotification('❌ Kritiskt fel - host måste trycka "Nästa"', 'error');
          });
      })
      .finally(() => {
        // Always reset guard, even if errors occurred
        console.log('[Timer] 🏁 Finally block - resetting guard');
        setTimeout(() => {
          isProcessingTimerExpiry = false;
          console.log('[Timer] ✅ GUARD: Reset after challenge placement (finally)');
        }, 1000);
      });
    
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

console.log('[Game] Timers module loaded (BUGFIX v4)');
