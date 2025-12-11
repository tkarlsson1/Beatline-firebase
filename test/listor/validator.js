// Validator - Core logic for analyzing and flagging tracks
// Version 3.0 - Extended statistics for ML training data

/**
 * Analyze album for compilation indicators
 * Returns: { isCompilation, confidence, reasons[] }
 */
function detectCompilationAlbum(track) {
  const reasons = [];
  let score = 0;
  
  // 1. Spotify explicitly says compilation
  if (track.albumType === 'compilation') {
    score += 50;
    reasons.push('Spotify album type: compilation');
  }
  
  // 2. Album name patterns
  const compilationKeywords = [
    // Very strong indicators (40 points)
    { regex: /greatest\s*hits/i, points: 40, name: 'Greatest Hits' },
    { regex: /best\s*of/i, points: 40, name: 'Best Of' },
    { regex: /the\s+very\s+best/i, points: 40, name: 'The Very Best' },
    { regex: /complete\s+collection/i, points: 40, name: 'Complete Collection' },
    { regex: /#1'?s\b/i, points: 40, name: 'Number Ones' },
    { regex: /number\s+ones/i, points: 40, name: 'Number Ones' },
    
    // Strong indicators (35 points)
    { regex: /anthology/i, points: 35, name: 'Anthology' },
    { regex: /the\s+definitive/i, points: 35, name: 'The Definitive' },
    { regex: /retrospective/i, points: 35, name: 'Retrospective' },
    { regex: /millennium\s+collection/i, points: 35, name: 'Millennium Collection' },
    
    // Medium indicators (30 points)
    { regex: /\bcollection\b/i, points: 30, name: 'Collection' },
    { regex: /\bessential\b/i, points: 30, name: 'Essential' },
    { regex: /\bultimate\b/i, points: 30, name: 'Ultimate' },
    { regex: /\bsingles\b/i, points: 30, name: 'Singles Collection' },
    { regex: /all\s+the\s+hits/i, points: 30, name: 'All The Hits' },
    { regex: /collected/i, points: 30, name: 'Collected' },
    { regex: /selected/i, points: 30, name: 'Selected' },
    { regex: /complete\s+works/i, points: 30, name: 'Complete Works' },
    
    // Moderate indicators (25 points)
    { regex: /\bgold\b/i, points: 25, name: 'Gold Edition' },
    { regex: /\bicon\b/i, points: 25, name: 'Icon' },
    { regex: /\bhits\b/i, points: 25, name: 'Hits compilation' },
    { regex: /top\s+hits/i, points: 25, name: 'Top Hits' },
    { regex: /all\s+time\s+greatest/i, points: 25, name: 'All Time Greatest' },
    { regex: /the\s+story/i, points: 25, name: 'The Story' },
    { regex: /box\s+set/i, points: 25, name: 'Box Set' },
    
    // Weak indicators (20 points)
    { regex: /\bclassic/i, points: 20, name: 'Classics' },
    { regex: /\bplaylist\b/i, points: 20, name: 'Playlist compilation' },
    { regex: /millennium\s+edition/i, points: 20, name: 'Millennium Edition' },
    
    // Decade indicators (15 points)
    { regex: /\b(60|70|80|90)s?\s+(hits|collection|classics)/i, points: 15, name: 'Decade compilation' },
    { regex: /\b(sixties|seventies|eighties|nineties)\s+(hits|collection)/i, points: 15, name: 'Decade compilation' },
    
    // Year range indicators (15 points)
    { regex: /\b(19|20)\d{2}\s*-\s*(19|20)\d{2}/i, points: 15, name: 'Year range compilation' }
  ];
  
  for (const keyword of compilationKeywords) {
    if (keyword.regex.test(track.album)) {
      score += keyword.points;
      reasons.push(`Album name: "${keyword.name}"`);
      break; // Only count one keyword
    }
  }
  
  // 3. Remaster/Deluxe/Anniversary (not compilation but re-release)
  const rereleaseKeywords = [
    { regex: /remaster/i, points: 20, name: 'Remastered' },
    { regex: /deluxe/i, points: 15, name: 'Deluxe Edition' },
    { regex: /anniversary/i, points: 20, name: 'Anniversary Edition' },
    { regex: /\bedition\b/i, points: 10, name: 'Special Edition' },
    { regex: /expanded/i, points: 15, name: 'Expanded' }
  ];
  
  for (const keyword of rereleaseKeywords) {
    if (keyword.regex.test(track.album)) {
      score += keyword.points;
      reasons.push(`Re-release: "${keyword.name}"`);
      break;
    }
  }
  
  // 4. Album data (if available)
  if (track.albumData) {
    const albumData = track.albumData;
    
    // Many tracks = likely compilation
    if (albumData.totalTracks > 30) {
      score += 25;
      reasons.push(`Many tracks (${albumData.totalTracks})`);
    } else if (albumData.totalTracks > 20) {
      score += 15;
      reasons.push(`Many tracks (${albumData.totalTracks})`);
    } else if (albumData.totalTracks > 15) {
      score += 8;
      reasons.push(`Relatively many tracks (${albumData.totalTracks})`);
    }
    
    // Album artist vs track artist
    const albumArtist = albumData.albumArtist?.toLowerCase();
    const trackArtist = track.artist?.toLowerCase();
    
    if (albumArtist === 'various artists' || albumArtist === 'various') {
      score += 40;
      reasons.push('Album artist: Various Artists');
    } else if (albumArtist && trackArtist && albumArtist !== trackArtist) {
      score += 15;
      reasons.push('Album artist differs from track artist');
    }
    
    // Compilation labels
    const compilationLabels = [
      /rhino/i,
      /rhino entertainment/i,
      /legacy/i,
      /legacy recordings/i,
      /sony legacy/i,
      /columbia legacy/i,
      /universal compilation/i,
      /sony compilation/i,
      /warner compilation/i,
      /warner strategic/i,
      /capitol catalogue/i,
      /emi gold/i,
      /mercury/i,
      /umc\b/i,
      /sony music cg/i,
      /geffen/i,
      /parlophone/i,
      /atlantic/i,
      /epic legacy/i,
      /rca legacy/i,
      /arista/i,
      /repertoire/i,
      /catalog/i,
      /catalogue/i
    ];
    
    if (albumData.label) {
      for (const labelRegex of compilationLabels) {
        if (labelRegex.test(albumData.label)) {
          score += 25;
          reasons.push(`Compilation label: ${albumData.label}`);
          break;
        }
      }
    }
  }
  
  // Determine confidence
  let confidence = 'none';
  if (score >= 70) confidence = 'very_high';
  else if (score >= 50) confidence = 'high';
  else if (score >= 30) confidence = 'medium';
  else if (score >= 15) confidence = 'low';
  
  return {
    isCompilation: score >= 50,
    confidence: confidence,
    score: score,
    reasons: reasons
  };
}

/**
 * Cross-validate year from multiple sources
 * Returns: { bestYear, confidence, sourcesAgree, sources }
 */
function crossValidateYear(track) {
  const sources = [];
  
  // Collect all year sources
  if (track.spotifyYear) {
    sources.push({ name: 'Spotify', year: track.spotifyYear, weight: 1 });
  }
  
  // Spotify Original (highest weight - Spotify's own data for original album)
  if (track.spotifyOriginalYear) {
    sources.push({ name: 'Spotify Original', year: track.spotifyOriginalYear, weight: 3 });
  }
  
  if (track.lastFmYear) {
    sources.push({ name: 'Last.fm', year: track.lastFmYear, weight: 2 });
  }
  
  if (track.earliestRecordingYear) {
    sources.push({ name: 'MusicBrainz', year: track.earliestRecordingYear, weight: 2 });
  }
  
  if (sources.length === 0) {
    return {
      bestYear: track.spotifyYear,
      confidence: 'low',
      sourcesAgree: false,
      sources: []
    };
  }
  
  // Count votes (weighted)
  const yearVotes = {};
  sources.forEach(source => {
    if (!yearVotes[source.year]) {
      yearVotes[source.year] = { count: 0, weight: 0, sources: [] };
    }
    yearVotes[source.year].count++;
    yearVotes[source.year].weight += source.weight;
    yearVotes[source.year].sources.push(source.name);
  });
  
  // Find year with most votes/weight
  let bestYear = null;
  let bestWeight = 0;
  let bestCount = 0;
  
  Object.entries(yearVotes).forEach(([year, data]) => {
    if (data.weight > bestWeight || (data.weight === bestWeight && data.count > bestCount)) {
      bestYear = parseInt(year);
      bestWeight = data.weight;
      bestCount = data.count;
    }
  });
  
  // Determine if sources agree
  const uniqueYears = Object.keys(yearVotes).length;
  const sourcesAgree = uniqueYears === 1;
  const majorityAgree = bestCount >= Math.ceil(sources.length / 2);
  
  // Determine confidence
  let confidence;
  if (sourcesAgree && sources.length >= 2) {
    confidence = 'very_high';
  } else if (majorityAgree && bestCount >= 2) {
    confidence = 'high';
  } else if (sources.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Special case: If MB and Last.fm agree but differ from Spotify
  const mbYear = track.earliestRecordingYear;
  const lfmYear = track.lastFmYear;
  if (mbYear && lfmYear && mbYear === lfmYear && mbYear !== track.spotifyYear) {
    confidence = 'very_high';
    bestYear = mbYear;
  }
  
  return {
    bestYear: bestYear || track.spotifyYear,
    confidence: confidence,
    sourcesAgree: sourcesAgree,
    majorityAgree: majorityAgree,
    sources: sources,
    votes: yearVotes
  };
}

/**
 * Analyze tracks and assign flags based on various criteria
 */
function analyzeAndFlagTracks(tracks) {
  return tracks.map(track => {
    const flags = [];
    let status = 'green';
    
    // Get compilation detection
    const compilationResult = detectCompilationAlbum(track);
    track.compilationDetection = compilationResult;
    
    // Get year cross-validation
    const validation = crossValidateYear(track);
    track.validation = validation;
    track.recommendedYear = validation.bestYear;
    
    // Store the default/recommended selection for override tracking
    track.defaultSelectedYear = validation.bestYear;
    
    // Calculate oldest available year for yearChoice tracking
    const availableYears = [];
    if (track.spotifyYear) availableYears.push(track.spotifyYear);
    if (track.spotifyOriginalYear) availableYears.push(track.spotifyOriginalYear);
    if (track.earliestRecordingYear) availableYears.push(track.earliestRecordingYear);
    if (track.lastFmYear) availableYears.push(track.lastFmYear);
    track.oldestAvailableYear = availableYears.length > 0 ? Math.min(...availableYears) : null;
    track.availableYearsCount = new Set(availableYears).size;
    
    // 1. Compilation detected
    if (compilationResult.isCompilation) {
      flags.push({
        type: 'compilation',
        level: 'info',
        message: `Compilation album detected (${compilationResult.confidence} confidence)`,
        details: compilationResult.reasons.join('; ')
      });
      
      if (validation.sourcesAgree && validation.bestYear < track.spotifyYear) {
        flags.push({
          type: 'compilation_resolved',
          level: 'info',
          message: `All sources agree on ${validation.bestYear} (earlier than Spotify ${track.spotifyYear})`
        });
        status = 'green';
      } else if (!validation.sourcesAgree) {
        status = 'yellow';
        flags.push({
          type: 'year_conflict',
          level: 'warning',
          message: `Sources disagree: ${Object.keys(validation.votes).join(', ')}`
        });
      }
    }
    
    // 2. Multiple artists (featuring)
    if (track.artist.includes('feat.') || track.artist.includes('&')) {
      flags.push({
        type: 'multiple_artists',
        level: 'info',
        message: 'Multiple artists detected in track'
      });
    }
    
    // 3. Remix/Remaster
    const titleLower = track.title.toLowerCase();
    const isRemixOrRemaster = titleLower.includes('remix') || 
                              titleLower.includes('remaster') ||
                              titleLower.includes('live') ||
                              titleLower.includes('acoustic') ||
                              titleLower.includes('demo');
    
    if (isRemixOrRemaster && !validation.sourcesAgree) {
      flags.push({
        type: 'remix_remaster',
        level: 'warning',
        message: 'Remix/remaster/live version with conflicting years',
        details: `Sources: ${validation.sources.map(s => `${s.name}: ${s.year}`).join(', ')}`
      });
      status = 'yellow';
    }
    
    // 4. Year conflict without compilation
    if (!compilationResult.isCompilation && !validation.sourcesAgree) {
      flags.push({
        type: 'year_conflict',
        level: 'warning',
        message: 'Year conflict between sources',
        details: `Sources: ${validation.sources.map(s => `${s.name}: ${s.year}`).join(', ')}`
      });
      status = 'yellow';
    }
    
    // 5. Large year difference
    const yearDiff = Math.abs(track.spotifyYear - validation.bestYear);
    if (yearDiff >= 5) {
      flags.push({
        type: 'large_year_diff',
        level: 'warning',
        message: `Large year difference: ${yearDiff} years`,
        details: `Spotify: ${track.spotifyYear}, Recommended: ${validation.bestYear}`
      });
      status = 'yellow';
    }
    
    // 6. No external validation
    if (!track.earliestRecordingYear && !track.lastFmYear && !track.spotifyOriginalYear) {
      flags.push({
        type: 'no_validation',
        level: 'info',
        message: 'No external year validation available',
        details: 'Only Spotify data available'
      });
    }
    
    // 7. CRITICAL: Compilation with major disagreement
    if (compilationResult.isCompilation && yearDiff >= 10) {
      flags.push({
        type: 'critical_compilation',
        level: 'error',
        message: 'Compilation with large year discrepancy',
        details: `Spotify shows ${track.spotifyYear}, but sources suggest ${validation.bestYear}`
      });
      status = 'red';
    }
    
    return {
      ...track,
      flags: flags,
      status: status,
      needsReview: status !== 'green'
    };
  });
}

/**
 * Get decade string from year
 */
function getDecadeFromYear(year) {
  if (!year || year < 1900) return 'unknown';
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

/**
 * Calculate playlist statistics - Extended for ML training
 */
function calculatePlaylistStats(tracks) {
  const stats = {
    total: tracks.length,
    verified: 0,
    green: 0,
    yellow: 0,
    red: 0,
    needsReview: 0,
    withMBMatch: 0,
    withISRC: 0,
    avgYearDiff: 0,
    flagTypes: {},
    
    // Original source accuracy
    sourceAccuracy: {
      'Spotify': 0,
      'Spotify Original': 0,
      'Last.fm': 0,
      'MusicBrainz': 0,
      'Custom': 0
    },
    
    // Original confidence accuracy
    confidenceAccuracy: {
      'very_high': { total: 0, correct: 0 },
      'high': { total: 0, correct: 0 },
      'medium': { total: 0, correct: 0 },
      'low': { total: 0, correct: 0 },
      'none': { total: 0, correct: 0 }
    },
    
    // Extended source statistics (fas 1)
    sourceStats: {
      'Spotify': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, deviations: [] },
      'SpotifyOriginal': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, deviations: [] },
      'LastFm': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, deviations: [] },
      'MusicBrainz': { hadData: 0, noData: 0, selectedAsWinner: 0, agreedWithFinal: 0, deviations: [] }
    },
    
    // Conflict statistics (fas 1)
    conflicts: {
      allAgreed: 0,
      twoVsOne: 0,
      threeWaySplit: 0,
      totalWithMultipleSources: 0,
      yearSpreadSum: 0,
      avgYearSpread: 0
    },
    
    // Compilation detection statistics (fas 1)
    compilationStats: {
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
    },
    
    // Year choice statistics (fas 2)
    yearChoiceStats: {
      choseOldest: 0,
      choseNewer: 0,
      totalWithChoice: 0,
      yearDiffSumWhenNewer: 0,
      avgYearDiffWhenNewer: 0,
      newerBySource: {
        'Spotify': 0,
        'SpotifyOriginal': 0,
        'MusicBrainz': 0,
        'LastFm': 0,
        'Custom': 0
      }
    },
    
    // Recommendation accuracy per scenario (fas 2)
    recommendationAccuracy: {
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
    },
    
    // Override statistics (fas 2)
    overrideStats: {
      keptDefault: 0,
      changedSelection: 0,
      overrideReasons: {
        olderYear: 0,
        newerYear: 0,
        customYear: 0
      }
    },
    
    // Flag accuracy correlation (fas 2)
    flagAccuracy: {
      compilation: { correct: 0, total: 0 },
      compilation_resolved: { correct: 0, total: 0 },
      year_conflict: { correct: 0, total: 0 },
      multiple_artists: { correct: 0, total: 0 },
      remix_remaster: { correct: 0, total: 0 },
      large_year_diff: { correct: 0, total: 0 },
      no_validation: { correct: 0, total: 0 },
      critical_compilation: { correct: 0, total: 0 }
    }
  };
  
  let yearDiffSum = 0;
  let yearDiffCount = 0;
  
  tracks.forEach(track => {
    // Count by status
    if (track.status === 'green') stats.green++;
    else if (track.status === 'yellow') stats.yellow++;
    else if (track.status === 'red') stats.red++;
    
    // === SOURCE STATS ===
    if (track.spotifyYear) {
      stats.sourceStats['Spotify'].hadData++;
    } else {
      stats.sourceStats['Spotify'].noData++;
    }
    
    if (track.spotifyOriginalYear) {
      stats.sourceStats['SpotifyOriginal'].hadData++;
    } else {
      stats.sourceStats['SpotifyOriginal'].noData++;
    }
    
    if (track.lastFmYear) {
      stats.sourceStats['LastFm'].hadData++;
    } else {
      stats.sourceStats['LastFm'].noData++;
    }
    
    if (track.earliestRecordingYear) {
      stats.sourceStats['MusicBrainz'].hadData++;
    } else {
      stats.sourceStats['MusicBrainz'].noData++;
    }
    
    // === CONFLICT STATS ===
    if (track.validation && track.validation.votes) {
      const uniqueYears = Object.keys(track.validation.votes).length;
      const sourceCount = track.validation.sources ? track.validation.sources.length : 0;
      
      if (sourceCount >= 2) {
        stats.conflicts.totalWithMultipleSources++;
        
        if (uniqueYears === 1) {
          stats.conflicts.allAgreed++;
        } else if (uniqueYears === 2 && sourceCount >= 3) {
          const voteCounts = Object.values(track.validation.votes).map(v => v.count);
          if (voteCounts.includes(2) && voteCounts.includes(1)) {
            stats.conflicts.twoVsOne++;
          }
        } else if (uniqueYears >= 3) {
          stats.conflicts.threeWaySplit++;
        }
        
        const years = Object.keys(track.validation.votes).map(y => parseInt(y));
        if (years.length >= 2) {
          const spread = Math.max(...years) - Math.min(...years);
          stats.conflicts.yearSpreadSum += spread;
        }
      }
    }
    
    // === COMPILATION STATS ===
    if (track.compilationDetection && track.compilationDetection.isCompilation) {
      stats.compilationStats.triggered++;
      stats.compilationStats.byConfidence[track.compilationDetection.confidence]++;
      
      if (track.recommendedYear && track.spotifyYear) {
        if (track.recommendedYear !== track.spotifyYear) {
          stats.compilationStats.changedYear++;
        } else {
          stats.compilationStats.keptOriginal++;
        }
      }
    }
    
    // === VERIFIED TRACK STATS ===
    if (track.verified) {
      stats.verified++;
      
      const finalYear = track.verifiedYear;
      const recommendedYear = track.recommendedYear;
      const wasCorrect = finalYear === recommendedYear;
      
      // Source accuracy
      if (track.chosenSource) {
        stats.sourceAccuracy[track.chosenSource]++;
      }
      
      // Confidence accuracy
      if (track.validation && track.validation.confidence) {
        const confidence = track.validation.confidence;
        stats.confidenceAccuracy[confidence].total++;
        if (wasCorrect) {
          stats.confidenceAccuracy[confidence].correct++;
        }
      }
      
      // Source agreement tracking
      if (track.spotifyYear) {
        if (track.spotifyYear === finalYear) {
          stats.sourceStats['Spotify'].agreedWithFinal++;
        } else {
          stats.sourceStats['Spotify'].deviations.push(track.spotifyYear - finalYear);
        }
      }
      
      if (track.spotifyOriginalYear) {
        if (track.spotifyOriginalYear === finalYear) {
          stats.sourceStats['SpotifyOriginal'].agreedWithFinal++;
        } else {
          stats.sourceStats['SpotifyOriginal'].deviations.push(track.spotifyOriginalYear - finalYear);
        }
      }
      
      if (track.lastFmYear) {
        if (track.lastFmYear === finalYear) {
          stats.sourceStats['LastFm'].agreedWithFinal++;
        } else {
          stats.sourceStats['LastFm'].deviations.push(track.lastFmYear - finalYear);
        }
      }
      
      if (track.earliestRecordingYear) {
        if (track.earliestRecordingYear === finalYear) {
          stats.sourceStats['MusicBrainz'].agreedWithFinal++;
        } else {
          stats.sourceStats['MusicBrainz'].deviations.push(track.earliestRecordingYear - finalYear);
        }
      }
      
      if (track.chosenSource) {
        const sourceKey = mapSourceNameToKey(track.chosenSource);
        if (stats.sourceStats[sourceKey]) {
          stats.sourceStats[sourceKey].selectedAsWinner++;
        }
      }
      
      // === YEAR CHOICE STATS ===
      if (track.oldestAvailableYear && track.availableYearsCount > 1) {
        stats.yearChoiceStats.totalWithChoice++;
        
        if (finalYear === track.oldestAvailableYear) {
          stats.yearChoiceStats.choseOldest++;
        } else if (finalYear > track.oldestAvailableYear) {
          stats.yearChoiceStats.choseNewer++;
          stats.yearChoiceStats.yearDiffSumWhenNewer += (finalYear - track.oldestAvailableYear);
          
          if (track.chosenSource) {
            const sourceKey = mapSourceNameToKey(track.chosenSource);
            if (stats.yearChoiceStats.newerBySource[sourceKey] !== undefined) {
              stats.yearChoiceStats.newerBySource[sourceKey]++;
            }
          }
        }
      }
      
      // === RECOMMENDATION ACCURACY ===
      
      // By match method
      const matchMethod = track.matchMethod || 'none';
      if (stats.recommendationAccuracy.byMatchMethod[matchMethod]) {
        stats.recommendationAccuracy.byMatchMethod[matchMethod].total++;
        if (wasCorrect) {
          stats.recommendationAccuracy.byMatchMethod[matchMethod].correct++;
        }
      }
      
      // By album type
      const albumType = track.albumType || 'unknown';
      if (stats.recommendationAccuracy.byAlbumType[albumType]) {
        stats.recommendationAccuracy.byAlbumType[albumType].total++;
        if (wasCorrect) {
          stats.recommendationAccuracy.byAlbumType[albumType].correct++;
        }
      }
      
      // By source count
      const sourceCount = track.validation?.sources?.length || 1;
      const sourceCountKey = ['one', 'two', 'three', 'four'][Math.min(sourceCount, 4) - 1];
      if (stats.recommendationAccuracy.bySourceCount[sourceCountKey]) {
        stats.recommendationAccuracy.bySourceCount[sourceCountKey].total++;
        if (wasCorrect) {
          stats.recommendationAccuracy.bySourceCount[sourceCountKey].correct++;
        }
      }
      
      // By decade
      const decade = getDecadeFromYear(finalYear);
      if (stats.recommendationAccuracy.byDecade[decade]) {
        stats.recommendationAccuracy.byDecade[decade].total++;
        if (wasCorrect) {
          stats.recommendationAccuracy.byDecade[decade].correct++;
        }
      }
      
      // === OVERRIDE STATS ===
      if (track.defaultSelectedYear) {
        if (finalYear === track.defaultSelectedYear) {
          stats.overrideStats.keptDefault++;
        } else {
          stats.overrideStats.changedSelection++;
          
          if (track.chosenSource === 'Custom') {
            stats.overrideStats.overrideReasons.customYear++;
          } else if (finalYear < track.defaultSelectedYear) {
            stats.overrideStats.overrideReasons.olderYear++;
          } else {
            stats.overrideStats.overrideReasons.newerYear++;
          }
        }
      }
      
      // === FLAG ACCURACY ===
      if (track.flags && track.flags.length > 0) {
        track.flags.forEach(flag => {
          if (stats.flagAccuracy[flag.type]) {
            stats.flagAccuracy[flag.type].total++;
            if (wasCorrect) {
              stats.flagAccuracy[flag.type].correct++;
            }
          }
        });
      }
    }
    
    if (track.needsReview) stats.needsReview++;
    if (track.mbYear) stats.withMBMatch++;
    if (track.isrc) stats.withISRC++;
    
    if (track.mbYear) {
      yearDiffSum += Math.abs(track.spotifyYear - track.mbYear);
      yearDiffCount++;
    }
    
    track.flags.forEach(flag => {
      if (!stats.flagTypes[flag.type]) {
        stats.flagTypes[flag.type] = 0;
      }
      stats.flagTypes[flag.type]++;
    });
  });
  
  // Calculate averages
  if (yearDiffCount > 0) {
    stats.avgYearDiff = Math.round(yearDiffSum / yearDiffCount);
  }
  
  if (stats.conflicts.totalWithMultipleSources > 0) {
    stats.conflicts.avgYearSpread = Math.round(
      (stats.conflicts.yearSpreadSum / stats.conflicts.totalWithMultipleSources) * 10
    ) / 10;
  }
  
  Object.keys(stats.sourceStats).forEach(source => {
    const deviations = stats.sourceStats[source].deviations;
    if (deviations.length > 0) {
      const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
      stats.sourceStats[source].avgDeviation = Math.round(avgDeviation * 10) / 10;
    } else {
      stats.sourceStats[source].avgDeviation = 0;
    }
    delete stats.sourceStats[source].deviations;
  });
  
  if (stats.yearChoiceStats.choseNewer > 0) {
    stats.yearChoiceStats.avgYearDiffWhenNewer = Math.round(
      (stats.yearChoiceStats.yearDiffSumWhenNewer / stats.yearChoiceStats.choseNewer) * 10
    ) / 10;
  }
  delete stats.yearChoiceStats.yearDiffSumWhenNewer;
  
  delete stats.conflicts.yearSpreadSum;
  
  return stats;
}

