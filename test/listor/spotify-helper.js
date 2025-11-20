// Spotify Helper - Uses backend token service (same as main game)
// No user authentication required

const BACKEND_TOKEN_URL = 'https://api-grl2mze3sa-uc.a.run.app/getSpotifyToken';

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get valid Spotify token from backend service
 */
async function getBackendSpotifyToken() {
  // Check cache
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await fetch(BACKEND_TOKEN_URL, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    const data = await response.json();
    
    cachedToken = data.access_token;
    // Cache for slightly less than expires_in to be safe
    tokenExpiry = Date.now() + ((data.expires_in - 60) * 1000);
    
    console.log('✅ Backend Spotify token retrieved');
    return cachedToken;
    
  } catch (error) {
    console.error('Failed to get backend token:', error);
    throw error;
  }
}

/**
 * Extract playlist ID from Spotify URL
 * Supports:
 * - https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe
 * - spotify:playlist:37i9dQZF1DX4UtSsGT1Sbe
 */
function extractPlaylistId(url) {
  // Remove whitespace
  url = url.trim();
  
  // HTTP URL format
  if (url.includes('open.spotify.com/playlist/')) {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  
  // URI format
  if (url.startsWith('spotify:playlist:')) {
    return url.split(':')[2];
  }
  
  // Maybe it's already just the ID
  if (/^[a-zA-Z0-9]+$/.test(url)) {
    return url;
  }
  
  return null;
}

/**
 * Fetch complete playlist from Spotify
 * Returns: { name, tracks[] }
 */
async function fetchSpotifyPlaylist(playlistUrl) {
  const playlistId = extractPlaylistId(playlistUrl);
  
  if (!playlistId) {
    throw new Error('Ogiltig Spotify playlist URL');
  }
  
  const token = await getBackendSpotifyToken();
  
  try {
    // Fetch playlist details
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Playlist hittades inte');
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract track information
    const tracks = data.tracks.items
      .filter(item => item.track && item.track.id) // Skip null tracks
      .map(item => {
        const track = item.track;
        
        return {
          spotifyId: track.id,
          title: track.name,
          artist: track.artists[0]?.name || 'Unknown',
          allArtists: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          albumType: track.album.album_type, // 'album', 'single', 'compilation'
          spotifyYear: parseInt(track.album.release_date.split('-')[0]),
          releaseDate: track.album.release_date,
          isrc: track.external_ids?.isrc || null,
          previewUrl: track.preview_url,
          duration: track.duration_ms
        };
      });
    
    console.log(`✅ Loaded playlist: ${data.name} (${tracks.length} tracks)`);
    
    return {
      name: data.name,
      description: data.description,
      owner: data.owner.display_name,
      tracks: tracks,
      totalTracks: tracks.length
    };
    
  } catch (error) {
    console.error('Failed to fetch playlist:', error);
    throw error;
  }
}

/**
 * Validate playlist URL format
 */
function isValidPlaylistUrl(url) {
  return extractPlaylistId(url) !== null;
}

// Export functions
window.spotifyHelper = {
  getToken: getBackendSpotifyToken,
  fetchPlaylist: fetchSpotifyPlaylist,
  extractPlaylistId: extractPlaylistId,
  isValidUrl: isValidPlaylistUrl
};
