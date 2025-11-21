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
    
    if (!data.access_token) {
      throw new Error('No access token in response');
    }
    
    cachedToken = data.access_token;
    // Cache for slightly less than expires_in to be safe
    tokenExpiry = Date.now() + ((data.expires_in - 60) * 1000);
    
    console.log('✅ Backend Spotify token retrieved');
    return cachedToken;
    
  } catch (error) {
    console.error('Failed to get backend token:', error);
    throw new Error(`Kunde inte hämta Spotify-token: ${error.message}`);
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
  
  let token;
  try {
    token = await getBackendSpotifyToken();
  } catch (error) {
    throw new Error(`Kunde inte hämta Spotify-token: ${error.message}`);
  }
  
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
        throw new Error('Playlist hittades inte. Kontrollera att länken är korrekt.');
      }
      if (response.status === 401) {
        throw new Error('Spotify-autentisering misslyckades. Försök igen.');
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.tracks || !data.tracks.items) {
      throw new Error('Spellistan har ingen data');
    }
    
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
          albumId: track.album.id,
          albumType: track.album.album_type, // 'album', 'single', 'compilation'
          spotifyYear: parseInt(track.album.release_date.split('-')[0]),
          releaseDate: track.album.release_date,
          isrc: track.external_ids?.isrc || null,
          previewUrl: track.preview_url,
          duration: track.duration_ms
        };
      });
    
    if (tracks.length === 0) {
      throw new Error('Spellistan är tom eller innehåller inga giltiga låtar');
    }
    
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
    
    // Re-throw with better message if not already formatted
    if (error.message.includes('Spotify') || error.message.includes('Playlist')) {
      throw error;
    }
    
    throw new Error(`Kunde inte ladda spellista: ${error.message}`);
  }
}

/**
 * Validate playlist URL format
 */
function isValidPlaylistUrl(url) {
  return extractPlaylistId(url) !== null;
}

/**
 * Fetch full album data from Spotify
 * Returns: { id, name, artists, albumType, totalTracks, releaseDate, label, genres }
 */
async function fetchSpotifyAlbum(albumId) {
  if (!albumId) {
    throw new Error('Inget album-ID angivet');
  }
  
  let token;
  try {
    token = await getBackendSpotifyToken();
  } catch (error) {
    throw new Error(`Kunde inte hämta Spotify-token: ${error.message}`);
  }
  
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/albums/${albumId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Album hittades inte');
      }
      if (response.status === 401) {
        throw new Error('Spotify-autentisering misslyckades');
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      id: data.id,
      name: data.name,
      artists: data.artists.map(a => a.name),
      albumArtist: data.artists[0]?.name || 'Unknown',
      albumType: data.album_type,
      totalTracks: data.total_tracks,
      releaseDate: data.release_date,
      releaseYear: parseInt(data.release_date.split('-')[0]),
      label: data.label || null,
      genres: data.genres || [],
      popularity: data.popularity || 0
    };
    
  } catch (error) {
    console.error('Failed to fetch album:', error);
    
    if (error.message.includes('Spotify') || error.message.includes('Album')) {
      throw error;
    }
    
    throw new Error(`Kunde inte ladda album: ${error.message}`);
  }
}

/**
 * Search Spotify for all versions of a track
 * Used to find original releases when we detect compilations
 * Returns: Array of tracks with album info
 */
async function searchSpotifyTrack(artist, title) {
  if (!artist || !title) {
    return [];
  }
  
  let token;
  try {
    token = await getBackendSpotifyToken();
  } catch (error) {
    throw new Error(`Kunde inte hämta Spotify-token: ${error.message}`);
  }
  
  try {
    // Build search query
    const query = `artist:${artist} track:${title}`;
    
    const response = await fetch(
      `https://api.spotify.com/v1/search?type=track&q=${encodeURIComponent(query)}&limit=20`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Spotify-autentisering misslyckades');
      }
      throw new Error(`Spotify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.tracks || !data.tracks.items) {
      return [];
    }
    
    // Extract track information
    const tracks = data.tracks.items
      .filter(item => item && item.id) // Skip null tracks
      .map(item => {
        return {
          spotifyId: item.id,
          title: item.name,
          artist: item.artists[0]?.name || 'Unknown',
          allArtists: item.artists.map(a => a.name).join(', '),
          album: item.album.name,
          albumId: item.album.id,
          albumType: item.album.album_type, // 'album', 'single', 'compilation'
          releaseDate: item.album.release_date,
          releaseYear: parseInt(item.album.release_date.split('-')[0])
        };
      });
    
    return tracks;
    
  } catch (error) {
    console.error('Failed to search Spotify track:', error);
    
    if (error.message.includes('Spotify')) {
      throw error;
    }
    
    throw new Error(`Spotify track search misslyckades: ${error.message}`);
  }
}

// Export functions
window.spotifyHelper = {
  getToken: getBackendSpotifyToken,
  fetchPlaylist: fetchSpotifyPlaylist,
  fetchAlbum: fetchSpotifyAlbum,
  searchSpotifyTrack: searchSpotifyTrack,
  extractPlaylistId: extractPlaylistId,
  isValidUrl: isValidPlaylistUrl
};
