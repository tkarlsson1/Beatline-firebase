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
  
  // Render challenge button (if Timer 2 is active)
  renderChallengeButton();
  
  // Render validation modal (if active)
  renderValidationModal();
  
  // Initialize scores based on revealed cards (only once at game start)
  if (!hasInitializedScores && currentGameData.status === 'playing') {
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
    } else {
      // Unrevealed card (preview) - ALWAYS show as blank until validated
      // Border style depends on whether it's my card or another team's
      if (isMyCard) {
        cardDiv.style.border = `4px dashed ${teamColorHex}`;
      } else {
        cardDiv.style.border = `4px dashed rgba(255, 255, 255, 0.3)`;
      }
      cardDiv.innerHTML = `
      <div class="card-blank-text">?</div>
    `;
    }
    
    container.appendChild(cardDiv);
  });
  
  // Check if we need to render a preview card at a specific position
  // (happens when dragging or after placing card but before revealing)
  const previewCard = displayTeam.pendingCard;
  if (previewCard && previewCard.position !== undefined) {
    renderPreviewCard(previewCard, teamColorHex);
  }
  
  // Check if we need to render a challenging card (during Timer 3)
  if (currentGameData.timerState === 'challenge_placement' && 
      currentGameData.challengeState && 
      currentGameData.challengeState.challengingCard) {
    
    const challengingCard = currentGameData.challengeState.challengingCard;
    const challengingTeamId = currentGameData.challengeState.challengingTeam;
    const challengingTeam = currentTeams[challengingTeamId];
    
    if (challengingCard.position !== undefined && challengingTeam) {
      // Get challenging team's color
      const challengingTeamColor = challengingTeam.color || 'blue';
      const challengingColorObj = TEAM_COLORS.find(c => c.name === challengingTeamColor);
      const challengingColorHex = challengingColorObj ? challengingColorObj.hex : '#0B939C';
      
      renderPreviewCard(challengingCard, challengingColorHex);
    }
  }
  
  // Auto-scroll to center card when team changes
  if (currentTeamId !== previousCurrentTeam) {
    console.log('[Timeline] Team changed from', previousCurrentTeam, 'to', currentTeamId, '- auto-scrolling to center');
    previousCurrentTeam = currentTeamId;
    
    // Use requestAnimationFrame to ensure DOM is updated before scrolling
    requestAnimationFrame(() => {
      const timelineContainer = document.getElementById('timelineContainer');
      const allCards = container.querySelectorAll('.card');
      
      if (allCards.length > 0) {
        // Find middle card
        const middleIndex = Math.floor(allCards.length / 2);
        const middleCard = allCards[middleIndex];
        
        if (middleCard && timelineContainer) {
          console.log('[Timeline] Scrolling to middle card at index', middleIndex, 'of', allCards.length, 'cards');
          
          // Calculate the position to scroll to
          const cardRect = middleCard.getBoundingClientRect();
          const containerRect = timelineContainer.getBoundingClientRect();
          const cardCenter = middleCard.offsetLeft + (cardRect.width / 2);
          const containerCenter = containerRect.width / 2;
          const scrollPosition = cardCenter - containerCenter;
          
          // Scroll to position
          timelineContainer.scrollTo({
            left: scrollPosition,
            behavior: 'smooth'
          });
        }
      }
    });
  }
}

