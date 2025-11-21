// UI Module - Handles all rendering and user interactions

// Current state
let currentState = {
  phase: 'input', // 'input', 'loading', 'validating', 'review', 'exporting'
  playlist: null,
  tracks: [],
  filter: 'all', // 'all', 'red', 'yellow', 'green', 'flagged'
  stats: null,
  currentAudio: null
};

/**
 * Initialize UI
 */
function initUI() {
  renderInputPhase();
  setupEventListeners();
}

/**
 * Setup global event listeners
 */
function setupEventListeners() {
  // Handle Enter key in URL input
  document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && currentState.phase === 'input') {
      const input = document.getElementById('playlistUrl');
      if (input && document.activeElement === input) {
        handleAnalyzeClick();
      }
    }
  });
}

/**
 * Phase 1: Input form
 */
function renderInputPhase() {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="input-phase">
      <div class="header">
        <h1>🎵 Playlist Validator</h1>
        <p>Verifiera årtal för Spotify-spellistor via MusicBrainz</p>
      </div>
      
      <div class="input-form">
        <label for="playlistUrl">Spotify Playlist URL:</label>
        <input 
          type="text" 
          id="playlistUrl" 
          placeholder="https://open.spotify.com/playlist/..."
          autofocus
        />
        <button id="analyzeBtn" class="btn-primary">
          Analysera Spellista
        </button>
      </div>
      
      <div class="help-text">
        <h3>Hur det fungerar:</h3>
        <ol>
          <li>Klistra in länk till Spotify-spellista</li>
          <li>Verktyget validerar alla låtar mot MusicBrainz</li>
          <li>Du granskar flaggade låtar manuellt</li>
          <li>Exportera verifierad spellista till JSON eller Firebase</li>
        </ol>
      </div>
    </div>
  `;
  
  // Attach event listener
  document.getElementById('analyzeBtn').onclick = handleAnalyzeClick;
}

/**
 * Handle analyze button click
 */
async function handleAnalyzeClick() {
  const input = document.getElementById('playlistUrl');
  const url = input.value.trim();
  
  if (!url) {
    showError('Ange en Spotify playlist URL');
    return;
  }
  
  if (!window.spotifyHelper.isValidUrl(url)) {
    showError('Ogiltig Spotify URL. Format: https://open.spotify.com/playlist/...');
    return;
  }
  
  // Start loading
  currentState.phase = 'loading';
  renderLoadingPhase('Hämtar spellista från Spotify...');
  
  try {
    // Fetch playlist
    const playlist = await window.spotifyHelper.fetchPlaylist(url);
    currentState.playlist = playlist;
    
    showNotification(`✅ Laddade ${playlist.totalTracks} låtar från "${playlist.name}"`, 'success');
    
    // Start validation
    currentState.phase = 'validating';
    await startValidation(playlist.tracks);
    
  } catch (error) {
    console.error('Failed to load playlist:', error);
    showError(`Misslyckades att ladda spellista: ${error.message}`);
    currentState.phase = 'input';
    renderInputPhase();
  }
}

/**
 * Phase 2: Loading
 */
function renderLoadingPhase(message) {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="loading-phase">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Phase 3: Validating with progress
 */
function renderValidatingPhase() {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="validating-phase">
      <h2>Validerar mot MusicBrainz...</h2>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="progress-text" id="progressText">0 / 0</div>
      </div>
      <div class="progress-message" id="progressMessage">Förbereder...</div>
      <p class="progress-note">⏱️ Rate limit: 1 request/sekund (MusicBrainz-krav)</p>
    </div>
  `;
}

/**
 * Update progress during validation
 */
function updateProgress(data) {
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  const message = document.getElementById('progressMessage');
  
  if (fill && text && message) {
    const percent = (data.current / data.total) * 100;
    fill.style.width = `${percent}%`;
    text.textContent = `${data.current} / ${data.total}`;
    message.textContent = data.message;
  }
}

/**
 * Start validation process
 */
