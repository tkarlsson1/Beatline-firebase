// ============================================
// NOTESTREAM - GAME CARDS MODULE
// Handles drag & drop, card placement, and validation
// ============================================

// ============================================
// GUARD VARIABLES
// ============================================
let isChangingCard = false;
let isLockingInPlacement = false; // BUGFIX v2.2: Prevent duplicate lock-in calls

// ============================================
// DRAG AND DROP HANDLERS (MOUSE)
// ============================================
function handleDragStart(e) {
  console.log('[Game] Drag start (current card)');
  isDragging = true;
  draggedCard = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handlePreviewDragStart(e) {
  console.log('[Game] Drag start (preview card)');
  isDragging = true;
  draggedCard = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  
  // Clear current placement position so we can set a new one
  placementPosition = null;
}

function handleDragEnd(e) {
  console.log('[Game] Drag end');
  isDragging = false;
  e.target.classList.remove('dragging');
  clearDynamicDropIndicator();
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  if (isDragging) {
    const position = showDynamicDropIndicator(e.clientX, e.clientY);
  }
}

function handleDragLeave(e) {
  // Keep indicator visible during drag
}

function handleDrop(e) {
  e.preventDefault();
  
  if (!isDragging) return;
  
  const position = getDropPositionFromCoords(e.clientX, e.clientY);
  console.log('[Game] Dropped at position:', position);
  
  placementPosition = position;
  clearDynamicDropIndicator();
  
  // Save preview card to Firebase so all players can see it
  savePendingCard(position);
  
  showNotification(`Kort placerat vid position ${position}`, 'success');
}

// ============================================
// TOUCH HANDLERS (MOBILE)
// ============================================
let touchStartX = 0;
let touchStartY = 0;
let ghostCard = null;

function handleTouchStart(e) {
  console.log('[Game] Touch start (current card)');
  isDragging = true;
  draggedCard = e.currentTarget;
  
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  
  // Create ghost card that follows finger
  ghostCard = draggedCard.cloneNode(true);
  ghostCard.style.position = 'fixed';
  ghostCard.style.zIndex = '10000';
  ghostCard.style.pointerEvents = 'none';
  ghostCard.style.opacity = '0.8';
  ghostCard.style.width = '82px';
  ghostCard.style.height = '96px';
  ghostCard.style.left = touch.clientX - 41 + 'px';
  ghostCard.style.top = touch.clientY - 48 + 'px';
  document.body.appendChild(ghostCard);
  
  draggedCard.classList.add('dragging');
  e.preventDefault();
}

function handlePreviewTouchStart(e) {
  console.log('[Game] Touch start (preview card)');
  
  // Clean up any existing ghost card first
  if (ghostCard) {
    console.log('[Game] Removing existing ghost card');
    document.body.removeChild(ghostCard);
    ghostCard = null;
  }
  
  isDragging = true;
  draggedCard = e.currentTarget;
  
  // Clear pending card from Firebase when starting to drag
  clearPendingCard();
  placementPosition = null;
  
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  
  // Create ghost card
  ghostCard = draggedCard.cloneNode(true);
  ghostCard.style.position = 'fixed';
  ghostCard.style.zIndex = '10000';
  ghostCard.style.pointerEvents = 'none';
  ghostCard.style.opacity = '0.8';
  ghostCard.style.width = '82px';
  ghostCard.style.height = '96px';
  ghostCard.style.left = touch.clientX - 41 + 'px';
  ghostCard.style.top = touch.clientY - 48 + 'px';
  document.body.appendChild(ghostCard);
  
  console.log('[Game] Ghost card created');
  
  draggedCard.classList.add('dragging');
  e.preventDefault();
}

function handleTouchMove(e) {
  if (!isDragging) {
    return;
  }
  
  if (!ghostCard) {
    console.warn('[Game] Touch move but no ghost card!');
    return;
  }
  
  const touch = e.touches[0];
  
  // Update ghost card position
  ghostCard.style.left = touch.clientX - 51 + 'px';
  ghostCard.style.top = touch.clientY - 48 + 'px';
  
  // Show dynamic drop indicator
  showDynamicDropIndicator(touch.clientX, touch.clientY);
  
  e.preventDefault();
}

function handleTouchEnd(e) {
  console.log('[Game] Touch end, isDragging:', isDragging);
  
  if (!isDragging) {
    console.log('[Game] Not dragging, ignoring touch end');
    return;
  }
  
  const touch = e.changedTouches[0];
  const position = getDropPositionFromCoords(touch.clientX, touch.clientY);
  
  console.log('[Game] Touch dropped at position:', position);
  
  placementPosition = position;
  clearDynamicDropIndicator();
  
  // Cleanup ghost card
  console.log('[Game] Cleaning up ghost card:', ghostCard ? 'exists' : 'null');
  if (ghostCard) {
    try {
      document.body.removeChild(ghostCard);
      console.log('[Game] Ghost card removed');
    } catch (err) {
      console.error('[Game] Error removing ghost card:', err);
    }
    ghostCard = null;
  }
  
  // Cleanup dragged card styling
  if (draggedCard) {
    draggedCard.classList.remove('dragging');
    draggedCard = null;
  }
  
  isDragging = false;
  
  // Save preview card to Firebase so all players can see it
  savePendingCard(position);
  
  showNotification(`Kort placerat vid position ${position}`, 'success');
  
  e.preventDefault();
}

// ============================================
// PENDING CARD (PREVIEW) MANAGEMENT
// ============================================
function savePendingCard(position) {
  console.log('[Game] Saving pending card to Firebase at position:', position);
  
  // Check if we're in challenge mode
  if (currentGameData.timerState === 'challenge_placement' && 
      currentGameData.challengeState &&
      currentGameData.challengeState.challengingTeam === teamId) {
    
    console.log('[Game] Challenge mode: saving to challengeState.challengingCard');
    
    const challengingCardRef = window.firebaseRef(
      window.firebaseDb, 
      `games/${gameId}/challengeState/challengingCard`
    );
    
    const challengingCard = {
      year: currentGameData.currentSong.year,
      title: currentGameData.currentSong.title,
      artist: currentGameData.currentSong.artist,
      spotifyId: currentGameData.currentSong.spotifyId,
      position: position,
      locked: false,
      timestamp: Date.now()
    };
    
    window.firebaseSet(challengingCardRef, challengingCard)
      .then(() => {
        console.log('[Game] Challenging card saved to challengeState');
      })
      .catch((error) => {
        console.error('[Game] Error saving challenging card:', error);
      });
    
    return;
  }
  
  // Normal mode: save to team's pendingCard
  const pendingCardRef = window.firebaseRef(
    window.firebaseDb, 
    `games/${gameId}/teams/${teamId}/pendingCard`
  );
  
  const pendingCard = {
    position: position,
    timestamp: Date.now()
  };
  
  window.firebaseSet(pendingCardRef, pendingCard)
    .then(() => {
      console.log('[Game] Pending card saved');
    })
    .catch((error) => {
      console.error('[Game] Error saving pending card:', error);
    });
}

function clearPendingCard() {
  console.log('[Game] Clearing pending card from Firebase');
  
  // Check if we're in challenge mode
  if (currentGameData.timerState === 'challenge_placement' && 
      currentGameData.challengeState &&
      currentGameData.challengeState.challengingTeam === teamId) {
    
    console.log('[Game] Challenge mode: clearing challengeState.challengingCard');
    
    const challengingCardRef = window.firebaseRef(
      window.firebaseDb, 
      `games/${gameId}/challengeState/challengingCard`
    );
    
    window.firebaseSet(challengingCardRef, null)
      .then(() => {
        console.log('[Game] Challenging card cleared');
      })
      .catch((error) => {
        console.error('[Game] Error clearing challenging card:', error);
      });
    
    return;
  }
  
  // Normal mode: clear team's pendingCard
  const pendingCardRef = window.firebaseRef(
    window.firebaseDb, 
    `games/${gameId}/teams/${teamId}/pendingCard`
  );
  
  window.firebaseSet(pendingCardRef, null)
    .then(() => {
      console.log('[Game] Pending card cleared');
    })
    .catch((error) => {
      console.error('[Game] Error clearing pending card:', error);
    });
}

// ============================================
// ACTION FUNCTIONS
// ============================================
function changeCard() {
  console.log('[Game] ========== BYT KORT ==========');
  
  // ============================================
  // GUARD: Prevent multiple simultaneous card changes
  // ============================================
  if (isChangingCard) {
    console.log('[Game] ⚠️ Already changing card, skipping duplicate call');
    return;
  }
  isChangingCard = true;
  
  // ============================================
  // VALIDATION
  // ============================================
  
  // Check tokens
  if (!myTeam || myTeam.tokens < 1) {
    console.log('[Game] ❌ No tokens available');
    showNotification('Du har inga tokens kvar!', 'error');
    isChangingCard = false;
    return;
  }
  
  // Must be active team
  if (currentGameData.currentTeam !== teamId) {
    console.log('[Game] ❌ Not active team');
    showNotification('Det är inte din tur!', 'error');
    isChangingCard = false;
    return;
  }
  
  // Must be during Timer 1 (guessing)
  if (currentGameData.timerState !== 'guessing') {
    console.log('[Game] ❌ Not in guessing state. Current state:', currentGameData.timerState);
    showNotification('Kan bara byta kort under gissning!', 'error');
    isChangingCard = false;
    return;
  }
  
  // Must not have validation modal active
  if (currentGameData.validationModal && currentGameData.validationModal.isVisible) {
    console.log('[Game] ❌ Validation modal is active');
    showNotification('Vänta tills valideringen är klar!', 'error');
    isChangingCard = false;
    return;
  }
  
  // Check if more songs available
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.log('[Game] ❌ No more songs in deck');
    showNotification('Inga fler låtar i listan!', 'error');
    isChangingCard = false;
    return;
  }
  
  console.log('[Game] ✅ All validation checks passed');
  
  // Confirm action
  if (!confirm('Byt låt för 1 token?')) {
    console.log('[Game] User cancelled');
    isChangingCard = false;
    return;
  }
  
  // ============================================
  // STEP 1: STOP TIMER FIRST (ATOMIC)
  // This prevents race conditions with timer expiry
  // ============================================
  console.log('[Game] 🛑 Step 1: Stopping timer atomically...');
  
  const stopUpdates = {};
  stopUpdates[`games/${gameId}/timerState`] = null;
  stopUpdates[`games/${gameId}/timerStartTime`] = null;
  stopUpdates[`games/${gameId}/timerDuration`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), stopUpdates)
    .then(() => {
      console.log('[Game] ✅ Timer stopped successfully');
      
      // Wait for Firebase propagation (300ms)
      console.log('[Game] ⏳ Waiting for Firebase propagation (300ms)...');
      return new Promise(resolve => setTimeout(resolve, 300));
    })
    .then(() => {
      // ============================================
      // STEP 2: SWAP CARD + DEDUCT TOKEN
      // ============================================
      console.log('[Game] 🔄 Step 2: Swapping card and deducting token...');
      
      const nextSong = songs[nextSongIndex];
      console.log('[Game] Current song:', currentGameData.currentSong.title);
      console.log('[Game] Next song:', nextSong.title);
      console.log('[Game] Song index:', currentSongIndex, '→', nextSongIndex);
      console.log('[Game] Tokens:', myTeam.tokens, '→', myTeam.tokens - 1);
      
      const swapUpdates = {};
      
      // Deduct token
      swapUpdates[`games/${gameId}/teams/${teamId}/tokens`] = myTeam.tokens - 1;
      
      // Update song
      swapUpdates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
      swapUpdates[`games/${gameId}/currentSong`] = nextSong;
      
      // Clear pending card
      swapUpdates[`games/${gameId}/teams/${teamId}/pendingCard`] = null;
      placementPosition = null;
      
      console.log('[Game] Applying', Object.keys(swapUpdates).length, 'updates...');
      
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), swapUpdates);
    })
    .then(() => {
      console.log('[Game] ✅ Card swapped successfully');
      showNotification('🔄 Ny låt! Lyssna noga...', 'success');
      
      // Wait for Firebase propagation (200ms)
      console.log('[Game] ⏳ Waiting for Firebase propagation (200ms)...');
      return new Promise(resolve => setTimeout(resolve, 200));
    })
    .then(() => {
      // ============================================
      // STEP 3: START NEW TIMER
      // ============================================
      console.log('[Game] ▶️ Step 3: Starting new timer with full duration...');
      
      const guessingTime = (currentGameData.guessingTime || 90) * 1000;
      console.log('[Game] Timer duration:', guessingTime, 'ms');
      
      // This will trigger Spotify playback automatically via updateGameView()
      // when timerState changes to 'guessing'
      startTimer('guessing', guessingTime);
      
      console.log('[Game] ✅ Timer started - Spotify will auto-play new song');
      console.log('[Game] ========== BYT KORT COMPLETE ==========');
    })
    .catch((error) => {
      console.error('[Game] ❌❌❌ ERROR IN CHANGECARD ❌❌❌');
      console.error('[Game] Error details:', error);
      console.error('[Game] Error message:', error.message);
      
      showNotification('❌ Kunde inte byta kort - försök igen', 'error');
      
      console.log('[Game] ========== BYT KORT FAILED ==========');
    })
    .finally(() => {
      // Always reset guard
      isChangingCard = false;
      console.log('[Game] ✅ Guard reset');
    });
}

