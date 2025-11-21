// Validator - Core logic for analyzing and flagging tracks

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
    { regex: /greatest\s*hits/i, points: 40, name: 'Greatest Hits' },
    { regex: /best\s*of/i, points: 40, name: 'Best Of' },
    { regex: /anthology/i, points: 35, name: 'Anthology' },
    { regex: /collection/i, points: 30, name: 'Collection' },
    { regex: /\bessential\b/i, points: 30, name: 'Essential' },
    { regex: /\bgold\b/i, points: 25, name: 'Gold Edition' },
    { regex: /\bultimate\b/i, points: 30, name: 'Ultimate' },
    { regex: /\bclassic/i, points: 20, name: 'Classics' },
    { regex: /\bhits\b/i, points: 25, name: 'Hits compilation' }
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
    if (albumData.totalTracks > 25) {
      score += 20;
      reasons.push(`Many tracks (${albumData.totalTracks})`);
    } else if (albumData.totalTracks > 20) {
      score += 10;
      reasons.push(`Many tracks (${albumData.totalTracks})`);
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
      /legacy/i,
      /universal compilation/i,
      /sony compilation/i,
      /warner compilation/i
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
    confidence = 'very_high'; // All sources agree
  } else if (majorityAgree && bestCount >= 2) {
    confidence = 'high'; // Majority agrees
  } else if (sources.length >= 2) {
    confidence = 'medium'; // Multiple sources but disagree
  } else {
    confidence = 'low'; // Only one source
  }
  
  // Special case: If MB and Last.fm agree but differ from Spotify
  const mbYear = track.earliestRecordingYear;
  const lfmYear = track.lastFmYear;
  if (mbYear && lfmYear && mbYear === lfmYear && mbYear !== track.spotifyYear) {
    confidence = 'very_high'; // Two independent sources agree
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
    
    // 1. Detect if album is compilation
    const compilationAnalysis = detectCompilationAlbum(track);
    track.compilationAnalysis = compilationAnalysis;
    
    if (compilationAnalysis.isCompilation) {
      flags.push({
        type: 'compilation_detected',
        severity: 'info',
        message: `Samlingsalbum detekterat (${compilationAnalysis.confidence} confidence): ${compilationAnalysis.reasons.join(', ')}`
      });
    }
    
    // 2. Cross-validate year from all sources
    const validation = crossValidateYear(track);
    track.validation = validation;
    
    // Get earliest recording year from SAME artist
    const earliestYear = track.earliestRecordingYear;
    const hasEarliestData = earliestYear !== null && earliestYear !== undefined;
    
    // 3. Multiple artists (potential modern version/feature)
    if (track.allArtists.includes('feat.') || 
        track.allArtists.includes('ft.') ||
        track.allArtists.includes('&') ||
        track.allArtists.includes(',') ||
        track.allArtists.includes(' x ')) {
      
      if (hasEarliestData) {
        // Same base artist but with features
        flags.push({
          type: 'multiple_artists',
          severity: 'info',
          message: 'Flera artister listade'
        });
      } else {
        // Different base artist - expected for features
        flags.push({
          type: 'feature_collaboration',
          severity: 'info',
          message: 'Feature/collaboration - använder nytt årtal (korrekt)'
        });
      }
    }
    
    // 4. Modified version in title
    const modifiedRegex = /remix|remaster|rerecord|live|version|edit|mix\)/i;
    if (modifiedRegex.test(track.title)) {
      flags.push({
        type: 'modified_version',
        severity: 'warning',
        message: 'Remix/remaster/live-version i titel'
      });
    }
    
    // 5. CRITICAL: Compilation + Multiple sources agree on older year
    if (compilationAnalysis.isCompilation && 
        validation.bestYear < track.spotifyYear) {
      
      const diff = track.spotifyYear - validation.bestYear;
      
      if (validation.confidence === 'very_high' && diff > 2) {
        // Multiple sources strongly agree - this is almost certainly wrong
        flags.push({
          type: 'compilation_wrong_year_confirmed',
          severity: 'error',
          message: `Samlingsalbum med fel årtal: Spotify ${track.spotifyYear}, men ${validation.sources.map(s => s.name).join(' + ')} säger ${validation.bestYear} (${diff} år skillnad)`
        });
      } else if (validation.confidence === 'high' && diff > 2) {
        flags.push({
          type: 'compilation_wrong_year_likely',
          severity: 'error',
          message: `Troligt fel årtal: Spotify ${track.spotifyYear}, källor föreslår ${validation.bestYear} (${diff} år skillnad)`
        });
      } else if (diff > 2) {
        flags.push({
          type: 'compilation_year_mismatch',
          severity: 'warning',
          message: `Årtalsskillnad: Spotify ${track.spotifyYear} vs föreslaget ${validation.bestYear} (${diff} år)`
        });
      }
    }
    
    // 6. Year mismatch even without compilation
    else if (!compilationAnalysis.isCompilation && 
             validation.bestYear && 
             validation.bestYear < track.spotifyYear) {
      
      const diff = track.spotifyYear - validation.bestYear;
      
      if (validation.confidence === 'very_high' && diff > 5) {
        flags.push({
          type: 'year_mismatch_confirmed',
          severity: 'error',
          message: `Stora skillnader mellan källor: Spotify ${track.spotifyYear}, konsensus ${validation.bestYear} (${diff} år)`
        });
      } else if (diff > 5) {
        flags.push({
          type: 'year_mismatch_potential',
          severity: 'warning',
          message: `Potentiell avvikelse: Spotify ${track.spotifyYear} vs ${validation.bestYear} (${diff} år)`
        });
      }
    }
    
    // 7. Sources disagree significantly
    if (!validation.sourcesAgree && validation.sources.length >= 2) {
      const years = Object.keys(validation.votes);
      if (Math.max(...years) - Math.min(...years) > 5) {
        flags.push({
          type: 'sources_disagree',
          severity: 'warning',
          message: `Källor är oense: ${validation.sources.map(s => `${s.name}(${s.year})`).join(', ')}`
        });
      }
    }
    
    // 8. No external validation (only Spotify data)
    if (validation.sources.length === 1 && validation.sources[0].name === 'Spotify') {
      flags.push({
        type: 'no_external_validation',
        severity: 'info',
        message: 'Ingen extern validering (ej funnen i MusicBrainz/Last.fm)'
      });
    }
    
    // 9. High confidence correct
    if (validation.confidence === 'very_high' && 
        validation.bestYear === track.spotifyYear) {
      flags.push({
        type: 'validated_correct',
        severity: 'info',
        message: `Verifierat korrekt av ${validation.sources.length} källor`
      });
    }
    
    // Determine overall status based on flags
    let status = 'green'; // OK to use
    
    // Red: Confirmed wrong year
    if (flags.some(f => 
      f.type === 'compilation_wrong_year_confirmed' || 
      f.type === 'compilation_wrong_year_likely' ||
      f.type === 'year_mismatch_confirmed'
    )) {
      status = 'red';
    }
    // Yellow: Potential issues
    else if (flags.some(f => 
      f.type === 'compilation_year_mismatch' ||
      f.type === 'year_mismatch_potential' ||
      f.type === 'sources_disagree' ||
      f.type === 'modified_version'
    )) {
      status = 'yellow';
    }
    
    // Determine recommended year
    // Use validation bestYear if confidence is high and it differs from Spotify
    let recommendedYear = track.spotifyYear;
    
    if (validation.confidence === 'very_high' && validation.bestYear !== track.spotifyYear) {
      recommendedYear = validation.bestYear;
    } else if (validation.confidence === 'high' && 
               compilationAnalysis.isCompilation &&
               validation.bestYear < track.spotifyYear) {
      recommendedYear = validation.bestYear;
    } else if (validation.bestYear && 
               validation.bestYear < track.spotifyYear &&
               track.spotifyYear - validation.bestYear > 5) {
      recommendedYear = validation.bestYear;
    }
    
    // Auto-fix determination
    // We can auto-fix if:
    // 1. Very high confidence
    // 2. Multiple sources agree
    // 3. Compilation detected
    // 4. Significant year difference
    const canAutoFix = 
      validation.confidence === 'very_high' &&
      validation.sourcesAgree &&
      compilationAnalysis.isCompilation &&
      Math.abs(validation.bestYear - track.spotifyYear) > 2;
    
    return {
      ...track,
      flags,
      status,
      recommendedYear,
      canAutoFix,
      verifiedYear: null,
      verified: false,
      needsReview: status !== 'green'
    };
  });
}

