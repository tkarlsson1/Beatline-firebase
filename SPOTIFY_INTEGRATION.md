# Spotify Web Playback SDK Integration

## Overview

This integration enables in-browser Spotify playback for the Notestream music quiz game using Spotify's Web Playback SDK with OAuth 2.0 PKCE flow.

## Features

- ✅ OAuth 2.0 Authorization with PKCE (secure authentication)
- ✅ Automatic token refresh
- ✅ Web Playback SDK integration
- ✅ Play tracks by Spotify ID without showing track info
- ✅ Playback controls (play, pause, next)
- ✅ Premium account verification
- ✅ Connection status in menu
- ✅ Token persistence in localStorage

## Requirements

⚠️ **Spotify Premium Account Required** - Web Playback SDK only works with Premium accounts.

## Files Created

### Core Files

1. **spotify-auth.js** - OAuth authentication and token management
   - PKCE flow implementation
   - Token storage and refresh
   - Premium account verification

2. **spotify-player.js** - Web Playback SDK integration
   - Player initialization
   - Playback controls (play, pause, next, resume)
   - State management
   - Event listeners

3. **callback.html** - OAuth redirect handler
   - Processes authorization code
   - Exchanges code for access token
   - Redirects back to app

4. **spotify-test.html** - Testing interface
   - Connection status monitoring
   - Playback controls
   - Test track player

### Modified Files

1. **index.html**
   - Added Spotify Web Playback SDK script
   - Loaded spotify-auth.js and spotify-player.js
   - Added connection status handler

2. **menu.js**
   - Added "Connect Spotify" menu item
   - Shows connection status (Connected ✓ / Connecting... / Connect Spotify)
   - Handles connect/disconnect actions

## Configuration

### Spotify App Settings

```javascript
Client ID: 3033344ef55647b8b70ef1dccfa7e65f
Redirect URI: https://www.notestream.se/test/callback
Scopes:
  - streaming (required for Web Playback)
  - user-read-email
  - user-modify-playback-state
  - user-read-playback-state
```

⚠️ **Important**: Ensure the redirect URI is added to your Spotify App settings in the Spotify Developer Dashboard.

## Usage

### For Users

1. **Connect to Spotify**
   - Click hamburger menu (☰)
   - Click "Connect Spotify"
   - Authorize in Spotify popup
   - Get redirected back to app

2. **Check Connection Status**
   - Menu shows "Spotify Connected ✓" when ready
   - Shows "Spotify Connecting..." during initialization
   - Shows "Connect Spotify" when not connected

### For Developers

#### Play a Track

```javascript
// Play track by Spotify ID (without showing UI info)
await window.spotifyPlayer.play('3n3Ppam7vgaVa1iaRUc9Lp');
```

#### Pause Playback

```javascript
await window.spotifyPlayer.pause();
```

#### Resume Playback

```javascript
await window.spotifyPlayer.resume();
```

#### Skip to Next Track

```javascript
await window.spotifyPlayer.next();
```

#### Check if Playing

```javascript
const playing = window.spotifyPlayer.isPlaying();
```

#### Get Player State

```javascript
const state = window.spotifyPlayer.getState();
console.log('Paused:', state.paused);
console.log('Position:', state.position);
console.log('Duration:', state.duration);
```

#### Get Device ID

```javascript
const deviceId = window.spotifyPlayer.getDeviceId();
```

### Authentication Methods

#### Check if Authenticated

```javascript
const isAuth = window.spotifyAuth.isAuthenticated();
```

#### Get Valid Access Token

```javascript
const token = await window.spotifyAuth.getToken();
```

#### Logout

```javascript
window.spotifyAuth.logout();
```

#### Check Premium Status

```javascript
const isPremium = await window.spotifyAuth.checkPremium();
```

## Event Listeners

### Player Ready

```javascript
window.addEventListener('spotifyPlayerReady', (e) => {
  console.log('Device ID:', e.detail.deviceId);
});
```

### Playback State Changed

```javascript
window.addEventListener('spotifyStateChanged', (e) => {
  const state = e.detail;
  console.log('Paused:', state.paused);
  console.log('Position:', state.position);
  console.log('Duration:', state.duration);
});
```

## Testing

Navigate to `/test/spotify-test.html` to access the test interface:

- Connection status monitoring
- Premium account verification
- Device ID display
- Playback controls
- State monitoring
- Play test track (Mr. Brightside by The Killers)

## Security Features

1. **PKCE Flow** - Uses code challenge/verifier instead of client secret
2. **Token Expiry** - Automatic token refresh before expiration
3. **Secure Storage** - Tokens stored in localStorage with expiry timestamps
4. **Premium Verification** - Prevents non-Premium users from attempting playback

## Token Management

### Storage

Tokens are stored in localStorage:
- `spotify_access_token` - Current access token
- `spotify_token_expiry` - Timestamp when token expires
- `spotify_refresh_token` - Refresh token for getting new access tokens
- `spotify_code_verifier` - Temporary PKCE code verifier

### Refresh Logic

- Tokens automatically refresh 5 minutes before expiry
- Failed refresh attempts trigger re-authentication
- Token validation on every API call

## Implementation in Main App

### Show "Now Playing" Indicator

```javascript
// Listen for state changes
window.addEventListener('spotifyStateChanged', (e) => {
  const state = e.detail;
  const nowPlayingDiv = document.getElementById('nowPlaying');

  if (!state.paused) {
    nowPlayingDiv.textContent = '♪ Now Playing...';
    nowPlayingDiv.style.display = 'block';
  } else {
    nowPlayingDiv.style.display = 'none';
  }
});
```

### Integrate with Quiz Game

```javascript
async function displaySong() {
  const song = currentFilteredSongs[Math.floor(Math.random() * currentFilteredSongs.length)];

  // Check if Spotify player is ready
  if (window.spotifyPlayer && window.spotifyPlayer.getDeviceId()) {
    // Play track without showing info
    await window.spotifyPlayer.play(song.spotifyId);

    // Show generic playing indicator
    document.getElementById('nowPlaying').style.display = 'block';
  } else {
    // Fallback to QR code
    generateQRCode(song.spotifyUrl);
  }
}
```

## Troubleshooting

### Player Not Ready

- Ensure user is authenticated
- Check if Premium account
- Wait for `spotifyPlayerReady` event
- Check browser console for errors

### Playback Fails

- Verify Premium account status
- Check token is valid and not expired
- Ensure device_id is available
- Check browser console for API errors

### Authentication Issues

- Clear localStorage and re-authenticate
- Check redirect URI matches app settings
- Verify client ID is correct
- Check browser allows third-party cookies

### Token Refresh Fails

- Re-authenticate manually
- Check refresh token is stored
- Verify network connectivity

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ⚠️ May require enabling cross-site tracking
- Mobile browsers: ✅ Supported with Premium

## API Limits

- Spotify Web API rate limits apply
- Recommended to cache player state
- Avoid excessive token refreshes

## Future Enhancements

Potential improvements:
- Queue management
- Volume control
- Seek functionality
- Multiple device support
- Playlist playback
- Shuffle mode

## Resources

- [Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [OAuth 2.0 PKCE Flow](https://oauth.net/2/pkce/)

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Spotify app configuration
3. Test with spotify-test.html
4. Check Premium account status
5. Review this documentation
