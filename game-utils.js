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
// TRACK REPORTING
// ============================================
function reportTrack(spotifyId, title, artist, year) {
  if (!confirm(`Vill du rapportera '${title}' med årtalet ${year} som felaktigt?`)) {
    return;
  }
  
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
      showNotification('Låten har rapporterats till spelledaren! Tack!', 'success');
      // Hide the report button so they can't spam it
      const reportBtns = document.querySelectorAll('.report-btn');
      reportBtns.forEach(btn => btn.style.display = 'none');
    })
    .catch((error) => {
      console.error('[Game] Fel vid rapportering:', error);
      showNotification('Kunde inte rapportera låten. Försök igen.', 'error');
    });
}
