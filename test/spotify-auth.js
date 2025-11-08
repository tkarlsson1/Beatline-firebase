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

// Debug logging
const DEBUG = true;
function debugLog(message, data = null) {
  if (DEBUG) {
    if (data) {
      console.log(`[Spotify Auth] ${message}`, data);
    } else {
      console.log(`[Spotify Auth] ${message}`);
    }
  }
}

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
  debugLog('Starting authorization flow...');

  const codeVerifier = generateRandomString(64);
  debugLog('Code verifier generated (first 20 chars):', codeVerifier.substring(0, 20) + '...');

  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);
  debugLog('Code challenge generated (first 20 chars):', codeChallenge.substring(0, 20) + '...');

  // Store code verifier for later use with verification
  try {
    localStorage.setItem('spotify_code_verifier', codeVerifier);
    debugLog('  → localStorage.setItem("spotify_code_verifier") called');

    const verifyCodeVerifier = localStorage.getItem('spotify_code_verifier');
    if (verifyCodeVerifier === codeVerifier) {
      debugLog('  ✅ VERIFIED: Code verifier stored correctly (first 20 chars):', verifyCodeVerifier.substring(0, 20) + '...');
    } else {
      console.error('  ❌ CRITICAL ERROR: Code verifier verification FAILED!');
      console.error('    Expected:', codeVerifier.substring(0, 20) + '...');
      console.error('    Got:', verifyCodeVerifier ? verifyCodeVerifier.substring(0, 20) + '...' : 'null');
      alert('Critical error: Failed to store OAuth state. Please try again.');
      return;
    }
  } catch (error) {
    console.error('❌ CRITICAL: Failed to store code verifier in localStorage!');
    console.error('  Error:', error);
    console.error('  This may indicate localStorage is disabled or full');
    alert('Error: Cannot store OAuth state. Please check browser settings and try again.');
    return;
  }

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
  debugLog('Redirecting to Spotify authorization URL:', authUrl.toString());
  window.location.href = authUrl.toString();
}

