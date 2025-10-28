if (!window.ns) window.ns = {};

// Extracted from legacy script.js into app-legacy.js
/* classic block #1 */
function escapeHTML(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function setSafeHTML(el, html){
  if (!el) return;
  el.innerHTML = escapeHTML(html ?? '');
}

/* classic block #2 */
document.addEventListener("DOMContentLoaded", function() {
  // Växla mellan inloggnings- och registreringsmodaler
  const showRegisterBtn = document.getElementById("showRegister");
  const showLoginBtn = document.getElementById("showLogin");
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener("click", () => {
      const lm = document.getElementById("loginModal");
      const rm = document.getElementById("registerModal");
      if (lm) lm.style.display = "none";
      if (rm) rm.style.display = "flex";
    });
  }
  if (showLoginBtn) {
    showLoginBtn.addEventListener("click", () => {
      const lm = document.getElementById("loginModal");
      const rm = document.getElementById("registerModal");
      if (rm) rm.style.display = "none";
      if (lm) lm.style.display = "flex";
    });
  }

  // Readme Modal (guards)
  const readmeModal = document.getElementById("readmeModal");
  const closeBtn = document.getElementById("closeReadme") || (readmeModal ? readmeModal.querySelector(".close") : null);
  if (closeBtn && readmeModal) {
    closeBtn.addEventListener("click", function() {
      readmeModal.style.display = "none";
    });
    window.addEventListener("click", function(event) {
      if (event.target === readmeModal) {
        readmeModal.style.display = "none";
      }
    });
  }

  // Feedback-hantering
  const feedbackBtn = document.getElementById("feedbackButton");
  const feedbackModal = document.getElementById("feedbackModal");
  const closeFeedback = document.getElementById("closeFeedback");
  const submitFeedback = document.getElementById("submitFeedback");
  if (feedbackBtn && feedbackModal) {
    feedbackBtn.addEventListener("click", function() {
      feedbackModal.style.display = "block";
    });
  }
  if (closeFeedback && feedbackModal) {
    closeFeedback.addEventListener("click", function() {
      feedbackModal.style.display = "none";
    });
  }
  window.addEventListener("click", function(event) {
    if (feedbackModal && event.target === feedbackModal) {
      feedbackModal.style.display = "none";
    }
  });
  if (submitFeedback) {
    submitFeedback.addEventListener("click", function() {
      const input = document.getElementById("feedbackText");
      const feedbackText = (input && input.value || "").trim();
      if (feedbackText.length === 0) {
        alert("Feedback kan inte vara tom!");
        return;
      }
      const _p = (window.ns && typeof window.ns.saveFeedback === 'function')
        ? window.ns.saveFeedback(feedbackText)
        : Promise.resolve();
      _p.then(() => {
          alert("Tack för din feedback!");
          if (input) input.value = "";
          if (feedbackModal) feedbackModal.style.display = "none";
        })
        .catch((error) => {
          console.error("Fel vid lagring av feedback:", error);
          alert("Något gick fel. Försök igen senare.");
        });
    });
  }

  // Edit year modal (guards)
  const saveYearBtn = document.getElementById("saveYearButton");
  if (saveYearBtn) {
    saveYearBtn.addEventListener("click", function() {
      const newYearInput = document.getElementById("newYearInput");
      const newYear = (newYearInput && newYearInput.value || "").trim();
      console.log("Save-knappen klickad, nytt år:", newYear);
      if (!/^\d{4}$/.test(newYear)) {
        alert("Ange ett giltigt årtal med 4 siffror.");
        return;
      }
      const updater = (window.ns && typeof window.ns.updateCustomYear === 'function')
        ? window.ns.updateCustomYear
        : null;
      const closer = (window.ns && typeof window.ns.closeEditYearModal === 'function')
        ? window.ns.closeEditYearModal
        : () => { const m = document.getElementById("editYearModal"); if (m) m.style.display = "none"; };
      const currentPlaylistName = window.ns?.currentPlaylistName;
      const currentSpotifyID = window.ns?.currentSpotifyID;
      const p = updater ? updater(currentPlaylistName, currentSpotifyID, newYear) : Promise.resolve();
      p.then(() => {
          console.log("Uppdatering lyckades, stänger modal.");
          closer();
        })
        .catch((error) => {
          console.error("Fel vid uppdatering av customYear:", error);
        });
    });
  }
  const closeYearBtn = document.getElementById("closeModal");
  if (closeYearBtn) {
    closeYearBtn.addEventListener("click", function() {
      console.log("Stänger modal via stäng-knappen.");
      const closer = (window.ns && typeof window.ns.closeEditYearModal === 'function')
        ? window.ns.closeEditYearModal
        : () => { const m = document.getElementById("editYearModal"); if (m) m.style.display = "none"; };
      closer();
    });
  }
});

/* classic block #3 */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(registration => {
      console.log("Service Worker registrerad med scope:", registration.scope);
    })
    .catch(error => {
      console.error("Service Worker misslyckades:", error);
    });
}

