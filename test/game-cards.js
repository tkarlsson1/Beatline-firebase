// ============================================
// NOTESTREAM - GAME CARDS MODULE
// Handles drag & drop, card placement, validation, and challenges
// ============================================

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
  console.log('[Game] Change card requested');
  
  if (!myTeam || myTeam.tokens < 1) {
    showNotification('Du har inga tokens kvar!', 'error');
    return;
  }
  
  if (!confirm('Byt låt för 1 token?')) {
    return;
  }
  
  // TODO: Implement card change logic
  showNotification('Byt låt-funktionen kommer snart!', 'info');
}

function lockInPlacement() {
  console.log('[Game] Lock in placement at position:', placementPosition);
  
  if (placementPosition === null) {
    showNotification('Placera kortet först!', 'error');
    return;
  }
  
  if (!currentGameData.currentSong) {
    showNotification('Ingen låt att placera!', 'error');
    return;
  }
  
  // Remove preview card
  const previewCard = document.querySelector('.preview-card');
  if (previewCard) {
    previewCard.remove();
  }
  
  // Get all non-null cards from timeline and sort by position
  let existingCards = [];
  if (myTeam.timeline) {
    existingCards = Object.entries(myTeam.timeline)
      .filter(([key, card]) => card !== null) // Filter out deleted cards
      .map(([key, card]) => ({ ...card, key }))
      .sort((a, b) => a.position - b.position);
  }
  
  console.log('[Game] Existing cards before placement:', existingCards.map(c => `${c.year}@pos${c.position}`).join(' → '));
  console.log('[Game] Placing new card at position:', placementPosition);
  
  // Create new card
  const timelineLength = myTeam.timeline ? Object.keys(myTeam.timeline).length : 0;
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
      updates[`games/${gameId}/teams/${teamId}/timeline/${card.key}`] = {
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
      updates[`games/${gameId}/teams/${teamId}/timeline/${card.key}/position`] = index;
      console.log('[Game] Updating card', card.key, 'to position', index);
    }
  });
  
  // Clear pending card from Firebase
  updates[`games/${gameId}/teams/${teamId}/pendingCard`] = null;
  
  console.log('[Game] Applying updates:', Object.keys(updates).length, 'updates');
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Card locked in to timeline');
      showNotification('Kort låst! Andra lag kan nu utmana...', 'info');
      placementPosition = null;
      
      // Start Timer 2 (challenge window) - only host should do this
      if (isHost) {
        console.log('[Host] Starting Timer 2 (challenge window)');
        setTimeout(() => {
          startTimer('challenge_window', (currentGameData.challengeTime || 10) * 1000);
        }, 1000);
      } else {
        // Non-host: set trigger for host to start Timer 2
        console.log('[Game] Non-host setting trigger for Timer 2');
        const triggerUpdates = {};
        triggerUpdates[`games/${gameId}/challengeTrigger`] = Date.now();
        window.firebaseUpdate(window.firebaseRef(window.firebaseDb), triggerUpdates);
      }
    })
    .catch((error) => {
      console.error('[Game] Error adding card:', error);
      showNotification('Kunde inte placera kort', 'error');
    });
}

// ============================================
// CHALLENGE FUNCTIONS
// ============================================
function challengeCard() {
  console.log('[Challenge] Challenge initiated by team:', teamId);
  
  // Check if team has tokens
  if (!myTeam || myTeam.tokens < 1) {
    showNotification('Du har inga tokens kvar!', 'error');
    return;
  }
  
  // Check if already challenged
  if (currentGameData.challengeState && currentGameData.challengeState.isActive) {
    showNotification('Någon har redan utmanat!', 'error');
    return;
  }
  
  // Check if timer is in challenge window
  if (currentGameData.timerState !== 'challenge_window') {
    showNotification('Utmaningsfönstret har stängt!', 'error');
    return;
  }
  
  console.log('[Challenge] Attempting to register challenge...');
  
  // Try to register challenge in Firebase
  const activeTeamId = currentGameData.currentTeam;
  const challengeState = {
    isActive: true,
    challengingTeam: teamId,
    activeTeam: activeTeamId,
    timestamp: Date.now()
  };
  
  const updates = {};
  updates[`games/${gameId}/challengeState`] = challengeState;
  
  // Deduct token immediately
  updates[`games/${gameId}/teams/${teamId}/tokens`] = myTeam.tokens - 1;
  
  // Stop Timer 2 (challenge window)
  updates[`games/${gameId}/timerState`] = null;
  updates[`games/${gameId}/timerStartTime`] = null;
  updates[`games/${gameId}/timerDuration`] = null;
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Challenge] Challenge registered successfully');
      showNotification(`Du utmanar ${currentTeams[activeTeamId].name}!`, 'success');
      
      // Host starts Timer 3
      if (isHost) {
        console.log('[Host] Starting Timer 3 (challenge placement)');
        setTimeout(() => {
          startTimer('challenge_placement', (currentGameData.placeChallengeTime || 20) * 1000);
        }, 1000);
      }
    })
    .catch((error) => {
      console.error('[Challenge] Error registering challenge:', error);
      showNotification('Kunde inte utmana', 'error');
    });
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