/**
 * Helper: Map display source name to Firebase-safe key
 */
function mapSourceNameToKey(sourceName) {
  const mapping = {
    'Spotify': 'Spotify',
    'Spotify Original': 'SpotifyOriginal',
    'Last.fm': 'LastFm',
    'MusicBrainz': 'MusicBrainz',
    'Custom': 'Custom'
  };
  return mapping[sourceName] || sourceName;
}

/**
 * Sort tracks for display
 */
function sortTracksByStatus(tracks) {
  const order = { red: 0, yellow: 1, green: 2 };
  
  return [...tracks].sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    const flagDiff = b.flags.length - a.flags.length;
    if (flagDiff !== 0) return flagDiff;
    
    const aYearDiff = a.mbYear ? Math.abs(a.spotifyYear - a.mbYear) : 0;
    const bYearDiff = b.mbYear ? Math.abs(b.spotifyYear - b.mbYear) : 0;
    return bYearDiff - aYearDiff;
  });
}

/**
 * Filter tracks by status
 */
function filterTracksByStatus(tracks, statusFilter) {
  if (statusFilter === 'all') return tracks;
  if (statusFilter === 'flagged') return tracks.filter(t => t.status !== 'green');
  return tracks.filter(t => t.status === statusFilter);
}

/**
 * Update track's verified year
 */