/* classic block #4 */
// A11y: modal focus trap and ESC close
(function(){
  function getFocusable(container){
    if (!container) return [];
    return Array.from(container.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  }
  function trapFocus(modal){
    const focusable = getFocusable(modal);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    function keydown(e){
      if (e.key === 'Escape') {
        modal.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
      }
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
    modal.addEventListener('keydown', keydown);
    modal.__cleanup = () => modal.removeEventListener('keydown', keydown);
  }
  document.addEventListener('modal:open', e => {
    const modal = e.target.closest('.modal');
    if (modal) {
      trapFocus(modal);
    }
  });
  document.addEventListener('modal:close', e => {
    const modal = e.target.closest('.modal');
    if (modal && modal.__cleanup) modal.__cleanup();
  });
})();

/* classic block #5 */
// === Hantera spellistor (via hamburgermenyn) ===
(function(){
  function qs(id){ return document.getElementById(id); }
  function show(el){ if(el){ el.style.display = 'block'; el.dispatchEvent(new CustomEvent('modal:open', {bubbles:true})); } }
  function hide(el){ if(el){ el.style.display = 'none'; el.dispatchEvent(new CustomEvent('modal:close', {bubbles:true})); } }

  async function fetchUserPlaylists(){
    // Använd appens riktiga fetch om den finns
    if (window.ns && typeof window.ns.fetchUserPlaylists === 'function'){
      return window.ns.fetchUserPlaylists();
    }
    // Fallback: tomt resultat (så inget kraschar)
    return {};
  }

  function renderPlaylists(data){
    const container = qs('managePlaylistsList');
    const info = qs('managePlaylistsInfo');
    if (!container){ if (info) info.textContent = 'Hittar ingen listcontainer.'; return; }
    container.innerHTML = '';
    container.style.textAlign = "left";
    const keys = Object.keys(data || {});
    if (!keys.length){
      if (info) info.textContent = 'Inga spellistor ännu.';
      return;
    }
    if (info) info.textContent = '';

    keys.forEach((name) => {
      const item = document.createElement('div');
      const left = document.createElement('div');
      const title = document.createElement('span');
      const meta = document.createElement('span');
      const del = document.createElement('button');
      const songCount = Array.isArray(data[name]) ? data[name].length : (data[name]?.count || 0);

      item.className = 'playlist-row';
      item.style.display = 'flex';
      item.style.width = '100%';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.gap = '1rem';
      item.style.padding = '.6rem .4rem';
      item.style.borderBottom = '1px solid rgba(255,255,255,.1)';

      left.style.display = 'flex';
      left.style.alignItems = 'flex-start';
      left.style.textAlign = 'left';
      left.style.flexDirection = 'column';

      title.style.display = 'block';
      title.style.textAlign = 'left';
      title.textContent = name;

      meta.style.display = 'block';
      meta.style.textAlign = 'left';
      meta.textContent = songCount + ' låtar';
      meta.style.opacity = '.8';
      meta.style.fontSize = '.9rem';

      del.type = 'button';
      del.textContent = 'Ta bort';
      del.className = 'btn-delete-playlist';
      del.style.padding = '.4rem .7rem';
      del.style.borderRadius = '8px';
      del.style.border = '1px solid rgba(255,255,255,.2)';
      del.style.background = 'transparent';
      del.style.color = '#fff';
      del.style.cursor = 'pointer';
      del.addEventListener('click', async () => {
        if (!confirm('Ta bort spellistan "' + name + '"? Detta går inte att ångra.')) return;
        try {
          item.remove();
          if (!qs('managePlaylistsList').children.length){
            const info = qs('managePlaylistsInfo'); if (info) info.textContent = 'Inga spellistor kvar.';
          }
          if (window.ns && typeof window.ns.deleteUserPlaylist === 'function'){
            await window.ns.deleteUserPlaylist(name);
          }
        } catch(e){
          console.error('Kunde inte ta bort:', e);
          alert('Kunde inte ta bort. Kolla nätverk och behörigheter.');
        }
      });

      left.appendChild(title);
      left.appendChild(meta);
      item.appendChild(left);
      item.appendChild(del);
      container.appendChild(item);
    });
  }

  window.openManagePlaylists = async function(){
    const modal = qs('managePlaylistsModal');
    const info = qs('managePlaylistsInfo');
    if (!modal){ return; }
    // kräver login om appen signalerar det
    if (window.ns && window.ns.requireLogin && !window.ns.currentUser){
      if (info) info.textContent = 'Du behöver vara inloggad för att hantera dina spellistor.';
      show(modal);
      return;
    }
    try {
      if (info) info.textContent = 'Hämtar dina spellistor...';
      const data = await fetchUserPlaylists();
      if (info) info.textContent = '';
      renderPlaylists(data);
      show(modal);
    } catch(e){
      console.error(e);
      if (info) info.textContent = 'Kunde inte hämta spellistor just nu.';
      show(modal);
    }
  };

  // Close handlers
  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'closeManagePlaylists')){
      hide(qs('managePlaylistsModal'));
    }
    if (e.target && e.target.id === 'managePlaylistsModal'){
      hide(qs('managePlaylistsModal'));
    }
  });

  // Om det finns en knapp i UI:t som ska öppna modalen, häng på den
  document.addEventListener('DOMContentLoaded', function(){
    const btn = document.getElementById('openManagePlaylists');
    if (btn) btn.addEventListener('click', window.openManagePlaylists);
  });
})();

/* classic block #6 */
(function(){ 
  function getFocusable(container){
    if (!container) return [];
    return Array.from(container.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  }
  function trapFocus(modal){
    const nodes = getFocusable(modal);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    function onKey(e){
      if (e.key === 'Escape') {
        closeModal(modal);
      } else if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modal.__trapKeyHandler = onKey;
    modal.addEventListener('keydown', onKey);
    // Sätt initialt fokus?
  }
  function untrapFocus(modal){
    if (modal.__trapKeyHandler) modal.removeEventListener('keydown', modal.__trapKeyHandler);
    modal.__trapKeyHandler = null;
  }
  function closeModal(modal){
    modal.style.display = 'none';
    document.body.style.top = '';
    window.scrollTo(0, 0 + (window.__loginScrollY || 0));
    modal.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
  }
  document.addEventListener('modal:open', function(e){
    const modal = e.target.closest('#loginModal');
    if (modal) trapFocus(modal);
  });
  document.addEventListener('modal:close', function(e){
    const modal = e.target.closest('#loginModal');
    if (modal) untrapFocus(modal);
  });
})();
