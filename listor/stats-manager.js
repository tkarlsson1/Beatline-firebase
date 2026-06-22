// Global Statistics Manager
// Version 3.0 - Extended statistics for ML training data

const FIREBASE_STATS_PATH = 'validatorGlobalStats';

/**
 * Map display source names to Firebase-safe keys
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
 * Create empty source stats
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
 * Create empty conflict stats
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
 * Create empty compilation stats
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
 * Create empty year choice stats (NEW)
 */
function createEmptyYearChoiceStats() {
  return {
    choseOldest: 0,
    choseNewer: 0,
    totalWithChoice: 0,
    avgYearDiffWhenNewer: 0,
    newerBySource: {
      'Spotify': 0,
      'SpotifyOriginal': 0,
      'MusicBrainz': 0,
      'LastFm': 0,
      'Custom': 0
    }
  };
}

/**
 * Create empty recommendation accuracy stats (NEW)
 */
function createEmptyRecommendationAccuracy() {
  return {
    byMatchMethod: {
      isrc: { correct: 0, total: 0 },
      search: { correct: 0, total: 0 },
      none: { correct: 0, total: 0 }
    },
    byAlbumType: {
      album: { correct: 0, total: 0 },
      single: { correct: 0, total: 0 },
      compilation: { correct: 0, total: 0 },
      unknown: { correct: 0, total: 0 }
    },
    bySourceCount: {
      one: { correct: 0, total: 0 },
      two: { correct: 0, total: 0 },
      three: { correct: 0, total: 0 },
      four: { correct: 0, total: 0 }
    },
    byDecade: {
      '1950s': { correct: 0, total: 0 },
      '1960s': { correct: 0, total: 0 },
      '1970s': { correct: 0, total: 0 },
      '1980s': { correct: 0, total: 0 },
      '1990s': { correct: 0, total: 0 },
      '2000s': { correct: 0, total: 0 },
      '2010s': { correct: 0, total: 0 },
      '2020s': { correct: 0, total: 0 },
      'unknown': { correct: 0, total: 0 }
    }
  };
}

/**
 * Create empty override stats (NEW)
 */
function createEmptyOverrideStats() {
  return {
    keptDefault: 0,
    changedSelection: 0,
    overrideReasons: {
      olderYear: 0,
      newerYear: 0,
      customYear: 0
    }
  };
}

/**
 * Create empty flag accuracy stats (NEW)
 */