// ============================================
// EXCHANGE CODE FOR TOKEN
// ============================================
async function getAccessToken(code) {
  debugLog('Exchanging authorization code for access token...');
  debugLog('Authorization code (first 20 chars):', code.substring(0, 20) + '...');

  const codeVerifier = localStorage.getItem('spotify_code_verifier');

  if (!codeVerifier) {
    console.error('[Spotify Auth] ERROR: Code verifier not found in localStorage!');
    return null;
  }

  debugLog('Code verifier retrieved (first 20 chars):', codeVerifier.substring(0, 20) + '...');

  const requestBody = {
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_verifier: codeVerifier,
  };

  debugLog('Token exchange request details:', {
    url: 'https://accounts.spotify.com/api/token',
    method: 'POST',
    client_id: SPOTIFY_CONFIG.clientId,
    grant_type: 'authorization_code',
    redirect_uri: SPOTIFY_CONFIG.redirectUri,
    code_length: code.length,
    code_verifier_length: codeVerifier.length
  });

  const payload = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(requestBody),
  };

  try {
    debugLog('Sending token request to Spotify...');
    const response = await fetch('https://accounts.spotify.com/api/token', payload);

    debugLog('Token response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        'content-type': response.headers.get('content-type')
      }
    });

    // Get response text first to handle both success and error cases
    const responseText = await response.text();
    debugLog('Response body length:', responseText.length);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Spotify Auth] ❌ Failed to parse response as JSON:', parseError);
      console.error('[Spotify Auth] Response text:', responseText.substring(0, 200));
      return null;
    }

    debugLog('Parsed response data:', {
      has_access_token: !!data.access_token,
      has_refresh_token: !!data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      scope: data.scope,
      error: data.error,
      error_description: data.error_description
    });

    // Check for errors in response
    if (data.error) {
      console.error('[Spotify Auth] ❌ Spotify API returned an error:');
      console.error('  Error:', data.error);
      console.error('  Description:', data.error_description);

      if (data.error === 'invalid_grant') {
        console.error('  Common causes:');
        console.error('    - Authorization code already used');
        console.error('    - Authorization code expired');
        console.error('    - Code verifier mismatch');
        console.error('    - Redirect URI mismatch');
      }

      return null;
    }

    if (!response.ok) {
      console.error('[Spotify Auth] ❌ HTTP error response:', response.status, response.statusText);
      console.error('  Response data:', data);
      return null;
    }

    if (data.access_token) {
      // Store token with expiry time
      const expiryTime = Date.now() + (data.expires_in * 1000);
      const expiryDate = new Date(expiryTime);

      debugLog('Attempting to store tokens in localStorage...');

      // CRITICAL: Store access token with verification
      try {
        localStorage.setItem('spotify_access_token', data.access_token);
        debugLog('  → localStorage.setItem("spotify_access_token") called');

        // VERIFY immediately after setting
        const verifyToken = localStorage.getItem('spotify_access_token');
        if (verifyToken === data.access_token) {
          debugLog('  ✅ VERIFIED: Access token stored correctly (first 20 chars):', verifyToken.substring(0, 20) + '...');
        } else {
          console.error('  ❌ CRITICAL ERROR: Token verification FAILED!');
          console.error('    Expected:', data.access_token.substring(0, 20) + '...');
          console.error('    Got:', verifyToken ? verifyToken.substring(0, 20) + '...' : 'null');
        }
      } catch (error) {
        console.error('❌ CRITICAL: Failed to store access token in localStorage!');
        console.error('  Error:', error);
        console.error('  Error name:', error.name);
        console.error('  Error message:', error.message);
        return null;
      }

      // Store expiry time with verification
      try {
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());
        debugLog('  → localStorage.setItem("spotify_token_expiry") called');

        const verifyExpiry = localStorage.getItem('spotify_token_expiry');
        if (verifyExpiry === expiryTime.toString()) {
          debugLog('  ✅ VERIFIED: Token expiry stored correctly:', new Date(parseInt(verifyExpiry)).toLocaleString());
        } else {
          console.error('  ❌ ERROR: Expiry verification FAILED!');
          console.error('    Expected:', expiryTime.toString());
          console.error('    Got:', verifyExpiry);
        }
      } catch (error) {
        console.error('❌ ERROR: Failed to store token expiry!');
        console.error('  Error:', error);
      }

      // Store refresh token if provided
      if (data.refresh_token) {
        try {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
          debugLog('  → localStorage.setItem("spotify_refresh_token") called');

          const verifyRefresh = localStorage.getItem('spotify_refresh_token');
          if (verifyRefresh === data.refresh_token) {
            debugLog('  ✅ VERIFIED: Refresh token stored correctly (first 20 chars):', verifyRefresh.substring(0, 20) + '...');
          } else {
            console.error('  ❌ ERROR: Refresh token verification FAILED!');
          }
        } catch (error) {
          console.error('❌ ERROR: Failed to store refresh token!');
          console.error('  Error:', error);
        }
      }

      debugLog('\n📦 Final localStorage check after storage:');
      debugLog('  spotify_access_token:', localStorage.getItem('spotify_access_token') ? 'EXISTS (length: ' + localStorage.getItem('spotify_access_token').length + ')' : 'MISSING!');
      debugLog('  spotify_token_expiry:', localStorage.getItem('spotify_token_expiry') || 'MISSING!');
      debugLog('  spotify_refresh_token:', localStorage.getItem('spotify_refresh_token') ? 'EXISTS' : 'MISSING');

      debugLog('✅ Token storage complete');
      debugLog('Token expires at:', expiryDate.toLocaleString());
      debugLog('Token expires in:', data.expires_in, 'seconds');

      // Clean up code verifier
      try {
        localStorage.removeItem('spotify_code_verifier');
        debugLog('Code verifier removed from localStorage');

        // Verify removal
        const verifyRemoved = localStorage.getItem('spotify_code_verifier');
        if (verifyRemoved === null) {
          debugLog('  ✅ VERIFIED: Code verifier removed successfully');
        } else {
          console.warn('  ⚠️ WARNING: Code verifier still exists after removal!');
        }
      } catch (error) {
        console.error('❌ ERROR: Failed to remove code verifier!');
        console.error('  Error:', error);
      }

      return data.access_token;
    } else {
      console.error('[Spotify Auth] ❌ Failed to get access token:', data);
      if (data.error) {
        console.error('[Spotify Auth] Error:', data.error);
        console.error('[Spotify Auth] Error description:', data.error_description);
      }
      return null;
    }
  } catch (error) {
    console.error('[Spotify Auth] ❌ Error exchanging code for token:', error);
    return null;
  }
}

