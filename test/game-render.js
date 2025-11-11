// ============================================
// NOTESTREAM - GAME RENDER MODULE
// ============================================

// ============================================
// MAIN RENDER FUNCTION
// ============================================
function updateGameView() {
  console.log('[Game] Updating game view');
  
  // Update team header
  renderTeamHeader();
  
  // Update turn indicator
  renderTurnIndicator();
  
  // Update timer
  updateTimer();
  
  // Update timeline
  renderTimeline();
  
  // Update current card (if it's my turn)
  renderCurrentCard();
  
  // Update action buttons
  updateActionButtons();
  
  // Initialize scores based on revealed cards (only once at game start)
  if (!hasInitializedScores && currentGameData.status === 'playing' && isHost) {
    hasInitializedScores = true;
    console.log('[Game] Initializing scores based on revealed cards');
    
    // Update each team's score based on their revealed cards
    const scoreUpdates = {};
    Object.entries(currentTeams).forEach(([teamKey, team]) => {
      if (team.timeline) {
        let revealedCount = 0;
        Object.values(team.timeline).forEach(card => {
          if (card && card.revealed) {
            revealedCount++;
          }
        });
        
        // Only update if score is not set or is 0 but should be higher
        if (revealedCount > 0 && (!team.score || team.score === 0)) {
          scoreUpdates[`games/${gameId}/teams/${teamKey}/score`] = revealedCount;
          console.log('[Game] Setting initial score for', team.name, 'to', revealedCount);
        }
      }
    });
    
    // Apply score updates if any
    if (Object.keys(scoreUpdates).length > 0) {
      window.firebaseUpdate(window.firebaseRef(window.firebaseDb), scoreUpdates)
        .then(() => {
          console.log('[Game] Initial scores set');
        })
        .catch((error) => {
          console.error('[Game] Error setting initial scores:', error);
        });
    }
  }
  
  // Update pause/resume button visibility (host only)
  if (isHost) {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    
    if (currentGameData.timerState === 'paused') {
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
    } else {
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
    }
    
    // Check if validation trigger changed (non-host validated their card)
    if (currentGameData.validationTrigger && currentGameData.validationTrigger !== lastValidationTrigger) {
      console.log('[Host] Validation trigger detected:', currentGameData.validationTrigger);
      lastValidationTrigger = currentGameData.validationTrigger;
      
      // Start Timer 4 after validation from non-host
      console.log('[Host] Starting Timer 4 after non-host validation');
      const nextTeamId = currentGameData.currentTeam;
      if (nextTeamId && !currentGameData.timerState) {
        // Only start if no timer is currently active
        console.log('[Host] Starting between_songs timer for:', nextTeamId);
        startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, nextTeamId);
        
        // Clear the trigger
        const clearUpdates = {};
        clearUpdates[`games/${gameId}/validationTrigger`] = null;
        window.firebaseUpdate(window.firebaseRef(window.firebaseDb), clearUpdates);
      }
    }
  }
  
  // Handle Spotify playback (host only)
  if (isHost && window.spotifyPlayer) {
    const currentTimerState = currentGameData.timerState;
    
    // Detect timer state change to 'guessing' - play new song
    if (currentTimerState === 'guessing' && previousTimerState !== 'guessing') {
      console.log('[Spotify] Timer changed to guessing, playing song...');
      
      if (currentGameData.currentSong && currentGameData.currentSong.spotifyId) {
        const spotifyId = currentGameData.currentSong.spotifyId;
        
        // Only play if it's a different song
        if (spotifyId !== currentPlayingTrackId) {
          console.log('[Spotify] Playing new track:', currentGameData.currentSong.title, 'by', currentGameData.currentSong.artist);
          
          window.spotifyPlayer.play(spotifyId)
            .then(success => {
              if (success) {
                currentPlayingTrackId = spotifyId;
                console.log('[Spotify] Track started successfully');
              } else {
                console.error('[Spotify] Failed to start track');
              }
            })
            .catch(error => {
              console.error('[Spotify] Error playing track:', error);
            });
        } else {
          console.log('[Spotify] Same track already playing, continuing...');
        }
      } else {
        console.warn('[Spotify] No currentSong or spotifyId available');
      }
    }
    
    // Update previous timer state
    previousTimerState = currentTimerState;
  }
  
  // Start initial timer (Timer 4) when game first starts
  if (!hasStartedInitialTimer && currentGameData.status === 'playing' && isHost) {
    hasStartedInitialTimer = true;
    console.log('[Game] Starting initial pause timer (Timer 4)');
    
    // Find the starting team (should already be set in currentTeam)
    const firstTeamId = currentGameData.currentTeam;
    
    // Start Timer 4 (10s between songs) showing the first team
    setTimeout(() => {
      startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, firstTeamId);
    }, 500); // Small delay to ensure everything is loaded
  }
}