function updateTrackYear(tracks, spotifyId, newYear) {
  const track = tracks.find(t => t.spotifyId === spotifyId);
  if (track) {
    track.verifiedYear = parseInt(newYear);
    track.verified = true;
    if (track.status === 'red' || track.status === 'yellow') {
      track.status = 'green';
    }
  }
  return tracks;
}

/**
 * Remove track from playlist
 */
function removeTrack(tracks, spotifyId) {
  return tracks.filter(t => t.spotifyId !== spotifyId);
}

/**
 * Auto-approve all green tracks
 */
function autoApproveGreenTracks(tracks) {
  return tracks.map(track => {
    if (track.status === 'green' && !track.verified) {
      return {
        ...track,
        verifiedYear: track.recommendedYear,
        verified: true
      };
    }
    return track;
  });
}

/**
 * Prepare playlist for export
 */
function prepareForExport(playlistName, playlistUrl, tracks) {
  const verifiedTracks = tracks.filter(t => t.verified);
  const stats = calculatePlaylistStats(tracks);
  
  const firebaseSafeSourceAccuracy = {
    'Spotify': stats.sourceAccuracy['Spotify'] || 0,
    'SpotifyOriginal': stats.sourceAccuracy['Spotify Original'] || 0,
    'LastFm': stats.sourceAccuracy['Last.fm'] || 0,
    'MusicBrainz': stats.sourceAccuracy['MusicBrainz'] || 0,
    'Custom': stats.sourceAccuracy['Custom'] || 0
  };
  
  const firebaseSafeStats = {
    ...stats,
    sourceAccuracy: firebaseSafeSourceAccuracy
  };
  
  return {
    name: playlistName,
    spotifyUrl: playlistUrl,
    verifiedAt: new Date().toISOString(),
    verifiedBy: 'admin',
    isStandardPlaylist: true,
    totalTracks: verifiedTracks.length,
    songs: verifiedTracks.map(track => ({
      spotifyId: track.spotifyId,
      title: track.title,
      artist: track.artist,
      year: track.verifiedYear
    })),
    _metadata: {
      originalTrackCount: tracks.length,
      removedTracks: tracks.length - verifiedTracks.length,
      validationStats: firebaseSafeStats,
      sourceAccuracy: firebaseSafeSourceAccuracy
    }
  };
}

