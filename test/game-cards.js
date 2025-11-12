// ============================================
// NOTESTREAM - GAME CARDS MODULE
// Handles drag & drop, card placement, and validation
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
      showNotification('Kort låst! Rättar...', 'info');
      placementPosition = null;
      
      // Validate placement (with longer delay to ensure Firebase has updated)
      setTimeout(() => {
        validateAndScoreCard(newCardKey, newCard);
      }, 1000);
    })
    .catch((error) => {
      console.error('[Game] Error adding card:', error);
      showNotification('Kunde inte placera kort', 'error');
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
      
      // Apply updates
      return window.firebaseUpdate(window.firebaseRef(window.firebaseDb), validationUpdates);
    })
    .then(() => {
      console.log('[Game] Validation complete, updates applied');
      console.log('[Game] ========== VALIDATION END ==========');
      
      // Only the active team should transition to next team and start Timer 4
      setTimeout(() => {
        // Check if we're still the active team (avoid race conditions)
        if (currentGameData.currentTeam !== teamId) {
          console.log('[Game] Not active team anymore, skipping transition');
          return;
        }
        
        console.log('[Game] Active team transitioning to next team after 2s delay');
        
        if (!currentTeams || Object.keys(currentTeams).length === 0) {
          console.error('[Game] No teams available!');
          return;
        }
        
        if (!currentGameData) {
          console.error('[Game] No game data available!');
          return;
        }
        
        // Calculate next team
        const teamIds = Object.keys(currentTeams);
        const currentTeamId = currentGameData.currentTeam;
        const currentIndex = teamIds.indexOf(currentTeamId);
        const nextIndex = (currentIndex + 1) % teamIds.length;
        const nextTeamId = teamIds[nextIndex];
        
        console.log('[Game] Current team:', currentTeamId, 'at index', currentIndex);
        console.log('[Game] Next team:', nextTeamId, 'at index', nextIndex);
        
        // Update current team and song in Firebase
        const currentSongIndex = currentGameData.currentSongIndex || 0;
        const nextSongIndex = currentSongIndex + 1;
        const songs = currentGameData.songs || [];
        
        console.log('[Game] Next song index:', nextSongIndex, '/', songs.length);
        
        if (nextSongIndex >= songs.length) {
          console.warn('[Game] No more songs in deck!');
          return;
        }
        
        const nextSong = songs[nextSongIndex];
        
        console.log('[Game] Next song:', nextSong ? nextSong.title : 'null');
        
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
        
        console.log('[Game] Applying game updates:', updates);
        
        window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
          .then(() => {
            console.log('[Game] Game updates applied, starting Timer 4');
            // Start between songs timer showing the team that will play next
            startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
          })
          .catch((error) => {
            console.error('[Game] Error applying game updates:', error);
          });
      }, 2000);
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
          
          window.firebaseUpdate(window.firebaseRef(window.firebaseDb), updates)
            .then(() => {
              startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
            });
        }, 1000);
      }
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