// ============================================
// REFRESH ACCESS TOKEN
// ============================================
async function refreshAccessToken() {
  debugLog('🔄 Attempting to refresh access token...');

  const refreshToken = localStorage.getItem('spotify_refresh_token');

  if (!refreshToken) {
    console.error('[Spotify Auth] ❌ No refresh token available - user needs to re-authenticate');
    return null;
  }

  debugLog('Refresh token found (first 20 chars):', refreshToken.substring(0, 20) + '...');

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
    debugLog('Sending refresh token request to Spotify...');
    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    const data = await response.json();

    debugLog('Refresh response status:', response.status);
    debugLog('Refresh response data:', {
      has_access_token: !!data.access_token,
      has_refresh_token: !!data.refresh_token,
      expires_in: data.expires_in,
      error: data.error
    });

    if (data.access_token) {
      const expiryTime = Date.now() + (data.expires_in * 1000);
      const expiryDate = new Date(expiryTime);

      debugLog('Attempting to store refreshed tokens in localStorage...');

      // Store refreshed access token with verification
      try {
        localStorage.setItem('spotify_access_token', data.access_token);
        debugLog('  → localStorage.setItem("spotify_access_token") called');

        const verifyToken = localStorage.getItem('spotify_access_token');
        if (verifyToken === data.access_token) {
          debugLog('  ✅ VERIFIED: Refreshed access token stored correctly (first 20 chars):', verifyToken.substring(0, 20) + '...');
        } else {
          console.error('  ❌ ERROR: Refreshed token verification FAILED!');
          console.error('    Expected:', data.access_token.substring(0, 20) + '...');
          console.error('    Got:', verifyToken ? verifyToken.substring(0, 20) + '...' : 'null');
        }
      } catch (error) {
        console.error('❌ CRITICAL: Failed to store refreshed access token!');
        console.error('  Error:', error);
        return null;
      }

      // Store refreshed expiry with verification
      try {
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());
        debugLog('  → localStorage.setItem("spotify_token_expiry") called');

        const verifyExpiry = localStorage.getItem('spotify_token_expiry');
        if (verifyExpiry === expiryTime.toString()) {
          debugLog('  ✅ VERIFIED: Token expiry updated correctly:', new Date(parseInt(verifyExpiry)).toLocaleString());
        } else {
          console.error('  ❌ ERROR: Expiry verification FAILED!');
        }
      } catch (error) {
        console.error('❌ ERROR: Failed to store refreshed token expiry!');
        console.error('  Error:', error);
      }

      debugLog('✅ Access token refreshed successfully');
      debugLog('New token expires at:', expiryDate.toLocaleString());

      // Update refresh token if provided
      if (data.refresh_token) {
        try {
          localStorage.setItem('spotify_refresh_token', data.refresh_token);
          debugLog('  → localStorage.setItem("spotify_refresh_token") called');

          const verifyRefresh = localStorage.getItem('spotify_refresh_token');
          if (verifyRefresh === data.refresh_token) {
            debugLog('  ✅ VERIFIED: Refresh token updated (first 20 chars):', verifyRefresh.substring(0, 20) + '...');
          } else {
            console.error('  ❌ ERROR: Refresh token update verification FAILED!');
          }
        } catch (error) {
          console.error('❌ ERROR: Failed to update refresh token!');
          console.error('  Error:', error);
        }
      }

      debugLog('\n📦 Final localStorage check after refresh:');
      debugLog('  spotify_access_token:', localStorage.getItem('spotify_access_token') ? 'EXISTS (length: ' + localStorage.getItem('spotify_access_token').length + ')' : 'MISSING!');
      debugLog('  spotify_token_expiry:', localStorage.getItem('spotify_token_expiry') || 'MISSING!');
      debugLog('  spotify_refresh_token:', localStorage.getItem('spotify_refresh_token') ? 'EXISTS' : 'MISSING');

      return data.access_token;
    } else {
      console.error('[Spotify Auth] ❌ Failed to refresh token:', data);
      if (data.error) {
        console.error('[Spotify Auth] Error:', data.error);
        console.error('[Spotify Auth] Error description:', data.error_description);
      }
      return null;
    }
  } catch (error) {
    console.error('[Spotify Auth] ❌ Error refreshing token:', error);
    return null;
  }
}