async function startValidation(tracks) {
  renderValidatingPhase();
  
  try {
    // Validate all tracks via MusicBrainz
    const validatedTracks = await window.musicBrainz.validatePlaylist(
      tracks,
      updateProgress,
      null
    );
    
    // Check if validation had too many errors
    const errorCount = validatedTracks.filter(t => t.matchMethod === 'error').length;
    if (errorCount > tracks.length * 0.5) {
      throw new Error(`För många valideringsfel (${errorCount}/${tracks.length}). MusicBrainz kan vara nere eller otillgänglig.`);
    }
    
    // Analyze and flag tracks
    const analyzedTracks = window.validator.analyzeAndFlagTracks(validatedTracks);
    
    // Sort by status (red first)
    currentState.tracks = window.validator.sortTracksByStatus(analyzedTracks);
    currentState.stats = window.validator.calculatePlaylistStats(analyzedTracks);
    
    // Show warning if there were errors
    if (errorCount > 0) {
      showNotification(`⚠️ ${errorCount} låtar kunde inte valideras mot MusicBrainz`, 'warning');
    }
    
    // Move to review phase
    currentState.phase = 'review';
    renderReviewPhase();
    
  } catch (error) {
    console.error('Validation failed:', error);
    
    // User-friendly error messages
    let errorMessage = error.message;
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'MusicBrainz rate limit nådd. Vänta 1 minut och försök igen.';
    } else if (error.message.includes('network') || error.message.includes('Nätverksfel')) {
      errorMessage = 'Nätverksfel: Kontrollera din internetanslutning och försök igen.';
    } else if (error.message.includes('För många valideringsfel')) {
      errorMessage = error.message + ' Försök igen om en stund.';
    }
    
    showError(errorMessage);
    
    // Return to input phase
    currentState.phase = 'input';
    renderInputPhase();
  }
}

/**
 * Phase 4: Review phase with table
 */