// ============================================
// TEAM HEADER
// ============================================
function renderTeamHeader() {
  const container = document.getElementById('teamList');
  container.innerHTML = '';
  
  const currentTeamId = currentGameData.currentTeam;
  
  Object.entries(currentTeams).forEach(([teamIdKey, team]) => {
    const badge = document.createElement('div');
    badge.className = 'team-badge';
    
    // Get team color
    const colorObj = TEAM_COLORS.find(c => c.name === team.color);
    const colorHex = colorObj ? colorObj.hex : '#FFFFFF';
    
    // Set border based on active state
    if (teamIdKey === currentTeamId) {
      // Active team: thick border in team's own color
      badge.style.border = `3px solid ${colorHex}`;
      badge.style.background = `${colorHex}22`; // Light background (hex with alpha)
      badge.style.boxShadow = `0 0 15px ${colorHex}80`;
    } else {
      // Inactive team: thin gray border
      badge.style.border = '2px solid rgba(255, 255, 255, 0.2)';
      badge.style.background = 'rgba(255, 255, 255, 0.05)';
      badge.style.boxShadow = 'none';
    }
    
    badge.innerHTML = `
      <div class="team-color-dot" style="background: ${colorHex};"></div>
      <div class="team-name">${escapeHtml(team.name)}</div>
      <div class="team-stats">
        <span class="team-score">🎵 ${team.score || 0}</span>
        <span class="team-tokens">🎫 ${team.tokens || 0}</span>
      </div>
    `;
    
    container.appendChild(badge);
  });
}

// ============================================
// TURN INDICATOR
// ============================================
function renderTurnIndicator() {
  // Turn indicator text removed - info shown in team badges and card borders instead
  // Container kept for timer bar rendering
  return;
}

// ============================================
// TIMELINE
// ============================================
function renderTimeline() {
  const container = document.getElementById('timeline');
  const currentTeamId = currentGameData.currentTeam;
  
  if (!currentTeamId) {
    container.innerHTML = '';
    return;
  }
  
  const displayTeam = currentTeams[currentTeamId];
  
  if (!displayTeam || !displayTeam.timeline) {
    container.innerHTML = '<p style="color: white;">Ingen tidslinje än...</p>';
    return;
  }
  
  // Get timeline cards sorted by position
  const timelineCards = Object.entries(displayTeam.timeline)
    .map(([key, card]) => ({ ...card, key }))
    .sort((a, b) => a.position - b.position);
  
  console.log('[Game] Rendering timeline with', timelineCards.length, 'cards');
  
  // Get team color for border
  const teamColor = displayTeam.color || 'blue'; // Fallback to blue
  const colorObj = TEAM_COLORS.find(c => c.name === teamColor);
  const teamColorHex = colorObj ? colorObj.hex : '#0B939C'; // Fallback to default accent
  
  container.innerHTML = '';
  
  // Just render cards, no drop zones (they appear dynamically during drag)
  timelineCards.forEach((card) => {
    // Check if this is my preview card
    const isMyCard = (teamId === currentTeamId) && !card.revealed;
    
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.position = card.position;
    
    // Add preview-card class if this is my card
    if (isMyCard) {
      cardDiv.classList.add('preview-card');
    }
    
    // Different border styles for revealed vs preview cards
    if (card.revealed) {
      // Revealed card - show year and info
      cardDiv.style.border = `6px solid ${teamColorHex}`;
      cardDiv.innerHTML = `
      <div class="card-year">${card.year}</div>
      <div class="card-info">${escapeHtml(card.title)}<br>${escapeHtml(card.artist)}</div>
    `;
    } else if (isMyCard) {
      // Preview card (not yet revealed, showing to player only)
      cardDiv.style.border = `4px dashed ${teamColorHex}`;
      cardDiv.innerHTML = `
      <div class="card-year">${card.year}</div>
      <div class="card-info" style="opacity: 0.7; font-size: 0.7rem;">
        ${escapeHtml(card.title)}<br>${escapeHtml(card.artist)}
      </div>
    `;
    } else {
      // Hidden card (preview for another team) - show blank card
      cardDiv.style.border = `4px dashed rgba(255, 255, 255, 0.3)`;
      cardDiv.innerHTML = `
      <div class="card-blank-text">?</div>
    `;
    }
    
    container.appendChild(cardDiv);
  });
  
  // Check if we need to render a preview card at a specific position
  // (happens when dragging or after placing card but before revealing)
  const previewCard = displayTeam.previewCard;
  if (previewCard && previewCard.position !== undefined) {
    renderPreviewCard(previewCard, teamColorHex);
  }
}

