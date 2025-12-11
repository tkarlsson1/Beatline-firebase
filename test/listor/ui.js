// UI Module - Handles all rendering and user interactions
// Version 3.0 - Extended statistics display for ML training

// Current state
let currentState = {
  phase: 'input',
  playlist: null,
  tracks: [],
  filter: 'all',
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
        <input type="text" id="playlistUrl" placeholder="https://open.spotify.com/playlist/..." autofocus />
        <button id="analyzeBtn" class="btn-primary">Analysera Spellista</button>
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
  
  currentState.phase = 'loading';
  renderLoadingPhase('Hämtar spellista från Spotify...');
  
  try {
    const playlist = await window.spotifyHelper.fetchPlaylist(url);
    currentState.playlist = playlist;
    showNotification(`✅ Laddade ${playlist.totalTracks} låtar från "${playlist.name}"`, 'success');
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
    const validatedTracks = await window.musicBrainz.validatePlaylist(tracks, updateProgress, null);
    
    const errorCount = validatedTracks.filter(t => t.matchMethod === 'error').length;
    if (errorCount > tracks.length * 0.5) {
      throw new Error(`För många valideringsfel (${errorCount}/${tracks.length}). MusicBrainz kan vara nere.`);
    }
    
    const analyzedTracks = window.validator.analyzeAndFlagTracks(validatedTracks);
    currentState.tracks = window.validator.sortTracksByStatus(analyzedTracks);
    currentState.stats = window.validator.calculatePlaylistStats(analyzedTracks);
    
    if (errorCount > 0) {
      showNotification(`⚠️ ${errorCount} låtar kunde inte valideras mot MusicBrainz`, 'warning');
    }
    
    currentState.phase = 'review';
    renderReviewPhase();
  } catch (error) {
    console.error('Validation failed:', error);
    let errorMessage = error.message;
    if (error.message.includes('rate limit')) {
      errorMessage = 'MusicBrainz rate limit nådd. Vänta 1 minut och försök igen.';
    } else if (error.message.includes('network') || error.message.includes('Nätverksfel')) {
      errorMessage = 'Nätverksfel: Kontrollera din internetanslutning och försök igen.';
    }
    showError(errorMessage);
    currentState.phase = 'input';
    renderInputPhase();
  }
}

/**
 * Render year choice stats (NEW)
 */