// ============================================
// CHALLENGE CARD
// BUGFIX v4: Bättre error handling och debug-loggar
// ============================================
function challengeCard() {
  console.log('[Game] ========== CHALLENGE REQUESTED ==========');
  console.log('[Game] 🎯 Team:', teamId, 'requesting challenge');
  console.log('[Game] 🔍 Current state:');
  console.log('  - timerState:', currentGameData.timerState);
  console.log('  - currentTeam:', currentGameData.currentTeam);
  console.log('  - My tokens:', myTeam ? myTeam.tokens : 'N/A');
  console.log('  - challengeState:', currentGameData.challengeState);
  
  // Check if we have tokens
  if (!myTeam || myTeam.tokens < 1) {
    console.log('[Game] ❌ No tokens available');
    showNotification('Du har inga tokens kvar!', 'error');
    return;
  }
  
  // Check if we're in challenge window
  if (!currentGameData.timerState || currentGameData.timerState !== 'challenge_window') {
    console.log('[Game] ❌ Not in challenge window. Current state:', currentGameData.timerState);
    showNotification('Inte rätt tid att utmana!', 'error');
    return;
  }
  
  // Check if someone already challenged
  if (currentGameData.challengeState && currentGameData.challengeState.isActive) {
    console.log('[Game] ❌ Someone already challenged:', currentGameData.challengeState);
    showNotification('Någon har redan utmanat!', 'error');
    return;
  }
  
  // Check that we're not the active team
  if (currentGameData.currentTeam === teamId) {
    console.log('[Game] ❌ Cannot challenge yourself');
    showNotification('Du kan inte utmana dig själv!', 'error');
    return;
  }
  
  console.log('[Game] ✅ All checks passed! Proceeding with challenge...');
  console.log('[Game] 💥 Challenge accepted! Setting challengeState...');
  
  const updates = {};
  
  // Set challenge state
  const challengeState = {
    isActive: true,
    challengingTeam: teamId,
    activeTeam: currentGameData.currentTeam,
    timestamp: Date.now()
  };
  updates[`games/${gameId}/challengeState`] = challengeState;
  console.log('[Game]   ✓ Added challengeState:', challengeState);
  
  // Deduct token
  const oldTokenCount = myTeam.tokens;
  const newTokenCount = oldTokenCount - 1;
  updates[`games/${gameId}/teams/${teamId}/tokens`] = newTokenCount;
  console.log('[Game]   ✓ Token deduction:', oldTokenCount, '→', newTokenCount);
  
  // Clear all pending cards (clean slate for challenge)
  const teamCount = Object.keys(currentTeams).length;
  Object.keys(currentTeams).forEach(tId => {
    updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
  });
  console.log('[Game]   ✓ Cleared pendingCards for', teamCount, 'teams');
  
  // Stop Timer 2
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  console.log('[Game]   ✓ Added Timer 2 stop');
  
  console.log('[Game] 📦 Total updates:', Object.keys(updates).length);
  console.log('[Game] 🔄 Applying Firebase update...');
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] ✅ Challenge registered successfully!');
      console.log('[Game] 🎬 Starting Timer 3 (challenge_placement)...');
      
      showNotification('💥 UTMANING! Placera ditt kort!', 'success');
      
      // Start Timer 3 (challenge placement)
      const placeChallengeTime = (currentGameData.placeChallengeTime || 20) * 1000;
      console.log('[Game] Timer 3 duration:', placeChallengeTime, 'ms');
      startTimer('challenge_placement', placeChallengeTime);
      console.log('[Game] ✅ Timer 3 started');
      console.log('[Game] ========== CHALLENGE COMPLETE ==========');
    })
    .catch((error) => {
      console.error('[Game] ❌❌❌ ERROR IN CHALLENGE ❌❌❌');
      console.error('[Game] Error details:', error);
      console.error('[Game] Error message:', error.message);
      console.error('[Game] Error code:', error.code);
      console.error('[Game] Updates that failed:', updates);
      
      showNotification('❌ Kunde inte utmana - försök igen', 'error');
      
      // Recovery: Try to restore token if Firebase update failed
      console.log('[Game] 🔧 Attempting token recovery...');
      const recoveryUpdate = {};
      recoveryUpdate[`games/${gameId}/teams/${teamId}/tokens`] = oldTokenCount;
      
      window.firebaseUpdate(window.firebaseRef(window.firebaseDb), recoveryUpdate)
        .then(() => {
          console.log('[Game] ✅ Token restored to', oldTokenCount);
        })
        .catch((recoveryError) => {
          console.error('[Game] ❌ Token recovery failed:', recoveryError);
          console.error('[Game] User may have lost a token - manual fix needed');
        });
      
      console.log('[Game] ========== CHALLENGE FAILED ==========');
    });
}