// ============================================
// GET VALID ACCESS TOKEN
// ============================================
async function getValidAccessToken() {
  debugLog('Checking for valid access token...');

  const token = localStorage.getItem('spotify_access_token');
  const expiry = localStorage.getItem('spotify_token_expiry');

  if (!token) {
    console.error('[Spotify Auth] ❌ No access token found in localStorage');
    return null;
  }

  if (!expiry) {
    console.error('[Spotify Auth] ❌ No token expiry found in localStorage');
    return null;
  }

  const expiryTime = parseInt(expiry);
  const now = Date.now();
  const timeUntilExpiry = expiryTime - now;
  const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);

  debugLog('Token found (first 20 chars):', token.substring(0, 20) + '...');
  debugLog('Token expires at:', new Date(expiryTime).toLocaleString());
  debugLog('Time until expiry:', minutesUntilExpiry, 'minutes');

  // Check if token exists and is not expired (with 5 minute buffer)
  if (token && expiry && Date.now() < (expiryTime - 300000)) {
    debugLog('✅ Token is valid and not expired');
    return token;
  }

  // Try to refresh token
  debugLog('⚠️ Token expired or expiring soon, attempting refresh...');
  const newToken = await refreshAccessToken();

  if (!newToken) {
    console.error('[Spotify Auth] ❌ Token refresh failed - user needs to re-authenticate');
  }

  return newToken;
}

// ============================================
// CHECK IF USER IS AUTHENTICATED
// ============================================
function isSpotifyAuthenticated() {
  const token = localStorage.getItem('spotify_access_token');
  const expiry = localStorage.getItem('spotify_token_expiry');

  const isAuth = token && expiry && Date.now() < parseInt(expiry);

  debugLog('Checking authentication status:', isAuth ? '✅ Authenticated' : '❌ Not authenticated');

  if (token && expiry) {
    const expiryTime = parseInt(expiry);
    const timeUntilExpiry = expiryTime - Date.now();
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
    debugLog('Token status:', {
      has_token: !!token,
      has_expiry: !!expiry,
      expires_at: new Date(expiryTime).toLocaleString(),
      minutes_until_expiry: minutesUntilExpiry,
      is_expired: Date.now() >= expiryTime
    });
  }

  return isAuth;
}

// ============================================
// LOGOUT / CLEAR TOKENS
// ============================================
function logoutSpotify() {
  debugLog('Logging out - clearing all Spotify tokens...');

  // Remove all tokens with verification
  try {
    localStorage.removeItem('spotify_access_token');
    const verifyAccess = localStorage.getItem('spotify_access_token');
    if (verifyAccess === null) {
      debugLog('  ✅ VERIFIED: Access token removed');
    } else {
      console.warn('  ⚠️ WARNING: Access token still exists after removal!');
    }
  } catch (error) {
    console.error('❌ ERROR: Failed to remove access token!', error);
  }

  try {
    localStorage.removeItem('spotify_token_expiry');
    const verifyExpiry = localStorage.getItem('spotify_token_expiry');
    if (verifyExpiry === null) {
      debugLog('  ✅ VERIFIED: Token expiry removed');
    } else {
      console.warn('  ⚠️ WARNING: Token expiry still exists after removal!');
    }
  } catch (error) {
    console.error('❌ ERROR: Failed to remove token expiry!', error);
  }

  try {
    localStorage.removeItem('spotify_refresh_token');
    const verifyRefresh = localStorage.getItem('spotify_refresh_token');
    if (verifyRefresh === null) {
      debugLog('  ✅ VERIFIED: Refresh token removed');
    } else {
      console.warn('  ⚠️ WARNING: Refresh token still exists after removal!');
    }
  } catch (error) {
    console.error('❌ ERROR: Failed to remove refresh token!', error);
  }

  try {
    localStorage.removeItem('spotify_code_verifier');
    const verifyVerifier = localStorage.getItem('spotify_code_verifier');
    if (verifyVerifier === null) {
      debugLog('  ✅ VERIFIED: Code verifier removed');
    } else {
      console.warn('  ⚠️ WARNING: Code verifier still exists after removal!');
    }
  } catch (error) {
    console.error('❌ ERROR: Failed to remove code verifier!', error);
  }

  debugLog('✅ All tokens cleared from localStorage');
}

