// MusicBrainz API Wrapper
// Rate limited to 1 request per second as per MusicBrainz guidelines
// https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
const RATE_LIMIT_MS = 1000; // 1 second between requests

let lastRequestTime = 0;
let requestQueue = [];
let isProcessingQueue = false;

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate-limited fetch to MusicBrainz
 */
async function rateLimitedFetch(url) {
  // Calculate wait time
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const waitTime = Math.max(0, RATE_LIMIT_MS - timeSinceLastRequest);
  
  if (waitTime > 0) {
    await sleep(waitTime);
  }
  
  lastRequestTime = Date.now();
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Notestream/2.4 (https://notestream.se)'
      }
    });
    
    if (!response.ok) {
      // MusicBrainz rate limit = 503
      if (response.status === 503) {
        throw new Error('MusicBrainz rate limit nådd. Vänta en stund och försök igen.');
      }
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }
    
    return response.json();
    
  } catch (error) {
    // Network error or timeout
    if (error.name === 'TypeError') {
      throw new Error('Nätverksfel: Kunde inte nå MusicBrainz API');
    }
    throw error;
  }
}

/**
 * Search MusicBrainz by ISRC (most accurate)
 * Returns: { found, recordingId, firstReleaseDate, title, artist }
 */
async function searchByISRC(isrc) {
  if (!isrc) {
    return { found: false };
  }
  
  try {
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=isrc:${isrc}&fmt=json`;
    const data = await rateLimitedFetch(url);
    
    if (!data.recordings || data.recordings.length === 0) {
      return { found: false };
    }
    
    const recording = data.recordings[0];
    
    // Find earliest release date
    let earliestDate = recording['first-release-date'] || null;
    
    // Check all releases for even earlier dates
    if (recording.releases && recording.releases.length > 0) {
      recording.releases.forEach(release => {
        const releaseDate = release.date || release['release-events']?.[0]?.date;
        if (releaseDate) {
          // Compare dates (YYYY-MM-DD format sorts correctly as strings)
          if (!earliestDate || releaseDate < earliestDate) {
            earliestDate = releaseDate;
          }
        }
      });
    }
    
    return {
      found: true,
      recordingId: recording.id,
      firstReleaseDate: earliestDate,
      title: recording.title,
      artist: recording['artist-credit']?.[0]?.name || 'Unknown',
      score: recording.score || 100 // MusicBrainz search score
    };
    
  } catch (error) {
    console.error(`MusicBrainz ISRC search failed for ${isrc}:`, error);
    return { found: false, error: error.message };
  }
}

/**
 * Normalize artist name - remove features, collaborations, etc
 * Used to identify the BASE artist
 */
function normalizeArtist(artistName) {
  if (!artistName) return '';
  
  return artistName
    .toLowerCase()
    // Split on common separators and take first artist
    .split(/\sfeat\.?\s/i)[0]
    .split(/\sft\.?\s/i)[0]
    .split(/\s&\s/)[0]
    .split(/\sx\s/i)[0]
    .split(/,/)[0]
    // Remove common suffixes
    .replace(/\sremix$/i, '')
    .replace(/\(.*?\)/g, '') // Remove parentheses
    .replace(/\[.*?\]/g, '') // Remove brackets
    // Clean up
    .replace(/[^\w\s]/g, '') // Remove special chars
    .trim();
}

/**
 * Normalize string for search (title)
 */
function normalizeForSearch(str) {
  return str
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove (Remastered 2010)
    .replace(/\[.*?\]/g, '') // Remove [Live]
    .replace(/feat\..*/gi, '') // Remove feat. part
    .replace(/ft\..*/gi, '') // Remove ft. part
    .replace(/[^\w\s]/g, '') // Remove special chars
    .trim();
}

/**
 * Calculate string similarity (simple Levenshtein-based)
 */
function stringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Search MusicBrainz by artist + title (fallback)
 * Returns: { found, recordings[] } where recordings contain all matches
 */
async function searchByArtistTitle(artist, title) {
  if (!artist || !title) {
    return { found: false, recordings: [] };
  }
  
  try {
    // Normalize search terms
    const cleanArtist = normalizeForSearch(artist);
    const cleanTitle = normalizeForSearch(title);
    
    // Build query
    const query = `artist:"${cleanArtist}" AND recording:"${cleanTitle}"`;
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
    
    const data = await rateLimitedFetch(url);
    
    if (!data.recordings || data.recordings.length === 0) {
      return { found: false, recordings: [] };
    }
    
    // Convert all recordings to our format
    const recordings = data.recordings.map(recording => {
      // Find earliest release date
      let earliestDate = recording['first-release-date'] || null;
      
      if (recording.releases && recording.releases.length > 0) {
        recording.releases.forEach(release => {
          const releaseDate = release.date || release['release-events']?.[0]?.date;
          if (releaseDate && (!earliestDate || releaseDate < earliestDate)) {
            earliestDate = releaseDate;
          }
        });
      }
      
      // Calculate similarity for this recording
      const mbTitle = normalizeForSearch(recording.title);
      const mbArtist = normalizeForSearch(recording['artist-credit']?.[0]?.name || '');
      
      const titleSim = stringSimilarity(cleanTitle, mbTitle);
      const artistSim = stringSimilarity(cleanArtist, mbArtist);
      const combinedScore = (titleSim * 0.6) + (artistSim * 0.4);
      
      return {
        recordingId: recording.id,
        firstReleaseDate: earliestDate,
        year: earliestDate ? parseInt(earliestDate.split('-')[0]) : null,
        title: recording.title,
        artist: recording['artist-credit']?.[0]?.name || 'Unknown',
        similarityScore: combinedScore,
        mbScore: recording.score
      };
    });
    
    // Sort by similarity score
    recordings.sort((a, b) => b.similarityScore - a.similarityScore);
    
    // Find best match
    const bestMatch = recordings[0];
    
    if (!bestMatch || bestMatch.similarityScore < 0.5) {
      return { found: false, recordings: [], reason: 'No good match (score too low)' };
    }
    
    // Determine confidence based on best match
    let confidence;
    if (bestMatch.similarityScore >= 0.9) confidence = 'high';
    else if (bestMatch.similarityScore >= 0.7) confidence = 'medium';
    else confidence = 'low';
    
    return {
      found: true,
      recordings: recordings, // Return ALL recordings
      bestMatch: bestMatch,
      confidence: confidence
    };
    
  } catch (error) {
    console.error(`MusicBrainz search failed for "${artist} - ${title}":`, error);
    return { found: false, recordings: [], error: error.message };
  }
}

/**
 * Get earliest recording year for matching artist
 * Filters recordings to same BASE artist (ignoring feat/remix/etc)
 */
function getEarliestRecordingForMatchingArtist(spotifyArtist, recordings) {
  if (!recordings || recordings.length === 0) {
    return null;
  }
  
  // Normalize Spotify artist to base artist
  const spotifyBaseArtist = normalizeArtist(spotifyArtist);
  
  // Filter recordings to matching base artist
  const matchingRecordings = recordings.filter(rec => {
    const mbBaseArtist = normalizeArtist(rec.artist);
    
    // Check if base artists are similar
    const similarity = stringSimilarity(spotifyBaseArtist, mbBaseArtist);
    return similarity >= 0.8; // 80% similarity threshold
  });
  
  if (matchingRecordings.length === 0) {
    return null;
  }
  
  // Find earliest year among matching recordings
  const years = matchingRecordings
    .filter(rec => rec.year !== null)
    .map(rec => rec.year);
  
  if (years.length === 0) {
    return null;
  }
  
  const earliestYear = Math.min(...years);
  
  return {
    earliestYear,
    matchingCount: matchingRecordings.length,
    allRecordings: matchingRecordings
  };
}

/**
 * Validate single track against MusicBrainz
 * Tries ISRC first, then falls back to artist+title search
 */
async function validateTrack(track, onProgress) {
  const result = {
    ...track, // Preserve all original Spotify data
    
    // Album data (to be fetched)
    albumData: null,
    
    // MusicBrainz data
    mbYear: null,
    mbFirstReleaseDate: null,
    mbRecordingId: null,
    earliestRecordingYear: null,
    matchMethod: 'none',
    confidence: 'none',
    mbData: null,
    
    // Last.fm data
    lastFmYear: null,
    lastFmData: null
  };
  
  // 1. Fetch full Spotify album data
  if (onProgress) onProgress(`Hämtar album-data från Spotify...`);
  
  try {
    const albumData = await window.spotifyHelper.fetchAlbum(track.albumId);
    result.albumData = albumData;
  } catch (error) {
    console.warn(`Failed to fetch album data for ${track.albumId}:`, error);
    // Continue without album data
  }
  
  // 2. Try Last.fm first (fast and often accurate for modern tracks)
  if (onProgress) onProgress(`Checking Last.fm...`);
  
  try {
    const lastFmData = await window.lastFm.getTrackInfo(track.artist, track.title);
    if (lastFmData.found) {
      result.lastFmYear = lastFmData.year;
      result.lastFmData = lastFmData;
    }
  } catch (error) {
    console.warn(`Last.fm lookup failed:`, error);
    // Continue without Last.fm data
  }
  
  // 3. Try ISRC in MusicBrainz (most accurate)
  if (track.isrc) {
    if (onProgress) onProgress(`Checking ISRC: ${track.isrc}...`);
    
    const isrcResult = await searchByISRC(track.isrc);
    
    if (isrcResult.found) {
      result.mbYear = isrcResult.firstReleaseDate ? 
        parseInt(isrcResult.firstReleaseDate.split('-')[0]) : null;
      result.mbFirstReleaseDate = isrcResult.firstReleaseDate;
      result.mbRecordingId = isrcResult.recordingId;
      result.matchMethod = 'isrc';
      result.confidence = 'high';
      result.mbData = isrcResult;
      
      // For ISRC match, the recording year IS the earliest for this specific recording
      result.earliestRecordingYear = result.mbYear;
      
      return result;
    }
  }
  
  // 4. Fallback: search MusicBrainz by artist + title
  if (onProgress) onProgress(`Searching MusicBrainz: ${track.artist} - ${track.title}...`);
  
  const searchResult = await searchByArtistTitle(track.artist, track.title);
  
  if (searchResult.found) {
    // Store best match data
    const bestMatch = searchResult.bestMatch;
    result.mbYear = bestMatch.year;
    result.mbFirstReleaseDate = bestMatch.firstReleaseDate;
    result.mbRecordingId = bestMatch.recordingId;
    result.matchMethod = 'search';
    result.confidence = searchResult.confidence;
    result.mbData = bestMatch;
    
    // Find earliest recording from SAME base artist
    const earliestData = getEarliestRecordingForMatchingArtist(
      track.artist,
      searchResult.recordings
    );
    
    if (earliestData) {
      result.earliestRecordingYear = earliestData.earliestYear;
      result.earliestRecordingData = earliestData; // For debugging
    } else {
      // No matching artist found - might be feature/remix
      result.earliestRecordingYear = null;
    }
  }
  
  return result;
}

/**
 * Validate entire playlist (rate-limited, one track at a time)
 */
async function validatePlaylist(tracks, onProgress, onTrackComplete) {
  const results = [];
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: tracks.length,
        track: track,
        message: `Validerar ${i + 1}/${tracks.length}: ${track.artist} - ${track.title}`
      });
    }
    
    try {
      const result = await validateTrack(track, (msg) => {
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: tracks.length,
            track: track,
            message: msg
          });
        }
      });
      
      results.push(result);
      consecutiveErrors = 0; // Reset on success
      
      if (onTrackComplete) {
        onTrackComplete(result, i + 1, tracks.length);
      }
      
    } catch (error) {
      console.error(`Failed to validate track ${i + 1}:`, error);
      consecutiveErrors++;
      
      // If too many consecutive errors, bail out
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`Validering misslyckades: ${consecutiveErrors} låtar i rad kunde inte valideras. MusicBrainz kan vara nere.`);
      }
      
      // Add track with error flag
      results.push({
        ...track,
        mbYear: null,
        mbFirstReleaseDate: null,
        mbRecordingId: null,
        matchMethod: 'error',
        confidence: 'none',
        mbData: null,
        validationError: error.message
      });
      
      if (onTrackComplete) {
        onTrackComplete(results[results.length - 1], i + 1, tracks.length);
      }
    }
  }
  
  return results;
}

// Export functions
window.musicBrainz = {
  searchByISRC,
  searchByArtistTitle,
  validateTrack,
  validatePlaylist,
  normalizeArtist,
  normalizeForSearch,
  stringSimilarity,
  getEarliestRecordingForMatchingArtist
};