function lockInPlacement(targetTeamId = null) {
  console.log('[Game] Lock in placement at position:', placementPosition);
  console.log('[Game] Target team:', targetTeamId || 'self');
  
  // ============================================
  // BUGFIX v2.2: GUARD AGAINST DUPLICATE CALLS
  // ============================================
  if (isLockingInPlacement) {
    console.log('[Game] ⚠️ GUARD: Already locking in placement, skipping duplicate call');
    return;
  }
  isLockingInPlacement = true;
  console.log('[Game] ✅ GUARD: Setting lock-in flag');
  
  // ============================================
  // BUGFIX v2.2: SUPPORT HOST BACKUP
  // Allow host to lock in for another team
  // ============================================
  const effectiveTeamId = targetTeamId || teamId;
  const effectiveTeam = targetTeamId ? currentTeams[targetTeamId] : myTeam;
  
  if (!effectiveTeam) {
    console.error('[Game] ❌ Target team not found:', effectiveTeamId);
    isLockingInPlacement = false;
    return;
  }
  
  console.log('[Game] Effective team:', effectiveTeam.name, '(', effectiveTeamId, ')');
  
  if (placementPosition === null) {
    showNotification('Placera kortet först!', 'error');
    isLockingInPlacement = false;
    return;
  }
  
  if (!currentGameData.currentSong) {
    showNotification('Ingen låt att placera!', 'error');
    isLockingInPlacement = false;
    return;
  }
  
  // ============================================
  // CHALLENGE MODE: Lock in challenging card
  // ============================================
  if (currentGameData.timerState === 'challenge_placement' && 
      currentGameData.challengeState &&
      currentGameData.challengeState.challengingTeam === teamId) {
    
    console.log('[Game] Challenge mode: locking challenging card and triggering validation');
    
    const updates = {};
    
    // Lock the card
    updates[`games/${gameId}/challengeState/challengingCard/locked`] = true;
    
    // Stop Timer 3
    updates[`games/${gameId}/timerState`] = null;
    updates[`games/${gameId}/timerStartTime`] = null;
    updates[`games/${gameId}/timerDuration`] = null;
    
    console.log('[Game] Locking card and stopping Timer 3');
    
    window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
      .then(() => {
        console.log('[Game] Challenging card locked, timer stopped');
        showNotification('💥 Challenge-kort låst! Validerar...', 'success');
        placementPosition = null;
        
        // Reset guard
        isLockingInPlacement = false;
        console.log('[Game] ✅ GUARD: Reset after challenge lock-in');
        
        // Wait a bit for Firebase to propagate, then validate
        setTimeout(() => {
          console.log('[Game] Triggering challenge validation...');
          validateChallenge();
        }, 500);
      })
      .catch((error) => {
        console.error('[Game] Error locking challenging card:', error);
        showNotification('Kunde inte låsa kort', 'error');
        
        // Reset guard on error
        isLockingInPlacement = false;
        console.log('[Game] ✅ GUARD: Reset after challenge lock-in error');
      });
    
    return;
  }
  
  // ============================================
  // NORMAL MODE: Lock in to timeline
  // ============================================
  
  // Remove preview card
  const previewCard = document.querySelector('.preview-card');
  if (previewCard) {
    previewCard.remove();
  }
  
  // Get all non-null cards from timeline and sort by position
  let existingCards = [];
  if (effectiveTeam.timeline) {
    existingCards = Object.entries(effectiveTeam.timeline)
      .filter(([key, card]) => card !== null) // Filter out deleted cards
      .map(([key, card]) => ({ ...card, key }))
      .sort((a, b) => a.position - b.position);
  }
  
  console.log('[Game] Existing cards before placement:', existingCards.map(c => `${c.year}@pos${c.position}`).join(' → '));
  console.log('[Game] Placing new card at position:', placementPosition);
  
  // Create new card
  const timelineLength = effectiveTeam.timeline ? Object.keys(effectiveTeam.timeline).length : 0;
  const newCardKey = timelineLength;
  
  const newCard = {
    spotifyId: currentGameData.currentSong.spotifyId,
    title: currentGameData.currentSong.title,
    artist: currentGameData.currentSong.artist,
    year: currentGameData.currentSong.year,
    position: placementPosition,
    revealed: false,
    key: newCardKey
  };
  
  // Insert new card into sorted array at the correct position
  existingCards.splice(placementPosition, 0, newCard);
  
  console.log('[Game] Cards after insertion:', existingCards.map(c => `${c.year}@key${c.key}`).join(' → '));
  
  // Recompact all positions from 0 (no gaps)
  const updates = {};
  existingCards.forEach((card, index) => {
    if (card.key === newCardKey) {
      // This is the new card - set all its data
      updates[`games/${gameId}/teams/${effectiveTeamId}/timeline/${card.key}`] = {
        spotifyId: card.spotifyId,
        title: card.title,
        artist: card.artist,
        year: card.year,
        position: index,
        revealed: false
      };
      console.log('[Game] Adding new card', card.key, 'at position', index);
    } else {
      // This is an existing card - just update position
      updates[`games/${gameId}/teams/${effectiveTeamId}/timeline/${card.key}/position`] = index;
      console.log('[Game] Updating card', card.key, 'to position', index);
    }
  });
  
  // Clear pending card from Firebase
  updates[`games/${gameId}/teams/${effectiveTeamId}/pendingCard`] = null;
  
  console.log('[Game] Applying updates:', Object.keys(updates).length, 'updates');
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Card locked in to timeline');
      showNotification('Kort låst!', 'info');
      placementPosition = null;
      
      // Reset guard
      isLockingInPlacement = false;
      console.log('[Game] ✅ GUARD: Reset after normal lock-in');
      
      // Start Timer 2 (challenge window) - other teams can challenge now
      console.log('[Game] Starting Timer 2 (challenge_window)');
      const challengeTime = (currentGameData.challengeTime || 10) * 1000;
      startTimer('challenge_window', challengeTime);
      
      // Store card info for later validation
      window.pendingValidationCard = { key: newCardKey, card: newCard };
    })
    .catch((error) => {
      console.error('[Game] Error adding card:', error);
      showNotification('Kunde inte placera kort', 'error');
      
      // Reset guard on error
      isLockingInPlacement = false;
      console.log('[Game] ✅ GUARD: Reset after normal lock-in error');
    });
}