function renderPreviewCard(card, teamColorHex) {
  const container = document.getElementById('timeline');
  const position = card.position;
  
  // Check if this is my card:
  // 1. Normal gameplay: I'm the active team
  // 2. Challenge mode: I'm the challenging team
  const isMyCard = (teamId === currentGameData.currentTeam) || 
                   (currentGameData.timerState === 'challenge_placement' && 
                    currentGameData.challengeState && 
                    currentGameData.challengeState.challengingTeam === teamId);
  
  const previewCard = document.createElement('div');
  previewCard.className = 'card preview-card';
  previewCard.dataset.position = position;
  previewCard.id = 'timelinePreviewCard';
  
  // IMPORTANT: Preview cards are ALWAYS blank until validated
  // Only show year/title/artist after lockInPlacement() -> validation -> revealed
  previewCard.style.border = `4px dashed ${teamColorHex}`;
  previewCard.innerHTML = `
    <div class="card-blank-text">?</div>
  `;
  
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
  
  // Show current card if:
  // 1. It's my turn AND we're in guessing state (normal gameplay)
  // 2. OR we're in challenge_placement AND I'm the challenging team
  // 3. OR Timer 2 (challenge_window) AND I'm NOT the active team (for UTMANA button)
  
  const isMyTurn = (currentTeamId === teamId && timerState === 'guessing');
  const isChallengingTeam = (
    timerState === 'challenge_placement' && 
    currentGameData.challengeState && 
    currentGameData.challengeState.challengingTeam === teamId
  );
  const isChallengeWindow = (timerState === 'challenge_window' && currentTeamId !== teamId);
  
  if (!isMyTurn && !isChallengingTeam && !isChallengeWindow) {
    container.style.visibility = 'hidden';
    return;
  }
  
  const currentSong = currentGameData.currentSong;
  
  if (!currentSong) {
    container.style.visibility = 'hidden';
    return;
  }
  
  container.style.visibility = 'visible';
  
  // BUGFIX PROBLEM 4: During challenge window (Timer 2), don't create card for non-active teams
  // The UTMANA button will be shown instead by updateActionButtons()
  if (isChallengeWindow) {
    const cardContainer = document.getElementById('currentCard');
    cardContainer.innerHTML = '';  // Clear any existing card
    return;  // Don't create a new card
  }
  
  // Create card element (for active team or challenging team)
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
  
  const changeCardBtn = document.getElementById('changeCardBtn');
  const lockInBtn = document.getElementById('lockInBtn');
  const cardContainer = document.getElementById('currentCard');
  
  if (!changeCardBtn || !lockInBtn || !cardContainer) return;
  
  // BUGFIX PROBLEM 4: During Timer 2 (challenge window), show UTMANA centered
  if (timerState === 'challenge_window') {
    const alreadyChallenged = currentGameData.challengeState && currentGameData.challengeState.isActive;
    
    // Don't show to active team or if already challenged
    if (currentTeamId === teamId || alreadyChallenged) {
      changeCardBtn.style.display = 'none';
      lockInBtn.style.display = 'none';
      cardContainer.style.display = 'none';
      return;
    }
    
    // Show UTMANA button centered across entire grid
    changeCardBtn.style.display = 'inline-block';
    changeCardBtn.style.gridColumn = '1 / -1';  // Span all columns
    changeCardBtn.style.justifySelf = 'center'; // Center in grid
    changeCardBtn.style.height = '48px';  // Match card height to prevent container jump
    changeCardBtn.textContent = 'UTMANA (1 🎫)';
    changeCardBtn.onclick = challengeCard;
    
    // Enable if team has tokens
    const hasTokens = myTeam && myTeam.tokens > 0;
    changeCardBtn.disabled = !hasTokens;
    
    // Hide other elements
    lockInBtn.style.display = 'none';
    cardContainer.style.display = 'none';
    return;
  }
  
  // Reset to normal state (not challenge window)
  changeCardBtn.style.display = 'inline-block';
  changeCardBtn.style.gridColumn = '';  // Reset to default (1 column)
  changeCardBtn.style.justifySelf = '';  // Reset to CSS default
  changeCardBtn.style.height = '';  // Reset to CSS default height
  changeCardBtn.textContent = 'BYT LÅT';
  changeCardBtn.onclick = changeCard;
  lockInBtn.style.display = 'inline-block';
  cardContainer.style.display = 'flex';  // Show card container
  
  // Check if we're in challenge mode and I'm the challenging team
  const isChallengingTeam = (
    timerState === 'challenge_placement' && 
    currentGameData.challengeState && 
    currentGameData.challengeState.challengingTeam === teamId
  );
  
  // Normal gameplay: only enable if it's my turn AND guessing state
  const isMyTurn = (currentTeamId === teamId && timerState === 'guessing');
  
  if (!isMyTurn && !isChallengingTeam) {
    changeCardBtn.disabled = true;
    lockInBtn.disabled = true;
    return;
  }
  
  // Change card button - enable if team has tokens (not available during challenge)
  if (isMyTurn && myTeam && myTeam.tokens > 0) {
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
// CHALLENGE BUTTON
// ============================================
function renderChallengeButton() {
  // BUGFIX PROBLEM 4: Challenge button is now handled in updateActionButtons()
  // This function is kept for backwards compatibility but does nothing
  const container = document.getElementById('challengeButtonContainer');
  
  if (container) {
    container.innerHTML = '';
    container.style.display = 'none';
  }
  
  return;
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

// ============================================
// VALIDATION MODAL RENDERING
// ============================================
function renderValidationModal() {
  const container = document.getElementById('validationModalContainer');
  const gameContainer = document.getElementById('gameContainer');
  
  if (!container || !gameContainer) {
    console.warn('[Game] Modal containers not found');
    return;
  }
  
  const modal = currentGameData.validationModal;
  
  // Check if modal should be visible
  if (!modal || !modal.isVisible) {
    // Hide modal and remove blur
    container.innerHTML = '';
    gameContainer.classList.remove('modal-active');
    return;
  }
  
  console.log('[Game] Rendering validation modal:', modal);
  
  // Add blur class to game container
  gameContainer.classList.add('modal-active');
  
  // Determine title and subtitle based on result
  let titleText = '';
  let titleClass = '';
  let subtitleText = '';
  
  if (modal.challengingTeamId) {
    // Challenge scenario
    if (modal.result === 'active_correct') {
      titleText = `✅ ${escapeHtml(modal.activeTeamName)} HADE RÄTT!`;
      titleClass = 'correct';
      subtitleText = `${escapeHtml(modal.challengingTeamName)} förlorade utmaningen`;
    } else if (modal.result === 'challenging_won') {
      titleText = `✅ ${escapeHtml(modal.challengingTeamName)} VANN UTMANINGEN!`;
      titleClass = 'correct';
      subtitleText = `${escapeHtml(modal.activeTeamName)} placerade fel`;
    } else {
      // both_wrong
      titleText = `❌ BÅDA LAGEN HADE FEL`;
      titleClass = 'wrong';
      subtitleText = `${escapeHtml(modal.activeTeamName)} och ${escapeHtml(modal.challengingTeamName)}`;
    }
  } else {
    // Normal validation (no challenge)
    if (modal.result === 'active_correct') {
      titleText = `✅ ${escapeHtml(modal.activeTeamName)} FICK KORTET!`;
      titleClass = 'correct';
      subtitleText = '';
    } else {
      titleText = `❌ ${escapeHtml(modal.activeTeamName)} PLACERADE FEL`;
      titleClass = 'wrong';
      subtitleText = '';
    }
  }
  
  // Build modal HTML
  let modalHTML = `
    <div class="validation-modal-overlay">
      <div class="validation-modal">
        <div class="validation-modal-title ${titleClass}">
          ${titleText}
        </div>
  `;
  
  if (subtitleText) {
    modalHTML += `
      <div class="validation-modal-subtitle">
        ${subtitleText}
      </div>
    `;
  }
  
  modalHTML += `
    <div class="validation-modal-song">
      <div class="validation-modal-song-year">${modal.song.year}</div>
      <div class="validation-modal-song-title">${escapeHtml(modal.song.title)}</div>
      <div class="validation-modal-song-artist">${escapeHtml(modal.song.artist)}</div>
    </div>
    
    <div class="validation-modal-buttons">
  `;
  
  // Show +TOKEN button only if canGiveToken and not already given
  if (modal.canGiveToken && !modal.tokenGiven) {
    modalHTML += `
      <button 
        class="validation-modal-btn token" 
        onclick="giveTokenToActiveTeam()"
        ${modal.isProcessing ? 'disabled' : ''}
      >
        🎫 +TOKEN
      </button>
    `;
  }
  
  // Show NÄSTA LÅT button (always visible)
  modalHTML += `
    <button 
      class="validation-modal-btn next" 
      onclick="closeValidationModal()"
      ${modal.isProcessing ? 'disabled' : ''}
    >
      NÄSTA LÅT →
    </button>
  `;
  
  modalHTML += `
    </div>
      </div>
    </div>
  `;
  
  container.innerHTML = modalHTML;
  
  console.log('[Game] Validation modal rendered');
}

console.log('[Game] Render module loaded');

console.log('[Game] Render module loaded');
