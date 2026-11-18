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
  
  // Read the year explanation for the song in play ahead of time, so that it is already
  // in memory when the card is turned and the validation modal opens
  if (currentGameData.currentSong) {
    loadYearInfo(currentGameData.currentSong.spotifyId);
  }

  // Render validation modal (if active)
  renderValidationModal();

  // Render game over modal (if phase is gameOver)
  renderGameOverModal();
  
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

    // Guessing time has begun - play the song
    if (currentTimerState === 'guessing' && previousTimerState !== 'guessing') {
      // A page that is loaded in the middle of a turn gets its first game state before the
      // player is ready. Then the song is started when the player reports that it is ready
      // (spotifyPlayerReady in game-init.js) instead of failing here.
      if (hasSeenFirstGameState || window.spotifyPlayer.getDeviceId()) {
        playCurrentSong();
      } else {
        console.log('[Spotify] Page loaded during guessing time, the song starts when the player is ready');
      }
    }

    // Update previous timer state
    previousTimerState = currentTimerState;
    hasSeenFirstGameState = true;
  }

  // Start the pause before the first song (Timer 4), once per game.
  // The game itself remembers that it has been done (startPauseStarted). The page's own
  // memory is not enough: a host who reloads the page would start the pause again, on top
  // of the timer that is running.
  if (!hasStartedInitialTimer && currentGameData.status === 'playing' && isHost) {
    hasStartedInitialTimer = true;

    if (!currentGameData.startPauseStarted) {
      console.log('[Game] Starting initial pause timer (Timer 4)');

      // Find the starting team (should already be set in currentTeam)
      const firstTeamId = currentGameData.currentTeam;

      // Start Timer 4 showing the first team, and mark the game in the same write
      setTimeout(() => {
        if (currentGameData.startPauseStarted) return;
        startTimer('between_songs', (currentGameData.betweenSongsTime || 10) * 1000, firstTeamId, { startPauseStarted: true });
      }, 500); // Small delay to ensure everything is loaded
    }
  }
}

/**
 * Starts the song in play on the host's Spotify player, unless it is already playing.
 * Called when guessing time begins and when the player becomes ready.
 */