function createEmptyFlagAccuracy() {
  return {
    compilation: { correct: 0, total: 0 },
    compilation_resolved: { correct: 0, total: 0 },
    year_conflict: { correct: 0, total: 0 },
    multiple_artists: { correct: 0, total: 0 },
    remix_remaster: { correct: 0, total: 0 },
    large_year_diff: { correct: 0, total: 0 },
    no_validation: { correct: 0, total: 0 },
    critical_compilation: { correct: 0, total: 0 }
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
    sourceStats: createEmptySourceStats(),
    conflicts: createEmptyConflictStats(),
    compilationStats: createEmptyCompilationStats(),
    // NEW fas 2
    yearChoiceStats: createEmptyYearChoiceStats(),
    recommendationAccuracy: createEmptyRecommendationAccuracy(),
    overrideStats: createEmptyOverrideStats(),
    flagAccuracy: createEmptyFlagAccuracy(),
    firstUsed: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
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
    
    // Ensure backwards compatibility
    if (!stats.sourceAccuracy) {
      stats.sourceAccuracy = { 'Spotify': 0, 'SpotifyOriginal': 0, 'LastFm': 0, 'MusicBrainz': 0, 'Custom': 0 };
    }
    if (!stats.confidenceAccuracy) {
      stats.confidenceAccuracy = {
        'very_high': { total: 0, correct: 0 },
        'high': { total: 0, correct: 0 },
        'medium': { total: 0, correct: 0 },
        'low': { total: 0, correct: 0 },
        'none': { total: 0, correct: 0 }
      };
    }
    if (!stats.sourceStats) stats.sourceStats = createEmptySourceStats();
    if (!stats.conflicts) stats.conflicts = createEmptyConflictStats();
    if (!stats.compilationStats) stats.compilationStats = createEmptyCompilationStats();
    // NEW fas 2
    if (!stats.yearChoiceStats) stats.yearChoiceStats = createEmptyYearChoiceStats();
    if (!stats.recommendationAccuracy) stats.recommendationAccuracy = createEmptyRecommendationAccuracy();
    if (!stats.overrideStats) stats.overrideStats = createEmptyOverrideStats();
    if (!stats.flagAccuracy) stats.flagAccuracy = createEmptyFlagAccuracy();
    
    return stats;
  } catch (error) {
    console.error('Failed to load global stats from Firebase:', error);
    return createEmptyGlobalStats();
  }
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
    
    // === SOURCE STATS ===
    if (playlistStats.sourceStats) {
      Object.keys(playlistStats.sourceStats).forEach(source => {
        if (globalStats.sourceStats[source]) {
          const ps = playlistStats.sourceStats[source];
          const gs = globalStats.sourceStats[source];
          
          gs.hadData += ps.hadData || 0;
          gs.noData += ps.noData || 0;
          gs.selectedAsWinner += ps.selectedAsWinner || 0;
          gs.agreedWithFinal += ps.agreedWithFinal || 0;
          
          // Weighted average for avgDeviation
          if (ps.avgDeviation && ps.hadData > 0) {
            const oldWeight = gs.hadData - ps.hadData;
            const newWeight = ps.hadData;
            const totalWeight = oldWeight + newWeight;
            if (totalWeight > 0) {
              gs.avgDeviation = Math.round(
                ((gs.avgDeviation * oldWeight) + (ps.avgDeviation * newWeight)) / totalWeight * 10
              ) / 10;
            }
          }
        }
      });
    }
    
    // === CONFLICT STATS ===
    if (playlistStats.conflicts) {
      const pc = playlistStats.conflicts;
      const gc = globalStats.conflicts;
      
      gc.allAgreed += pc.allAgreed || 0;
      gc.twoVsOne += pc.twoVsOne || 0;
      gc.threeWaySplit += pc.threeWaySplit || 0;
      
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
    
    // === COMPILATION STATS ===
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
    
    // === YEAR CHOICE STATS (NEW) ===
    if (playlistStats.yearChoiceStats) {
      const pyc = playlistStats.yearChoiceStats;
      const gyc = globalStats.yearChoiceStats;
      
      gyc.choseOldest += pyc.choseOldest || 0;
      gyc.choseNewer += pyc.choseNewer || 0;
      
      const oldChoiceTotal = gyc.totalWithChoice;
      const newChoiceTotal = pyc.totalWithChoice || 0;
      gyc.totalWithChoice = oldChoiceTotal + newChoiceTotal;
      
      // Weighted average for avgYearDiffWhenNewer
      if (pyc.avgYearDiffWhenNewer && pyc.choseNewer > 0) {
        const oldNewerCount = gyc.choseNewer - pyc.choseNewer;
        const newNewerCount = pyc.choseNewer;
        if (oldNewerCount + newNewerCount > 0) {
          gyc.avgYearDiffWhenNewer = Math.round(
            ((gyc.avgYearDiffWhenNewer * oldNewerCount) + (pyc.avgYearDiffWhenNewer * newNewerCount)) / 
            (oldNewerCount + newNewerCount) * 10
          ) / 10;
        }
      }
      
      if (pyc.newerBySource) {
        Object.keys(pyc.newerBySource).forEach(source => {
          if (gyc.newerBySource[source] !== undefined) {
            gyc.newerBySource[source] += pyc.newerBySource[source] || 0;
          }
        });
      }
    }
    
    // === RECOMMENDATION ACCURACY (NEW) ===
    if (playlistStats.recommendationAccuracy) {
      const pra = playlistStats.recommendationAccuracy;
      const gra = globalStats.recommendationAccuracy;
      
      // By match method
      if (pra.byMatchMethod) {
        Object.keys(pra.byMatchMethod).forEach(method => {
          if (gra.byMatchMethod[method]) {
            gra.byMatchMethod[method].correct += pra.byMatchMethod[method].correct || 0;
            gra.byMatchMethod[method].total += pra.byMatchMethod[method].total || 0;
          }
        });
      }
      
      // By album type
      if (pra.byAlbumType) {
        Object.keys(pra.byAlbumType).forEach(type => {
          if (gra.byAlbumType[type]) {
            gra.byAlbumType[type].correct += pra.byAlbumType[type].correct || 0;
            gra.byAlbumType[type].total += pra.byAlbumType[type].total || 0;
          }
        });
      }
      
      // By source count
      if (pra.bySourceCount) {
        Object.keys(pra.bySourceCount).forEach(count => {
          if (gra.bySourceCount[count]) {
            gra.bySourceCount[count].correct += pra.bySourceCount[count].correct || 0;
            gra.bySourceCount[count].total += pra.bySourceCount[count].total || 0;
          }
        });
      }
      
      // By decade
      if (pra.byDecade) {
        Object.keys(pra.byDecade).forEach(decade => {
          if (gra.byDecade[decade]) {
            gra.byDecade[decade].correct += pra.byDecade[decade].correct || 0;
            gra.byDecade[decade].total += pra.byDecade[decade].total || 0;
          }
        });
      }
    }
    
    // === OVERRIDE STATS (NEW) ===
    if (playlistStats.overrideStats) {
      const pos = playlistStats.overrideStats;
      const gos = globalStats.overrideStats;
      
      gos.keptDefault += pos.keptDefault || 0;
      gos.changedSelection += pos.changedSelection || 0;
      
      if (pos.overrideReasons) {
        gos.overrideReasons.olderYear += pos.overrideReasons.olderYear || 0;
        gos.overrideReasons.newerYear += pos.overrideReasons.newerYear || 0;
        gos.overrideReasons.customYear += pos.overrideReasons.customYear || 0;
      }
    }
    
    // === FLAG ACCURACY (NEW) ===
    if (playlistStats.flagAccuracy) {
      Object.keys(playlistStats.flagAccuracy).forEach(flagType => {
        if (globalStats.flagAccuracy[flagType]) {
          globalStats.flagAccuracy[flagType].correct += playlistStats.flagAccuracy[flagType].correct || 0;
          globalStats.flagAccuracy[flagType].total += playlistStats.flagAccuracy[flagType].total || 0;
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
  
  if (!confirmed) return false;
  
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
      coverage: total > 0 ? Math.round((s.hadData / total) * 100) : 0,
      accuracy: s.hadData > 0 ? Math.round((s.agreedWithFinal / s.hadData) * 100) : 0,
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
    agreementRate: total > 0 ? Math.round((conflicts.allAgreed / total) * 100) : 0,
    majorityRate: total > 0 ? Math.round((conflicts.twoVsOne / total) * 100) : 0,
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
    changeRate: triggered > 0 ? Math.round((compilationStats.changedYear / triggered) * 100) : 0,
    keepRate: triggered > 0 ? Math.round((compilationStats.keptOriginal / triggered) * 100) : 0
  };
}

/**
 * Get year choice statistics with calculated metrics (NEW)
 */
function getYearChoiceStats(yearChoiceStats) {
  const total = yearChoiceStats.totalWithChoice;
  
  return {
    ...yearChoiceStats,
    oldestRate: total > 0 ? Math.round((yearChoiceStats.choseOldest / total) * 100) : 0,
    newerRate: total > 0 ? Math.round((yearChoiceStats.choseNewer / total) * 100) : 0
  };
}

/**
 * Get recommendation accuracy with calculated percentages (NEW)
 */
function getRecommendationAccuracyStats(recommendationAccuracy) {
  const calcAccuracy = (obj) => {
    const result = {};
    Object.keys(obj).forEach(key => {
      const item = obj[key];
      result[key] = {
        ...item,
        accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0
      };
    });
    return result;
  };
  
  return {
    byMatchMethod: calcAccuracy(recommendationAccuracy.byMatchMethod),
    byAlbumType: calcAccuracy(recommendationAccuracy.byAlbumType),
    bySourceCount: calcAccuracy(recommendationAccuracy.bySourceCount),
    byDecade: calcAccuracy(recommendationAccuracy.byDecade)
  };
}

/**
 * Get override statistics with calculated metrics (NEW)
 */
function getOverrideStats(overrideStats) {
  const total = overrideStats.keptDefault + overrideStats.changedSelection;
  
  return {
    ...overrideStats,
    defaultRate: total > 0 ? Math.round((overrideStats.keptDefault / total) * 100) : 0,
    overrideRate: total > 0 ? Math.round((overrideStats.changedSelection / total) * 100) : 0
  };
}

/**
 * Get flag accuracy with calculated percentages (NEW)
 */
function getFlagAccuracyStats(flagAccuracy) {
  const result = {};
  Object.keys(flagAccuracy).forEach(flagType => {
    const item = flagAccuracy[flagType];
    result[flagType] = {
      ...item,
      accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0
    };
  });
  return result;
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
      compilationStats: getCompilationStats(stats.compilationStats),
      yearChoiceStats: getYearChoiceStats(stats.yearChoiceStats),
      recommendationAccuracy: getRecommendationAccuracyStats(stats.recommendationAccuracy),
      overrideStats: getOverrideStats(stats.overrideStats),
      flagAccuracy: getFlagAccuracyStats(stats.flagAccuracy)
    }
  };
  
  const blob = new Blob([JSON.stringify(enrichedStats, null, 2)], { type: 'application/json' });
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
  const yearChoice = getYearChoiceStats(stats.yearChoiceStats);
  const recAccuracy = getRecommendationAccuracyStats(stats.recommendationAccuracy);
  const overrideS = getOverrideStats(stats.overrideStats);
  const flagAcc = getFlagAccuracyStats(stats.flagAccuracy);
  
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
    yearChoice: yearChoice,
    recommendationAccuracy: recAccuracy,
    overrides: overrideS,
    flagAccuracy: flagAcc,
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
  getYearChoiceStats,
  getRecommendationAccuracyStats,
  getOverrideStats,
  getFlagAccuracyStats,
  exportGlobalStatsToJSON,
  generateStatsSummary
};