// ============================================
// CHECK FOR PREMIUM ACCOUNT
// ============================================
async function checkPremiumAccount() {
  debugLog('Checking if user has Spotify Premium...');

  const token = await getValidAccessToken();

  if (!token) {
    console.error('[Spotify Auth] ❌ Cannot check premium status - no valid token');
    return false;
  }

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    debugLog('Premium check response status:', response.status);

    const data = await response.json();

    debugLog('User profile data:', {
      id: data.id,
      display_name: data.display_name,
      email: data.email,
      product: data.product,
      country: data.country
    });

    const isPremium = data.product === 'premium';

    if (isPremium) {
      debugLog('✅ User has Spotify Premium');
    } else {
      debugLog('❌ User does NOT have Spotify Premium (current plan:', data.product + ')');
    }

    return isPremium;
  } catch (error) {
    console.error('[Spotify Auth] ❌ Error checking premium status:', error);
    return false;
  }
}

// ============================================
// HANDLE CALLBACK (for OAuth redirect)
// ============================================
async function handleSpotifyCallback() {
  debugLog('=== HANDLING OAUTH CALLBACK ===');

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  debugLog('URL params:', {
    has_code: !!code,
    has_error: !!error,
    error: error
  });

  if (error) {
    console.error('[Spotify Auth] ❌ Spotify authorization error:', error);
    alert('Spotify authorization failed: ' + error);
    return false;
  }

  if (code) {
    debugLog('Authorization code received, exchanging for token...');

    const token = await getAccessToken(code);

    if (token) {
      debugLog('✅ Successfully authenticated with Spotify');

      // Verify token was stored
      const storedToken = localStorage.getItem('spotify_access_token');
      const storedExpiry = localStorage.getItem('spotify_token_expiry');
      const storedRefresh = localStorage.getItem('spotify_refresh_token');

      debugLog('Token storage verification:', {
        token_stored: !!storedToken,
        expiry_stored: !!storedExpiry,
        refresh_stored: !!storedRefresh,
        token_matches: storedToken === token
      });

      // Check if user has premium
      const isPremium = await checkPremiumAccount();

      if (!isPremium) {
        console.error('[Spotify Auth] ❌ User does not have Spotify Premium');
        alert('Spotify Web Playback requires a Premium account. Please upgrade to use this feature.');
        logoutSpotify();
        return false;
      }

      debugLog('✅ Callback handling completed successfully');
      return true;
    } else {
      console.error('[Spotify Auth] ❌ Failed to exchange code for token');
      return false;
    }
  }

  debugLog('❌ No authorization code found in URL');
  return false;
}