function renderYearChoiceStats(yearChoiceStats, title, isGlobal = false) {
  if (!yearChoiceStats || yearChoiceStats.totalWithChoice === 0) return '';
  
  const total = yearChoiceStats.totalWithChoice;
  const oldestRate = Math.round((yearChoiceStats.choseOldest / total) * 100);
  const newerRate = Math.round((yearChoiceStats.choseNewer / total) * 100);
  
  return `
    <div class="year-choice-stats-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Hur ofta valdes äldsta tillgängliga år vs ett nyare år?</p>
      <div class="year-choice-metrics">
        <div class="year-choice-bars">
          <div class="year-choice-bar-row">
            <span class="yc-label">🕰️ Äldsta året</span>
            <div class="yc-bar-container">
              <div class="yc-bar yc-oldest" style="width: ${oldestRate}%"></div>
            </div>
            <span class="yc-value">${yearChoiceStats.choseOldest} (${oldestRate}%)</span>
          </div>
          <div class="year-choice-bar-row">
            <span class="yc-label">📅 Nyare år</span>
            <div class="yc-bar-container">
              <div class="yc-bar yc-newer" style="width: ${newerRate}%"></div>
            </div>
            <span class="yc-value">${yearChoiceStats.choseNewer} (${newerRate}%)</span>
          </div>
        </div>
        ${yearChoiceStats.choseNewer > 0 ? `
          <div class="yc-avg-diff">
            <span>Snittskillnad när nyare valdes:</span>
            <strong>${yearChoiceStats.avgYearDiffWhenNewer || 0} år</strong>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render recommendation accuracy stats (NEW)
 */
function renderRecommendationAccuracy(recommendationAccuracy, title, isGlobal = false) {
  if (!recommendationAccuracy) return '';
  
  // Find categories with data
  const hasData = (obj) => Object.values(obj).some(v => v.total > 0);
  
  if (!hasData(recommendationAccuracy.byMatchMethod) && 
      !hasData(recommendationAccuracy.byAlbumType) &&
      !hasData(recommendationAccuracy.byDecade)) {
    return '';
  }
  
  const renderCategory = (data, categoryTitle) => {
    const items = Object.entries(data)
      .filter(([_, v]) => v.total > 0)
      .map(([key, v]) => {
        const accuracy = v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0;
        return `
          <div class="rec-acc-row">
            <span class="rec-acc-label">${key}</span>
            <div class="rec-acc-bar-container">
              <div class="rec-acc-bar" style="width: ${accuracy}%; background: ${accuracy >= 90 ? '#28a745' : accuracy >= 70 ? '#ffc107' : '#dc3545'}"></div>
            </div>
            <span class="rec-acc-value">${v.correct}/${v.total} (${accuracy}%)</span>
          </div>
        `;
      })
      .join('');
    
    if (!items) return '';
    return `
      <div class="rec-acc-category">
        <h5>${categoryTitle}</h5>
        ${items}
      </div>
    `;
  };
  
  return `
    <div class="recommendation-accuracy-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Hur ofta var rekommendationen rätt per scenario?</p>
      <div class="rec-acc-grid">
        ${renderCategory(recommendationAccuracy.byMatchMethod, 'Per matchmetod')}
        ${renderCategory(recommendationAccuracy.byAlbumType, 'Per albumtyp')}
        ${renderCategory(recommendationAccuracy.bySourceCount, 'Per antal källor')}
        ${renderCategory(recommendationAccuracy.byDecade, 'Per årtionde')}
      </div>
    </div>
  `;
}

/**
 * Render override stats (NEW)
 */
function renderOverrideStats(overrideStats, title, isGlobal = false) {
  if (!overrideStats) return '';
  
  const total = overrideStats.keptDefault + overrideStats.changedSelection;
  if (total === 0) return '';
  
  const defaultRate = Math.round((overrideStats.keptDefault / total) * 100);
  const overrideRate = Math.round((overrideStats.changedSelection / total) * 100);
  
  return `
    <div class="override-stats-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Hur ofta behövdes manuell korrigering?</p>
      <div class="override-metrics">
        <div class="override-summary">
          <div class="override-stat">
            <span class="override-value override-kept">${defaultRate}%</span>
            <span class="override-label">Behöll default (${overrideStats.keptDefault})</span>
          </div>
          <div class="override-stat">
            <span class="override-value override-changed">${overrideRate}%</span>
            <span class="override-label">Ändrade (${overrideStats.changedSelection})</span>
          </div>
        </div>
        ${overrideStats.changedSelection > 0 ? `
          <div class="override-reasons">
            <span class="reasons-title">När ändring gjordes:</span>
            <div class="reasons-list">
              <span>🕰️ Äldre år: ${overrideStats.overrideReasons.olderYear}</span>
              <span>📅 Nyare år: ${overrideStats.overrideReasons.newerYear}</span>
              <span>✏️ Manuellt: ${overrideStats.overrideReasons.customYear}</span>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render flag accuracy stats (NEW)
 */
function renderFlagAccuracy(flagAccuracy, title, isGlobal = false) {
  if (!flagAccuracy) return '';
  
  const items = Object.entries(flagAccuracy)
    .filter(([_, v]) => v.total > 0)
    .map(([flagType, v]) => {
      const accuracy = v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0;
      const icon = {
        'compilation': '📀',
        'compilation_resolved': '✅',
        'year_conflict': '⚠️',
        'multiple_artists': '👥',
        'remix_remaster': '🔄',
        'large_year_diff': '📊',
        'no_validation': '❓',
        'critical_compilation': '🔴'
      }[flagType] || '🏷️';
      
      return { flagType, icon, accuracy, correct: v.correct, total: v.total };
    })
    .sort((a, b) => a.accuracy - b.accuracy); // Worst accuracy first
  
  if (items.length === 0) return '';
  
  return `
    <div class="flag-accuracy-section">
      <h4>${isGlobal ? '🌍' : '📋'} ${title}</h4>
      <p class="stats-description">Rekommendationens träffsäkerhet per flaggtyp (låg = problem)</p>
      <div class="flag-accuracy-list">
        ${items.map(item => `
          <div class="flag-acc-row">
            <span class="flag-acc-label">${item.icon} ${item.flagType.replace(/_/g, ' ')}</span>
            <div class="flag-acc-bar-container">
              <div class="flag-acc-bar" style="width: ${item.accuracy}%; background: ${item.accuracy >= 90 ? '#28a745' : item.accuracy >= 70 ? '#ffc107' : '#dc3545'}"></div>
            </div>
            <span class="flag-acc-value">${item.correct}/${item.total} (${item.accuracy}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render extended source stats panel
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
      <div class="extended-source-stats">${rows}</div>
    </div>
  `;
}

/**
 * Render conflict stats panel
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
 * Render compilation stats panel
 */
function renderCompilationStats(compilationStats, title, isGlobal = false) {
  if (!compilationStats || compilationStats.triggered === 0) return '';
  
  const triggered = compilationStats.triggered;
  const changeRate = Math.round((compilationStats.changedYear / triggered) * 100);
  const keepRate = Math.round((compilationStats.keptOriginal / triggered) * 100);
  
  const confidenceBreakdown = Object.entries(compilationStats.byConfidence || {})
    .filter(([_, count]) => count > 0)
    .map(([level, count]) => {
      const percentage = Math.round((count / triggered) * 100);
      const icon = { 'very_high': '🟢', 'high': '🟡', 'medium': '🟠', 'low': '🔴', 'none': '⚫' }[level] || '⚫';
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
 * Render source accuracy panel (main panel)
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
  
  const currentRows = sources
    .filter(source => stats.sourceAccuracy[source.name] > 0)
    .map(source => {
      const count = stats.sourceAccuracy[source.name];
      const percentage = Math.round((count / total) * 100);
      return `
        <div class="source-stat-row">
          <div class="source-stat-label">
            <span class="source-icon">${source.icon}</span>
            <span class="source-name">${source.name}</span>
          </div>
          <div class="source-stat-bar-container">
            <div class="source-stat-bar" style="width: ${percentage}%; background-color: ${source.color}"></div>
          </div>
          <div class="source-stat-value">${count} <span class="source-percentage">(${percentage}%)</span></div>
        </div>
      `;
    })
    .join('');
  
  const globalSection = `<div class="source-stats-section" id="globalStatsSection">
    <div class="loading-stats">⏳ Laddar global statistik från Firebase...</div>
  </div>`;
  
  const currentConfidenceHtml = renderConfidenceAccuracy(stats.confidenceAccuracy, `Confidence-träffsäkerhet (${total} verifierade)`, false);
  const extendedSourceHtml = renderExtendedSourceStats(stats.sourceStats, `Källbeteende (${stats.total} låtar)`, false);
  const conflictHtml = renderConflictStats(stats.conflicts, `Källkonflikter`, false);
  const compilationHtml = renderCompilationStats(stats.compilationStats, `Compilation-detection`, false);
  const yearChoiceHtml = renderYearChoiceStats(stats.yearChoiceStats, `Årtalsval`, false);
  const recAccHtml = renderRecommendationAccuracy(stats.recommendationAccuracy, `Rekommendationsträffsäkerhet`, false);
  const overrideHtml = renderOverrideStats(stats.overrideStats, `Override-statistik`, false);
  const flagAccHtml = renderFlagAccuracy(stats.flagAccuracy, `Flagg-korrelation`, false);
  
  // Load global stats asynchronously
  if (window.statsManager) {
    window.statsManager.getGlobalStats().then(globalStats => {
      const globalStatsElement = document.getElementById('globalStatsSection');
      if (globalStatsElement && globalStats && globalStats.totalVerified > 0) {
        const firebaseKeyMap = {
          'SpotifyOriginal': 'Spotify Original', 'LastFm': 'Last.fm',
          'Spotify': 'Spotify', 'MusicBrainz': 'MusicBrainz', 'Custom': 'Custom'
        };
        
        const globalRows = sources
          .map(source => {
            const displayName = source.name;
            const firebaseKey = Object.keys(firebaseKeyMap).find(k => firebaseKeyMap[k] === displayName);
            const count = globalStats.sourceAccuracy[firebaseKey] || globalStats.sourceAccuracy[displayName] || 0;
            return { source, count };
          })
          .filter(item => item.count > 0)
          .map(item => {
            const percentage = Math.round((item.count / globalStats.totalVerified) * 100);
            return `
              <div class="source-stat-row">
                <div class="source-stat-label">
                  <span class="source-icon">${item.source.icon}</span>
                  <span class="source-name">${item.source.name}</span>
                </div>
                <div class="source-stat-bar-container">
                  <div class="source-stat-bar" style="width: ${percentage}%; background-color: ${item.source.color}"></div>
                </div>
                <div class="source-stat-value">${item.count} <span class="source-percentage">(${percentage}%)</span></div>
              </div>
            `;
          })
          .join('');
        
        const globalConfidenceHtml = renderConfidenceAccuracy(globalStats.confidenceAccuracy, `Global confidence-träffsäkerhet (${globalStats.totalVerified} låtar)`, true);
        const globalExtendedSourceHtml = renderExtendedSourceStats(globalStats.sourceStats, `Globalt källbeteende (${globalStats.totalTracks} låtar)`, true);
        const globalConflictHtml = renderConflictStats(globalStats.conflicts, `Globala källkonflikter`, true);
        const globalCompilationHtml = renderCompilationStats(globalStats.compilationStats, `Global compilation-detection`, true);
        const globalYearChoiceHtml = renderYearChoiceStats(globalStats.yearChoiceStats, `Globalt årtalsval`, true);
        const globalRecAccHtml = renderRecommendationAccuracy(globalStats.recommendationAccuracy, `Global rekommendationsträffsäkerhet`, true);
        const globalOverrideHtml = renderOverrideStats(globalStats.overrideStats, `Global override-statistik`, true);
        const globalFlagAccHtml = renderFlagAccuracy(globalStats.flagAccuracy, `Global flagg-korrelation`, true);
        
        globalStatsElement.innerHTML = `
          <h4>🌍 Global statistik (${globalStats.totalPlaylists} spellistor, ${globalStats.totalVerified} låtar)</h4>
          <p class="stats-description">Vilken källa valdes för verifierade låtar</p>
          <div class="source-stats">${globalRows}</div>
          ${globalConfidenceHtml}
          ${globalExtendedSourceHtml}
          ${globalConflictHtml}
          ${globalCompilationHtml}
          ${globalYearChoiceHtml}
          ${globalRecAccHtml}
          ${globalOverrideHtml}
          ${globalFlagAccHtml}
          <div class="global-stats-actions">
            <button class="btn-secondary btn-small" onclick="exportGlobalStats()">📊 Exportera global statistik</button>
            <button class="btn-secondary btn-small btn-danger" onclick="resetGlobalStats()">🗑️ Nollställ statistik</button>
          </div>
        `;
      } else if (globalStatsElement) {
        globalStatsElement.innerHTML = `<div class="no-global-stats"><p>Ingen global statistik ännu. Exportera för att börja samla!</p></div>`;
      }
    }).catch(error => {
      console.error('Failed to load global stats:', error);
      const el = document.getElementById('globalStatsSection');
      if (el) el.innerHTML = `<div class="error-stats">⚠️ Kunde inte ladda global statistik</div>`;
    });
  }
  
  return `
    <div class="source-accuracy-panel">
      <h3>📊 Källstatistik</h3>
      <div class="source-stats-section">
        <h4>📋 Denna spellista (${total} verifierade)</h4>
        <p class="source-accuracy-description">Visar vilken källa du valde för varje godkänd låt</p>
        <div class="source-stats">${currentRows}</div>
      </div>
      ${currentConfidenceHtml}
      ${extendedSourceHtml}
      ${conflictHtml}
      ${compilationHtml}
      ${yearChoiceHtml}
      ${recAccHtml}
      ${overrideHtml}
      ${flagAccHtml}
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
        <div class="stat-item stat-green"><div class="stat-value">${stats.green}</div><div class="stat-label">✅ Inga problem</div></div>
        <div class="stat-item stat-yellow"><div class="stat-value">${stats.yellow}</div><div class="stat-label">⚠️ Bör granskas</div></div>
        <div class="stat-item stat-red"><div class="stat-value">${stats.red}</div><div class="stat-label">❌ Måste granskas</div></div>
        <div class="stat-item"><div class="stat-value">${stats.verified}</div><div class="stat-label">✓ Verifierade</div></div>
      </div>
      
      ${stats.verified > 0 ? renderSourceAccuracyPanel(stats) : ''}
      
      <div class="controls-panel">
        <div class="filter-controls">
          <label>Visa:</label>
          <button class="btn-filter ${currentState.filter === 'all' ? 'active' : ''}" onclick="setFilter('all')">Alla (${stats.total})</button>
          <button class="btn-filter ${currentState.filter === 'flagged' ? 'active' : ''}" onclick="setFilter('flagged')">Flaggade (${stats.yellow + stats.red})</button>
          <button class="btn-filter ${currentState.filter === 'red' ? 'active' : ''}" onclick="setFilter('red')">Röda (${stats.red})</button>
        </div>
        <div class="action-controls">
          <button class="btn-secondary" onclick="autoApproveGreen()">Auto-godkänn gröna (${stats.green - stats.verified})</button>
          <button class="btn-primary" onclick="handleExport()" ${stats.verified === stats.total ? '' : 'disabled'}>Exportera (${stats.verified}/${stats.total})</button>
        </div>
      </div>
      
      <div class="tracks-table-container">
        <table class="tracks-table" id="tracksTable">
          <thead>
            <tr><th>Status</th><th>Titel</th><th>Artist</th><th>Spotify År</th><th>Original År</th><th>Verifierat År</th><th>Flaggor</th><th>Åtgärder</th></tr>
          </thead>
          <tbody id="tracksTableBody"></tbody>
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
  
  const filteredTracks = window.validator.filterTracksByStatus(currentState.tracks, currentState.filter);
  
  if (filteredTracks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="no-tracks">Inga låtar matchar filtret</td></tr>`;
    return;
  }
  
  tbody.innerHTML = filteredTracks.map(track => renderTrackRow(track)).join('');
}

/**
 * Render single track row
 */
function renderTrackRow(track) {
  const statusIcon = { red: '❌', yellow: '⚠️', green: '✅' }[track.status];
  const statusClass = `track-${track.status}`;
  
  let yearControl;
  if (track.status === 'red' || track.status === 'yellow') {
    const options = [];
    const years = new Set();
    
    options.push(`<option value="${track.spotifyYear}">${track.spotifyYear} (Spotify)</option>`);
    years.add(track.spotifyYear);
    
    if (track.spotifyOriginalYear && !years.has(track.spotifyOriginalYear)) {
      const selected = track.validation?.bestYear === track.spotifyOriginalYear ? 'selected' : '';
      options.push(`<option value="${track.spotifyOriginalYear}" ${selected}>${track.spotifyOriginalYear} (Spotify Original: ${track.spotifyOriginalAlbum})</option>`);
      years.add(track.spotifyOriginalYear);
    }
    
    if (track.validation && track.validation.bestYear && !years.has(track.validation.bestYear)) {
      const sourcesText = track.validation.sources.filter(s => s.year === track.validation.bestYear).map(s => s.name).join('+');
      const selected = track.validation.confidence === 'very_high' || track.validation.confidence === 'high' ? 'selected' : '';
      options.push(`<option value="${track.validation.bestYear}" ${selected}>${track.validation.bestYear} (${sourcesText} - ${track.validation.confidence})</option>`);
      years.add(track.validation.bestYear);
    }
    
    if (track.earliestRecordingYear && !years.has(track.earliestRecordingYear)) {
      options.push(`<option value="${track.earliestRecordingYear}">${track.earliestRecordingYear} (MusicBrainz äldsta)</option>`);
      years.add(track.earliestRecordingYear);
    }
    
    if (track.lastFmYear && !years.has(track.lastFmYear)) {
      options.push(`<option value="${track.lastFmYear}">${track.lastFmYear} (Last.fm)</option>`);
      years.add(track.lastFmYear);
    }
    
    options.push(`<option value="custom">Anpassat...</option>`);
    
    yearControl = `<select id="year-${track.spotifyId}" onchange="handleYearChange('${track.spotifyId}', this.value)" class="year-select">${options.join('')}</select>`;
  } else {
    const year = track.verifiedYear || track.recommendedYear;
    yearControl = `<span class="year-display">${year}</span>`;
  }
  
  let flagsHtml = '';
  
  if (track.spotifyOriginalData && track.spotifyOriginalData.found) {
    flagsHtml += `<div class="spotify-original-info"><strong>🎯 Spotify Original:</strong> ${track.spotifyOriginalAlbum} (${track.spotifyOriginalYear})<br><small>Funnen från ${track.spotifyOriginalData.alternativesCount} alternativ (${track.spotifyOriginalData.confidence} confidence)</small></div>`;
  }
  
  if (track.validation && track.validation.sources.length > 0) {
    const sourcesText = track.validation.sources.map(s => `${s.name}: ${s.year}`).join(', ');
    flagsHtml += `<div class="validation-sources"><strong>Källor:</strong> ${sourcesText}<br><strong>Confidence:</strong> <span class="confidence-${track.validation.confidence}">${track.validation.confidence.replace('_', ' ')}</span></div>`;
  }
  
  if (track.compilationAnalysis && track.compilationAnalysis.isCompilation) {
    flagsHtml += `<div class="compilation-info"><strong>Samlingsalbum:</strong> ${track.compilationAnalysis.confidence}<br><small>${track.compilationAnalysis.reasons.slice(0, 2).join(', ')}</small></div>`;
  }
  
  if (track.flags.length > 0) {
    flagsHtml += `<ul class="flags-list">${track.flags.map(flag => `<li class="flag flag-${flag.severity}">${flag.message}</li>`).join('')}</ul>`;
  }
  
  if (!flagsHtml) flagsHtml = '<span class="no-flags">-</span>';
  
  const actions = track.verified 
    ? `<span class="verified-badge">✓ Verifierad</span>`
    : `<button class="btn-action btn-approve" onclick="approveTrack('${track.spotifyId}')">✓ Godkänn</button><button class="btn-action btn-remove" onclick="removeTrackFromList('${track.spotifyId}')">✗ Ta bort</button>`;
  
  const previewBtn = track.previewUrl ? `<button class="btn-action btn-preview" onclick="playPreview('${track.spotifyId}', '${escapeHtml(track.previewUrl)}')">🎵</button>` : '';
  
  return `
    <tr class="${statusClass}" data-track-id="${track.spotifyId}">
      <td class="status-cell">${statusIcon}</td>
      <td class="title-cell">${escapeHtml(track.title)}</td>
      <td class="artist-cell">${escapeHtml(track.allArtists)}</td>
      <td class="year-cell">${track.spotifyYear}</td>
      <td class="year-cell">${track.earliestRecordingYear || '-'}</td>
      <td class="year-cell">${yearControl}</td>
      <td class="flags-cell">${flagsHtml}</td>
      <td class="actions-cell">${actions}${previewBtn}</td>
    </tr>
  `;
}

function setFilter(filter) { currentState.filter = filter; renderReviewPhase(); }

function handleYearChange(spotifyId, value) {
  if (value === 'custom') {
    const newYear = prompt('Ange korrekt årtal:');
    if (newYear && !isNaN(newYear)) {
      const year = parseInt(newYear);
      updateTrackYearValue(spotifyId, year);
      const select = document.getElementById(`year-${spotifyId}`);
      if (select) {
        const existingOption = Array.from(select.options).find(opt => parseInt(opt.value) === year);
        if (existingOption) {
          select.value = year;
        } else {
          const customOption = select.querySelector('option[value="custom"]');
          const newOption = document.createElement('option');
          newOption.value = year;
          newOption.textContent = `${year} (Anpassat)`;
          newOption.selected = true;
          select.insertBefore(newOption, customOption);
        }
      }
    } else {
      const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
      const select = document.getElementById(`year-${spotifyId}`);
      if (select && track) select.value = track.verifiedYear || track.recommendedYear;
    }
  } else {
    updateTrackYearValue(spotifyId, parseInt(value));
  }
}

function updateTrackYearValue(spotifyId, year) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (track) track.verifiedYear = year;
}

function approveTrack(spotifyId) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (!track) return;
  
  let selectedYear = track.recommendedYear;
  let chosenSource = 'Spotify';
  
  const select = document.getElementById(`year-${spotifyId}`);
  if (select) {
    selectedYear = parseInt(select.value);
    const optionText = select.options[select.selectedIndex].textContent;
    if (optionText.includes('Spotify Original')) chosenSource = 'Spotify Original';
    else if (optionText.includes('MusicBrainz')) chosenSource = 'MusicBrainz';
    else if (optionText.includes('Last.fm')) chosenSource = 'Last.fm';
    else if (optionText.includes('Anpassat')) chosenSource = 'Custom';
    else if (optionText.includes('Spotify')) chosenSource = 'Spotify';
  }
  
  track.verifiedYear = selectedYear;
  track.verified = true;
  track.chosenSource = chosenSource;
  
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  renderReviewPhase();
  showNotification(`✓ ${track.artist} - ${track.title} godkänd (${selectedYear})`, 'success');
}

function removeTrackFromList(spotifyId) {
  const track = currentState.tracks.find(t => t.spotifyId === spotifyId);
  if (!track || !confirm(`Ta bort "${track.title}" från listan?`)) return;
  
  currentState.tracks = window.validator.removeTrack(currentState.tracks, spotifyId);
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  renderReviewPhase();
  showNotification(`✗ ${track.artist} - ${track.title} borttagen`, 'warning');
}

function autoApproveGreen() {
  const greenTracks = currentState.tracks.filter(t => t.status === 'green' && !t.verified);
  if (greenTracks.length === 0) { showNotification('Inga gröna låtar att godkänna', 'info'); return; }
  
  currentState.tracks = window.validator.autoApproveGreenTracks(currentState.tracks);
  
  currentState.tracks.forEach(track => {
    if (track.verified && !track.chosenSource) {
      if (track.validation && track.validation.bestYear) {
        const matchingSources = track.validation.sources.filter(s => s.year === track.verifiedYear);
        track.chosenSource = matchingSources.length > 0 ? matchingSources[0].name : 'Spotify';
      } else {
        track.chosenSource = 'Spotify';
      }
    }
  });
  
  currentState.stats = window.validator.calculatePlaylistStats(currentState.tracks);
  renderReviewPhase();
  showNotification(`✓ ${greenTracks.length} gröna låtar auto-godkända`, 'success');
}

function playPreview(spotifyId, previewUrl) {
  if (currentState.currentAudio) { currentState.currentAudio.pause(); currentState.currentAudio = null; }
  const audio = new Audio(previewUrl);
  currentState.currentAudio = audio;
  audio.play().catch(err => { console.error('Failed to play:', err); showError('Kunde inte spela förhandslyssning'); });
  setTimeout(() => { if (currentState.currentAudio === audio) { audio.pause(); currentState.currentAudio = null; } }, 30000);
}

function handleExport() {
  const validation = window.validator.validateReadyForExport(currentState.tracks);
  if (!validation.ready) { showError(validation.message); return; }
  showExportModal();
}

function showExportModal() {
  const sourceStatsHtml = renderSourceStatsForExport(currentState.stats);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Exportera Verifierad Spellista</h2>
      <p>${currentState.tracks.length} verifierade låtar redo för export</p>
      ${sourceStatsHtml}
      <div class="export-options">
        <button class="btn-primary btn-large" onclick="exportJSON()">📄 Ladda ner JSON-fil</button>
        <button class="btn-primary btn-large" onclick="exportFirebase()">🔥 Spara till Firebase</button>
        <button class="btn-secondary btn-large" onclick="exportGameFormat()">🎮 Spelformat (manuell kopiering)</button>
      </div>
      <button class="btn-secondary" onclick="closeExportModal()">Avbryt</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function renderSourceStatsForExport(stats) {
  const total = stats.verified;
  if (total === 0) return '';
  const sources = [
    { name: 'Spotify Original', icon: '🎯' }, { name: 'MusicBrainz', icon: '🎵' },
    { name: 'Last.fm', icon: '🔴' }, { name: 'Spotify', icon: '🟢' }, { name: 'Custom', icon: '✏️' }
  ];
  const list = sources.filter(s => stats.sourceAccuracy[s.name] > 0)
    .map(s => `<li>${s.icon} <strong>${s.name}:</strong> ${stats.sourceAccuracy[s.name]} (${Math.round((stats.sourceAccuracy[s.name] / total) * 100)}%)</li>`)
    .join('');
  return `<div class="export-source-stats"><h3>📊 Källstatistik</h3><ul>${list}</ul></div>`;
}

function renderConfidenceAccuracy(confidenceData, title, isGlobal = false) {
  if (!confidenceData) return '';
  const levels = [
    { key: 'very_high', label: 'Very High', icon: '🟢', color: '#28a745' },
    { key: 'high', label: 'High', icon: '🟡', color: '#ffc107' },
    { key: 'medium', label: 'Medium', icon: '🟠', color: '#fd7e14' },
    { key: 'low', label: 'Low', icon: '🔴', color: '#dc3545' },
    { key: 'none', label: 'None', icon: '⚫', color: '#6c757d' }
  ];
  const rows = levels.filter(l => confidenceData[l.key] && confidenceData[l.key].total > 0)
    .map(l => {
      const d = confidenceData[l.key];
      const acc = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
      return `<div class="confidence-stat-row"><div class="confidence-stat-label"><span class="confidence-icon">${l.icon}</span><span class="confidence-name">${l.label}</span></div><div class="confidence-stat-bar-container"><div class="confidence-stat-bar" style="width: ${acc}%; background-color: ${l.color}"></div></div><div class="confidence-stat-value">${d.correct}/${d.total} <span class="confidence-percentage">(${acc}%)</span></div></div>`;
    }).join('');
  if (!rows) return '';
  return `<div class="confidence-accuracy-section"><h4>${isGlobal ? '🌍' : '📋'} ${title}</h4><p class="confidence-description">Visar hur ofta varje confidence-nivå hade rätt rekommendation</p><div class="confidence-stats">${rows}</div></div>`;
}

async function exportJSON() {
  const playlistData = window.validator.prepareForExport(currentState.playlist.name, currentState.playlist.spotifyUrl || '', currentState.tracks);
  window.validator.exportToJSON(playlistData);
  if (window.statsManager) await window.statsManager.updateGlobalStats(currentState.stats, currentState.tracks.filter(t => t.verified));
  showNotification('✅ JSON-fil nedladdad och statistik uppdaterad', 'success');
  closeExportModal();
  setTimeout(() => renderReviewPhase(), 500);
}

async function exportFirebase() {
  try {
    const playlistData = window.validator.prepareForExport(currentState.playlist.name, currentState.playlist.spotifyUrl || '', currentState.tracks);
    const playlistId = await window.validator.saveToFirebase(playlistData);
    if (window.statsManager) await window.statsManager.updateGlobalStats(currentState.stats, currentState.tracks.filter(t => t.verified));
    showNotification(`✅ Spellista sparad till Firebase: ${playlistId}`, 'success');
    closeExportModal();
    setTimeout(() => renderReviewPhase(), 500);
  } catch (error) { showError(`Misslyckades att spara till Firebase: ${error.message}`); }
}

function exportGameFormat() {
  try {
    window.validator.exportGameFormatJSON(currentState.playlist.name, currentState.tracks);
    showNotification('✅ Spelformat-JSON nedladdad', 'success');
    closeExportModal();
  } catch (error) { showError(`Misslyckades att exportera: ${error.message}`); }
}

function closeExportModal() { const modal = document.querySelector('.modal'); if (modal) modal.remove(); }

async function exportGlobalStats() {
  if (window.statsManager) { await window.statsManager.exportGlobalStatsToJSON(); showNotification('✅ Global statistik exporterad', 'success'); }
}

async function resetGlobalStats() {
  if (window.statsManager) {
    const success = await window.statsManager.resetGlobalStats();
    if (success) { showNotification('✅ Global statistik nollställd', 'success'); renderReviewPhase(); }
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => { notification.classList.remove('show'); setTimeout(() => notification.remove(), 300); }, 3000);
}

function showError(message) { showNotification(message, 'error'); }

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

// Export functions
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