// ============================================
// VALIDATION AND SCORING
// ============================================
function validateAndScoreCard(cardKey, card) {
  console.log('[Game] ========== VALIDATION START ==========');
  console.log('[Game] Validating card:', cardKey, card);
  
  // Stop timer immediately by clearing Firebase (anyone can do this during validation)
  const timerUpdates = {};
  timerUpdates[`games/${gameId}/timerState`] = null;
  timerUpdates[`games/${gameId}/timerStartTime`] = null;
  timerUpdates[`games/${gameId}/timerDuration`] = null;
  timerUpdates[`games/${gameId}/nextTeam`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), timerUpdates)
    .then(() => {
      console.log('[Game] Timer stopped for validation');
    })
    .catch((error) => {
      console.error('[Game] Error stopping timer:', error);
    });
  
  // Get fresh data from Firebase using get() instead of onValue
  const teamRef = window.firebaseRef(window.firebaseDb, `games/${gameId}/teams/${teamId}`);
  
  window.firebaseGet(teamRef)
    .then((snapshot) => {
      if (!snapshot.exists()) {
        console.error('[Game] Team not found for validation');
        // Move to next team anyway
        setTimeout(() => nextTeam(), 1000);
        return;
      }
      
      const team = snapshot.val();
      const timeline = team.timeline || {};
      
      console.log('[Game] Timeline for validation:', timeline);
      console.log('[Game] Timeline type:', Array.isArray(timeline) ? 'array' : 'object');
      
      // Convert to array of cards with original keys preserved
      let cardsArray;
      if (Array.isArray(timeline)) {
        // Timeline is already an array (Firebase converted it)
        cardsArray = timeline
          .map((c, idx) => c ? { key: idx.toString(), ...c } : null)
          .filter(c => c !== null);
      } else {
        // Timeline is an object
        cardsArray = Object.entries(timeline)
          .map(([key, c]) => ({ key, ...c }));
      }
      
      // Sort by position
      const sortedCards = cardsArray.sort((a, b) => a.position - b.position);
      
      console.log('[Game] Sorted cards:', sortedCards.map(c => `${c.year} (pos ${c.position}, key ${c.key})`));
      console.log('[Game] Looking for card with key:', cardKey, 'and position:', card.position);
      
      // Find the card we just placed by POSITION and YEAR (more reliable than key)
      const cardIndex = sortedCards.findIndex(c => 
        c.position === card.position && 
        c.year === card.year &&
        c.spotifyId === card.spotifyId
      );
      
      if (cardIndex === -1) {
        console.error('[Game] Card not found in timeline for validation');
        console.error('[Game] Searched for:', card);
        console.error('[Game] Available cards:', sortedCards);
        // Move to next team anyway
        setTimeout(() => nextTeam(), 1000);
        return;
      }
      
      console.log('[Game] Found card at index:', cardIndex);
      console.log('[Game] Total cards in sorted array:', sortedCards.length);
      
      const placedCard = sortedCards[cardIndex];
      const leftCard = cardIndex > 0 ? sortedCards[cardIndex - 1] : null;
      const rightCard = cardIndex < sortedCards.length - 1 ? sortedCards[cardIndex + 1] : null;
      
      console.log('[Game] Validation context:');
      console.log('  Card index:', cardIndex, '/', sortedCards.length - 1, '(max)');
      console.log('  Left card:', leftCard ? `${leftCard.year} (${leftCard.title}) at position ${leftCard.position}` : 'none');
      console.log('  Placed card:', `${placedCard.year} (${placedCard.title}) at position ${placedCard.position}`);
      console.log('  Right card:', rightCard ? `${rightCard.year} (${rightCard.title}) at position ${rightCard.position}` : 'none');
      console.log('  All cards:', sortedCards.map(c => `${c.year}@pos${c.position}`).join(' → '));
      
      // Validate placement
      let isCorrect = true;
      let reason = '';
      
      // Check left neighbor
      if (leftCard) {
        if (placedCard.year < leftCard.year) {
          isCorrect = false;
          reason = `År ${placedCard.year} < vänster ${leftCard.year}`;
          console.log('[Game] Incorrect:', reason);
        } else if (placedCard.year === leftCard.year) {
          console.log('[Game] Special case: same year as left neighbor - OK');
        } else {
          console.log('[Game] Left check passed:', placedCard.year, '>=', leftCard.year);
        }
      } else {
        console.log('[Game] No left card - OK (first position)');
      }
      
      // Check right neighbor
      if (rightCard) {
        if (placedCard.year > rightCard.year) {
          isCorrect = false;
          reason = `År ${placedCard.year} > höger ${rightCard.year}`;
          console.log('[Game] Incorrect:', reason);
        } else if (placedCard.year === rightCard.year) {
          console.log('[Game] Special case: same year as right neighbor - OK');
        } else {
          console.log('[Game] Right check passed:', placedCard.year, '<=', rightCard.year);
        }
      } else {
        console.log('[Game] No right card - OK (last position)');
      }
      
      console.log('[Game] ====> Result:', isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗');
      
      // Update Firebase based on result
      const validationUpdates = {};
      
      // Use the actual key from the found card in sorted array
      const actualCardKey = placedCard.key;
      console.log('[Game] Using card key for updates:', actualCardKey);
      
      if (isCorrect) {
        // Reveal the card
        validationUpdates[`games/${gameId}/teams/${teamId}/timeline/${actualCardKey}/revealed`] = true;
        
        // Calculate score as total number of revealed cards
        // Count revealed cards in timeline (after this card is revealed)
        let revealedCount = 0;
        Object.values(timeline).forEach(c => {
          if (c && c.revealed) {
            revealedCount++;
          }
        });
        // Add 1 for the card we just revealed
        const newScore = revealedCount + 1;
        
        validationUpdates[`games/${gameId}/teams/${teamId}/score`] = newScore;
        
        console.log('[Game] Updating score to', newScore, '(revealed cards)');
        
        // Check for winner (11 cards)
        if (newScore >= 11) {
          console.log('[Game] Team reached 11 cards! Potential winner!');
          showNotification('🎉 11 KORT! Du kan vinna!', 'success');
        } else {
          showNotification('✓ RÄTT! Kortet behålls!', 'success');
        }
      } else {
        // Remove the card from timeline
        validationUpdates[`games/${gameId}/teams/${teamId}/timeline/${actualCardKey}`] = null;
        
        console.log('[Game] Removing incorrect card');
        showNotification(`✗ FEL! ${reason}`, 'error');
      }
      
      console.log('[Game] Applying validation updates:', validationUpdates);
      
      // Return validation data to next .then()
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), validationUpdates)
        .then(() => {
          // Return data needed for modal
          return {
            isCorrect: isCorrect,
            placedCard: placedCard,
            activeTeam: currentTeams[teamId]
          };
        });
    })
    .then((validationData) => {
      if (!validationData) {
        // Early return happened (not active team)
        console.log('[Game] No validation data, skipping modal');
        return;
      }
      
      console.log('[Game] Validation complete, updates applied');
      console.log('[Game] ========== VALIDATION END ==========');
      
      // ============================================
      // SET VALIDATION MODAL
      // ============================================
      
      // Only the active team should set the validation modal
      if (currentGameData.currentTeam !== teamId) {
        console.log('[Game] Not active team anymore, skipping modal setup');
        return;
      }
      
      console.log('[Game] Setting up validation modal...');
      
      const validationModal = {
        isVisible: true,
        isProcessing: false,
        
        // Active team info (team that had the turn)
        activeTeamId: teamId,
        activeTeamName: validationData.activeTeam ? validationData.activeTeam.name : 'Unknown',
        
        // No challenge info for normal validation
        challengingTeamId: null,
        challengingTeamName: null,
        
        // Result
        result: validationData.isCorrect ? 'active_correct' : 'active_wrong',
        
        // Song info
        song: {
          year: validationData.placedCard.year,
          title: validationData.placedCard.title,
          artist: validationData.placedCard.artist
        },
        
        // Can give bonus token only if correct
        canGiveToken: validationData.isCorrect,
        tokenGiven: false,
        
        timestamp: Date.now()
      };
      
      console.log('[Game] Validation modal data:', validationModal);
      
      const modalUpdates = {};
      modalUpdates[`games/${gameId}/validationModal`] = validationModal;
      
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), modalUpdates);
    })
    .then(() => {
      console.log('[Game] ✅ Validation modal set successfully');
      console.log('[Game] Modal will be displayed to all players');
    })
    .catch((error) => {
      console.error('[Game] Error in validation:', error);
      
      // On error, still transition to next team if we're the active team
      if (currentGameData.currentTeam === teamId) {
        setTimeout(() => {
          const teamIds = Object.keys(currentTeams);
          const currentIndex = teamIds.indexOf(currentGameData.currentTeam);
          const nextIndex = (currentIndex + 1) % teamIds.length;
          const nextTeamId = teamIds[nextIndex];
          
          // Update to next team
          const updates = {};
          updates[`games/${gameId}/currentTeam`] = nextTeamId;
          
          // Clear challenge state and pending cards even on error
          updates[`games/${gameId}/challengeState`] = null;
          Object.keys(currentTeams).forEach(tId => {
            updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
          });
          
          window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
            .then(() => {
              startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
            });
        }, 1000);
      }
    });
}

