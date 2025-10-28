/* classic block #1 */
// Helper to escape HTML to mitigate XSS when using innerHTML
function escapeHTML(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function setSafeHTML(el, html){
  el.innerHTML = String(html).replace(/<script/gi,'&lt);script');
}

/* classic block #2 */
document.addEventListener("DOMContentLoaded", function() {
      // Växla mellan inloggnings- och registreringsmodaler
      const showRegisterBtn = document.getElementById("showRegister");
      const showLoginBtn = document.getElementById("showLogin");
      if (showRegisterBtn) {
        showRegisterBtn.addEventListener("click", () => {
          document.getElementById("loginModal").style.display = "none";
          document.getElementById("registerModal").style.display = "flex";
        });
      }
      if (showLoginBtn) {
        showLoginBtn.addEventListener("click", () => {
          document.getElementById("registerModal").style.display = "none";
          document.getElementById("loginModal").style.display = "flex";
        });
      }
      
      // Readme Modal
      const readmeModal = document.getElementById("readmeModal");
      const closeBtn = document.querySelector(".closeBtn");
      closeBtn.addEventListener("click", function() {
        readmeModal.style.display = "none";
      });
      window.addEventListener("click", function(event) {
        if (event.target == readmeModal) {
          readmeModal.style.display = "none";
        }
      });
     


      // Feedback-hantering
      document.getElementById("feedbackButton")?.addEventListener("click", function() {
        document.getElementById("feedbackModal").style.display = "block";
      });
      document.getElementById("closeFeedback")?.addEventListener("click", function() {
        document.getElementById("feedbackModal").style.display = "none";
      });
      window.addEventListener("click", function(event) {
        if (event.target == document.getElementById("feedbackModal")) {
          document.getElementById("feedbackModal").style.display = "none";
        }
      });
      document.getElementById("submitFeedback")?.addEventListener("click", function() {
    const feedbackText = document.getElementById("feedbackText").value.trim();
    if (feedbackText.length === 0) {
        alert("Feedback kan inte vara tom!");
        return;
    }

    const feedbackRef = window.firebaseRef(window.firebaseDb, 'feedback');
    window.firebasePush(feedbackRef, { text: feedbackText, timestamp: Date.now() })
        .then(() => {
            alert("Tack för din feedback!");
            document.getElementById("feedbackText").value = "";
            document.getElementById("feedbackModal").style.display = "none";
        })
        .catch((error) => {
            console.error("Fel vid lagring av feedback:", error);
            alert("Något gick fel. Försök igen senare.");
        });
});
      document.getElementById("saveYearButton").addEventListener("click", function() {
          const newYear = document.getElementById("newYearInput").value.trim();
          console.log("Save-knappen klickad, nytt år:", newYear);
          if (!/^\d{4}$/.test(newYear)) {
              alert("Ange ett giltigt årtal med 4 siffror.");
              return;
          }
          console.log("Uppdaterar customYear för playlist:", currentPlaylistName, "spotifyID:", currentSpotifyID);
          updateCustomYear(currentPlaylistName, currentSpotifyID, newYear)
              .then(() => {
                  console.log("Uppdatering lyckades, stänger modal.");
                  closeEditYearModal();
              })
              .catch((error) => {
                  console.error("Fel vid uppdatering av customYear:", error);
              });
      });
      document.getElementById("closeModal").addEventListener("click", function() {
          console.log("Stänger modal via stäng-knappen.");
          closeEditYearModal();
      });
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
  function trapFocus(modal){
    const focusable = modal.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    let first = focusable[0], last = focusable[focusable.length - 1];
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
      (modal.querySelector('[autofocus]') || modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || modal).focus();
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
  function show(el){ el.style.display = 'block'; el.dispatchEvent(new CustomEvent('modal:open', {bubbles:true})); }
  function hide(el){ el.style.display = 'none'; el.dispatchEvent(new CustomEvent('modal:close', {bubbles:true})); }

  async function fetchUserPlaylists(){
    if (!window.auth || !window.auth.currentUser) return null;
    return new Promise((resolve, reject) => {
      const userId = window.window.auth.currentUser.uid;
      const userRef = window.firebaseRef(window.firebaseDb, 'userPlaylists/' + userId);
      window.firebaseOnValue(userRef, (snap) => {
        const val = snap.val() || {};
        resolve(val);
      }, (err) => reject(err), { onlyOnce: true });
    });
  }

  function renderPlaylists(listMap){
    const container = qs('managePlaylistsList');
    container.innerHTML = '';
    container.style.textAlign = "left";

    const keys = Object.keys(listMap || {});
    if (!keys.length){
      container.innerHTML = '<p>Du har inga egna spellistor ännu.</p>';
      return;
    }
    keys.forEach((name) => {
      const item = document.createElement('div');
      item.className = 'playlist-row';
      item.style.display = 'flex';
      item.style.width = '100%';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.gap = '1rem';
      item.style.padding = '.6rem .4rem';
      item.style.borderBottom = '1px solid rgba(255,255,255,.1)';
      // Left: name + count (if songs exist)
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'flex-start';
      left.style.textAlign = 'left';
      left.style.flexDirection = 'column';
      const title = document.createElement('strong');
      title.style.display = 'block';
      title.style.textAlign = 'left';
      title.textContent = name;
      left.appendChild(title);
      const meta = document.createElement('span');
      meta.style.display = 'block';
      meta.style.textAlign = 'left';
      const songCount = listMap[name] && listMap[name].songs ? Object.keys(listMap[name].songs).length : 0;
      meta.textContent = songCount + ' låtar';
      meta.style.opacity = '.8';
      meta.style.fontSize = '.9rem';
      left.appendChild(meta);
      // Right: delete button
      const del = document.createElement('button');
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
          const userId = window.window.auth.currentUser.uid;
          const refToList = window.firebaseRef(window.firebaseDb, 'userPlaylists/' + userId + '/' + name);
          await window.firebaseSet(refToList, null); // delete node
          // Optimistisk uppdatering
          item.remove();
          if (!qs('managePlaylistsList').children.length){
            qs('managePlaylistsList').innerHTML = '<p>Du har inga egna spellistor ännu.</p>';
          }
        } catch(e){
          console.error('Kunde inte ta bort:', e);
          alert('Kunde inte ta bort. Kolla nätverk och behörigheter.');
        }
      });
      item.appendChild(left);
      item.appendChild(del);
      container.appendChild(item);
    });
  }

  window.openManagePlaylists = async function(){
    const modal = qs('managePlaylistsModal');
    const info = qs('managePlaylistsInfo');
    info.textContent = '';
    if (!window.auth || !window.auth.currentUser){
      info.textContent = 'Du behöver vara inloggad för att hantera dina spellistor.';
      qs('managePlaylistsList').innerHTML = '';
      show(modal);
      return;
    }
    try {
      info.textContent = 'Hämtar dina spellistor...';
      const data = await fetchUserPlaylists();
      info.textContent = '';
      renderPlaylists(data);
      show(modal);
    } catch(e){
      console.error(e);
      info.textContent = 'Kunde inte hämta spellistor just nu.';
      show(modal);
    }
  };

  // Close handlers
  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'closeManagePlaylists')){
      hide(qs('managePlaylistsModal'));
    }
    // click outside modal-content
    if (e.target && e.target.id === 'managePlaylistsModal'){
      hide(qs('managePlaylistsModal'));
    }
  });

  // Add entry to hamburger menu after it is built
  document.addEventListener('DOMContentLoaded', function(){
    const menu = document.getElementById('menuContainer') || document.querySelector('#menuContainer');
    const dropdown = document.getElementById('menuDropdown') || document.querySelector('#menuDropdown');
    const host = dropdown || menu;
    if (!host) return;
    let list = host.querySelector('.menu-items');
    if (!list){
      list = document.createElement('div');
      list.className = 'menu-items';
      if (!dropdown){
        const dd = document.createElement('div');
        dd.id = 'menuDropdown';
        dd.style.background = 'rgba(20,20,20,.96)';
        dd.style.backdropFilter = 'blur(8px)';
        dd.style.border = '1px solid rgba(255,255,255,.15)';
        dd.style.borderRadius = '12px';
        dd.style.position = 'absolute';
        dd.style.right = '0';
        dd.style.top = '60px';
        dd.style.minWidth = '220px';
        dd.style.padding = '.6rem';
        dd.style.display = 'none';
        dd.appendChild(list);
        menu && menu.appendChild(dd);
      } else {
        dropdown.appendChild(list);
      }
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = 'Hantera spellistor';
    item.style.width = '100%';
    item.style.textAlign = 'left';
    item.style.padding = '.55rem .7rem';
    item.style.border = 'none';
    item.style.background = 'transparent';
    item.style.color = '#fff';
    item.style.cursor = 'pointer';
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.08)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => {
      const dd = document.getElementById('menuDropdown');
      if (dd) dd.style.display = 'none';
      window.openManagePlaylists();
    });
    list.appendChild(item);
  });
})();

/* classic block #6 */
// Fokusfälla + ESC-stängning för login-modalen
(function(){ 
  function getFocusable(container){
    return container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
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
    // Sätt initialt fokus
    (modal.querySelector('[autofocus]') || first).focus();
  }
  function untrapFocus(modal){
    if (modal.__trapKeyHandler) modal.removeEventListener('keydown', modal.__trapKeyHandler);
    modal.__trapKeyHandler = null;
  }
  function closeModal(modal){
    // Stäng och lås upp scroll (samma mönster som tidigare)
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, 0 + (window.__loginScrollY || 0));
    modal.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
  }
  // När modalen öppnas: sätt fokusfälla
  document.addEventListener('modal:open', function(e){
    const modal = e.target.closest('#loginModal');
    if (modal) trapFocus(modal);
  });
  // När modalen stängs: ta bort fokusfällan
  document.addEventListener('modal:close', function(e){
    const modal = e.target.closest('#loginModal');
    if (modal) untrapFocus(modal);
  });
})();
