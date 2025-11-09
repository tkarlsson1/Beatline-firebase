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