// Validate single card (no challenge)
function validateCard() {
  console.log('[Validate] ========== VALIDATION START (NO CHALLENGE) ==========');
  
  const activeTeamId = currentGameData.currentTeam;
  const activeTeam = currentTeams[activeTeamId];
  
  if (!activeTeam || !activeTeam.timeline) {
    console.error('[Validate] Active team has no timeline');
    return;
  }
  
  // Find unrevealed cards (should be just one - the most recent)
  const timeline = activeTeam.timeline;
  const timelineCards = Object.entries(timeline);
  const unrevealedCards = timelineCards.filter(([key, card]) => card && !card.revealed);
  
  if (unrevealedCards.length === 0) {
    console.warn('[Validate] No unrevealed cards found');
    return;
  }
  
  const [cardKey, card] = unrevealedCards[unrevealedCards.length - 1]; // Get most recent
  console.log('[Validate] Validating card:', cardKey, card);
  
  // Get all revealed cards sorted by position
  const revealedCards = timelineCards
    .filter(([key, c]) => c && c.revealed)
    .map(([key, c]) => ({ ...c, key }))
    .sort((a, b) => a.position - b.position);
  
  console.log('[Validate] Revealed cards:', revealedCards.map(c => `${c.year}@pos${c.position}`).join(' → '));
  
  // Find neighbors
  const leftNeighbor = revealedCards.filter(c => c.position < card.position).pop();
  const rightNeighbor = revealedCards.find(c => c.position > card.position);
  
  console.log('[Validate] Left neighbor:', leftNeighbor ? `${leftNeighbor.year}@pos${leftNeighbor.position}` : 'none');
  console.log('[Validate] Card:', `${card.year}@pos${card.position}`);
  console.log('[Validate] Right neighbor:', rightNeighbor ? `${rightNeighbor.year}@pos${rightNeighbor.position}` : 'none');
  
  // Validate
  let isCorrect = true;
  let reason = '';
  
  if (leftNeighbor && card.year < leftNeighbor.year) {
    isCorrect = false;
    reason = `År ${card.year} < vänster ${leftNeighbor.year}`;
  }
  
  if (rightNeighbor && card.year > rightNeighbor.year) {
    isCorrect = false;
    reason = `År ${card.year} > höger ${rightNeighbor.year}`;
  }
  
  console.log('[Validate] Result:', isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗', reason);
  
  // Apply result
  const updates = {};
  
  if (isCorrect) {
    // Reveal card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${cardKey}/revealed`] = true;
    
    // Update score
    const currentScore = activeTeam.score || 0;
    const newScore = currentScore + 1;
    updates[`games/${gameId}/teams/${activeTeamId}/score`] = newScore;
    
    console.log('[Validate] Revealing card and updating score to', newScore);
    showNotification('✓ RÄTT! Kortet behålls!', 'success');
    
    // Check for winner
    if (newScore >= 11) {
      console.log('[Validate] Team reached 11 cards!');
      showNotification('🎉 11 KORT! Du kan vinna!', 'success');
    }
  } else {
    // Remove card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${cardKey}`] = null;
    console.log('[Validate] Removing incorrect card');
    showNotification(`✗ FEL! ${reason}`, 'error');
  }
  
  // Apply updates
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Validate] Validation complete');
      console.log('[Validate] ========== VALIDATION END ==========');
      
      // Transition to next team (host only)
      if (isHost) {
        setTimeout(() => {
          transitionToNextTeam();
        }, 2000);
      }
    })
    .catch((error) => {
      console.error('[Validate] Error applying validation:', error);
    });
}