// ============================================
// GET TOKEN DEBUG INFO
// ============================================
function getTokenDebugInfo() {
  const token = localStorage.getItem('spotify_access_token');
  const expiry = localStorage.getItem('spotify_token_expiry');
  const refresh = localStorage.getItem('spotify_refresh_token');

  if (!token || !expiry) {
    return {
      status: 'missing',
      has_token: !!token,
      has_expiry: !!expiry,
      has_refresh: !!refresh,
      token_preview: token ? token.substring(0, 20) + '...' : null,
      expiry_date: null,
      is_expired: null,
      minutes_until_expiry: null
    };
  }

  const expiryTime = parseInt(expiry);
  const now = Date.now();
  const timeUntilExpiry = expiryTime - now;
  const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);
  const isExpired = now >= expiryTime;

  return {
    status: isExpired ? 'expired' : 'valid',
    has_token: true,
    has_expiry: true,
    has_refresh: !!refresh,
    token_preview: token.substring(0, 20) + '...',
    refresh_preview: refresh ? refresh.substring(0, 20) + '...' : null,
    expiry_timestamp: expiryTime,
    expiry_date: new Date(expiryTime).toLocaleString(),
    is_expired: isExpired,
    minutes_until_expiry: minutesUntilExpiry,
    current_time: new Date(now).toLocaleString()
  };
}

// ============================================
// TEST LOCALSTORAGE FUNCTIONALITY
// ============================================
function testLocalStorage() {
  console.log('=== TESTING LOCALSTORAGE FUNCTIONALITY ===');

  const testKey = 'spotify_test_key';
  const testValue = 'test_value_' + Date.now();

  try {
    // Test write
    console.log('Test 1: Writing to localStorage...');
    localStorage.setItem(testKey, testValue);
    console.log('  → localStorage.setItem() called');

    // Test read
    console.log('Test 2: Reading from localStorage...');
    const readValue = localStorage.getItem(testKey);
    console.log('  → localStorage.getItem() returned:', readValue);

    // Verify
    if (readValue === testValue) {
      console.log('  ✅ SUCCESS: Value matches!');
    } else {
      console.error('  ❌ FAIL: Value mismatch!');
      console.error('    Expected:', testValue);
      console.error('    Got:', readValue);
      return false;
    }

    // Test delete
    console.log('Test 3: Deleting from localStorage...');
    localStorage.removeItem(testKey);
    console.log('  → localStorage.removeItem() called');

    // Verify deletion
    const deletedValue = localStorage.getItem(testKey);
    if (deletedValue === null) {
      console.log('  ✅ SUCCESS: Value deleted!');
    } else {
      console.error('  ❌ FAIL: Value still exists after deletion!');
      console.error('    Got:', deletedValue);
      return false;
    }

    // Test quota
    console.log('Test 4: Checking localStorage quota...');
    try {
      const largeString = 'x'.repeat(1000000); // 1MB
      localStorage.setItem('spotify_quota_test', largeString);
      localStorage.removeItem('spotify_quota_test');
      console.log('  ✅ SUCCESS: Can write large values (1MB+)');
    } catch (quotaError) {
      console.warn('  ⚠️ WARNING: Limited localStorage quota');
      console.warn('    Error:', quotaError.message);
    }

    console.log('\n✅ ALL LOCALSTORAGE TESTS PASSED!');
    console.log('localStorage is working correctly.');
    return true;

  } catch (error) {
    console.error('❌ LOCALSTORAGE TEST FAILED!');
    console.error('  Error:', error);
    console.error('  Error name:', error.name);
    console.error('  Error message:', error.message);

    if (error.name === 'SecurityError') {
      console.error('\n  This usually means:');
      console.error('    - Running in private/incognito mode');
      console.error('    - localStorage is disabled in browser settings');
      console.error('    - Third-party cookies are blocked');
    } else if (error.name === 'QuotaExceededError') {
      console.error('\n  This means:');
      console.error('    - localStorage is full');
      console.error('    - Try clearing browser data');
    }

    return false;
  }
}

// Export functions and config for global use
window.SPOTIFY_CONFIG = SPOTIFY_CONFIG;

window.spotifyAuth = {
  authorize: authorizeSpotify,
  getToken: getValidAccessToken,
  isAuthenticated: isSpotifyAuthenticated,
  logout: logoutSpotify,
  checkPremium: checkPremiumAccount,
  handleCallback: handleSpotifyCallback,
  getDebugInfo: getTokenDebugInfo,
  testLocalStorage: testLocalStorage,
  config: SPOTIFY_CONFIG
};

// Auto-run localStorage test on script load (in debug mode)
if (DEBUG) {
  console.log('\n[Spotify Auth] Running automatic localStorage test...');
  testLocalStorage();
}
