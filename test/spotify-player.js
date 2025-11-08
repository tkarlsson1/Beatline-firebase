// ============================================
// SPOTIFY WEB PLAYBACK SDK
// ============================================

let spotifyPlayer = null;
let deviceId = null;
let currentPlayerState = null;

// ============================================
// INITIALIZE SPOTIFY PLAYER
// ============================================
window.onSpotifyWebPlaybackSDKReady = async () => {
  console.log('Spotify Web Playback SDK is ready');

  // Check if user is authenticated
  if (!window.spotifyAuth || !window.spotifyAuth.isAuthenticated()) {
    console.log('User not authenticated with Spotify');
    return;
  }

  const token = await window.spotifyAuth.getToken();

  if (!token) {
    console.error('Failed to get Spotify access token');
    return;
  }

  // Initialize the player
  spotifyPlayer = new Spotify.Player({
    name: 'Notestream Player',
    getOAuthToken: async (cb) => {
      const token = await window.spotifyAuth.getToken();
      cb(token);
    },
    volume: 0.8
  });

  // ============================================
  // PLAYER EVENT LISTENERS
  // ============================================

  // Ready
  spotifyPlayer.addListener('ready', ({ device_id }) => {
    console.log('Spotify Player ready with Device ID:', device_id);
    deviceId = device_id;
    window.spotifyDeviceId = device_id;

    // Dispatch custom event for other parts of the app
    window.dispatchEvent(new CustomEvent('spotifyPlayerReady', { detail: { deviceId: device_id } }));
  });

  // Not Ready
  spotifyPlayer.addListener('not_ready', ({ device_id }) => {
    console.log('Spotify Player not ready, Device ID:', device_id);
  });

  // Player State Changed
  spotifyPlayer.addListener('player_state_changed', (state) => {
    if (!state) {
      console.log('Player state is null');
      currentPlayerState = null;
      return;
    }

    currentPlayerState = state;

    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('spotifyStateChanged', { detail: state }));

    // Log playback state
    console.log('Playback state:', {
      paused: state.paused,
      position: state.position,
      duration: state.duration,
      track: state.track_window?.current_track?.name
    });
  });

  // Initialization Error
  spotifyPlayer.addListener('initialization_error', ({ message }) => {
    console.error('Spotify initialization error:', message);
  });

  // Authentication Error
  spotifyPlayer.addListener('authentication_error', ({ message }) => {
    console.error('Spotify authentication error:', message);
    // Try to refresh token
    window.spotifyAuth.getToken().then(newToken => {
      if (newToken) {
        console.log('Token refreshed, reconnecting...');
        spotifyPlayer.connect();
      } else {
        console.error('Failed to refresh token');
      }
    });
  });

  // Account Error
  spotifyPlayer.addListener('account_error', ({ message }) => {
    console.error('Spotify account error:', message);
    alert('Spotify Web Playback requires a Premium account. Please upgrade to use this feature.');
  });

  // Playback Error
  spotifyPlayer.addListener('playback_error', ({ message }) => {
    console.error('Spotify playback error:', message);
  });

  // Connect to the player
  const connected = await spotifyPlayer.connect();

  if (connected) {
    console.log('Successfully connected to Spotify Player');
  } else {
    console.error('Failed to connect to Spotify Player');
  }
};

// ============================================
// PLAY TRACK BY SPOTIFY ID
// ============================================
async function playTrack(spotifyTrackId) {
  if (!deviceId) {
    console.error('No Spotify device available');
    alert('Spotify player not ready. Please try again.');
    return false;
  }

  const token = await window.spotifyAuth.getToken();

  if (!token) {
    console.error('No valid Spotify token');
    alert('Please reconnect to Spotify');
    return false;
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        uris: [`spotify:track:${spotifyTrackId}`]
      })
    });

    if (response.status === 204 || response.status === 200) {
      console.log('Track started playing:', spotifyTrackId);
      return true;
    } else {
      const error = await response.json();
      console.error('Failed to play track:', error);
      return false;
    }
  } catch (error) {
    console.error('Error playing track:', error);
    return false;
  }
}

// ============================================
// PAUSE PLAYBACK
// ============================================
async function pauseTrack() {
  if (!deviceId) {
    console.error('No Spotify device available');
    return false;
  }

  const token = await window.spotifyAuth.getToken();

  if (!token) {
    console.error('No valid Spotify token');
    return false;
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 204 || response.status === 200) {
      console.log('Playback paused');
      return true;
    } else {
      console.error('Failed to pause playback');
      return false;
    }
  } catch (error) {
    console.error('Error pausing playback:', error);
    return false;
  }
}

// ============================================
// SKIP TO NEXT TRACK
// ============================================
async function nextTrack() {
  if (!deviceId) {
    console.error('No Spotify device available');
    return false;
  }

  const token = await window.spotifyAuth.getToken();

  if (!token) {
    console.error('No valid Spotify token');
    return false;
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 204 || response.status === 200) {
      console.log('Skipped to next track');
      return true;
    } else {
      console.error('Failed to skip track');
      return false;
    }
  } catch (error) {
    console.error('Error skipping track:', error);
    return false;
  }
}

// ============================================
// RESUME PLAYBACK
// ============================================
async function resumePlayback() {
  if (!deviceId) {
    console.error('No Spotify device available');
    return false;
  }

  const token = await window.spotifyAuth.getToken();

  if (!token) {
    console.error('No valid Spotify token');
    return false;
  }

  try {
    const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 204 || response.status === 200) {
      console.log('Playback resumed');
      return true;
    } else {
      console.error('Failed to resume playback');
      return false;
    }
  } catch (error) {
    console.error('Error resuming playback:', error);
    return false;
  }
}

// ============================================
// GET CURRENT PLAYBACK STATE
// ============================================
function getPlayerState() {
  return currentPlayerState;
}

// ============================================
// CHECK IF PLAYING
// ============================================
function isPlaying() {
  return currentPlayerState && !currentPlayerState.paused;
}

// ============================================
// DISCONNECT PLAYER
// ============================================
function disconnectPlayer() {
  if (spotifyPlayer) {
    spotifyPlayer.disconnect();
    console.log('Spotify player disconnected');
  }
}

// Export functions for global use
window.spotifyPlayer = {
  play: playTrack,
  pause: pauseTrack,
  next: nextTrack,
  resume: resumePlayback,
  getState: getPlayerState,
  isPlaying: isPlaying,
  disconnect: disconnectPlayer,
  getDeviceId: () => deviceId
};