/**
 * Calculate statistics for analyzed playlist
 */
function calculatePlaylistStats(tracks) {
  const stats = {
    total: tracks.length,
    green: 0,
    yellow: 0,
    red: 0,
    verified: 0,
    needsReview: 0,
    withMBMatch: 0,
    withISRC: 0,
    avgYearDiff: 0,
    flagTypes: {}
  };
  
  let yearDiffSum = 0;
  let yearDiffCount = 0;
  
  tracks.forEach(track => {
    // Count by status
    if (track.status === 'green') stats.green++;
    else if (track.status === 'yellow') stats.yellow++;
    else if (track.status === 'red') stats.red++;
    
    if (track.verified) stats.verified++;
    if (track.needsReview) stats.needsReview++;
    if (track.mbYear) stats.withMBMatch++;
    if (track.isrc) stats.withISRC++;
    
    // Calculate year diff
    if (track.mbYear) {
      yearDiffSum += Math.abs(track.spotifyYear - track.mbYear);
      yearDiffCount++;
    }
    
    // Count flag types
    track.flags.forEach(flag => {
      if (!stats.flagTypes[flag.type]) {
        stats.flagTypes[flag.type] = 0;
      }
      stats.flagTypes[flag.type]++;
    });
  });
  
  if (yearDiffCount > 0) {
    stats.avgYearDiff = Math.round(yearDiffSum / yearDiffCount);
  }
  
  return stats;
}