function renderPreviewCard(card, teamColorHex) {
  const container = document.getElementById('timeline');
  const position = card.position;
  
  // Check if this is my card (so I can see it and drag it)
  const isMyCard = (teamId === currentGameData.currentTeam);
  
  const previewCard = document.createElement('div');
  previewCard.className = 'card preview-card';
  previewCard.dataset.position = position;
  previewCard.id = 'timelinePreviewCard';
  
  // Style based on whether it's my card or not
  if (isMyCard) {
    // My card - show details with dashed border
    previewCard.style.border = `4px dashed ${teamColorHex}`;
    previewCard.innerHTML = `
      <div class="card-year">${card.year}</div>
      <div class="card-info" style="opacity: 0.7; font-size: 0.7rem;">
        ${escapeHtml(card.title)}<br>${escapeHtml(card.artist)}
      </div>
    `;
  } else {
    // Someone else's card - show as blank
    previewCard.style.border = `4px dashed rgba(255, 255, 255, 0.3)`;
    previewCard.innerHTML = `
      <div class="card-blank-text">?</div>
    `;
  }
  
  // Make preview draggable only if it's my card
  if (isMyCard) {
    previewCard.draggable = true;
    previewCard.addEventListener('dragstart', handlePreviewDragStart);
    previewCard.addEventListener('dragend', handleDragEnd);
    previewCard.addEventListener('touchstart', handlePreviewTouchStart);
    previewCard.addEventListener('touchmove', handleTouchMove);
    previewCard.addEventListener('touchend', handleTouchEnd);
    previewCard.style.cursor = 'move';
  }
  
  // Update local placementPosition to match Firebase (for lock in button)
  if (isMyCard) {
    placementPosition = position;
  }
  
  // Insert at correct position based on index
  // Position from Firebase should correspond to index in DOM
  const cards = container.querySelectorAll('.card:not(.preview-card)');
  if (position === 0 || cards.length === 0) {
    container.insertBefore(previewCard, container.firstChild);
  } else if (position >= cards.length) {
    container.appendChild(previewCard);
  } else {
    // Insert before the card at this index
    const insertBeforeCard = cards[position];
    container.insertBefore(previewCard, insertBeforeCard);
  }
}

// ============================================
// CURRENT CARD
// ============================================
function renderCurrentCard() {
  const container = document.getElementById('currentCardContainer');
  const currentTeamId = currentGameData.currentTeam;
  const timerState = currentGameData.timerState;
  
  // Only show current card if it's my turn AND we're in guessing state (not pause)
  if (currentTeamId !== teamId || timerState !== 'guessing') {
    container.style.display = 'none';
    return;
  }
  
  const currentSong = currentGameData.currentSong;
  
  if (!currentSong) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'grid';
  
  // Create card element
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card blank-card';
  cardDiv.id = 'draggableCard';
  cardDiv.draggable = true;
  cardDiv.style.width = '41px';
  cardDiv.style.height = '48px';
  cardDiv.style.fontSize = '1.5rem';
  cardDiv.style.padding = '0.3rem';
  cardDiv.innerHTML = `
    <div class="card-blank-text" style="font-size: 1.5rem; margin: 0;">?</div>
  `;
  
  // Add drag event listeners
  cardDiv.addEventListener('dragstart', handleDragStart);
  cardDiv.addEventListener('dragend', handleDragEnd);
  
  // Touch events
  cardDiv.addEventListener('touchstart', handleTouchStart);
  cardDiv.addEventListener('touchmove', handleTouchMove);
  cardDiv.addEventListener('touchend', handleTouchEnd);
  
  // Replace existing card
  const cardContainer = document.getElementById('currentCard');
  cardContainer.innerHTML = '';
  cardContainer.appendChild(cardDiv);
  
  currentCardElement = cardDiv;
  
  // Add dragover listener to timeline for dynamic indicators
  const timeline = document.getElementById('timeline');
  timeline.addEventListener('dragover', handleDragOver);
  timeline.addEventListener('drop', handleDrop);
}

