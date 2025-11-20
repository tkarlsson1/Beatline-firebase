// Validator - Core logic for analyzing and flagging tracks

/**
 * Analyze tracks and assign flags based on various criteria
 */
function analyzeAndFlagTracks(tracks) {
  return tracks.map(track => {
    const flags = [];
    
    // FLAG 1: Multiple artists (potential modern version/feature)
    if (track.allArtists.includes('feat.') || 
        track.allArtists.includes('ft.') ||
        track.allArtists.includes('&') ||
        track.allArtists.includes(',') ||
        track.allArtists.includes(' x ')) {
      flags.push({
        type: 'multiple_artists',
        severity: 'warning',
        message: 'Flera artister - kan vara modern version eller feature'
      });
    }
    
    // FLAG 2: Modified version in title
    const modifiedRegex = /remix|remaster|rerecord|live|version|edit|mix\)/i;
    if (modifiedRegex.test(track.title)) {
      flags.push({
        type: 'modified_version',
        severity: 'warning',
        message: 'Remix/remaster/live-version i titel'
      });
    }
    
    // FLAG 3: Compilation album
    if (track.albumType === 'compilation') {
      flags.push({
        type: 'compilation',
        severity: 'info',
        message: 'Från samlingsalbum - år kan vara albumets release istället för originalet'
      });
    }
    
    // FLAG 4: Spotify year > MusicBrainz year (modern re-release)
    if (track.mbYear && track.spotifyYear > track.mbYear) {
      const diff = track.spotifyYear - track.mbYear;
      const severity = diff > 10 ? 'error' : 'warning';
      
      flags.push({
        type: 'year_mismatch_newer',
        severity: severity,
        message: `Spotify år (${track.spotifyYear}) är nyare än originalår (${track.mbYear}) - skillnad: ${diff} år`
      });
    }
    
    // FLAG 5: Spotify year < MusicBrainz year (suspicious)
    if (track.mbYear && track.spotifyYear < track.mbYear) {
      flags.push({
        type: 'suspicious_year',
        severity: 'error',
        message: `Spotify år (${track.spotifyYear}) är äldre än MusicBrainz (${track.mbYear}) - troligt datafel`
      });
    }
    
    // FLAG 6: No MusicBrainz match
    if (track.matchMethod === 'none') {
      flags.push({
        type: 'no_match',
        severity: 'warning',
        message: 'Ingen match i MusicBrainz - manuell kontroll krävs'
      });
    }
    
    // FLAG 7: Low confidence match
    if (track.confidence === 'low') {
      flags.push({
        type: 'low_confidence',
        severity: 'warning',
        message: 'Osäker match i MusicBrainz - verifiera manuellt'
      });
    }
    
    // FLAG 8: No ISRC (less reliable)
    if (!track.isrc) {
      flags.push({
        type: 'no_isrc',
        severity: 'info',
        message: 'Ingen ISRC-kod - använder artist+titel-sökning'
      });
    }
    
    // FLAG 9: Very old track with modern album type
    if (track.mbYear && track.mbYear < 1990 && track.albumType === 'compilation') {
      flags.push({
        type: 'old_on_compilation',
        severity: 'warning',
        message: 'Gammal låt på samlingsalbum - kontrollera årtalet'
      });
    }
    
    // Determine overall status based on flags
    let status = 'green'; // OK to use
    
    if (flags.some(f => f.severity === 'error')) {
      status = 'red'; // Must review
    } else if (flags.some(f => f.severity === 'warning')) {
      status = 'yellow'; // Should review
    }
    
    // Determine recommended year
    let recommendedYear = track.spotifyYear;
    
    if (track.mbYear) {
      // If MusicBrainz year exists and is older or same, prefer it
      if (track.mbYear <= track.spotifyYear) {
        recommendedYear = track.mbYear;
      }
      // If Spotify is older (suspicious), flag for manual review but suggest Spotify
      else {
        recommendedYear = track.spotifyYear;
      }
    }
    
    return {
      ...track,
      flags,
      status,
      recommendedYear,
      verifiedYear: null,  // Will be set during manual review
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
    throw new Error('Firebase not initialized');
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
    throw error;
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
