// ============================================
// SPOTIFY OAUTH AUTHENTICATION
// ============================================

const SPOTIFY_CONFIG = {
  clientId: '3033344ef55647b8b70ef1dccfa7e65f',
  redirectUri: 'https://www.notestream.se/test/callback',
  scopes: [
    'streaming',
    'user-read-email',
    'user-modify-playback-state',
    'user-read-playback-state'
  ]
};

// ============================================
// GENERATE RANDOM STRING FOR STATE
// ============================================
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

// ============================================
// SHA256 HASH FOR PKCE
// ============================================
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

// ============================================
// BASE64 ENCODE FOR PKCE
// ============================================
function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ============================================
// START SPOTIFY AUTHORIZATION FLOW
// ============================================
async function authorizeSpotify() {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  // Store code verifier for later use
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  const params = {
    response_type: 'code',
    client_id: SPOTIFY_CONFIG.clientId,
    scope: SPOTIFY_CONFIG.scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
  };

  authUrl.search = new URLSearchParams(params).toString();
  window.location.href = authUrl.toString();
}

// ============================================
// EXCHANGE CODE FOR TOKEN
// ============================================
async function getAccessToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CONFIG.clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: SPOTIFY_CONFIG.redirectUri,
      code_verifier: codeVerifier,
    }),
  };

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    const data = await response.json();

    if (data.access_token) {
      // Store token with expiry time
      const expiryTime = Date.now() + (data.expires_in * 1000);
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', expiryTime);
      localStorage.setItem('spotify_refresh_token', data.refresh_token);

      // Clean up code verifier
      localStorage.removeItem('spotify_code_verifier');

      return data.access_token;
    } else {
      console.error('Failed to get access token:', data);
      return null;
    }
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    return null;
  }
}

// ============================================
// REFRESH ACCESS TOKEN
// ============================================
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('spotify_refresh_token');

  if (!refreshToken) {
    console.error('No refresh token available');
    return null;
  }

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CONFIG.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  };

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    const data = await response.json();

    if (data.access_token) {
      const expiryTime = Date.now() + (data.expires_in * 1000);
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expiry', expiryTime);

      // Update refresh token if provided
      if (data.refresh_token) {
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
      }

      return data.access_token;
    } else {
      console.error('Failed to refresh token:', data);
      return null;
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

// ============================================
// GET VALID ACCESS TOKEN
// ============================================
async function getValidAccessToken() {
  const token = localStorage.getItem('spotify_access_token');
  const expiry = localStorage.getItem('spotify_token_expiry');

  // Check if token exists and is not expired (with 5 minute buffer)
  if (token && expiry && Date.now() < (parseInt(expiry) - 300000)) {
    return token;
  }

  // Try to refresh token
  console.log('Token expired or missing, attempting refresh...');
  return await refreshAccessToken();
}

// ============================================
// CHECK IF USER IS AUTHENTICATED
// ============================================
function isSpotifyAuthenticated() {
  const token = localStorage.getItem('spotify_access_token');
  const expiry = localStorage.getItem('spotify_token_expiry');

  return token && expiry && Date.now() < parseInt(expiry);
}

// ============================================
// LOGOUT / CLEAR TOKENS
// ============================================
function logoutSpotify() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_token_expiry');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_code_verifier');
}

// ============================================
// CHECK FOR PREMIUM ACCOUNT
// ============================================
async function checkPremiumAccount() {
  const token = await getValidAccessToken();

  if (!token) {
    return false;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data.product === 'premium';
  } catch (error) {
    console.error('Error checking premium status:', error);
    return false;
  }
}

// ============================================
// HANDLE CALLBACK (for OAuth redirect)
// ============================================
async function handleSpotifyCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    console.error('Spotify authorization error:', error);
    alert('Spotify authorization failed: ' + error);
    return false;
  }

  if (code) {
    const token = await getAccessToken(code);
    if (token) {
      console.log('Successfully authenticated with Spotify');

      // Check if user has premium
      const isPremium = await checkPremiumAccount();
      if (!isPremium) {
        alert('Spotify Web Playback requires a Premium account. Please upgrade to use this feature.');
        logoutSpotify();
        return false;
      }

      return true;
    }
  }

  return false;
}

// Export functions for global use
window.spotifyAuth = {
  authorize: authorizeSpotify,
  getToken: getValidAccessToken,
  isAuthenticated: isSpotifyAuthenticated,
  logout: logoutSpotify,
  checkPremium: checkPremiumAccount,
  handleCallback: handleSpotifyCallback
};
