// Global Statistics Manager
// Tracks source accuracy across multiple playlists using Firebase

const FIREBASE_STATS_PATH = 'validatorGlobalStats';

/**
 * Get global statistics from Firebase
 */
async function getGlobalStats() {
  if (!window.validatorFirebase) {
    console.warn('Firebase not initialized');
    return createEmptyGlobalStats();
  }
  
  try {
    const stats = await window.validatorFirebase.get(FIREBASE_STATS_PATH);
    
    if (!stats) {
      return createEmptyGlobalStats();
    }
    
    // Ensure all sources exist (for backwards compatibility)
    if (!stats.sourceAccuracy) {
      stats.sourceAccuracy = {
        'Spotify': 0,
        'Spotify Original': 0,
        'Last.fm': 0,
        'MusicBrainz': 0,
        'Custom': 0
      };
    }
    
    // Ensure confidenceAccuracy exists (for backwards compatibility)
    if (!stats.confidenceAccuracy) {
      stats.confidenceAccuracy = {
        'very_high': { total: 0, correct: 0 },
        'high': { total: 0, correct: 0 },
        'medium': { total: 0, correct: 0 },
        'low': { total: 0, correct: 0 },
        'none': { total: 0, correct: 0 }
      };
    }
    
    return stats;
  } catch (error) {
    console.error('Failed to load global stats from Firebase:', error);
    return createEmptyGlobalStats();
  }
}

/**
 * Create empty global stats object
 */
function createEmptyGlobalStats() {
  return {
    totalPlaylists: 0,
    totalTracks: 0,
    totalVerified: 0,
    sourceAccuracy: {
      'Spotify': 0,
      'Spotify Original': 0,
      'Last.fm': 0,
      'MusicBrainz': 0,
      'Custom': 0
    },
    confidenceAccuracy: {
      'very_high': { total: 0, correct: 0 },
      'high': { total: 0, correct: 0 },
      'medium': { total: 0, correct: 0 },
      'low': { total: 0, correct: 0 },
      'none': { total: 0, correct: 0 }
    },
    firstUsed: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Update global statistics with new playlist data
 */
async function updateGlobalStats(playlistStats, verifiedTracks) {
  if (!window.validatorFirebase) {
    console.warn('Firebase not initialized - cannot save global stats');
    return null;
  }
  
  try {
    const globalStats = await getGlobalStats();
    
    // Increment counters
    globalStats.totalPlaylists++;
    globalStats.totalTracks += playlistStats.total;
    globalStats.totalVerified += playlistStats.verified;
    
    // Add source accuracy counts
    Object.keys(playlistStats.sourceAccuracy).forEach(source => {
      if (globalStats.sourceAccuracy[source] !== undefined) {
        globalStats.sourceAccuracy[source] += playlistStats.sourceAccuracy[source];
      }
    });
    
    // Add confidence accuracy counts
    if (playlistStats.confidenceAccuracy) {
      Object.keys(playlistStats.confidenceAccuracy).forEach(confidence => {
        if (globalStats.confidenceAccuracy[confidence]) {
          globalStats.confidenceAccuracy[confidence].total += playlistStats.confidenceAccuracy[confidence].total;
          globalStats.confidenceAccuracy[confidence].correct += playlistStats.confidenceAccuracy[confidence].correct;
        }
      });
    }
    
    globalStats.lastUpdated = new Date().toISOString();
    
    // Save to Firebase
    await window.validatorFirebase.set(FIREBASE_STATS_PATH, globalStats);
    
    console.log('✅ Global stats updated in Firebase:', globalStats);
    return globalStats;
  } catch (error) {
    console.error('Failed to save global stats to Firebase:', error);
    return null;
  }
}

/**
 * Reset global statistics
 */
async function resetGlobalStats() {
  const confirmed = confirm(
    'Är du säker på att du vill nollställa all global statistik i databasen?\n\n' +
    'Detta raderar statistik från alla tidigare verifierade spellistor för ALLA användare.'
  );
  
  if (!confirmed) {
    return false;
  }
  
  if (!window.validatorFirebase) {
    console.warn('Firebase not initialized');
    return false;
  }
  
  try {
    const emptyStats = createEmptyGlobalStats();
    await window.validatorFirebase.set(FIREBASE_STATS_PATH, emptyStats);
    console.log('✅ Global stats reset in Firebase');
    return true;
  } catch (error) {
    console.error('Failed to reset global stats in Firebase:', error);
    return false;
  }
}

/**
 * Get source accuracy percentages
 */
function getSourceAccuracyPercentages(sourceAccuracy, total) {
  if (total === 0) return {};
  
  const percentages = {};
  Object.keys(sourceAccuracy).forEach(source => {
    percentages[source] = {
      count: sourceAccuracy[source],
      percentage: Math.round((sourceAccuracy[source] / total) * 100)
    };
  });
  
  return percentages;
}

/**
 * Export global statistics to JSON
 */
async function exportGlobalStatsToJSON() {
  const stats = await getGlobalStats();
  const blob = new Blob([JSON.stringify(stats, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `notestream_validator_global_stats_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export functions
window.statsManager = {
  getGlobalStats,
  updateGlobalStats,
  resetGlobalStats,
  getSourceAccuracyPercentages,
  exportGlobalStatsToJSON
};