function playCurrentSong() {
  const song = currentGameData && currentGameData.currentSong;
  if (!song || !song.spotifyId) {
    console.warn('[Spotify] No currentSong or spotifyId available');
    return;
  }

  const spotifyId = song.spotifyId;

  // Only play if it's a different song
  if (spotifyId === currentPlayingTrackId) {
    console.log('[Spotify] Same track already playing, continuing...');
    return;
  }

  console.log('[Spotify] Playing new track:', song.title, 'by', song.artist);

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

    // The team's colour; game.css draws the box from it
    applyTeamColors(badge, teamColors(team.color, '#FFFFFF'));

    // The team in turn is a solid block in its colour, the others are outlines
    if (teamIdKey === currentTeamId) {
      badge.classList.add('active');
    }

    badge.innerHTML = `
      <div class="team-color-dot"></div>
      <div class="team-name">${escapeHtml(team.name)}</div>
      <div class="team-stats">
        <span class="team-score">${ICON_NOTE}${escapeHtml(team.score || 0)}</span>
        <span class="team-tokens">${ICON_TICKET}${escapeHtml(team.tokens || 0)}</span>
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
  
  // The team's colour: the cards are filled with it
  const teamColor = displayTeam.color || 'blue'; // Fallback to blue
  const displayColors = teamColors(teamColor, '#0B939C'); // Fallback to default accent
  const teamColorHex = displayColors.color;

  container.innerHTML = '';
  
  // Just render cards, no drop zones (they appear dynamically during drag)
  timelineCards.forEach((card) => {
    // My own placed-but-unrevealed card (active team, waiting for validation)
    const isMyCard = (teamId === currentTeamId) && !card.revealed;

    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    cardDiv.dataset.position = card.position;

    // This is a real timeline card, so it must NOT get the preview-card class.
    // Positions are counted against '.card:not(.preview-card)' on every device. Giving it
    // preview-card only on the active team's device made that device count one card fewer,
    // so the challenger's card was drawn one slot to the right there.
    if (isMyCard) {
      cardDiv.classList.add('own-unrevealed-card');
    }

    // The look comes from game.css, which reads the team's colour from the card
    applyTeamColors(cardDiv, displayColors);

    if (card.revealed) {
      // Revealed card - show year and info, filled with the team's colour
      cardDiv.innerHTML = `
      <div class="card-year">${escapeHtml(card.year)}</div>
      <div class="card-info"><span class="card-title">${escapeHtml(card.title)}</span><span class="card-artist">${escapeHtml(card.artist)}</span></div>
    `;
    } else {
      // Unrevealed card - ALWAYS show as blank until validated. The class only sets the
      // look: an outline in the team's colour for my own card (own-unrevealed-card above),
      // a white outline for another team's.
      cardDiv.classList.add('unrevealed');
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
    renderPreviewCard(previewCard, teamColorHex, currentTeamId);
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
      
      renderPreviewCard(challengingCard, challengingColorHex, challengingTeamId);
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

function renderPreviewCard(card, teamColorHex, ownerTeamId) {
  const container = document.getElementById('timeline');
  const position = card.position;

  // Only the team that owns this preview may move it:
  // pendingCard belongs to the active team, challengingCard to the challenging team.
  // (Previously the active team could also drag the challenger's card.)
  const isMyCard = ownerTeamId === teamId;
  
  const previewCard = document.createElement('div');
  previewCard.className = 'card preview-card';
  previewCard.dataset.position = position;
  previewCard.id = 'timelinePreviewCard';
  
  // IMPORTANT: Preview cards are ALWAYS blank until validated
  // Only show year/title/artist after lockInPlacement() -> validation -> revealed
  // game.css draws the outline in the owner's colour
  previewCard.style.setProperty('--team', teamColorHex);
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
  // Size and look are set in game.css (.card.blank-card)
  cardDiv.innerHTML = `
    <div class="card-blank-text">?</div>
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
    // The label with what it costs: one token. The class only sets the look (game.css).
    changeCardBtn.classList.add('utmana');
    changeCardBtn.innerHTML = `UTMANA <span class="btn-cost">${ICON_TICKET}1</span>`;
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
  changeCardBtn.classList.remove('utmana');
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
    // Find which position in timeline based on x,y coordinates
    // Position is based on actual index in DOM, not dataset.position
    const timeline = document.getElementById('timeline');
    const cards = timeline.querySelectorAll('.card:not(.preview-card):not(.dragging)');
    
    if (cards.length === 0) {
      return 0;
    }
    
    // Iterate through all cards to find where we are dropping (supports multi-row flex-wrap)
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      
      // Are we roughly on the same row? (Generous vertical margin of 60px for touch screens)
      const onSameRow = y >= rect.top - 60 && y <= rect.bottom + 60;
      
      if (onSameRow) {
        // If we are to the left of the card's center, insert before it
        const cardCenter = rect.left + rect.width / 2;
        if (x < cardCenter) {
          return i;
        }
      } else if (y < rect.top - 60) {
        // We are strictly above this row, meaning we should be inserted before this card
        // This handles dropping at the end of the previous row
        return i;
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
  
  // The marker's look is set in game.css (.dynamic-drop-indicator). It is as wide as it was
  // before, margins included, so the cards move apart by the same distance.
  const indicator = document.createElement('div');
  indicator.className = 'dynamic-drop-indicator';

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
// YEAR INFO (explanation and source for the year on a turned card)
// ============================================
// The text is read from verifiedTracks on each device, not from the game node, so the
// game state stays small. The helpers between the markers are run by an offline test.

// <year-info>
const YEAR_INFO_TRACK_ID = /^[A-Za-z0-9]{22}$/;

// Returns what to show under the song for a cache record, or null when there is nothing
// to show. A record whose year differs from the year on the card is not shown: its
// explanation would argue for another year than the one the players see.
function pickYearInfo(record, shownYear) {
  if (!record || typeof record !== 'object') return null;
  if (record.year == null || shownYear == null) return null;
  if (Number(record.year) !== Number(shownYear)) return null;

  const explanation = typeof record.explanation === 'string' ? record.explanation.trim() : '';

  let sourceUrl = null;
  let sourceHost = null;
  if (typeof record.sourceUrl === 'string') {
    try {
      const url = new URL(record.sourceUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        sourceUrl = url.href;
        sourceHost = url.hostname.replace(/^www\./, '');
      }
    } catch (error) {
      // Not a usable address: show the explanation without a link
    }
  }

  if (!explanation && !sourceUrl) return null;
  return { explanation, sourceUrl, sourceHost };
}

// Fills the element with the explanation and the source link. The text is set as text
// and the link through properties, so nothing from the database is parsed as HTML.
function fillYearInfo(element, info, doc) {
  element.textContent = '';
  if (!info) return;

  if (info.explanation) {
    const text = doc.createElement('div');
    text.className = 'validation-modal-song-explanation';
    text.textContent = info.explanation;
    element.appendChild(text);
  }

  if (info.sourceUrl) {
    const source = doc.createElement('div');
    source.className = 'validation-modal-song-source';
    source.appendChild(doc.createTextNode('Källa: '));
    const link = doc.createElement('a');
    link.href = info.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = info.sourceHost;
    source.appendChild(link);
    element.appendChild(source);
  }
}
// </year-info>

const yearInfoRequests = new Map(); // spotifyId -> promise of the cache record (or null)
const yearInfoRecords = new Map();  // spotifyId -> cache record (or null) once it is read

function loadYearInfo(spotifyId) {
  // Also keeps ids such as 'unknown' and characters Firebase forbids out of the path
  if (typeof spotifyId !== 'string' || !YEAR_INFO_TRACK_ID.test(spotifyId)) {
    return Promise.resolve(null);
  }

  if (!yearInfoRequests.has(spotifyId)) {
    const recordRef = window.firebaseRef(window.firebaseDb, `verifiedTracks/${spotifyId}`);
    const request = window.firebaseGet(recordRef)
      .then((snapshot) => {
        const record = snapshot.exists() ? snapshot.val() : null;
        yearInfoRecords.set(spotifyId, record);
        return record;
      })
      .catch((error) => {
        // Without the record the modal looks as it did before. Forget the request so
        // that the next render tries again.
        console.warn('[Game] Could not read year info:', error);
        yearInfoRequests.delete(spotifyId);
        return null;
      });
    yearInfoRequests.set(spotifyId, request);
  }

  return yearInfoRequests.get(spotifyId);
}

function showYearInfo(song) {
  const element = document.getElementById('validationYearInfo');
  if (!element) return;

  if (yearInfoRecords.has(song.spotifyId)) {
    fillYearInfo(element, pickYearInfo(yearInfoRecords.get(song.spotifyId), song.year), document);
    return;
  }

  loadYearInfo(song.spotifyId).then((record) => {
    // The modal is rebuilt on every game update and may be closed or show another song by now
    const shown = currentGameData && currentGameData.validationModal;
    const current = document.getElementById('validationYearInfo');
    if (!current || !shown || !shown.isVisible || !shown.song) return;
    if (shown.song.spotifyId !== song.spotifyId) return;
    fillYearInfo(current, pickYearInfo(record, shown.song.year), document);
  });
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
      titleText = `${escapeHtml(modal.activeTeamName)} HADE RÄTT!`;
      titleClass = 'correct';
      subtitleText = `${escapeHtml(modal.challengingTeamName)} förlorade utmaningen`;
    } else if (modal.result === 'challenging_won') {
      titleText = `${escapeHtml(modal.challengingTeamName)} VANN UTMANINGEN!`;
      titleClass = 'correct';
      subtitleText = `${escapeHtml(modal.activeTeamName)} placerade fel`;
    } else {
      // both_wrong
      titleText = `BÅDA LAGEN HADE FEL`;
      titleClass = 'wrong';
      subtitleText = `${escapeHtml(modal.activeTeamName)} och ${escapeHtml(modal.challengingTeamName)}`;
    }
  } else {
    // Normal validation (no challenge)
    if (modal.result === 'active_correct') {
      titleText = `${escapeHtml(modal.activeTeamName)} FICK KORTET!`;
      titleClass = 'correct';
      subtitleText = '';
    } else {
      titleText = `${escapeHtml(modal.activeTeamName)} PLACERADE FEL`;
      titleClass = 'wrong';
      subtitleText = '';
    }
  }
  
  // The song is shown as the card itself, in the colour of the team that gets it. When
  // nobody gets it the card is white.
  let cardTeam = null;
  if (modal.result === 'active_correct') {
    cardTeam = currentTeams[modal.activeTeamId];
  } else if (modal.result === 'challenging_won') {
    cardTeam = currentTeams[modal.challengingTeamId];
  }
  const cardColors = cardTeam ? teamColors(cardTeam.color, '#FFFFFF') : { color: '#ffffff', ink: '#0b0b0b' };

  // Build modal HTML: the card on the left, the result and the text about the year on the
  // right. The buttons sit outside the scrolling body, so they stay visible however long
  // the text above them is.
  let modalHTML = `
    <div class="validation-modal-overlay">
      <div class="validation-modal">
        <div class="validation-modal-body">
          <div class="validation-modal-card" style="--team: ${cardColors.color}; --ink: ${cardColors.ink};">
            <div class="card-year">${escapeHtml(modal.song.year)}</div>
            <div class="card-info"><span class="card-title">${escapeHtml(modal.song.title)}</span><span class="card-artist">${escapeHtml(modal.song.artist)}</span></div>
          </div>
          <div class="validation-modal-text">
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

  // validationYearInfo is filled by showYearInfo() below; it must be written without
  // whitespace inside so that it takes no room while it is empty
  modalHTML += `
            <div class="validation-modal-song-info" id="validationYearInfo"></div>
          </div>
        </div>

        <div class="validation-modal-buttons">
          <button id="reportTrackBtn" class="validation-modal-btn report-btn">
            Fel årtal?
          </button>
  `;
  
  // Show +TOKEN button only if canGiveToken and not already given
  if (modal.canGiveToken && !modal.tokenGiven) {
    modalHTML += `
      <button 
        class="validation-modal-btn token" 
        onclick="giveTokenToActiveTeam()"
        ${modal.isProcessing ? 'disabled' : ''}
      >
        ${ICON_TICKET}+ TOKEN
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
      NÄSTA LÅT
    </button>
  `;
  
  modalHTML += `
        </div>
      </div>
    </div>
  `;

  container.innerHTML = modalHTML;

  // Explanation and source for the year, under the song
  showYearInfo(modal.song);

  // Song data comes from the database. Passing it through a listener instead of an inline
  // onclick means quotes or backticks in a title can neither break the button nor run as code.
  const reportBtn = document.getElementById('reportTrackBtn');
  if (reportBtn) {
    const song = modal.song;
    reportBtn.addEventListener('click', () => {
      reportTrack(song.spotifyId, song.title, song.artist, song.year);
    });
  }

  console.log('[Game] Validation modal rendered');
}

// ============================================
// GAME OVER MODAL RENDER
// ============================================
function renderGameOverModal() {
  const container = document.getElementById('gameOverModalContainer');
  if (!container) return;
  
  if (currentGameData.phase !== 'gameOver') {
    container.innerHTML = '';
    return;
  }
  
  const teamName = (id) => (currentTeams[id] ? currentTeams[id].name : 'Okänt lag');

  // Who won. When the songs ran out several teams can share the lead; the database stores
  // their ids as a list, which can come back as an object. Each team is shown as a block in
  // its own colour (a white block for a team that is no longer in the game).
  const teamBlock = (id, label) => {
    const team = currentTeams[id];
    const colors = team ? teamColors(team.color, '#FFFFFF') : { color: '#ffffff', ink: '#0b0b0b' };
    return `<div class="game-over-team" style="--team: ${colors.color}; --ink: ${colors.ink};"><span class="game-over-label">${label}</span><span class="game-over-name">${escapeHtml(teamName(id))}</span></div>`;
  };

  const tiedIds = currentGameData.tiedTeams ? Object.values(currentGameData.tiedTeams) : [];
  const isTie = !currentGameData.winner && tiedIds.length > 1;
  const resultHTML = isTie
    ? tiedIds.map(id => teamBlock(id, 'Oavgjort')).join('')
    : teamBlock(currentGameData.winner, 'Vinnare');

  // Why the game ended, when it was not by reaching the points to win
  const reasonHTML = currentGameData.gameOverReason === 'outOfSongs'
    ? `<p class="game-over-reason">Låtarna tog slut – flest kort vinner</p>`
    : '';

  // Going on and starting over both take more songs than may be left
  const songsLeft = songsLeftFor(currentGameData, Object.keys(currentTeams).length);

  let modalHTML = `
    <div class="validation-modal-overlay">
      <div class="game-over-modal">
        <div class="game-over-kicker">Spel avslutat</div>
        ${reasonHTML}
        <div class="game-over-result${isTie ? ' tie' : ''}">${resultHTML}</div>
  `;

  if (isHost) {
    // The choice that goes on with the game is solid white and stands last, the others
    // are quieter
    modalHTML += `
      <div class="game-over-buttons">
        <button
          class="validation-modal-btn text-btn"
          onclick="window.location.href='/'"
        >
          Återgå till startsida
        </button>
    `;
    if (songsLeft.canRestart) {
      modalHTML += `
        <button
          class="validation-modal-btn outline two-line"
          onclick="restartGame()"
        >
          STARTA OM<small>samma inställningar</small>
        </button>
      `;
    }
    if (songsLeft.canContinue) {
      modalHTML += `
        <button
          class="validation-modal-btn solid"
          onclick="continuePlaying()"
        >
          FORTSÄTT SPELA
        </button>
      `;
    }
    modalHTML += `
      </div>
    `;
  } else {
    modalHTML += `
      <p class="game-over-wait">
        ${songsLeft.canContinue || songsLeft.canRestart ? 'Väntar på att host ska välja nästa steg...' : 'Spelet är slut.'}
      </p>
      <div class="game-over-buttons">
        <button
          class="validation-modal-btn outline"
          onclick="window.location.href='/'"
        >
          Lämna spelet
        </button>
      </div>
    `;
  }
  
  modalHTML += `
      </div>
    </div>
  `;
  
  container.innerHTML = modalHTML;
}

console.log('[Game] Render module loaded');