/**
 * Export to JSON file
 */
function exportToJSON(playlistData) {
  const blob = new Blob([JSON.stringify(playlistData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${playlistData.name.replace(/[^a-z0-9]/gi, '_')}_verified.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Save to Firebase validator database
 */
async function saveToFirebase(playlistData) {
  if (!window.validatorFirebase) {
    throw new Error('Firebase är inte initialiserad');
  }
  
  if (!playlistData || !playlistData.songs || playlistData.songs.length === 0) {
    throw new Error('Ingen data att spara');
  }
  
  try {
    const playlistId = 'playlist_' + Date.now();
    await window.validatorFirebase.set(`verifiedPlaylists/${playlistId}`, playlistData);
    console.log(`✅ Playlist saved to Firebase: ${playlistId}`);
    return playlistId;
  } catch (error) {
    console.error('Failed to save to Firebase:', error);
    if (error.code === 'PERMISSION_DENIED') {
      throw new Error('Firebase-behörighet nekad. Kontrollera security rules.');
    }
    if (error.message.includes('network')) {
      throw new Error('Nätverksfel: Kunde inte spara till Firebase.');
    }
    throw new Error(`Firebase-fel: ${error.message}`);
  }
}

/**
 * Validate that all tracks have been reviewed
 */
function validateReadyForExport(tracks) {
  const unverified = tracks.filter(t => !t.verified);
  if (unverified.length > 0) {
    return {
      ready: false,
      message: `${unverified.length} låtar behöver fortfarande granskas`,
      unverifiedTracks: unverified
    };
  }
  return { ready: true, message: 'Alla låtar är verifierade och redo för export' };
}

/**
 * Prepare playlist data in game format
 */
function prepareForGameFormat(playlistName, tracks) {
  const verifiedTracks = tracks.filter(t => t.verified);
  if (verifiedTracks.length === 0) {
    throw new Error('Inga verifierade låtar att exportera');
  }
  
  const songs = {};
  verifiedTracks.forEach(track => {
    songs[track.spotifyId] = {
      artist: track.artist,
      title: track.title,
      year: String(track.verifiedYear)
    };
  });
  
  return { playlistName, songs, totalTracks: verifiedTracks.length };
}

/**
 * Export playlist in game format
 */
function exportGameFormatJSON(playlistName, tracks) {
  const gameData = prepareForGameFormat(playlistName, tracks);
  const blob = new Blob([JSON.stringify(gameData.songs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${playlistName.replace(/[^a-z0-9]/gi, '_')}_game_format.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log(`✅ Game format JSON exported: ${gameData.totalTracks} tracks`);
}

// Export functions
window.validator = {
  analyzeAndFlagTracks,
  calculatePlaylistStats,
  sortTracksByStatus,
  filterTracksByStatus,
  updateTrackYear,
  removeTrack,
  autoApproveGreenTracks,
  prepareForExport,
  exportToJSON,
  saveToFirebase,
  validateReadyForExport,
  prepareForGameFormat,
  exportGameFormatJSON
};
