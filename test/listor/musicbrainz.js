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
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Notestream/2.4 (https://notestream.se)'
    }
  });
  
  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }
  
  return response.json();
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
 * Normalize string for search (remove special chars, etc)
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
 * Returns: { found, recordingId, firstReleaseDate, title, artist, confidence }
 */
async function searchByArtistTitle(artist, title) {
  if (!artist || !title) {
    return { found: false };
  }
  
  try {
    // Normalize search terms
    const cleanArtist = normalizeForSearch(artist);
    const cleanTitle = normalizeForSearch(title);
    
    // Build query
    const query = `artist:"${cleanArtist}" AND recording:"${cleanTitle}"`;
    const url = `${MUSICBRAINZ_API_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    
    const data = await rateLimitedFetch(url);
    
    if (!data.recordings || data.recordings.length === 0) {
      return { found: false };
    }
    
    // Find best match
    let bestMatch = null;
    let bestScore = 0;
    
    for (const recording of data.recordings) {
      const mbTitle = normalizeForSearch(recording.title);
      const mbArtist = normalizeForSearch(recording['artist-credit']?.[0]?.name || '');
      
      // Calculate similarity scores
      const titleSim = stringSimilarity(cleanTitle, mbTitle);
      const artistSim = stringSimilarity(cleanArtist, mbArtist);
      const combinedScore = (titleSim * 0.6) + (artistSim * 0.4); // Title weighted more
      
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = recording;
      }
    }
    
    if (!bestMatch || bestScore < 0.5) {
      return { found: false, reason: 'No good match (score too low)' };
    }
    
    // Find earliest release date
    let earliestDate = bestMatch['first-release-date'] || null;
    
    if (bestMatch.releases && bestMatch.releases.length > 0) {
      bestMatch.releases.forEach(release => {
        const releaseDate = release.date || release['release-events']?.[0]?.date;
        if (releaseDate && (!earliestDate || releaseDate < earliestDate)) {
          earliestDate = releaseDate;
        }
      });
    }
    
    // Determine confidence based on similarity score
    let confidence;
    if (bestScore >= 0.9) confidence = 'high';
    else if (bestScore >= 0.7) confidence = 'medium';
    else confidence = 'low';
    
    return {
      found: true,
      recordingId: bestMatch.id,
      firstReleaseDate: earliestDate,
      title: bestMatch.title,
      artist: bestMatch['artist-credit']?.[0]?.name || 'Unknown',
      confidence: confidence,
      similarityScore: bestScore,
      mbScore: bestMatch.score
    };
    
  } catch (error) {
    console.error(`MusicBrainz search failed for "${artist} - ${title}":`, error);
    return { found: false, error: error.message };
  }
}

/**
 * Validate single track against MusicBrainz
 * Tries ISRC first, then falls back to artist+title search
 */
async function validateTrack(track, onProgress) {
  const result = {
    ...track, // Preserve all original Spotify data
    mbYear: null,
    mbFirstReleaseDate: null,
    mbRecordingId: null,
    matchMethod: 'none',
    confidence: 'none',
    mbData: null
  };
  
  // Try ISRC first (most accurate)
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
      
      return result;
    }
  }
  
  // Fallback: search by artist + title
  if (onProgress) onProgress(`Searching: ${track.artist} - ${track.title}...`);
  
  const searchResult = await searchByArtistTitle(track.artist, track.title);
  
  if (searchResult.found) {
    result.mbYear = searchResult.firstReleaseDate ? 
      parseInt(searchResult.firstReleaseDate.split('-')[0]) : null;
    result.mbFirstReleaseDate = searchResult.firstReleaseDate;
    result.mbRecordingId = searchResult.recordingId;
    result.matchMethod = 'search';
    result.confidence = searchResult.confidence;
    result.mbData = searchResult;
  }
  
  return result;
}

/**
 * Validate entire playlist (rate-limited, one track at a time)
 */
async function validatePlaylist(tracks, onProgress, onTrackComplete) {
  const results = [];
  
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
    
    if (onTrackComplete) {
      onTrackComplete(result, i + 1, tracks.length);
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
  normalizeForSearch,
  stringSimilarity
};
