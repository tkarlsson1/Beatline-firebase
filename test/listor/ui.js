// UI Module - Handles all rendering and user interactions
// Version 2.0 - Extended statistics display

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
 * Render extended source stats panel (NEW)
 */
function renderExtendedSourceStats(sourceStats, title, isGlobal = false) {
  if (!sourceStats) return '';
  
  const sources = [
    { key: 'Spotify', name: 'Spotify', icon: '🟢', color: '#1DB954' },
    { key: 'SpotifyOriginal', name: 'Spotify Original', icon: '🎯', color: '#1ed760' },
    { key: 'MusicBrainz', name: 'MusicBrainz', icon: '🎵', color: '#BA478F' },
    { key: 'LastFm', name: 'Last.fm', icon: '🔴', color: '#D51007' }
  ];
  
  const rows = sources
    .filter(source => sourceStats[source.key] && sourceStats[source.key].hadData > 0)
    .map(source => {
      const s = sourceStats[source.key];
      const total = s.hadData + s.noData;
      const coverage = total > 0 ? Math.round((s.hadData / total) * 100) : 0;
      const accuracy = s.hadData > 0 ? Math.round((s.agreedWithFinal / s.hadData) * 100) : 0;
      const selectionRate = s.hadData > 0 ? Math.round((s.selectedAsWinner / s.hadData) * 100) : 0;
      
      return `
        <div class="extended-source-row">
          <div class="extended-source-label">
            <span class="source-icon">${source.icon}</span>
            <span class="source-name">${source.name}</span>
          </div>
          <div class="extended-source-metrics">
            <div class="metric">
              <span class="metric-value">${coverage}%</span>
              <span class="metric-label">Täckning</span>
            </div>
            <div class="metric">
              <span class="metric-value">${accuracy}%</span>
              <span class="metric-label">Träffsäkerhet</span>
            </div>
            <div class="metric">
              <span class="metric-value">${selectionRate}%</span>
              <span class="metric-label">Valdes</span>
            </div>
            <div class="metric">
              <span class="metric-value ${s.avgDeviation > 2 ? 'metric-warning' : ''}">${s.avgDeviation || 0}</span>
              <span class="metric-label">Avg avvikelse</span>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
  
  if (!rows) return '';
  
  return `
    <div class="extended-stats-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Täckning = hade data, Träffsäkerhet = stämde med verifierat år</p>
      <div class="extended-source-stats">
        ${rows}
      </div>
    </div>
  `;
}

/**
 * Render conflict stats panel (NEW)
 */
function renderConflictStats(conflicts, title, isGlobal = false) {
  if (!conflicts || conflicts.totalWithMultipleSources === 0) return '';
  
  const total = conflicts.totalWithMultipleSources;
  const agreementRate = Math.round((conflicts.allAgreed / total) * 100);
  const majorityRate = Math.round((conflicts.twoVsOne / total) * 100);
  const splitRate = Math.round((conflicts.threeWaySplit / total) * 100);
  
  return `
    <div class="conflict-stats-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Hur ofta källorna var eniga (${total} låtar med flera källor)</p>
      <div class="conflict-metrics">
        <div class="conflict-metric">
          <div class="conflict-bar-container">
            <div class="conflict-bar conflict-agreed" style="width: ${agreementRate}%"></div>
          </div>
          <div class="conflict-label">
            <span class="conflict-icon">✅</span>
            <span>Alla eniga</span>
            <span class="conflict-value">${conflicts.allAgreed} (${agreementRate}%)</span>
          </div>
        </div>
        <div class="conflict-metric">
          <div class="conflict-bar-container">
            <div class="conflict-bar conflict-majority" style="width: ${majorityRate}%"></div>
          </div>
          <div class="conflict-label">
            <span class="conflict-icon">⚖️</span>
            <span>2 mot 1</span>
            <span class="conflict-value">${conflicts.twoVsOne} (${majorityRate}%)</span>
          </div>
        </div>
        <div class="conflict-metric">
          <div class="conflict-bar-container">
            <div class="conflict-bar conflict-split" style="width: ${splitRate}%"></div>
          </div>
          <div class="conflict-label">
            <span class="conflict-icon">❌</span>
            <span>Total oenighet</span>
            <span class="conflict-value">${conflicts.threeWaySplit} (${splitRate}%)</span>
          </div>
        </div>
        <div class="conflict-avg-spread">
          <span>Genomsnittlig årsspridning vid oenighet:</span>
          <strong>${conflicts.avgYearSpread || 0} år</strong>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render compilation stats panel (NEW)
 */
function renderCompilationStats(compilationStats, title, isGlobal = false) {
  if (!compilationStats || compilationStats.triggered === 0) return '';
  
  const triggered = compilationStats.triggered;
  const changeRate = Math.round((compilationStats.changedYear / triggered) * 100);
  const keepRate = Math.round((compilationStats.keptOriginal / triggered) * 100);
  
  // Confidence breakdown
  const confidenceBreakdown = Object.entries(compilationStats.byConfidence || {})
    .filter(([_, count]) => count > 0)
    .map(([level, count]) => {
      const percentage = Math.round((count / triggered) * 100);
      const icon = {
        'very_high': '🟢',
        'high': '🟡',
        'medium': '🟠',
        'low': '🔴',
        'none': '⚫'
      }[level] || '⚫';
      return `<span class="comp-confidence">${icon} ${level.replace('_', ' ')}: ${count} (${percentage}%)</span>`;
    })
    .join('');
  
  return `
    <div class="compilation-stats-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Hur ofta compilation-detection triggades och ledde till ändring</p>
      <div class="compilation-metrics">
        <div class="compilation-summary">
          <div class="comp-stat">
            <span class="comp-value">${triggered}</span>
            <span class="comp-label">Totalt triggade</span>
          </div>
          <div class="comp-stat">
            <span class="comp-value comp-changed">${compilationStats.changedYear}</span>
            <span class="comp-label">Ändrade år (${changeRate}%)</span>
          </div>
          <div class="comp-stat">
            <span class="comp-value comp-kept">${compilationStats.keptOriginal}</span>
            <span class="comp-label">Behöll original (${keepRate}%)</span>
          </div>
        </div>
        ${confidenceBreakdown ? `
          <div class="compilation-confidence-breakdown">
            <span class="breakdown-label">Fördelning per confidence:</span>
            ${confidenceBreakdown}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render source accuracy panel (UPDATED with new sections)
 */
function renderSourceAccuracyPanel(stats) {
  const total = stats.verified;
  if (total === 0) return '';
  
  const sources = [
    { name: 'Spotify Original', icon: '🎯', color: '#1DB954' },
    { name: 'MusicBrainz', icon: '🎵', color: '#BA478F' },
    { name: 'Last.fm', icon: '🔴', color: '#D51007' },
    { name: 'Spotify', icon: '🟢', color: '#1DB954' },
    { name: 'Custom', icon: '✏️', color: '#FFA500' }
  ];
  
  // Current playlist stats - source selection (original)
  const currentRows = sources
    .filter(source => stats.sourceAccuracy[source.name] > 0)
    .map(source => {
      const count = stats.sourceAccuracy[source.name];
      const percentage = Math.round((count / total) * 100);
      const barWidth = percentage;
      
      return `
        <div class="source-stat-row">
          <div class="source-stat-label">
            <span class="source-icon">${source.icon}</span>
            <span class="source-name">${source.name}</span>
          </div>
          <div class="source-stat-bar-container">
            <div class="source-stat-bar" style="width: ${barWidth}%; background-color: ${source.color}"></div>
          </div>
          <div class="source-stat-value">
            ${count} <span class="source-percentage">(${percentage}%)</span>
          </div>
        </div>
      `;
    })
    .join('');
  
  // Placeholder for global stats (will be loaded async)
  const globalSection = `
    <div class="source-stats-section" id="globalStatsSection">
      <div class="loading-stats">⏳ Laddar global statistik från Firebase...</div>
    </div>
  `;
  
  // Render confidence accuracy for current playlist
  const currentConfidenceHtml = renderConfidenceAccuracy(
    stats.confidenceAccuracy,
    `Confidence-träffsäkerhet (${total} verifierade)`,
    false
  );
  
  // NEW: Render extended source stats for current playlist
  const extendedSourceHtml = renderExtendedSourceStats(
    stats.sourceStats,
    `Källbeteende (${stats.total} låtar)`,
    false
  );
  
  // NEW: Render conflict stats for current playlist
  const conflictHtml = renderConflictStats(
    stats.conflicts,
    `Källkonflikter`,
    false
  );
  
  // NEW: Render compilation stats for current playlist
  const compilationHtml = renderCompilationStats(
    stats.compilationStats,
    `Compilation-detection`,
    false
  );
  
  // Load global stats asynchronously and update DOM
  if (window.statsManager) {
    window.statsManager.getGlobalStats().then(globalStats => {
      const globalStatsElement = document.getElementById('globalStatsSection');
      if (globalStatsElement && globalStats && globalStats.totalVerified > 0) {
        // Map Firebase keys to display names for rendering
        const firebaseKeyMap = {
          'SpotifyOriginal': 'Spotify Original',
          'LastFm': 'Last.fm',
          'Spotify': 'Spotify',
          'MusicBrainz': 'MusicBrainz',
          'Custom': 'Custom'
        };
        
        const globalRows = sources
          .map(source => {
            // Try both display name and Firebase key
            const displayName = source.name;
            const firebaseKey = Object.keys(firebaseKeyMap).find(k => firebaseKeyMap[k] === displayName);
            const count = globalStats.sourceAccuracy[firebaseKey] || globalStats.sourceAccuracy[displayName] || 0;
            
            return { source, count };
          })
          .filter(item => item.count > 0)
          .map(item => {
            const count = item.count;
            const percentage = Math.round((count / globalStats.totalVerified) * 100);
            const barWidth = percentage;
            
            return `
              <div class="source-stat-row">
                <div class="source-stat-label">
                  <span class="source-icon">${item.source.icon}</span>
                  <span class="source-name">${item.source.name}</span>
                </div>
                <div class="source-stat-bar-container">
                  <div class="source-stat-bar" style="width: ${barWidth}%; background-color: ${item.source.color}"></div>
                </div>
                <div class="source-stat-value">
                  ${count} <span class="source-percentage">(${percentage}%)</span>
                </div>
              </div>
            `;
          })
          .join('');
        
        // Render global confidence accuracy
        const globalConfidenceHtml = renderConfidenceAccuracy(
          globalStats.confidenceAccuracy,
          `Global confidence-träffsäkerhet (${globalStats.totalVerified} låtar)`,
          true
        );
        
        // NEW: Render global extended source stats
        const globalExtendedSourceHtml = renderExtendedSourceStats(
          globalStats.sourceStats,
          `Globalt källbeteende (${globalStats.totalTracks} låtar)`,
          true
        );
        
        // NEW: Render global conflict stats
        const globalConflictHtml = renderConflictStats(
          globalStats.conflicts,
          `Globala källkonflikter`,
          true
        );
        
        // NEW: Render global compilation stats
        const globalCompilationHtml = renderCompilationStats(
          globalStats.compilationStats,
          `Global compilation-detection`,
          true
        );
        
        globalStatsElement.innerHTML = `
          <h4>🌍 Global statistik (${globalStats.totalPlaylists} spellistor, ${globalStats.totalVerified} låtar)</h4>
          <p class="stats-description">Vilken källa valdes för verifierade låtar</p>
          <div class="source-stats">
            ${globalRows}
          </div>
          ${globalConfidenceHtml}
          ${globalExtendedSourceHtml}
          ${globalConflictHtml}
          ${globalCompilationHtml}
          <div class="global-stats-actions">
            <button class="btn-secondary btn-small" onclick="exportGlobalStats()">
              📊 Exportera global statistik
            </button>
            <button class="btn-secondary btn-small btn-danger" onclick="resetGlobalStats()">
              🗑️ Nollställ statistik
            </button>
          </div>
        `;
      } else if (globalStatsElement) {
        // No global stats yet
        globalStatsElement.innerHTML = `
          <div class="no-global-stats">
            <p>Ingen global statistik ännu. Exportera denna spellista för att börja samla statistik!</p>
          </div>
        `;
      }
    }).catch(error => {
      console.error('Failed to load global stats:', error);
      const globalStatsElement = document.getElementById('globalStatsSection');
      if (globalStatsElement) {
        globalStatsElement.innerHTML = `
          <div class="error-stats">
            ⚠️ Kunde inte ladda global statistik från Firebase
          </div>
        `;
      }
    });
  }
  
  return `
    <div class="source-accuracy-panel">
      <h3>📊 Källstatistik</h3>
      
      <div class="source-stats-section">
        <h4>📋 Denna spellista (${total} verifierade)</h4>
        <p class="source-accuracy-description">Visar vilken källa du valde för varje godkänd låt</p>
        <div class="source-stats">
          ${currentRows}
        </div>
      </div>
      
      ${currentConfidenceHtml}
      
      ${extendedSourceHtml}
      
      ${conflictHtml}
      
      ${compilationHtml}
      
      ${globalSection}
    </div>
  `;
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
      
      ${stats.verified > 0 ? renderSourceAccuracyPanel(stats) : ''}
      
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
    const years = new Set();
    
    // Add Spotify year option
    options.push(`<option value="${track.spotifyYear}">
      ${track.spotifyYear} (Spotify)
    </option>`);
    years.add(track.spotifyYear);
    
    // Add Spotify Original year if available (compilation search result)
    if (track.spotifyOriginalYear && !years.has(track.spotifyOriginalYear)) {
      const selected = track.validation?.bestYear === track.spotifyOriginalYear ? 'selected' : '';
      
      options.push(`<option value="${track.spotifyOriginalYear}" ${selected}>
        ${track.spotifyOriginalYear} (Spotify Original: ${track.spotifyOriginalAlbum})
      </option>`);
      years.add(track.spotifyOriginalYear);
    }
    
    // Add validation bestYear if available and different
    if (track.validation && track.validation.bestYear && !years.has(track.validation.bestYear)) {
      const sourcesText = track.validation.sources
        .filter(s => s.year === track.validation.bestYear)
        .map(s => s.name)
        .join('+');
      
      const selected = track.validation.confidence === 'very_high' || 
                       track.validation.confidence === 'high' ? 'selected' : '';
      
      options.push(`<option value="${track.validation.bestYear}" ${selected}>
        ${track.validation.bestYear} (${sourcesText} - ${track.validation.confidence})
      </option>`);
      years.add(track.validation.bestYear);
    }
    
    // Add earliestRecordingYear if different from above
    if (track.earliestRecordingYear && !years.has(track.earliestRecordingYear)) {
      options.push(`<option value="${track.earliestRecordingYear}">
        ${track.earliestRecordingYear} (MusicBrainz äldsta)
      </option>`);
      years.add(track.earliestRecordingYear);
    }
    
    // Add Last.fm year if different
    if (track.lastFmYear && !years.has(track.lastFmYear)) {
      options.push(`<option value="${track.lastFmYear}">
        ${track.lastFmYear} (Last.fm)
      </option>`);
      years.add(track.lastFmYear);
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
  
  // Flags display with sources info
  let flagsHtml = '';
  
  // Show Spotify original info if found (for compilations)
  if (track.spotifyOriginalData && track.spotifyOriginalData.found) {
    flagsHtml += `
      <div class="spotify-original-info">
        <strong>🎯 Spotify Original:</strong> 
        ${track.spotifyOriginalAlbum} (${track.spotifyOriginalYear})
        <br>
        <small>Funnen från ${track.spotifyOriginalData.alternativesCount} alternativ 
        (${track.spotifyOriginalData.confidence} confidence)</small>
      </div>
    `;
  }
  
  // Show validation sources first
  if (track.validation && track.validation.sources.length > 0) {
    const sourcesText = track.validation.sources
      .map(s => `${s.name}: ${s.year}`)
      .join(', ');
    
    flagsHtml += `
      <div class="validation-sources">
        <strong>Källor:</strong> ${sourcesText}
        <br>
        <strong>Confidence:</strong> 
        <span class="confidence-${track.validation.confidence}">
          ${track.validation.confidence.replace('_', ' ')}
        </span>
      </div>
    `;
  }
  
  // Show compilation analysis
  if (track.compilationAnalysis && track.compilationAnalysis.isCompilation) {
    flagsHtml += `
      <div class="compilation-info">
        <strong>Samlingsalbum:</strong> ${track.compilationAnalysis.confidence}
        <br>
        <small>${track.compilationAnalysis.reasons.slice(0, 2).join(', ')}</small>
      </div>
    `;
  }
  
  // Show flags
  if (track.flags.length > 0) {
    flagsHtml += `
      <ul class="flags-list">
        ${track.flags.map(flag => `
          <li class="flag flag-${flag.severity}">
            ${flag.message}
          </li>
        `).join('')}
      </ul>
    `;
  }
  
  if (!flagsHtml) {
    flagsHtml = '<span class="no-flags">-</span>';
  }
  
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
      const year = parseInt(newYear);
      updateTrackYearValue(spotifyId, year);
      
      // Update dropdown to show the custom year
      const select = document.getElementById(`year-${spotifyId}`);
      if (select) {
        // Check if this year already exists as an option
        const existingOption = Array.from(select.options).find(opt => 
          parseInt(opt.value) === year
        );
        
        if (existingOption) {
          // Just select the existing option
          select.value = year;
        } else {
          // Add new option for custom year (before "custom" option)
          const customOption = select.querySelector('option[value="custom"]');
          const newOption = document.createElement('option');
          newOption.value = year;
          newOption.textContent = `${year} (Anpassat)`;
          newOption.selected = true;
          select.insertBefore(newOption, customOption);
        }
      }
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
  
  if (!track) {
    console.error('Track not found:', spotifyId);
    return;
  }
  
  // Get selected year from dropdown (or use recommendedYear for green tracks)
  let selectedYear = track.recommendedYear;
  let chosenSource = 'Spotify'; // Default
  
  const select = document.getElementById(`year-${spotifyId}`);
  if (select) {
    selectedYear = parseInt(select.value);
    
    // Determine which source was chosen
    const selectedOption = select.options[select.selectedIndex];
    const optionText = selectedOption.textContent;
    
    if (optionText.includes('Spotify Original')) {
      chosenSource = 'Spotify Original';
    } else if (optionText.includes('MusicBrainz')) {
      chosenSource = 'MusicBrainz';
    } else if (optionText.includes('Last.fm')) {
      chosenSource = 'Last.fm';
    } else if (optionText.includes('Anpassat')) {
      chosenSource = 'Custom';
    } else if (optionText.includes('Spotify')) {
      chosenSource = 'Spotify';
    }
  }
  
  // Update track
  track.verifiedYear = selectedYear;
  track.verified = true;
  track.chosenSource = chosenSource;
  
  // Recalculate stats
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  // Re-render
  renderReviewPhase();
  
  showNotification(`✓ ${track.artist} - ${track.title} godkänd (${selectedYear})`, 'success');
}

/**
 * Remove track from list
 */
function removeTrackFromList(spotifyId) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  
  if (!track) {
    console.error('Track not found:', spotifyId);
    return;
  }
  
  if (!confirm(`Ta bort "${track.title}" från listan?`)) {
    return;
  }
  
  // Remove track
  currentState.tracks = window.validator.removeTrack(currentState.tracks, spotifyId);
  
  // Recalculate stats
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  // Re-render
  renderReviewPhase();
  
  showNotification(`✗ ${track.artist} - ${track.title} borttagen`, 'warning');
}

/**
 * Auto-approve all green tracks
 */
function autoApproveGreen() {
  const greenTracks = currentState.tracks.filter(t => t.status === 'green' && !t.verified);
  
  if (greenTracks.length === 0) {
    showNotification('Inga gröna låtar att godkänna', 'info');
    return;
  }
  
  // Auto-approve
  currentState.tracks = window.validator.autoApproveGreenTracks(currentState.tracks);
  
  // Set chosenSource based on recommendedYear source
  currentState.tracks.forEach(track => {
    if (track.verified && !track.chosenSource) {
      // Determine source based on which year was recommended
      if (track.validation && track.validation.bestYear) {
        const matchingSources = track.validation.sources.filter(
          s => s.year === track.verifiedYear
        );
        
        if (matchingSources.length > 0) {
          // Pick first matching source (highest weight)
          track.chosenSource = matchingSources[0].name;
        } else {
          track.chosenSource = 'Spotify';
        }
      } else {
        track.chosenSource = 'Spotify';
      }
    }
  });
  
  // Recalculate stats
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  
  // Re-render
  renderReviewPhase();
  
  showNotification(`✓ ${greenTracks.length} gröna låtar auto-godkända`, 'success');
}

/**
 * Play audio preview
 */
function playPreview(spotifyId, previewUrl) {
  // Stop any currently playing audio
  if (currentState.currentAudio) {
    currentState.currentAudio.pause();
    currentState.currentAudio = null;
  }
  
  // Play new preview
  const audio = new Audio(previewUrl);
  currentState.currentAudio = audio;
  
  audio.play().catch(err => {
    console.error('Failed to play preview:', err);
    showError('Kunde inte spela förhandslyssning');
  });
  
  // Auto-stop after 30 seconds
  setTimeout(() => {
    if (currentState.currentAudio === audio) {
      audio.pause();
      currentState.currentAudio = null;
    }
  }, 30000);
}

/**
 * Handle export button
 */
function handleExport() {
  // Check if all tracks are verified
  const validation = window.validator.validateReadyForExport(currentState.tracks);
  
  if (!validation.ready) {
    showError(validation.message);
    return;
  }
  
  // Show export modal
  showExportModal();
}

/**
 * Show export modal
 */
function showExportModal() {
  // Create source stats summary
  const sourceStatsHtml = renderSourceStatsForExport(currentState.stats);
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Exportera Verifierad Spellista</h2>
      <p>${currentState.tracks.length} verifierade låtar redo för export</p>
      
      ${sourceStatsHtml}
      
      <div class="export-options">
        <button class="btn-primary btn-large" onclick="exportJSON()">
          📄 Ladda ner JSON-fil
        </button>
        <button class="btn-primary btn-large" onclick="exportFirebase()">
          🔥 Spara till Firebase
        </button>
        <button class="btn-secondary btn-large" onclick="exportGameFormat()">
          🎮 Spelformat (manuell kopiering)
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
 * Render source stats summary for export modal
 */
function renderSourceStatsForExport(stats) {
  const total = stats.verified;
  if (total === 0) return '';
  
  const sources = [
    { name: 'Spotify Original', icon: '🎯' },
    { name: 'MusicBrainz', icon: '🎵' },
    { name: 'Last.fm', icon: '🔴' },
    { name: 'Spotify', icon: '🟢' },
    { name: 'Custom', icon: '✏️' }
  ];
  
  const stats_list = sources
    .filter(source => stats.sourceAccuracy[source.name] > 0)
    .map(source => {
      const count = stats.sourceAccuracy[source.name];
      const percentage = Math.round((count / total) * 100);
      return `<li>${source.icon} <strong>${source.name}:</strong> ${count} (${percentage}%)</li>`;
    })
    .join('');
  
  return `
    <div class="export-source-stats">
      <h3>📊 Källstatistik</h3>
      <ul>
        ${stats_list}
      </ul>
    </div>
  `;
}

/**
 * Render confidence accuracy section
 */
function renderConfidenceAccuracy(confidenceData, title, isGlobal = false) {
  if (!confidenceData) return '';
  
  const confidenceLevels = [
    { key: 'very_high', label: 'Very High', icon: '🟢', color: '#28a745' },
    { key: 'high', label: 'High', icon: '🟡', color: '#ffc107' },
    { key: 'medium', label: 'Medium', icon: '🟠', color: '#fd7e14' },
    { key: 'low', label: 'Low', icon: '🔴', color: '#dc3545' },
    { key: 'none', label: 'None', icon: '⚫', color: '#6c757d' }
  ];
  
  const rows = confidenceLevels
    .filter(level => confidenceData[level.key] && confidenceData[level.key].total > 0)
    .map(level => {
      const data = confidenceData[level.key];
      const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      const barWidth = accuracy;
      
      return `
        <div class="confidence-stat-row">
          <div class="confidence-stat-label">
            <span class="confidence-icon">${level.icon}</span>
            <span class="confidence-name">${level.label}</span>
          </div>
          <div class="confidence-stat-bar-container">
            <div class="confidence-stat-bar" style="width: ${barWidth}%; background-color: ${level.color}"></div>
          </div>
          <div class="confidence-stat-value">
            ${data.correct}/${data.total} <span class="confidence-percentage">(${accuracy}%)</span>
          </div>
        </div>
      `;
    })
    .join('');
  
  if (!rows) return '';
  
  return `
    <div class="confidence-accuracy-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="confidence-description">Visar hur ofta varje confidence-nivå hade rätt rekommendation</p>
      <div class="confidence-stats">
        ${rows}
      </div>
    </div>
  `;
}

/**
 * Export to JSON
 */
async function exportJSON() {
  const playlistData = window.validator.prepareForExport(
    currentState.playlist.name,
    currentState.playlist.spotifyUrl || '',
    currentState.tracks
  );
  
  window.validator.exportToJSON(playlistData);
  
  // Update global statistics
  if (window.statsManager) {
    await window.statsManager.updateGlobalStats(
      currentState.stats,
      currentState.tracks.filter(t => t.verified)
    );
  }
  
  showNotification('✅ JSON-fil nedladdad och statistik uppdaterad', 'success');
  closeExportModal();
  
  // Re-render to show updated global stats
  setTimeout(() => {
    renderReviewPhase();
  }, 500);
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
    
    // Update global statistics
    if (window.statsManager) {
      await window.statsManager.updateGlobalStats(
        currentState.stats,
        currentState.tracks.filter(t => t.verified)
      );
    }
    
    showNotification(`✅ Spellista sparad till Firebase: ${playlistId}`, 'success');
    closeExportModal();
    
    // Re-render to show updated global stats
    setTimeout(() => {
      renderReviewPhase();
    }, 500);
    
  } catch (error) {
    showError(`Misslyckades att spara till Firebase: ${error.message}`);
  }
}

/**
 * Export in game format (for manual copying to live database)
 */
function exportGameFormat() {
  try {
    window.validator.exportGameFormatJSON(
      currentState.playlist.name,
      currentState.tracks
    );
    
    showNotification('✅ Spelformat-JSON nedladdad - kopiera manuellt till standardLists/', 'success');
    closeExportModal();
    
  } catch (error) {
    showError(`Misslyckades att exportera spelformat: ${error.message}`);
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
 * Export global statistics
 */
async function exportGlobalStats() {
  if (window.statsManager) {
    await window.statsManager.exportGlobalStatsToJSON();
    showNotification('✅ Global statistik exporterad', 'success');
  }
}

/**
 * Reset global statistics
 */
async function resetGlobalStats() {
  if (window.statsManager) {
    const success = await window.statsManager.resetGlobalStats();
    if (success) {
      showNotification('✅ Global statistik nollställd', 'success');
      renderReviewPhase();
    }
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
window.exportGameFormat = exportGameFormat;
window.closeExportModal = closeExportModal;
window.exportGlobalStats = exportGlobalStats;
window.resetGlobalStats = resetGlobalStats;
window.showNotification = showNotification;
window.showError = showError;
