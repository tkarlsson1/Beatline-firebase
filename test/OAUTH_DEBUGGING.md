# Spotify OAuth Debugging Guide

## Overview

This guide helps you debug Spotify OAuth authentication issues. All logging is enabled by default and will appear in the browser console.

## Quick Start - Finding the Problem

### Step 1: Check Configuration
Visit **`/test/verify-config.html`** to verify your OAuth configuration:
- Client ID matches your Spotify app
- Redirect URI is exactly: `https://www.notestream.se/test/callback`
- No trailing slashes or typos

### Step 2: Test OAuth Flow
1. Navigate to `/test/spotify-test.html`
2. Open browser console (F12)
3. Click "Connect Spotify"
4. Watch the console logs

### Step 3: Check Callback
When redirected to `/test/callback`, check console for:
- Full callback URL with all parameters
- Authorization code capture
- Token exchange request/response
- Token storage confirmation

## Console Logs Explained

### Authorization Start
```
[Spotify Auth] Starting authorization flow...
[Spotify Auth] Code verifier generated (first 20 chars): xT9mK2pL...
[Spotify Auth] Redirecting to Spotify authorization URL: https://accounts.spotify.com/authorize?...
```
**What this means:** OAuth flow initiated successfully.

### Callback Page Load
```
=== SPOTIFY CALLBACK PAGE LOADED ===
Full URL: https://www.notestream.se/test/callback?code=AQC8x...
Search params: ?code=AQC8x...

All URL Parameters:
  code: AQC8x... (truncated)

✅ Authorization code found!
```
**What this means:** Callback received authorization code successfully.

### Token Exchange
```
[Spotify Auth] === HANDLING OAUTH CALLBACK ===
[Spotify Auth] Exchanging authorization code for access token...
[Spotify Auth] Token exchange request details: {
  client_id: "3033344ef55647b8b70ef1dccfa7e65f",
  redirect_uri: "https://www.notestream.se/test/callback",
  grant_type: "authorization_code"
}
[Spotify Auth] Token response received: {
  status: 200,
  statusText: "OK",
  ok: true
}
[Spotify Auth] ✅ Access token stored successfully (first 20 chars): BQC7k3...
[Spotify Auth] Token expires at: 1/8/2025, 3:30:00 PM
```
**What this means:** Token exchange successful, token stored in localStorage.

## Common Error Messages

### ❌ "redirect_uri_mismatch"
**Full log:**
```
[Spotify Auth] ❌ Spotify API returned an error:
  Error: invalid_request
  Description: redirect_uri_mismatch
```

**Cause:** Redirect URI in code doesn't match Spotify Dashboard.