function renderReviewPhase() {
  const container = document.getElementById('app');
  
  const stats = currentState.stats;
  const playlist = currentState.playlist;
  
  container.innerHTML = `
    <div class="review-phase">
      <div class="header">
        <h1>📋 ${escapeHtml(playlist.name)}</h1>
        <p class="playlist-info">${playlist.totalTracks} låtar från ${escapeHtml(playlist.owner)}</p>
      </div>
      
      <div class="stats-panel">
        <div class="stat-item stat-green">
          <div class="stat-value">${stats.green}</div>
          <div class="stat-label">✅ Inga problem</div>
        </div>
        <div class="stat-item stat-yellow">
          <div class="stat-value">${stats.yellow}</div>
          <div class="stat-label">⚠️ Bör granskas</div>
        </div>
        <div class="stat-item stat-red">
          <div class="stat-value">${stats.red}</div>
          <div class="stat-label">❌ Måste granskas</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.verified}</div>
          <div class="stat-label">✓ Verifierade</div>
        </div>
      </div>
      
      <div class="controls-panel">
        <div class="filter-controls">
          <label>Visa:</label>
          <button class="btn-filter ${currentState.filter === 'all' ? 'active' : ''}" 
                  onclick="setFilter('all')">
            Alla (${stats.total})
          </button>
          <button class="btn-filter ${currentState.filter === 'flagged' ? 'active' : ''}" 
                  onclick="setFilter('flagged')">
            Flaggade (${stats.yellow + stats.red})
          </button>
          <button class="btn-filter ${currentState.filter === 'red' ? 'active' : ''}" 
                  onclick="setFilter('red')">
            Röda (${stats.red})
          </button>
        </div>
        
        <div class="action-controls">
          <button class="btn-secondary" onclick="autoApproveGreen()">
            Auto-godkänn gröna (${stats.green - stats.verified})
          </button>
          <button class="btn-primary" onclick="handleExport()" ${stats.verified === stats.total ? '' : 'disabled'}>
            Exportera (${stats.verified}/${stats.total})
          </button>
        </div>
      </div>
      
      <div class="tracks-table-container">
        <table class="tracks-table" id="tracksTable">
          <thead>
            <tr>
              <th>Status</th>
              <th>Titel</th>
              <th>Artist</th>
              <th>Spotify År</th>
              <th>Original År</th>
              <th>Verifierat År</th>
              <th>Flaggor</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody id="tracksTableBody">
            <!-- Populated by renderTracksTable() -->
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  renderTracksTable();
}

/**
 * Render tracks table
 */
function renderTracksTable() {
  const tbody = document.getElementById('tracksTableBody');
  if (!tbody) return;
  
  const filteredTracks = window.validator.filterTracksByStatus(
    currentState.tracks,
    currentState.filter
  );
  
  if (filteredTracks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="no-tracks">
          Inga låtar matchar filtret
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = filteredTracks.map(track => renderTrackRow(track)).join('');
}

/**
 * Render single track row
 */
function renderTrackRow(track) {
  const statusIcon = {
    red: '❌',
    yellow: '⚠️',
    green: '✅'
  }[track.status];
  
  const statusClass = `track-${track.status}`;
  
  // Year input/select
  let yearControl;
  if (track.status === 'red' || track.status === 'yellow') {
    // Dropdown for tracks that need review
    const options = [];
    
    // Add Spotify year option
    options.push(`<option value="${track.spotifyYear}">
      ${track.spotifyYear} (Spotify)
    </option>`);
    
    // Add earliestRecordingYear if available and different
    if (track.earliestRecordingYear && track.earliestRecordingYear !== track.spotifyYear) {
      const selected = track.earliestRecordingYear < track.spotifyYear ? 'selected' : '';
      options.push(`<option value="${track.earliestRecordingYear}" ${selected}>
        ${track.earliestRecordingYear} (Original från samma artist)
      </option>`);
    }
    
    // Custom input option
    options.push(`<option value="custom">Anpassat...</option>`);
    
    yearControl = `
      <select id="year-${track.spotifyId}" 
              onchange="handleYearChange('${track.spotifyId}', this.value)"
              class="year-select">
        ${options.join('')}
      </select>
    `;
  } else {
    // Display only for green tracks
    const year = track.verifiedYear || track.recommendedYear;
    yearControl = `<span class="year-display">${year}</span>`;
  }
  
  // Flags display
  const flagsHtml = track.flags.length > 0 ? `
    <ul class="flags-list">
      ${track.flags.map(flag => `
        <li class="flag flag-${flag.severity}">
          ${flag.message}
        </li>
      `).join('')}
    </ul>
  ` : '<span class="no-flags">-</span>';
  
  // Action buttons
  const actions = track.verified ? `
    <span class="verified-badge">✓ Verifierad</span>
  ` : `
    <button class="btn-action btn-approve" 
            onclick="approveTrack('${track.spotifyId}')">
      ✓ Godkänn
    </button>
    <button class="btn-action btn-remove" 
            onclick="removeTrackFromList('${track.spotifyId}')">
      ✗ Ta bort
    </button>
  `;
  
  const previewBtn = track.previewUrl ? `
    <button class="btn-action btn-preview" 
            onclick="playPreview('${track.spotifyId}', '${escapeHtml(track.previewUrl)}')">
      🎵
    </button>
  ` : '';
  
  return `
    <tr class="${statusClass}" data-track-id="${track.spotifyId}">
      <td class="status-cell">${statusIcon}</td>
      <td class="title-cell">${escapeHtml(track.title)}</td>
      <td class="artist-cell">${escapeHtml(track.allArtists)}</td>
      <td class="year-cell">${track.spotifyYear}</td>
      <td class="year-cell">${track.earliestRecordingYear || '-'}</td>
      <td class="year-cell">${yearControl}</td>
      <td class="flags-cell">${flagsHtml}</td>
      <td class="actions-cell">
        ${actions}
        ${previewBtn}
      </td>
    </tr>
  `;
}

/**
 * Set filter
 */
function setFilter(filter) {
  currentState.filter = filter;
  renderReviewPhase();
}

/**
 * Handle year change in dropdown
 */
function handleYearChange(spotifyId, value) {
  if (value === 'custom') {
    const newYear = prompt('Ange korrekt årtal:');
    if (newYear && !isNaN(newYear)) {
      updateTrackYearValue(spotifyId, parseInt(newYear));
    } else {
      // Reset select to previous value
      const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
      const select = document.getElementById(`year-${spotifyId}`);
      if (select && track) {
        select.value = track.verifiedYear || track.recommendedYear;
      }
    }
  } else {
    updateTrackYearValue(spotifyId, parseInt(value));
  }
}

/**
 * Update track year value
 */
function updateTrackYearValue(spotifyId, year) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (track) {
    track.verifiedYear = year;
    // Don't auto-verify, wait for approve button
  }
}

/**
 * Approve track
 */
function approveTrack(spotifyId) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (!track) return;
  
  // Get year from select/display
  const yearElement = document.getElementById(`year-${spotifyId}`);
  const year = yearElement ? parseInt(yearElement.value) : track.recommendedYear;
  
  // Update track
  currentState.tracks = window.validator.updateTrackYear(
    currentState.tracks,
    spotifyId,
    year
  );
  
  // Update stats
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  // Re-render
  renderReviewPhase();
  
  showNotification('✅ Låt godkänd', 'success');
}

/**
 * Remove track from list
 */
function removeTrackFromList(spotifyId) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (!track) return;
  
  if (!confirm(`Ta bort "${track.title}" från spellistan?`)) {
    return;
  }
  
  currentState.tracks = window.validator.removeTrack(currentState.tracks, spotifyId);
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  renderReviewPhase();
  
  showNotification('🗑️ Låt borttagen', 'info');
}

/**
 * Auto-approve all green tracks
 */
function autoApproveGreen() {
  currentState.tracks = window.validator.autoApproveGreenTracks(currentState.tracks);
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  renderReviewPhase();
  
  showNotification('✅ Alla gröna låtar godkända', 'success');
}

/**
 * Play preview
 */
function playPreview(spotifyId, previewUrl) {
  // Stop current audio if playing
  if (currentState.currentAudio) {
    currentState.currentAudio.pause();
    currentState.currentAudio = null;
  }
  
  // Play new audio
  const audio = new Audio(previewUrl);
  audio.volume = 0.5;
  audio.play();
  
  currentState.currentAudio = audio;
  
  // Auto-stop after 30 seconds
  setTimeout(() => {
    if (currentState.currentAudio === audio) {
      audio.pause();
      currentState.currentAudio = null;
    }
  }, 30000);
}

/**
 * Handle export
 */
function handleExport() {
  const validation = window.validator.validateReadyForExport(currentState.tracks);
  
  if (!validation.ready) {
    showError(validation.message);
    return;
  }
  
  // Show export modal
  renderExportModal();
}

/**
 * Render export modal
 */
function renderExportModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Exportera Verifierad Spellista</h2>
      <p>${currentState.tracks.length} verifierade låtar redo för export</p>
      
      <div class="export-options">
        <button class="btn-primary btn-large" onclick="exportJSON()">
          📄 Ladda ner JSON-fil
        </button>
        <button class="btn-primary btn-large" onclick="exportFirebase()">
          🔥 Spara till Firebase
        </button>
      </div>
      
      <button class="btn-secondary" onclick="closeExportModal()">
        Avbryt
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
}

/**
 * Export to JSON
 */
function exportJSON() {
  const playlistData = window.validator.prepareForExport(
    currentState.playlist.name,
    currentState.playlist.spotifyUrl || '',
    currentState.tracks
  );
  
  window.validator.exportToJSON(playlistData);
  
  showNotification('✅ JSON-fil nedladdad', 'success');
  closeExportModal();
}

/**
 * Export to Firebase
 */
async function exportFirebase() {
  try {
    const playlistData = window.validator.prepareForExport(
      currentState.playlist.name,
      currentState.playlist.spotifyUrl || '',
      currentState.tracks
    );
    
    const playlistId = await window.validator.saveToFirebase(playlistData);
    
    showNotification(`✅ Spellista sparad till Firebase: ${playlistId}`, 'success');
    closeExportModal();
    
  } catch (error) {
    showError(`Misslyckades att spara till Firebase: ${error.message}`);
  }
}

/**
 * Close export modal
 */
function closeExportModal() {
  const modal = document.querySelector('.modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Show error notification
 */
function showError(message) {
  showNotification(message, 'error');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export functions to window
window.initUI = initUI;
window.setFilter = setFilter;
window.handleYearChange = handleYearChange;
window.approveTrack = approveTrack;
window.removeTrackFromList = removeTrackFromList;
window.autoApproveGreen = autoApproveGreen;
window.playPreview = playPreview;
window.handleExport = handleExport;
window.exportJSON = exportJSON;
window.exportFirebase = exportFirebase;
window.closeExportModal = closeExportModal;
window.showNotification = showNotification;
window.showError = showError;