// ============================================
// VALIDATE CHALLENGE
// Called when Timer 3 expires
// ============================================
function validateChallenge() {
  console.log('[Game] ========== VALIDATE CHALLENGE ==========');
  
  // GUARD: Prevent multiple simultaneous validations
  if (window.isValidatingChallenge) {
    console.log('[Game] ⚠️ Already validating challenge, skipping duplicate call');
    return;
  }
  window.isValidatingChallenge = true;
  
  // 1. GET DATA
  const challengeState = currentGameData.challengeState;
  
  if (!challengeState || !challengeState.isActive) {
    console.error('[Game] No active challenge state!');
    window.isValidatingChallenge = false;
    return;
  }
  
  const activeTeamId = challengeState.activeTeam;
  const challengingTeamId = challengeState.challengingTeam;
  const activeTeam = currentTeams[activeTeamId];
  const challengingTeam = currentTeams[challengingTeamId];
  
  console.log('[Game] Active team:', activeTeamId, activeTeam ? activeTeam.name : 'N/A');
  console.log('[Game] Challenging team:', challengingTeamId, challengingTeam ? challengingTeam.name : 'N/A');
  
  // 2. FIND ACTIVE TEAM'S UNREVEALED CARD
  const activeTimeline = activeTeam.timeline || {};
  const activeCardEntries = Object.entries(activeTimeline).filter(([key, card]) => 
    card && card.revealed === false
  );
  
  if (activeCardEntries.length === 0) {
    console.error('[Game] No unrevealed card found for active team!');
    transitionAfterChallenge();
    return;
  }
  
  // Should only be one unrevealed card
  const [activeCardKey, activeCard] = activeCardEntries[0];
  console.log('[Game] Found active team card:', activeCard.year, activeCard.title, 'at position', activeCard.position);
  
  // 3. VALIDATE ACTIVE TEAM'S CARD
  const activeCorrect = isCardPlacementCorrect(activeCard, activeTimeline);
  console.log('[Game] Active team placement correct?', activeCorrect);
  
  const updates = {};
  
  // BUGFIX: Declare challengingCorrect in larger scope so we can use it for result determination
  let challengingCorrect = false;
  
  if (activeCorrect) {
    // ============================================
    // ACTIVE TEAM WON
    // ============================================
    console.log('[Game] ✅ Active team won!');
    
    // Reveal card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}/revealed`] = true;
    
    // Update score
    const newScore = (activeTeam.score || 0) + 1;
    updates[`games/${gameId}/teams/${activeTeamId}/score`] = newScore;
    
    console.log('[Game] Active team score:', (activeTeam.score || 0), '→', newScore);
    
    showNotification(`✅ ${activeTeam.name} hade rätt!`, 'success');
    
    // Challenging team loses their token (already deducted)
    // Challenging team's card disappears (do nothing, it's only in challengeState)
    
  } else {
    // ============================================
    // ACTIVE TEAM WAS WRONG
    // ============================================
    console.log('[Game] ❌ Active team was wrong');
    
    // Remove active team's card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}`] = null;
    console.log('[Game] Removing active team card at key:', activeCardKey);
    
    // Recompact active team's timeline
    const remainingCards = Object.entries(activeTimeline)
      .filter(([key, card]) => key !== activeCardKey && card !== null)
      .map(([key, card]) => ({ ...card, key }))
      .sort((a, b) => a.position - b.position);
    
    remainingCards.forEach((card, index) => {
      updates[`games/${gameId}/teams/${activeTeamId}/timeline/${card.key}/position`] = index;
    });
    
    console.log('[Game] Recompacted active team timeline:', remainingCards.length, 'cards remain');
    
    showNotification(`❌ ${activeTeam.name} hade fel!`, 'error');
    
    // Check if challenging team placed a card
    const challengingCard = challengeState.challengingCard;
    
    if (challengingCard && challengingCard.locked) {
      console.log('[Game] 🎯 Validating challenging team card...');
      console.log('[Game] Challenging card:', challengingCard.year, challengingCard.title, 'at position', challengingCard.position);
      
      // VALIDATE AGAINST ACTIVE TEAM'S TIMELINE (after removing their wrong card)
      // Create simulated timeline for validation
      const simulatedTimeline = {};
      remainingCards.forEach((card, index) => {
        simulatedTimeline[card.key] = { ...card, position: index };
      });
      
      console.log('[Game] Simulated timeline for validation:', Object.keys(simulatedTimeline).length, 'cards');
      
      // BUGFIX: Assign to challengingCorrect (declared in larger scope) instead of declaring locally
      challengingCorrect = isCardPlacementCorrectInTimeline(
        challengingCard, 
        simulatedTimeline
      );
      
      console.log('[Game] Challenging team placement correct?', challengingCorrect);
      
      if (challengingCorrect) {
        // ============================================
        // CHALLENGING TEAM WON!
        // ============================================
        console.log('[Game] ✅ Challenging team won!');
        
        // Find correct position in challenging team's timeline (based on year)
        const challengingTimeline = challengingTeam.timeline || {};
        const challengingCards = Object.entries(challengingTimeline)
          .filter(([key, card]) => card !== null)
          .map(([key, card]) => ({ ...card, key }))
          .sort((a, b) => a.position - b.position);
        
        // Find insert position based on year
        let insertPosition = challengingCards.length; // Default: end
        for (let i = 0; i < challengingCards.length; i++) {
          if (challengingCard.year <= challengingCards[i].year) {
            insertPosition = i;
            break;
          }
        }
        
        console.log('[Game] Insert position in challenging team timeline:', insertPosition);
        
        // Create new card key
        const newCardKey = Object.keys(challengingTimeline).length;
        
        // Add card at correct position
        updates[`games/${gameId}/teams/${challengingTeamId}/timeline/${newCardKey}`] = {
          year: challengingCard.year,
          title: challengingCard.title,
          artist: challengingCard.artist,
          spotifyId: challengingCard.spotifyId,
          position: insertPosition,
          revealed: true
        };
        
        console.log('[Game] Adding card to challenging team timeline at key:', newCardKey, 'position:', insertPosition);
        
        // Recompact challenging team's timeline (shift cards after insert position)
        challengingCards.forEach((card, index) => {
          const newPosition = index >= insertPosition ? index + 1 : index;
          if (newPosition !== card.position) {
            updates[`games/${gameId}/teams/${challengingTeamId}/timeline/${card.key}/position`] = newPosition;
          }
        });
        
        // Update score
        const newScore = (challengingTeam.score || 0) + 1;
        updates[`games/${gameId}/teams/${challengingTeamId}/score`] = newScore;
        
        console.log('[Game] Challenging team score:', (challengingTeam.score || 0), '→', newScore);
        console.log('[Game] Token is consumed (not returned even on win)');
        
        showNotification(`✅ ${challengingTeam.name} vann utmaningen!`, 'success');
        
      } else {
        // ============================================
        // BOTH TEAMS WERE WRONG
        // ============================================
        console.log('[Game] ❌ Both teams were wrong');
        
        showNotification('❌ Båda lagen hade fel!', 'error');
        
        // Challenging team keeps their lost token (no token back)
      }
    } else {
      console.log('[Game] Challenging team did not place a card');
      showNotification(`${challengingTeam.name} placerade inget kort`, 'info');
    }
  }
  
  // 4. DETERMINE RESULT FOR MODAL
  console.log('[Game] Determining result for validation modal...');
  
  // BUGFIX: Use challengingCorrect directly instead of checking updates keys
  let result;
  if (activeCorrect) {
    result = 'active_correct';
  } else {
    const challengingCard = challengeState.challengingCard;
    if (challengingCard && challengingCard.locked && challengingCorrect) {
      // Challenging team was correct
      result = 'challenging_won';
    } else {
      // Both were wrong (or challenging team didn't place)
      result = 'both_wrong';
    }
  }
  
  console.log('[Game] Final result:', result);
  
  // 5. DON'T CLEAR CHALLENGE STATE YET
  // (will be cleared when modal is closed)
  console.log('[Game] Keeping challengeState for modal (will clear when modal closes)');
  
  // Clear all pending cards
  Object.keys(currentTeams).forEach(tId => {
    updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
  });
  
  console.log('[Game] Total updates:', Object.keys(updates).length);
  console.log('[Game] Applying updates...');
  
  // Apply all updates
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Challenge validation complete');
      console.log('[Game] ========== VALIDATE CHALLENGE END ==========');
      
      // ============================================
      // SET VALIDATION MODAL (instead of transitioning immediately)
      // ============================================
      
      console.log('[Game] Setting up validation modal for challenge...');
      
      const validationModal = {
        isVisible: true,
        isProcessing: false,
        
        // Active team info (team that was challenged)
        activeTeamId: activeTeamId,
        activeTeamName: activeTeam ? activeTeam.name : 'Unknown',
        
        // Challenge info
        challengingTeamId: challengingTeamId,
        challengingTeamName: challengingTeam ? challengingTeam.name : 'Unknown',
        
        // Result
        result: result,
        
        // Song info
        song: {
          year: activeCard.year,
          title: activeCard.title,
          artist: activeCard.artist
        },
        
        // Can give bonus token only if active team won
        canGiveToken: (result === 'active_correct'),
        tokenGiven: false,
        
        timestamp: Date.now()
      };
      
      console.log('[Game] Validation modal data:', validationModal);
      
      const modalUpdates = {};
      modalUpdates[`games/${gameId}/validationModal`] = validationModal;
      
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), modalUpdates);
    })
    .then(() => {
      console.log('[Game] ✅ Validation modal set successfully');
      console.log('[Game] Modal will be displayed to all players');
    })
    .catch((error) => {
      console.error('[Game] Error in validateChallenge:', error);
    })
    .finally(() => {
      // Reset guard
      window.isValidatingChallenge = false;
      console.log('[Game] ✅ Validation guard reset');
    });
}

