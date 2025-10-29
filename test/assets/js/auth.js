/**
 * auth.js — clean, no top-level returns, fully guarded.
 * Exposes small helpers via window.ns, works with our Firebase module if present.
 */
(function(){
  if (!window.ns) window.ns = {};

  // Optional SW registration (safe if duplicated elsewhere)
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/service-worker.js'); } catch (e) {}
  }

  // Source of truth for current user is typically provided by firebase.js (onAuthStateChanged).
  // We mirror that into window.ns.currentUser; if missing, we provide a getter.
  function getUid(){
    return window.ns?.currentUser?.uid
      || window.auth?.currentUser?.uid
      || window.window?.auth?.currentUser?.uid
      || null;
  }

  // Stubs that delegate to firebase.js if available
  async function ensureAuthed(){
    if (typeof window.ns?.ensureAuthed === 'function') {
      return window.ns.ensureAuthed();
    }
    // Fallback: pretend success without changing auth state
    return { uid: getUid() };
  }

  // Export to ns
  window.ns.getUid = getUid;
  window.ns.ensureAuthed = window.ns.ensureAuthed || ensureAuthed;

  // No returns at top-level; everything is wrapped.
})();