// ============================================
// ACTION BUTTONS
// ============================================
function updateActionButtons() {
  const currentTeamId = currentGameData.currentTeam;
  const timerState = currentGameData.timerState;
  
  // Buttons are now inside currentCardContainer, no need to show/hide separately
  // Just update button states
  
  const changeCardBtn = document.getElementById('changeCardBtn');
  const lockInBtn = document.getElementById('lockInBtn');
  
  if (!changeCardBtn || !lockInBtn) return;
  
  // Only enable buttons if it's my turn AND we're in guessing state
  if (currentTeamId !== teamId || timerState !== 'guessing') {
    changeCardBtn.disabled = true;
    lockInBtn.disabled = true;
    return;
  }
  
  // Change card button - enable if team has tokens
  if (myTeam && myTeam.tokens > 0) {
    changeCardBtn.disabled = false;
  } else {
    changeCardBtn.disabled = true;
  }
  
  // Lock in button - enable if placement position is set
  if (placementPosition !== null) {
    lockInBtn.disabled = false;
  } else {
    lockInBtn.disabled = true;
  }
}

// ============================================
// DROP POSITION & INDICATORS
// ============================================
function getDropPositionFromCoords(x, y) {
  // Find which position in timeline based on x coordinate
  // Position is based on actual index in DOM, not dataset.position
  const timeline = document.getElementById('timeline');
  const cards = timeline.querySelectorAll('.card:not(.preview-card):not(.dragging)');
  
  if (cards.length === 0) {
    return 0;
  }
  
  // Check if before first card
  const firstCard = cards[0];
  const firstRect = firstCard.getBoundingClientRect();
  if (x < firstRect.left + firstRect.width / 2) {
    return 0;
  }
  
  // Check if after last card
  const lastCard = cards[cards.length - 1];
  const lastRect = lastCard.getBoundingClientRect();
  if (x > lastRect.right - lastRect.width / 2) {
    return cards.length;
  }
  
  // Check between cards
  for (let i = 0; i < cards.length - 1; i++) {
    const currentCard = cards[i];
    const nextCard = cards[i + 1];
    
    const currentRect = currentCard.getBoundingClientRect();
    const nextRect = nextCard.getBoundingClientRect();
    
    const currentCenter = currentRect.left + currentRect.width / 2;
    const nextCenter = nextRect.left + nextRect.width / 2;
    
    // If x is between current card center and next card center
    if (x >= currentCenter && x < nextCenter) {
      return i + 1;
    }
  }
  
  // Default to after last card
  return cards.length;
}

function showDynamicDropIndicator(x, y) {
  // Remove existing indicator
  const existing = document.querySelector('.dynamic-drop-indicator');
  if (existing) {
    existing.remove();
  }
  
  const position = getDropPositionFromCoords(x, y);
  
  // Create and position indicator
  const timeline = document.getElementById('timeline');
  const cards = timeline.querySelectorAll('.card:not(.preview-card):not(.dragging)');
  
  const indicator = document.createElement('div');
  indicator.className = 'dynamic-drop-indicator';
  indicator.style.cssText = `
    width: 4px;
    height: 80%;
    background: #4CAF50;
    position: relative;
    flex-shrink: 0;
    margin: auto 0.5rem;
    border-radius: 2px;
    box-shadow: 0 0 10px #4CAF50;
    animation: pulse 1s infinite;
  `;
  
  // Add arrow indicator
  indicator.innerHTML = `
    <div style="
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 2rem;
      color: #4CAF50;
      animation: pulse 1s infinite;
    ">↓</div>
  `;
  
  // Insert at position based on actual index
  if (position === 0 || cards.length === 0) {
    // Insert before first card
    timeline.insertBefore(indicator, timeline.firstChild);
  } else if (position >= cards.length) {
    // Insert after last card
    timeline.appendChild(indicator);
  } else {
    // Insert before the card at this index
    const insertBeforeCard = cards[position];
    timeline.insertBefore(indicator, insertBeforeCard);
  }
  
  return position;
}

function clearDynamicDropIndicator() {
  const indicator = document.querySelector('.dynamic-drop-indicator');
  if (indicator) {
    indicator.remove();
  }
}

console.log('[Game] Render module loaded');