// ============================================
// CLOSE VALIDATION MODAL & TRANSITION TO NEXT TEAM
// ============================================
function closeValidationModal() {
  console.log('[Game] ========== CLOSE VALIDATION MODAL ==========');
  
  // GUARD: Prevent multiple simultaneous closes
  if (!currentGameData.validationModal || currentGameData.validationModal.isProcessing) {
    console.log('[Game] ⚠️ Already processing or no modal, skipping');
    return;
  }
  
  console.log('[Game] Closing validation modal and transitioning to next team...');
  
  // BUGFIX (Problem 1): Calculate next team ONCE at the start (before Firebase update)
  // This prevents Timer 4 from showing the wrong team (race condition)
  const teamIds = Object.keys(currentTeams);
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  console.log('[Game] Current team:', currentTeamId);
  console.log('[Game] Next team:', nextTeamId);
  
  // Set processing flag
  const processingUpdate = {};
  processingUpdate[`games/${gameId}/validationModal/isProcessing`] = true;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), processingUpdate)
    .then(() => {
      console.log('[Game] Processing flag set');
      
      // Get next song
      const currentSongIndex = currentGameData.currentSongIndex || 0;
      const nextSongIndex = currentSongIndex + 1;
      const songs = currentGameData.songs || [];
      
      if (nextSongIndex >= songs.length) {
        console.warn('[Game] No more songs in deck!');
        showNotification('Inga fler låtar!', 'error');
        return;
      }
      
      const nextSong = songs[nextSongIndex];
      console.log('[Game] Next song:', nextSong.title);
      
      // Prepare updates
      const updates = {};
      
      // Clear validation modal
      updates[`games/${gameId}/validationModal`] = null;
      
      // Update game state
      updates[`games/${gameId}/currentTeam`] = nextTeamId;
      updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
      updates[`games/${gameId}/currentSong`] = nextSong;
      
      // Clear challenge state
      updates[`games/${gameId}/challengeState`] = null;
      
      // Clear all pending cards
      Object.keys(currentTeams).forEach(tId => {
        updates[`games/${gameId}/teams/${tId}/pendingCard`] = null;
      });
      
      // Increment round if we wrapped around
      if (nextIndex === 0) {
        const newRound = (currentGameData.currentRound || 0) + 1;
        updates[`games/${gameId}/currentRound`] = newRound;
        console.log('[Game] New round:', newRound);
      }
      
      console.log('[Game] Applying', Object.keys(updates).length, 'updates...');
      
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates);
    })
    .then(() => {
      console.log('[Game] ✅ Modal closed, game state updated');
      
      // Start Timer 4 (between songs)
      // BUGFIX (Problem 1): Use nextTeamId calculated at the start (not recalculated)
      console.log('[Game] Starting Timer 4 for next team:', nextTeamId);
      
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
      
      console.log('[Game] ========== CLOSE VALIDATION MODAL END ==========');
    })
    .catch((error) => {
      console.error('[Game] ❌ Error closing validation modal:', error);
      showNotification('Ett fel uppstod', 'error');
    });
}

