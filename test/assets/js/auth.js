/**
 * auth.js — cleaned
 * - No top-level returns
 * - Guards for legacy window.auth
 * - Exposes helpers via window.ns
 */
(function(){
  if (!window.ns) window.ns = {};

  // Optional: SW register (safe if duplicated elsewhere)
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/service-worker.js'); } catch (e) {}
  }

  function getUid() {
    return window.ns?.currentUser?.uid
      || window.auth?.currentUser?.uid
      || window.window?.auth?.currentUser?.uid
      || null;
  }

  async function ensureAuthed(){
    // Delegate to firebase.js if present
    if (typeof window.ns?.ensureAuthed === 'function') {
      return window.ns.ensureAuthed();
    }
    return { uid: getUid() };
  }

  window.ns.getUid = getUid;
  window.ns.ensureAuthed = window.ns.ensureAuthed || ensureAuthed;
})();
