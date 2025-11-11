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
  
  // Update challenge button (if Timer 2 is active)
  renderChallengeButton();
  
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
    
    // Check if challenge trigger changed (non-host locked in card)
    if (currentGameData.challengeTrigger && currentGameData.challengeTrigger !== lastValidationTrigger) {
      console.log('[Host] Challenge trigger detected:', currentGameData.challengeTrigger);
      lastValidationTrigger = currentGameData.challengeTrigger;
      
      // Start Timer 2 (challenge window)
      console.log('[Host] Starting Timer 2 after non-host lock in');
      if (!currentGameData.timerState) {
        // Only start if no timer is currently active
        console.log('[Host] Starting challenge_window timer');
        startTimer('challenge_window', (currentGameData.challengeTime || 10) * 1000);
        
        // Clear the trigger
        const clearUpdates = {};
        clearUpdates[`games/${gameId}/challengeTrigger`] = null;
        window.firebaseUpdate(window.firebaseRef(window.firebaseDb), clearUpdates);
      }
    }
    
    // NEW: Check if challengeState changed (someone challenged) - Start Timer 3
    const challengeState = currentGameData.challengeState;
    if (challengeState && challengeState.isActive && challengeState.timestamp !== lastChallengeTimestamp) {
      console.log('[Host] Challenge detected! Starting Timer 3');
      lastChallengeTimestamp = challengeState.timestamp;
      
      // Stop Timer 2 and start Timer 3
      const placeChallengeTime = currentGameData.placeChallengeTime || 20;
      startTimer('challenge_placement', placeChallengeTime * 1000);
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
  const container = document.getElementById('turnIndicator');
  
  // Container only holds the timer - timer is rendered separately in updateTimer()
  // Keep the container for timer to render into
}

// ============================================
// TIMELINE
// ============================================
function renderTimeline() {
  const container = document.getElementById('timeline');
  container.innerHTML = '';
  
  if (!myTeam || !myTeam.timeline) {
    return;
  }
  
  // Get all cards from my timeline, sorted by position
  const timelineCards = Object.entries(myTeam.timeline)
    .filter(([key, card]) => card !== null)
    .map(([key, card]) => ({ ...card, key }))
    .sort((a, b) => a.position - b.position);
  
  console.log('[Timeline] Rendering', timelineCards.length, 'cards');
  
  // Render each card
  timelineCards.forEach((card, index) => {
    if (card.revealed) {
      // Revealed card - show year and info
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card';
      cardDiv.dataset.position = card.position;
      cardDiv.dataset.cardKey = card.key;
      
      cardDiv.innerHTML = `
        <div class="card-year">${card.year}</div>
        <div class="card-info">
          <strong>${escapeHtml(card.title)}</strong><br>
          ${escapeHtml(card.artist)}
        </div>
      `;
      
      container.appendChild(cardDiv);
    } else {
      // Unrevealed card (preview) - show as "?"
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card preview-card blank-card';
      cardDiv.dataset.position = card.position;
      cardDiv.dataset.cardKey = card.key;
      cardDiv.id = `preview-${card.key}`;
      
      // Check if this is a challenging team's card during Timer 3
      const challengeState = currentGameData.challengeState;
      const isChallengingCard = challengeState && 
                                challengeState.isActive && 
                                currentGameData.timerState === 'challenge_placement' &&
                                currentGameData.currentTeam !== teamId; // I'm NOT the active team
      
      if (isChallengingCard) {
        // Challenging team's card - red border
        cardDiv.style.border = '3px dashed #EA4335';
        cardDiv.style.background = 'linear-gradient(135deg, #EA4335 0%, #C62828 100%)';
      } else {
        // Active team's card during challenge - team color border
        const colorObj = TEAM_COLORS.find(c => c.name === myTeam.color);
        const colorHex = colorObj ? colorObj.hex : '#667eea';
        cardDiv.style.border = `3px dashed ${colorHex}`;
      }
      
      cardDiv.innerHTML = `
        <div class="card-blank-text">?</div>
      `;
      
      // Add touch/drag events to preview cards so they can be moved
      cardDiv.draggable = true;
      cardDiv.addEventListener('dragstart', handlePreviewDragStart);
      cardDiv.addEventListener('dragend', handleDragEnd);
      cardDiv.addEventListener('touchstart', handlePreviewTouchStart);
      cardDiv.addEventListener('touchmove', handleTouchMove);
      cardDiv.addEventListener('touchend', handleTouchEnd);
      
      container.appendChild(cardDiv);
    }
  });
  
  console.log('[Timeline] Rendered', timelineCards.length, 'total cards');
}

