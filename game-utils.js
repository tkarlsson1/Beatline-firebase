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
    reportedByTeam: window.teamId || "Unknown"
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
