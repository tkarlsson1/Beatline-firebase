// ============================================
// NOTESTREAM - GAME UTILITIES MODULE
// Helper functions used across game modules
// ============================================

// ============================================
// ERROR HANDLING
// ============================================
function showError(message) {
  console.error('[Game] Error:', message);
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorState').style.display = 'block';
}

// ============================================
// HTML SANITIZATION
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// ICONS AND TEAM COLOURS (look only)
// ============================================
// Flat icons in the colour of the text around them, used where the game showed emoji before:
// the note beside a team's score and the ticket beside its tokens.
const ICON_NOTE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3v10.6A3.5 3.5 0 1 0 11 17V7h7V3z"></path></svg>';
const ICON_TICKET = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"></path></svg>';

/**
 * The colour of a team and the text colour that reads on it.
 * colorName is the name stored on the team ('blue', 'red', ...), fallbackHex is used when
 * the name is not one of TEAM_COLORS (lobby.js).
 * Returns { color, ink }: ink is white on the dark colours (purple, pink) and near black
 * on the others.
 */
function teamColors(colorName, fallbackHex) {
  const known = TEAM_COLORS.find(c => c.name === colorName);
  const color = known ? known.hex : fallbackHex;

  // Relative luminance of the colour (WCAG), 0 for black and 1 for white
  const channel = (start) => {
    const value = parseInt(color.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  return { color: color, ink: luminance < 0.19 ? '#ffffff' : '#0b0b0b' };
}

/** Sets the team's colours on an element; game.css reads them as --team and --ink. */
function applyTeamColors(element, colors) {
  element.style.setProperty('--team', colors.color);
  element.style.setProperty('--ink', colors.ink);
}

// ============================================
// MESSAGES AT THE TOP OF THE SCREEN
// ============================================
// lobby.js has a showNotification() that sets its look in the code and is shared with the
// lobby pages. The game uses this one instead, which only sets classes: the look is in
// game.css. Same message, same types ('success', 'error', 'info') and the same time on
// screen (3.3 seconds) as before.
function showNotification(message, type = 'info') {
  console.log(`[Game] Notification (${type}):`, message);

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) notification.parentNode.removeChild(notification);
  }, 3300);
}

console.log('[Game] Utils module loaded');

// ============================================
// QUESTIONS AND MESSAGES
// ============================================
// The browser's own confirm() and alert() make a phone leave fullscreen, so the game asks
// in its own box (ny/dialog.js). Unlike confirm() the box does not freeze the page: the
// timer goes on while a question is open, so the caller checks the state again afterwards.

/**
 * Asks a yes/no question. options: { title, text, confirmLabel, cancelLabel, danger }.
 * Returns a promise for true or false with a dismiss() method that takes the question away.
 * Falls back to the browser's own box if dialog.js did not load.
 */
function askQuestion(options) {
  if (window.NotestreamDialog) return window.NotestreamDialog.confirm(options);

  const text = options.text ? `${options.title}\n\n${options.text}` : options.title;
  const answer = Promise.resolve(window.confirm(text));
  answer.dismiss = () => {};
  return answer;
}

// spotify-player.js reports problems with alert(). In the game they are shown in the game's
// box instead. It does not wait for the user: the code after alert() carries on. A message
// that is already on screen or waiting is not added again, so that the same Spotify problem
// at every new song does not pile up behind the first one.
const pendingGameMessages = new Set();
if (window.NotestreamDialog) {
  window.alert = message => {
    const text = String(message);
    if (pendingGameMessages.has(text)) return;
    pendingGameMessages.add(text);
    window.NotestreamDialog.message({ text }).then(() => pendingGameMessages.delete(text));
  };
}

// ============================================
// TRACK REPORTING
// ============================================
async function reportTrack(spotifyId, title, artist, year) {
  const confirmed = await askQuestion({
    title: 'Rapportera fel årtal?',
    text: `"${title}" med årtalet ${year} skickas till admin för kontroll.`,
    confirmLabel: 'Rapportera'
  });
  if (!confirmed) return;

  const reportRef = window.firebaseRef(window.firebaseDb, `reportedTracks/${spotifyId}`);
  const reportData = {
    spotifyId: spotifyId,
    title: title,
    artist: artist,
    year: year,
    reportedAt: Date.now(),
    reportedByTeam: window.teamId || "Unknown",
    // The database rules only accept a report that names a game that exists
    gameId: gameId
  };
  
  window.firebaseSet(reportRef, reportData)
    .then(() => {
      showNotification('Låten har rapporterats till admin! Tack!', 'success');
      // Hide the report button so they can't spam it
      const reportBtns = document.querySelectorAll('.report-btn');
      reportBtns.forEach(btn => btn.style.display = 'none');
    })
    .catch((error) => {
      console.error('[Game] Fel vid rapportering:', error);
      showNotification('Kunde inte rapportera låten. Försök igen.', 'error');
    });
}