// ============================================
// GIVE BONUS TOKEN TO ACTIVE TEAM
// ============================================
function giveTokenToActiveTeam() {
  console.log('[Game] ========== GIVE BONUS TOKEN ==========');
  
  const modal = currentGameData.validationModal;
  
  if (!modal || !modal.isVisible) {
    console.log('[Game] ⚠️ No active modal');
    return;
  }
  
  if (!modal.canGiveToken) {
    console.log('[Game] ⚠️ Cannot give token (team was wrong)');
    showNotification('Kan inte ge token - laget hade fel!', 'error');
    return;
  }
  
  if (modal.tokenGiven) {
    console.log('[Game] ⚠️ Token already given');
    showNotification('Token redan utdelad!', 'error');
    return;
  }
  
  const activeTeamId = modal.activeTeamId;
  const activeTeam = currentTeams[activeTeamId];
  
  if (!activeTeam) {
    console.error('[Game] ❌ Active team not found');
    return;
  }
  
  console.log('[Game] Giving bonus token to', activeTeam.name);
  
  const updates = {};
  updates[`games/${gameId}/teams/${activeTeamId}/tokens`] = (activeTeam.tokens || 0) + 1;
  updates[`games/${gameId}/validationModal/tokenGiven`] = true;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] ✅ Bonus token given!');
      showNotification(`🎫 ${activeTeam.name} fick en bonus-token!`, 'success');
      console.log('[Game] ========== GIVE BONUS TOKEN END ==========');
    })
    .catch((error) => {
      console.error('[Game] ❌ Error giving token:', error);
      showNotification('Kunde inte ge token', 'error');
    });
}

