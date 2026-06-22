// Last.fm API Wrapper
// Free API, no authentication required for basic queries
// Rate limit: Reasonable (no hard limit documented, be respectful)

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';
const LASTFM_API_KEY = '885ed9b24b2b5adc196f32b6854fedb4'; // Notestream API key

// Rate limiting
let lastFmRequestTime = 0;
const LASTFM_RATE_LIMIT_MS = 200; // 5 requests per second = 200ms between

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate-limited fetch to Last.fm
 */
async function rateLimitedLastFmFetch(url) {
  // Calculate wait time
  const now = Date.now();
  const timeSinceLastRequest = now - lastFmRequestTime;
  const waitTime = Math.max(0, LASTFM_RATE_LIMIT_MS - timeSinceLastRequest);
  
  if (waitTime > 0) {
    await sleep(waitTime);
  }
  
  lastFmRequestTime = Date.now();
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Last.fm API-nyckel ogiltig eller nått limit. Skaffa egen nyckel på last.fm/api');
      }
      if (response.status === 429) {
        throw new Error('Last.fm rate limit nådd');
      }
      throw new Error(`Last.fm API error: ${response.status}`);
    }
    
    return response.json();
    
  } catch (error) {
    if (error.name === 'TypeError') {
      throw new Error('Nätverksfel: Kunde inte nå Last.fm API');
    }
    throw error;
  }
}

/**
 * Normalize artist/title for Last.fm search
 */
function normalizeForLastFm(str) {
  return str
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/\[.*?\]/g, '') // Remove brackets
    .replace(/feat\..*/gi, '') // Remove feat.
    .replace(/ft\..*/gi, '') // Remove ft.
    .trim();
}

/**
 * Get track info from Last.fm
 * Returns: { found, year, listeners, playcount, mbid, wiki }
 */
async function getLastFmTrackInfo(artist, title) {
  if (!artist || !title) {
    return { found: false };
  }
  
  try {
    // Normalize for search
    const cleanArtist = normalizeForLastFm(artist);
    const cleanTitle = normalizeForLastFm(title);
    
    // Build URL
    const params = new URLSearchParams({
      method: 'track.getInfo',
      api_key: LASTFM_API_KEY,
      artist: cleanArtist,
      track: cleanTitle,
      format: 'json'
    });
    
    const url = `${LASTFM_API_BASE}?${params}`;
    const data = await rateLimitedLastFmFetch(url);
    
    if (data.error || !data.track) {
      return { found: false, reason: data.message || 'Track not found' };
    }
    
    const track = data.track;
    
    // Extract release date from wiki
    let year = null;
    if (track.wiki && track.wiki.published) {
      // Wiki published format: "31 Dec 2009, 13:42"
      const publishedMatch = track.wiki.published.match(/(\d{4})/);
      if (publishedMatch) {
        year = parseInt(publishedMatch[1]);
      }
    }
    
    // Fallback: Try album release date
    if (!year && track.album && track.album.title) {
      try {
        const albumInfo = await getLastFmAlbumInfo(artist, track.album.title);
        if (albumInfo.found && albumInfo.year) {
          year = albumInfo.year;
        }
      } catch (error) {
        console.warn('Failed to fetch album info from Last.fm:', error);
      }
    }
    
    return {
      found: true,
      year: year,
      listeners: parseInt(track.listeners) || 0,
      playcount: parseInt(track.playcount) || 0,
      mbid: track.mbid || null,
      duration: track.duration ? parseInt(track.duration) : null,
      artist: track.artist?.name || artist,
      title: track.name || title,
      albumTitle: track.album?.title || null
    };
    
  } catch (error) {
    console.error(`Last.fm track info failed for "${artist} - ${title}":`, error);
    return { found: false, error: error.message };
  }
}

/**
 * Get album info from Last.fm
 * Returns: { found, year, listeners, playcount }
 */
async function getLastFmAlbumInfo(artist, album) {
  if (!artist || !album) {
    return { found: false };
  }
  
  try {
    const params = new URLSearchParams({
      method: 'album.getInfo',
      api_key: LASTFM_API_KEY,
      artist: artist,
      album: album,
      format: 'json'
    });
    
    const url = `${LASTFM_API_BASE}?${params}`;
    const data = await rateLimitedLastFmFetch(url);
    
    if (data.error || !data.album) {
      return { found: false };
    }
    
    const albumData = data.album;
    
    // Extract year from wiki
    let year = null;
    if (albumData.wiki && albumData.wiki.published) {
      const publishedMatch = albumData.wiki.published.match(/(\d{4})/);
      if (publishedMatch) {
        year = parseInt(publishedMatch[1]);
      }
    }
    
    return {
      found: true,
      year: year,
      listeners: parseInt(albumData.listeners) || 0,
      playcount: parseInt(albumData.playcount) || 0,
      tracks: albumData.tracks?.track?.length || 0
    };
    
  } catch (error) {
    console.error(`Last.fm album info failed for "${artist} - ${album}":`, error);
    return { found: false, error: error.message };
  }
}

/**
 * Search Last.fm for artist+track (alternative method)
 * Returns array of matches
 */
async function searchLastFm(artist, title) {
  if (!artist || !title) {
    return [];
  }
  
  try {
    const params = new URLSearchParams({
      method: 'track.search',
      api_key: LASTFM_API_KEY,
      artist: artist,
      track: title,
      limit: 5,
      format: 'json'
    });
    
    const url = `${LASTFM_API_BASE}?${params}`;
    const data = await rateLimitedLastFmFetch(url);
    
    if (data.error || !data.results || !data.results.trackmatches) {
      return [];
    }
    
    const matches = data.results.trackmatches.track;
    if (!Array.isArray(matches)) {
      return matches ? [matches] : [];
    }
    
    return matches.map(track => ({
      artist: track.artist,
      title: track.name,
      listeners: parseInt(track.listeners) || 0,
      mbid: track.mbid || null
    }));
    
  } catch (error) {
    console.error('Last.fm search failed:', error);
    return [];
  }
}

// Export functions
window.lastFm = {
  getTrackInfo: getLastFmTrackInfo,
  getAlbumInfo: getLastFmAlbumInfo,
  search: searchLastFm
};
