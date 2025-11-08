// ============================================
// UTILITY FUNCTIONS
// ============================================

// Helper to escape HTML to mitigate XSS
function escapeHTML(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function setSafeHTML(el, html) {
  el.innerHTML = String(html).replace(/<script/gi,'&lt);script');
}