// Validate challenge (both cards)
function validateChallenge() {
  console.log('[Challenge] ========== VALIDATION START (CHALLENGE) ==========');
  
  const challengeState = currentGameData.challengeState;
  if (!challengeState || !challengeState.isActive) {
    console.error('[Challenge] No active challenge state');
    return;
  }
  
  const activeTeamId = challengeState.activeTeam;
  const challengingTeamId = challengeState.challengingTeam;
  
  const activeTeam = currentTeams[activeTeamId];
  const challengingTeam = currentTeams[challengingTeamId];
  
  console.log('[Challenge] Active team:', activeTeamId);
  console.log('[Challenge] Challenging team:', challengingTeamId);
  
  if (!activeTeam || !activeTeam.timeline) {
    console.error('[Challenge] Active team has no timeline');
    return;
  }
  
  // Find active team's unrevealed card
  const activeTimeline = activeTeam.timeline;
  const activeUnrevealedCards = Object.entries(activeTimeline).filter(([key, card]) => card && !card.revealed);
  
  if (activeUnrevealedCards.length === 0) {
    console.warn('[Challenge] Active team has no unrevealed cards');
    return;
  }
  
  const [activeCardKey, activeCard] = activeUnrevealedCards[activeUnrevealedCards.length - 1];
  console.log('[Challenge] Active team card:', activeCardKey, activeCard);
  
  // Find challenging team's card (should be in active team's timeline as unrevealed)
  // The challenging team placed their card in the active team's timeline
  const challengingCards = Object.entries(activeTimeline).filter(([key, card]) => 
    card && !card.revealed && key !== activeCardKey
  );
  
  let challengingCardKey = null;
  let challengingCard = null;
  
  if (challengingCards.length > 0) {
    [challengingCardKey, challengingCard] = challengingCards[0];
    console.log('[Challenge] Challenging team card:', challengingCardKey, challengingCard);
  } else {
    console.warn('[Challenge] Challenging team did not place a card - validate active team only');
    
    // Challenging team didn't place card - just validate active team's card
    const updates = {};
    
    // Get revealed cards for validation
    const revealedCards = Object.entries(activeTimeline)
      .filter(([key, c]) => c && c.revealed)
      .map(([key, c]) => ({ ...c, key }))
      .sort((a, b) => a.position - b.position);
    
    const leftNeighbor = revealedCards.filter(c => c.position < activeCard.position).pop();
    const rightNeighbor = revealedCards.find(c => c.position > activeCard.position);
    
    let isActiveCorrect = true;
    let reason = '';
    
    if (leftNeighbor && activeCard.year < leftNeighbor.year) {
      isActiveCorrect = false;
      reason = `År ${activeCard.year} < vänster ${leftNeighbor.year}`;
    }
    
    if (rightNeighbor && activeCard.year > rightNeighbor.year) {
      isActiveCorrect = false;
      reason = `År ${activeCard.year} > höger ${rightNeighbor.year}`;
    }
    
    if (isActiveCorrect) {
      updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}/revealed`] = true;
      const newScore = (activeTeam.score || 0) + 1;
      updates[`games/${gameId}/teams/${activeTeamId}/score`] = newScore;
      showNotification(`✓ ${activeTeam.name} hade rätt!`, 'success');
    } else {
      updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}`] = null;
      showNotification(`✗ ${activeTeam.name} hade fel! ${reason}`, 'error');
    }
    
    // Clear challenge state
    updates[`games/${gameId}/challengeState`] = null;
    
    window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
      .then(() => {
        console.log('[Challenge] Validation complete (no challenging card)');
        if (isHost) {
          setTimeout(() => transitionToNextTeam(), 2000);
        }
      });
    
    return;
  }
  
  // Both cards exist - validate both
  // Get all revealed cards (excluding the two unrevealed cards being validated)
  const revealedCards = Object.entries(activeTimeline)
    .filter(([key, c]) => c && c.revealed)
    .map(([key, c]) => ({ ...c, key }))
    .sort((a, b) => a.position - b.position);
  
  console.log('[Challenge] Revealed cards for context:', revealedCards.map(c => `${c.year}@pos${c.position}`).join(' → '));
  
  // Validate active team's card
  const activeLeftNeighbor = revealedCards.filter(c => c.position < activeCard.position).pop();
  const activeRightNeighbor = revealedCards.find(c => c.position > activeCard.position);
  
  let isActiveCorrect = true;
  let activeReason = '';
  
  if (activeLeftNeighbor && activeCard.year < activeLeftNeighbor.year) {
    isActiveCorrect = false;
    activeReason = `År ${activeCard.year} < vänster ${activeLeftNeighbor.year}`;
  }
  
  if (activeRightNeighbor && activeCard.year > activeRightNeighbor.year) {
    isActiveCorrect = false;
    activeReason = `År ${activeCard.year} > höger ${activeRightNeighbor.year}`;
  }
  
  console.log('[Challenge] Active team validation:', isActiveCorrect ? 'CORRECT ✓' : 'INCORRECT ✗', activeReason);
  
  // Apply results based on rules:
  // 1. If active team is correct, they get the point (challenging team loses)
  // 2. If active team is wrong, validate challenging team's card
  
  const updates = {};
  
  if (isActiveCorrect) {
    // Active team correct - they get the point
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}/revealed`] = true;
    const activeNewScore = (activeTeam.score || 0) + 1;
    updates[`games/${gameId}/teams/${activeTeamId}/score`] = activeNewScore;
    
    // Remove challenging team's card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${challengingCardKey}`] = null;
    
    console.log('[Challenge] Active team correct - they keep card');
    showNotification(`✓ ${activeTeam.name} hade rätt! ${challengingTeam.name} förlorade utmaningen.`, 'success');
    
    // Check for winner
    if (activeNewScore >= 11) {
      showNotification(`🎉 ${activeTeam.name} har 11 kort!`, 'success');
    }
  } else {
    // Active team wrong - remove their card and validate challenging team's card
    updates[`games/${gameId}/teams/${activeTeamId}/timeline/${activeCardKey}`] = null;
    
    console.log('[Challenge] Active team wrong - checking challenging team...');
    
    // Validate challenging team's card
    const challengingLeftNeighbor = revealedCards.filter(c => c.position < challengingCard.position).pop();
    const challengingRightNeighbor = revealedCards.find(c => c.position > challengingCard.position);
    
    let isChallengingCorrect = true;
    let challengingReason = '';
    
    if (challengingLeftNeighbor && challengingCard.year < challengingLeftNeighbor.year) {
      isChallengingCorrect = false;
      challengingReason = `År ${challengingCard.year} < vänster ${challengingLeftNeighbor.year}`;
    }
    
    if (challengingRightNeighbor && challengingCard.year > challengingRightNeighbor.year) {
      isChallengingCorrect = false;
      challengingReason = `År ${challengingCard.year} > höger ${challengingRightNeighbor.year}`;
    }
    
    console.log('[Challenge] Challenging team validation:', isChallengingCorrect ? 'CORRECT ✓' : 'INCORRECT ✗', challengingReason);
    
    if (isChallengingCorrect) {
      // Challenging team correct - they get the point
      updates[`games/${gameId}/teams/${activeTeamId}/timeline/${challengingCardKey}/revealed`] = true;
      const challengingNewScore = (challengingTeam.score || 0) + 1;
      updates[`games/${gameId}/teams/${challengingTeamId}/score`] = challengingNewScore;
      
      console.log('[Challenge] Challenging team correct - they get point');
      showNotification(`✓ ${challengingTeam.name} hade rätt! ${activeTeam.name} hade fel.`, 'success');
      
      // Check for winner
      if (challengingNewScore >= 11) {
        showNotification(`🎉 ${challengingTeam.name} har 11 kort!`, 'success');
      }
    } else {
      // Both wrong - remove both cards
      updates[`games/${gameId}/teams/${activeTeamId}/timeline/${challengingCardKey}`] = null;
      
      console.log('[Challenge] Both teams wrong - both cards removed');
      showNotification(`✗ Båda hade fel! Inga poäng.`, 'error');
    }
  }
  
  // Clear challenge state
  updates[`games/${gameId}/challengeState`] = null;
  
  // Apply updates
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Challenge] Validation complete');
      console.log('[Challenge] ========== VALIDATION END ==========');
      
      // Transition to next team (host only)
      if (isHost) {
        setTimeout(() => {
          transitionToNextTeam();
        }, 2000);
      }
    })
    .catch((error) => {
      console.error('[Challenge] Error applying validation:', error);
    });
}