**Solution:**
1. Visit `/test/verify-config.html`
2. Copy the exact redirect URI shown
3. Go to [Spotify Dashboard](https://developer.spotify.com/dashboard)
4. Settings → Redirect URIs → Add: `https://www.notestream.se/test/callback`
5. Click Save

**Common mistakes:**
- Trailing slash: `https://www.notestream.se/test/callback/` ❌
- HTTP instead of HTTPS: `http://www.notestream.se/test/callback` ❌
- Missing www: `https://notestream.se/test/callback` ❌
- Wrong path: `https://www.notestream.se/callback` ❌

### ❌ "invalid_grant"
**Full log:**
```
[Spotify Auth] ❌ Spotify API returned an error:
  Error: invalid_grant
  Description: Invalid authorization code
  Common causes:
    - Authorization code already used
    - Authorization code expired
    - Code verifier mismatch
    - Redirect URI mismatch
```

**Causes:**
1. **Code already used** - Authorization codes can only be used once
2. **Code expired** - Codes expire after ~10 minutes
3. **Code verifier mismatch** - PKCE verification failed
4. **Redirect URI mismatch** - URI changed between auth and callback

**Solutions:**
- Don't refresh the callback page
- Complete OAuth flow within 10 minutes
- Don't clear localStorage during OAuth flow
- Verify redirect URI matches exactly

### ❌ "NO AUTHORIZATION CODE FOUND IN URL"
**Full log:**
```
❌ NO AUTHORIZATION CODE FOUND IN URL!
This usually means:
  1. User denied authorization
  2. Redirect URI mismatch
  3. Invalid OAuth flow
```

**Causes:**
1. User clicked "Cancel" on Spotify authorization page
2. Redirect URI not matching (Spotify redirects to wrong page)
3. OAuth parameters incorrect

**Solutions:**
- Try authorizing again
- Check redirect URI in Dashboard
- Verify Client ID is correct

### ❌ "Code verifier not found in localStorage"
**Full log:**
```
[Spotify Auth] ERROR: Code verifier not found in localStorage!
```

**Cause:** Code verifier was cleared or page was refreshed during OAuth flow.

**Solution:**
- Don't refresh or close browser during OAuth
- Don't clear localStorage during OAuth
- Start OAuth flow again from beginning

### ❌ "Failed to parse response as JSON"
**Full log:**
```
[Spotify Auth] ❌ Failed to parse response as JSON: SyntaxError...
[Spotify Auth] Response text: <!DOCTYPE html>...
```

**Cause:** Spotify returned HTML instead of JSON (usually an error page).

**Solution:**
- Check if you're hitting the correct endpoint
- Verify network connectivity
- Check Spotify API status

## Debugging Workflow

### Problem: OAuth Flow Fails Immediately

**Steps:**
1. Open `/test/verify-config.html`
2. Verify redirect URI matches exactly
3. Copy redirect URI to clipboard
4. Go to Spotify Dashboard → Settings
5. Add redirect URI (exact copy)
6. Save and wait 30 seconds
7. Try again

### Problem: Callback Receives No Code

**Steps:**
1. Open browser console
2. Click "Connect Spotify"
3. Check console for authorization URL
4. Copy the URL and verify:
   - `client_id` matches your app
   - `redirect_uri` is correct
   - `response_type=code`
5. Look at Spotify authorization page URL
6. After clicking "Agree", check callback URL
7. If no `?code=`, check Spotify Dashboard redirect URIs

### Problem: Token Exchange Fails

**Steps:**
1. Open `/test/callback` page
2. Check console logs for:
   - Authorization code present?
   - Code verifier found?
   - Token exchange request details
   - Response status and error
3. If `invalid_grant`:
   - Start fresh OAuth flow
   - Don't reuse authorization codes
4. If redirect URI mismatch:
   - Update Spotify Dashboard
   - Verify exact match (no typos!)

## Testing Tools

### 1. Configuration Verifier
**URL:** `/test/verify-config.html`

**Features:**
- Shows current OAuth configuration
- Validates redirect URI
- Provides copy buttons for easy setup
- Links to Spotify Dashboard
- Test OAuth button

### 2. Test Page with Debug Info
**URL:** `/test/spotify-test.html`

**Features:**
- Real-time token status
- Token preview (first 20 chars)
- Expiry countdown
- Debug info panel
- Manual token refresh
- Clear tokens button

### 3. Full Console Debug
Run in browser console:
```javascript
// Get current auth status
window.spotifyAuth.isAuthenticated()

// Get detailed token info
window.spotifyAuth.getDebugInfo()

// View full debug info
const debug = window.spotifyAuth.getDebugInfo();
console.table(debug);

// Check token manually
localStorage.getItem('spotify_access_token')?.substring(0, 20)

// Check expiry
new Date(parseInt(localStorage.getItem('spotify_token_expiry'))).toLocaleString()

// Force logout and clear all tokens
window.spotifyAuth.logout()
```

## Verification Checklist

Before starting OAuth flow:

- [ ] Redirect URI in code: `https://www.notestream.se/test/callback`
- [ ] Redirect URI in Spotify Dashboard matches exactly
- [ ] Client ID is correct: `3033344ef55647b8b70ef1dccfa7e65f`
- [ ] Browser allows third-party cookies
- [ ] Not in private/incognito mode (localStorage needed)
- [ ] Browser console is open to see logs
- [ ] No ad blockers interfering with redirects

During OAuth flow:

- [ ] Don't refresh the page
- [ ] Don't close the browser
- [ ] Don't clear localStorage
- [ ] Complete within 10 minutes
- [ ] Click "Agree" on Spotify page

After OAuth flow:

- [ ] Check console for success messages
- [ ] Verify token is stored (green "VALID" status)
- [ ] Check token expiry is in the future
- [ ] Confirm Premium account (if needed)

## Log Levels

All logs are prefixed for easy filtering:

- `[Spotify Auth]` - Authentication flow logs
- `===` - Section headers
- `✅` - Success
- `❌` - Error
- `⚠️` - Warning
- `🔄` - Refresh operation

Filter console by typing: `[Spotify Auth]`

## Network Tab Debugging

### Check Token Exchange Request

1. Open DevTools → Network tab
2. Filter by "token"
3. Start OAuth flow
4. Look for POST to `accounts.spotify.com/api/token`
5. Check:
   - **Request payload:**
     - `grant_type=authorization_code`
     - `code=` (authorization code)
     - `redirect_uri=https://www.notestream.se/test/callback`
     - `client_id=3033344ef55647b8b70ef1dccfa7e65f`
     - `code_verifier=` (64 char string)
   - **Response:**
     - Status 200 = success
     - Status 400 = invalid request
     - Body should contain `access_token`

### Common Network Issues

**Status 400 + "redirect_uri_mismatch":**
- Redirect URI doesn't match Dashboard

**Status 400 + "invalid_grant":**
- Code already used or expired
- Code verifier mismatch

**Status 401 + "invalid_client":**
- Wrong Client ID

## Still Having Issues?

1. Clear all tokens: `/test/spotify-test.html` → "Clear All Tokens"
2. Clear browser cache and cookies
3. Verify configuration: `/test/verify-config.html`
4. Check Spotify API status: https://developer.spotify.com/status
5. Start fresh OAuth flow
6. Check console logs from start to finish
7. Copy error messages from console
8. Check Network tab for failed requests

## Contact / Report Issues

If you've followed all steps and still have issues:

1. Copy full console log output
2. Take screenshot of `/test/verify-config.html`
3. Copy error message from callback page
4. Check Network tab for failed token request
5. Report issue with all debug info

## Summary

**Key Points:**
- All logging is automatic - just open console
- Redirect URI must match EXACTLY
- Authorization codes expire after 10 minutes
- Can only use each code once
- Don't refresh during OAuth flow
- Use `/test/verify-config.html` to check setup
- Use `/test/spotify-test.html` to test and debug

**Most Common Fix:**
Update redirect URI in Spotify Dashboard to exactly:
```
https://www.notestream.se/test/callback
```
(No trailing slash, exact case, HTTPS, includes www)