// ============================================
// CURRENT CARD
// ============================================
function renderCurrentCard() {
  const container = document.getElementById('currentCardContainer');
  const currentTeamId = currentGameData.currentTeam;
  const timerState = currentGameData.timerState;
  const challengeState = currentGameData.challengeState;
  
  // Show current card if:
  // 1. It's my turn during guessing (Timer 1)
  // 2. OR I'm the challenging team during challenge_placement (Timer 3)
  const isMyTurn = currentTeamId === teamId && timerState === 'guessing';
  const isMyChallenge = challengeState && 
                        challengeState.isActive && 
                        challengeState.challengingTeam === teamId && 
                        timerState === 'challenge_placement';
  
  if (!isMyTurn && !isMyChallenge) {
    container.style.visibility = 'hidden';
    return;
  }
  
  const currentSong = currentGameData.currentSong;
  
  if (!currentSong) {
    container.style.visibility = 'hidden';
    return;
  }
  
  container.style.visibility = 'visible';
  
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
// CHALLENGE BUTTON
// ============================================
function renderChallengeButton() {
  const timerState = currentGameData.timerState;
  const currentTeamId = currentGameData.currentTeam;
  const challengeState = currentGameData.challengeState;
  
  // Find or create challenge button container
  let challengeContainer = document.getElementById('challengeButtonContainer');
  
  // Only show challenge button during Timer 2 (challenge_window)
  if (timerState !== 'challenge_window') {
    if (challengeContainer) {
      challengeContainer.style.display = 'none';
    }
    return;
  }
  
  // Create container if it doesn't exist
  if (!challengeContainer) {
    challengeContainer = document.createElement('div');
    challengeContainer.id = 'challengeButtonContainer';
    challengeContainer.style.cssText = `
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 1rem auto;
      max-width: 400px;
    `;
    
    // Insert after timer container
    const turnIndicator = document.getElementById('turnIndicator');
    turnIndicator.parentNode.insertBefore(challengeContainer, turnIndicator.nextSibling);
  }
  
  challengeContainer.style.display = 'flex';
  
  // Check if I should see the challenge button
  // Show if: NOT the active team AND have tokens > 0 AND no one has challenged yet
  const isActiveTeam = currentTeamId === teamId;
  const hasTokens = myTeam && myTeam.tokens > 0;
  const alreadyChallenged = challengeState && challengeState.isActive;
  
  if (isActiveTeam) {
    // I'm the active team - show waiting message
    challengeContainer.innerHTML = `
      <div style="
        color: white;
        font-size: 1.1rem;
        font-weight: bold;
        text-align: center;
        opacity: 0.8;
      ">Väntar på utmaningar...</div>
    `;
  } else if (alreadyChallenged) {
    // Someone has already challenged
    const challengingTeam = currentTeams[challengeState.challengingTeam];
    challengeContainer.innerHTML = `
      <div style="
        color: #FFC107;
        font-size: 1.1rem;
        font-weight: bold;
        text-align: center;
      ">${escapeHtml(challengingTeam.name)} utmanar!</div>
    `;
  } else if (!hasTokens) {
    // I don't have tokens
    challengeContainer.innerHTML = `
      <button 
        disabled 
        style="
          background: #555;
          border: none;
          color: white;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.2rem;
          font-weight: bold;
          cursor: not-allowed;
          opacity: 0.5;
          font-family: 'Manrope', sans-serif;
        "
      >UTMANA (Inga tokens)</button>
    `;
  } else {
    // I can challenge!
    challengeContainer.innerHTML = `
      <button 
        onclick="challengeCard()" 
        style="
          background: #EA4335;
          border: none;
          color: white;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-size: 1.2rem;
          font-weight: bold;
          cursor: pointer;
          font-family: 'Manrope', sans-serif;
          box-shadow: 0 4px 12px rgba(234, 67, 53, 0.4);
          transition: all 0.3s;
        "
        onmouseover="this.style.background='#C62828'; this.style.transform='translateY(-2px)'"
        onmouseout="this.style.background='#EA4335'; this.style.transform='translateY(0)'"
      >UTMANA (1 🎫)</button>
    `;
  }
}

// ============================================
// DROP POSITION & INDICATORS
// ============================================
function getDropPositionFromCoords(x, y) {
  // Find which position in timeline based on x coordinate
  // Position is based on actual index in DOM, not dataset.position
  const timeline = document.getElementById('timeline');
  const cards = Array.from(timeline.children);
  
  if (cards.length === 0) {
    return 0; // First position
  }
  
  // Find the card closest to drop point
  let closestIndex = 0;
  let closestDistance = Infinity;
  
  cards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.left + rect.width / 2;
    const distance = Math.abs(cardCenter - x);
    
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  
  // Determine if drop is before or after the closest card
  const closestCard = cards[closestIndex];
  const rect = closestCard.getBoundingClientRect();
  const cardCenter = rect.left + rect.width / 2;
  
  if (x < cardCenter) {
    // Drop before this card
    return closestIndex;
  } else {
    // Drop after this card
    return closestIndex + 1;
  }
}

function showDynamicDropIndicator(x, y) {
  // Remove any existing indicator
  clearDynamicDropIndicator();
  
  const timeline = document.getElementById('timeline');
  const cards = Array.from(timeline.children);
  
  if (cards.length === 0) {
    // Empty timeline - show indicator in middle
    const indicator = document.createElement('div');
    indicator.id = 'dynamicDropIndicator';
    indicator.className = 'drop-zone first';
    indicator.style.position = 'absolute';
    indicator.style.left = '50%';
    indicator.style.transform = 'translateX(-50%)';
    timeline.appendChild(indicator);
    return 0;
  }
  
  // Find position based on x coordinate
  const position = getDropPositionFromCoords(x, y);
  
  // Create indicator
  const indicator = document.createElement('div');
  indicator.id = 'dynamicDropIndicator';
  indicator.className = 'drop-zone';
  
  if (position === 0) {
    indicator.classList.add('first');
  } else if (position === cards.length) {
    indicator.classList.add('last');
  } else {
    indicator.classList.add('between');
  }
  
  // Insert indicator at the correct position
  if (position >= cards.length) {
    timeline.appendChild(indicator);
  } else {
    timeline.insertBefore(indicator, cards[position]);
  }
  
  return position;
}

function clearDynamicDropIndicator() {
  const indicator = document.getElementById('dynamicDropIndicator');
  if (indicator) {
    indicator.remove();
  }
}

// ============================================
// AUTO-SCROLL TIMELINE
// ============================================
function autoScrollTimeline() {
  const container = document.querySelector('.timeline-container');
  if (!container) return;
  
  // Scroll to center of timeline
  const scrollWidth = container.scrollWidth;
  const clientWidth = container.clientWidth;
  const scrollPosition = (scrollWidth - clientWidth) / 2;
  
  container.scrollTo({
    left: scrollPosition,
    behavior: 'smooth'
  });
}

console.log('[Game] Render module loaded');