// ============================================
// HELPER: TRANSITION TO NEXT TEAM
// ============================================
function transitionToNextTeam() {
  console.log('[Game] Transitioning to next team...');
  
  if (!currentTeams || Object.keys(currentTeams).length === 0) {
    console.error('[Game] No teams available');
    return;
  }
  
  // Calculate next team
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
    console.warn('[Game] No more songs in deck!');
    showNotification('Inga fler låtar!', 'info');
    return;
  }
  
  const nextSong = songs[nextSongIndex];
  
  console.log('[Game] Next team:', nextTeamId);
  console.log('[Game] Next song:', nextSong.title);
  
  // Update Firebase
  const updates = {};
  updates[`games/${gameId}/currentTeam`] = nextTeamId;
  updates[`games/${gameId}/currentSongIndex`] = nextSongIndex;
  updates[`games/${gameId}/currentSong`] = nextSong;
  
  // Increment round if wrapped around
  if (nextIndex === 0) {
    const newRound = (currentGameData.currentRound || 0) + 1;
    updates[`games/${gameId}/currentRound`] = newRound;
  }
  
  window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
    .then(() => {
      console.log('[Game] Transitioned to next team');
      
      // Start Timer 4 (between songs)
      if (isHost) {
        startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
      }
    })
    .catch((error) => {
      console.error('[Game] Error transitioning to next team:', error);
    });
}

console.log('[Game] Cards module loaded');