/**
 * Sort tracks for display (red first, then yellow, then green)
 */
function sortTracksByStatus(tracks) {
  const order = { red: 0, yellow: 1, green: 2 };
  
  return [...tracks].sort((a, b) => {
    // First by status
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    // Then by number of flags (more flags first)
    const flagDiff = b.flags.length - a.flags.length;
    if (flagDiff !== 0) return flagDiff;
    
    // Then by year difference (larger diff first)
    const aYearDiff = a.mbYear ? Math.abs(a.spotifyYear - a.mbYear) : 0;
    const bYearDiff = b.mbYear ? Math.abs(b.spotifyYear - b.mbYear) : 0;
    return bYearDiff - aYearDiff;
  });
}

/**
 * Filter tracks by status
 */
function filterTracksByStatus(tracks, statusFilter) {
  if (statusFilter === 'all') {
    return tracks;
  }
  
  if (statusFilter === 'flagged') {
    return tracks.filter(t => t.status !== 'green');
  }
  
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
    
    // If manually verified, mark as green
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
    // Metadata for reference
    _metadata: {
      originalTrackCount: tracks.length,
      removedTracks: tracks.length - verifiedTracks.length,
      validationStats: calculatePlaylistStats(tracks)
    }
  };
}

/**
 * Export to JSON file
 */
function exportToJSON(playlistData) {
  const blob = new Blob([JSON.stringify(playlistData, null, 2)], {
    type: 'application/json'
  });
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
    // Generate unique ID
    const playlistId = 'playlist_' + Date.now();
    
    // Save to verifiedPlaylists
    await window.validatorFirebase.set(
      `verifiedPlaylists/${playlistId}`,
      playlistData
    );
    
    console.log(`✅ Playlist saved to Firebase: ${playlistId}`);
    return playlistId;
    
  } catch (error) {
    console.error('Failed to save to Firebase:', error);
    
    // Better error messages
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
  
  return {
    ready: true,
    message: 'Alla låtar är verifierade och redo för export'
  };
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
  validateReadyForExport
};
