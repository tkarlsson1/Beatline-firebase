// Global Statistics Manager
// Tracks source accuracy across multiple playlists using Firebase
// Version 2.0 - Extended statistics for source behavior, conflicts, and compilation detection

const FIREBASE_STATS_PATH = 'validatorGlobalStats';

/**
 * Map display source names to Firebase-safe keys
 * Firebase doesn't allow dots or certain characters in keys
 */
function mapSourceToFirebaseKey(sourceName) {
  const mapping = {
    'Spotify Original': 'SpotifyOriginal',
    'Last.fm': 'LastFm',
    'Spotify': 'Spotify',
    'MusicBrainz': 'MusicBrainz',
    'Custom': 'Custom'
  };
  return mapping[sourceName] || sourceName;
}

/**
 * Map Firebase keys back to display names
 */
function mapFirebaseKeyToSource(firebaseKey) {
  const mapping = {
    'SpotifyOriginal': 'Spotify Original',
    'LastFm': 'Last.fm',
    'Spotify': 'Spotify',
    'MusicBrainz': 'MusicBrainz',
    'Custom': 'Custom'
  };
  return mapping[firebaseKey] || firebaseKey;
}

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
        'SpotifyOriginal': 0,
        'LastFm': 0,
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
    
    // Ensure NEW stats exist (for backwards compatibility)
    if (!stats.sourceStats) {
      stats.sourceStats = createEmptySourceStats();
    }
    
    if (!stats.conflicts) {
      stats.conflicts = createEmptyConflictStats();
    }
    
    if (!stats.compilationStats) {
      stats.compilationStats = createEmptyCompilationStats();
    }
    
    return stats;
  } catch (error) {
    console.error('Failed to load global stats from Firebase:', error);
    return createEmptyGlobalStats();
  }
}

/**
 * Create empty source stats object
 */
function createEmptySourceStats() {
  return {
    'Spotify': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, avgDeviation: 0 },
    'SpotifyOriginal': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, avgDeviation: 0 },
    'LastFm': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, avgDeviation: 0 },
    'MusicBrainz': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, avgDeviation: 0 }
  };
}

/**
 * Create empty conflict stats object
 */
function createEmptyConflictStats() {
  return {
    allAgreed: 0,
    twoVsOne: 0,
    threeWaySplit: 0,
    totalWithMultipleSources: 0,
    avgYearSpread: 0
  };
}

/**
 * Create empty compilation stats object
 */