// ============================================
// HELPER: VALIDATE CARD PLACEMENT
// ============================================
function isCardPlacementCorrect(card, timeline) {
  // Convert timeline to sorted array
  const sortedCards = Object.values(timeline)
    .filter(c => c !== null)
    .sort((a, b) => a.position - b.position);
  
  // Find the card
  const cardIndex = sortedCards.findIndex(c => 
    c.position === card.position && c.year === card.year
  );
  
  if (cardIndex === -1) {
    console.error('[Game] Card not found in timeline for validation');
    return false;
  }
  
  const leftCard = cardIndex > 0 ? sortedCards[cardIndex - 1] : null;
  const rightCard = cardIndex < sortedCards.length - 1 ? sortedCards[cardIndex + 1] : null;
  
  console.log('[Game] Validation context:');
  console.log('  Left:', leftCard ? `${leftCard.year}` : 'none');
  console.log('  Card:', `${card.year}`);
  console.log('  Right:', rightCard ? `${rightCard.year}` : 'none');
  
  // Check left neighbor
  if (leftCard && card.year < leftCard.year) {
    console.log('[Game] Failed: card.year < leftCard.year');
    return false;
  }
  
  // Check right neighbor
  if (rightCard && card.year > rightCard.year) {
    console.log('[Game] Failed: card.year > rightCard.year');
    return false;
  }
  
  return true;
}

// Helper for challenging card validation (similar but takes timeline as param)
function isCardPlacementCorrectInTimeline(card, timeline) {
  // Convert timeline to sorted array
  const sortedCards = Object.values(timeline)
    .filter(c => c !== null)
    .sort((a, b) => a.position - b.position);
  
  // Find where card WOULD be inserted based on its position
  const position = card.position;
  
  // Get left and right neighbors at this position
  const leftCard = position > 0 && sortedCards[position - 1] ? sortedCards[position - 1] : null;
  const rightCard = position < sortedCards.length && sortedCards[position] ? sortedCards[position] : null;
  
  console.log('[Game] Validation context (simulated):');
  console.log('  Left:', leftCard ? `${leftCard.year}` : 'none');
  console.log('  Card:', `${card.year} (at position ${position})`);
  console.log('  Right:', rightCard ? `${rightCard.year}` : 'none');
  
  // Check left neighbor
  if (leftCard && card.year < leftCard.year) {
    console.log('[Game] Failed: card.year < leftCard.year');
    return false;
  }
  
  // Check right neighbor
  if (rightCard && card.year > rightCard.year) {
    console.log('[Game] Failed: card.year > rightCard.year');
    return false;
  }
  
  return true;
}

// ============================================
// HELPER: TRANSITION AFTER CHALLENGE
// ============================================
function transitionAfterChallenge() {
  console.log('[Game] Transitioning to next team after challenge...');
  
  // Calculate next team
  const teamIds = Object.keys(currentTeams);
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  console.log('[Game] Next team:', nextTeamId);
  
  // Get next song
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.warn('[Game] No more songs in deck!');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  
  // Update game state
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Increment round if we wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
    console.log('[Game] New round:', newRound);
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Transitioned to next team');
      // Start Timer 4 (between songs)
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
    })
    .catch((error) => {
      console.error('[Game] Error transitioning:', error);
    });
}

// ============================================
// HELPER: NEXT TEAM
// ============================================
function nextTeam() {
  console.log('[Game] Switching to next team...');
  
  // Get list of team IDs
  const teamIds = Object.keys(currentTeams);
  
  if (teamIds.length === 0) {
    console.error('[Game] No teams in game');
    return;
  }
  
  // Find current team index
  const currentTeamId = currentGameData.currentTeam;
  const currentIndex = teamIds.indexOf(currentTeamId);
  
  // Get next team (wrap around)
  const nextIndex = (currentIndex + 1) % teamIds.length;
  const nextTeamId = teamIds[nextIndex];
  
  console.log('[Game] Next team:', nextTeamId);
  
  // Get next song from deck
  const currentSongIndex = currentGameData.currentSongIndex || 0;
  const nextSongIndex = currentSongIndex + 1;
  const songs = currentGameData.songs || [];
  
  if (nextSongIndex >= songs.length) {
    console.warn('[Game] No more songs in deck! Game should end.');
    // TODO: End game when out of songs
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  console.log('[Game] Next song:', nextSong.title, 'by', nextSong.artist);
  
  // Update Firebase
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Increment round if we wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
    console.log('[Game] New round:', newRound);
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Team switched successfully');
    })
    .catch((error) => {
      console.error('[Game] Error switching team:', error);
    });
}

console.log('[Game] Cards module loaded');