function createEmptyCompilationStats() {
  return {
    triggered: 0,
    changedYear: 0,
    keptOriginal: 0,
    byConfidence: {
      'very_high': 0,
      'high': 0,
      'medium': 0,
      'low': 0,
      'none': 0
    }
  };
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
      'SpotifyOriginal': 0,
      'LastFm': 0,
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
    // NEW: Extended source statistics
    sourceStats: createEmptySourceStats(),
    // NEW: Conflict statistics
    conflicts: createEmptyConflictStats(),
    // NEW: Compilation detection statistics
    compilationStats: createEmptyCompilationStats(),
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
    
    // Add source accuracy counts (map display names to Firebase keys)
    Object.keys(playlistStats.sourceAccuracy).forEach(source => {
      const firebaseKey = mapSourceToFirebaseKey(source);
      if (globalStats.sourceAccuracy[firebaseKey] !== undefined) {
        globalStats.sourceAccuracy[firebaseKey] += playlistStats.sourceAccuracy[source];
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
    
    // === NEW: Add extended source stats ===
    if (playlistStats.sourceStats) {
      Object.keys(playlistStats.sourceStats).forEach(source => {
        if (globalStats.sourceStats[source]) {
          const playlistSource = playlistStats.sourceStats[source];
          const globalSource = globalStats.sourceStats[source];
          
          globalSource.hadData += playlistSource.hadData || 0;
          globalSource.noData += playlistSource.noData || 0;
          globalSource.selectedAsWinner += playlistSource.selectedAsWinner || 0;
          globalSource.agreedWithFinal += playlistSource.agreedWithFinal || 0;
          
          // Weighted average for avgDeviation
          if (playlistSource.avgDeviation && playlistSource.hadData > 0) {
            const oldWeight = globalSource.hadData - playlistSource.hadData;
            const newWeight = playlistSource.hadData;
            const totalWeight = oldWeight + newWeight;
            
            if (totalWeight > 0) {
              globalSource.avgDeviation = Math.round(
                ((globalSource.avgDeviation * oldWeight) + (playlistSource.avgDeviation * newWeight)) / totalWeight * 10
              ) / 10;
            }
          }
        }
      });
    }
    
    // === NEW: Add conflict stats ===
    if (playlistStats.conflicts) {
      const pc = playlistStats.conflicts;
      const gc = globalStats.conflicts;
      
      gc.allAgreed += pc.allAgreed || 0;
      gc.twoVsOne += pc.twoVsOne || 0;
      gc.threeWaySplit += pc.threeWaySplit || 0;
      
      // Weighted average for avgYearSpread
      const oldTotal = gc.totalWithMultipleSources;
      const newTotal = pc.totalWithMultipleSources || 0;
      const combinedTotal = oldTotal + newTotal;
      
      if (combinedTotal > 0 && newTotal > 0) {
        gc.avgYearSpread = Math.round(
          ((gc.avgYearSpread * oldTotal) + (pc.avgYearSpread * newTotal)) / combinedTotal * 10
        ) / 10;
      }
      
      gc.totalWithMultipleSources = combinedTotal;
    }
    
    // === NEW: Add compilation stats ===
    if (playlistStats.compilationStats) {
      const pcs = playlistStats.compilationStats;
      const gcs = globalStats.compilationStats;
      
      gcs.triggered += pcs.triggered || 0;
      gcs.changedYear += pcs.changedYear || 0;
      gcs.keptOriginal += pcs.keptOriginal || 0;
      
      if (pcs.byConfidence) {
        Object.keys(pcs.byConfidence).forEach(conf => {
          if (gcs.byConfidence[conf] !== undefined) {
            gcs.byConfidence[conf] += pcs.byConfidence[conf] || 0;
          }
        });
      }
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
 * Get extended source statistics with calculated metrics
 */
function getExtendedSourceStats(sourceStats) {
  const extended = {};
  
  Object.keys(sourceStats).forEach(source => {
    const s = sourceStats[source];
    const total = s.hadData + s.noData;
    
    extended[source] = {
      ...s,
      // Coverage: how often does this source have data?
      coverage: total > 0 ? Math.round((s.hadData / total) * 100) : 0,
      // Accuracy: when selected, how often did it agree with final?
      accuracy: s.hadData > 0 ? Math.round((s.agreedWithFinal / s.hadData) * 100) : 0,
      // Selection rate: how often is this source chosen as winner?
      selectionRate: s.hadData > 0 ? Math.round((s.selectedAsWinner / s.hadData) * 100) : 0
    };
  });
  
  return extended;
}

/**
 * Get conflict statistics with calculated metrics
 */
function getConflictStats(conflicts) {
  const total = conflicts.totalWithMultipleSources;
  
  return {
    ...conflicts,
    // Agreement rate: how often do all sources agree?
    agreementRate: total > 0 ? Math.round((conflicts.allAgreed / total) * 100) : 0,
    // Majority rate: how often is there a 2-vs-1 split?
    majorityRate: total > 0 ? Math.round((conflicts.twoVsOne / total) * 100) : 0,
    // Total disagreement rate
    totalDisagreementRate: total > 0 ? Math.round((conflicts.threeWaySplit / total) * 100) : 0
  };
}

/**
 * Get compilation statistics with calculated metrics
 */
function getCompilationStats(compilationStats) {
  const triggered = compilationStats.triggered;
  
  return {
    ...compilationStats,
    // How often does compilation detection lead to year change?
    changeRate: triggered > 0 ? Math.round((compilationStats.changedYear / triggered) * 100) : 0,
    // How often is original kept despite compilation detection?
    keepRate: triggered > 0 ? Math.round((compilationStats.keptOriginal / triggered) * 100) : 0
  };
}

/**
 * Export global statistics to JSON
 */
async function exportGlobalStatsToJSON() {
  const stats = await getGlobalStats();
  
  // Add calculated metrics for export
  const enrichedStats = {
    ...stats,
    _calculated: {
      sourceStatsExtended: getExtendedSourceStats(stats.sourceStats),
      conflictStats: getConflictStats(stats.conflicts),
      compilationStats: getCompilationStats(stats.compilationStats)
    }
  };
  
  const blob = new Blob([JSON.stringify(enrichedStats, null, 2)], {
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

/**
 * Generate a summary report of current statistics
 */
async function generateStatsSummary() {
  const stats = await getGlobalStats();
  
  const extendedSource = getExtendedSourceStats(stats.sourceStats);
  const conflictStats = getConflictStats(stats.conflicts);
  const compStats = getCompilationStats(stats.compilationStats);
  
  return {
    overview: {
      totalPlaylists: stats.totalPlaylists,
      totalTracks: stats.totalTracks,
      totalVerified: stats.totalVerified,
      verificationRate: stats.totalTracks > 0 
        ? Math.round((stats.totalVerified / stats.totalTracks) * 100) 
        : 0
    },
    sources: {
      bestCoverage: findBestSource(extendedSource, 'coverage'),
      bestAccuracy: findBestSource(extendedSource, 'accuracy'),
      mostSelected: findBestSource(extendedSource, 'selectionRate'),
      details: extendedSource
    },
    conflicts: conflictStats,
    compilations: compStats,
    confidence: {
      veryHigh: calculateConfidenceAccuracy(stats.confidenceAccuracy.very_high),
      high: calculateConfidenceAccuracy(stats.confidenceAccuracy.high),
      medium: calculateConfidenceAccuracy(stats.confidenceAccuracy.medium),
      low: calculateConfidenceAccuracy(stats.confidenceAccuracy.low)
    }
  };
}

/**
 * Helper: Find best source for a given metric
 */
function findBestSource(extendedSource, metric) {
  let best = null;
  let bestValue = -1;
  
  Object.keys(extendedSource).forEach(source => {
    const value = extendedSource[source][metric] || 0;
    if (value > bestValue) {
      bestValue = value;
      best = source;
    }
  });
  
  return { source: best, value: bestValue };
}

/**
 * Helper: Calculate confidence accuracy percentage
 */
function calculateConfidenceAccuracy(conf) {
  if (!conf || conf.total === 0) return { total: 0, correct: 0, accuracy: 0 };
  
  return {
    total: conf.total,
    correct: conf.correct,
    accuracy: Math.round((conf.correct / conf.total) * 100)
  };
}

// Export functions
window.statsManager = {
  getGlobalStats,
  updateGlobalStats,
  resetGlobalStats,
  getSourceAccuracyPercentages,
  getExtendedSourceStats,
  getConflictStats,
  getCompilationStats,
  exportGlobalStatsToJSON,
  generateStatsSummary
};
