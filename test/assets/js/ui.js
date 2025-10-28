(function () {
  if (!window.ns) window.ns = {};

  // XSS-säkra helpers
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function setSafeHTML(el, html) {
    if (!el) return;
    el.innerHTML = escapeHTML(html ?? '');
  }
  window.ns.escapeHTML = escapeHTML;
  window.ns.setSafeHTML = setSafeHTML;

  // Modal-hjälpare
  function qs(id) { return document.getElementById(id); }
  function show(el) {
    if (!el) return;
    el.style.display = 'block';
    el.dispatchEvent(new CustomEvent('modal:open', { bubbles: true }));
  }
  function hide(el) {
    if (!el) return;
    el.style.display = 'none';
    el.dispatchEvent(new CustomEvent('modal:close', { bubbles: true }));
  }

  // Fokuserbara element i modal – för fokusfälla
  function getFocusable(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  }

  // Öppna/lukta README-modal
  (function initReadmeModal() {
    const readmeModal = qs('readmeModal');
    const closeBtn = document.getElementById('closeReadme') || readmeModal?.querySelector('.closeBtn');
    if (!readmeModal) return;
    if (closeBtn) {
      closeBtn.addEventListener('click', () => hide(readmeModal));
    }
    window.addEventListener('click', (e) => {
      if (e.target === readmeModal) hide(readmeModal);
    });
  })();

  // Fokusfälla + ESC-stängning generellt för modaler
  (function initFocusTrap() {
    function trapFocus(modal) {
      const focusable = getFocusable(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      function onKey(e) {
        if (e.key === 'Escape') {
          // Standard: dispatcha modal:close så varje modal kan hantera sin egen stängning
          modal.dispatchEvent(new CustomEvent('modal:close', { bubbles: true }));
          return;
        }
        if (e.key !== 'Tab') return;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }

      modal.__trapKeyHandler = onKey;
      modal.addEventListener('keydown', onKey);

      // Sätt initialt fokus
      (modal.querySelector('[autofocus]') || first).focus();
    }

    document.addEventListener('modal:open', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) trapFocus(modal);
    });

    document.addEventListener('modal:close', (e) => {
      const modal = e.target.closest('.modal');
      if (modal && modal.__trapKeyHandler) {
        modal.removeEventListener('keydown', modal.__trapKeyHandler);
        modal.__trapKeyHandler = null;
      }
      document.body.classList.remove('modal-open');
    });
  })();

  // Hamburgermeny/Dropdown – lägg till "Hantera spellistor"-punkt om behållare finns
  (function initMenuHook() {
    // Försök hitta en host: antingen #menuContainer eller fallback till body
    const menu = document.getElementById('menuContainer') || document.body;
    let dropdown = document.getElementById('menuDropdown');

    // Skapa dropdown om den saknas
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'menuDropdown';
      Object.assign(dropdown.style, {
        background: 'rgba(20,20,20,.96)',
        border: '1px solid rgba(255,255,255,.15)',
        borderRadius: '12px',
        position: 'absolute',
        right: '0',
        top: '60px',
        minWidth: '220px',
        padding: '.6rem',
        display: 'none',
        backdropFilter: 'blur(8px)'
      });
      menu && menu.appendChild(dropdown);
    }

    // Hämta/skap lista
    let list = dropdown.querySelector('.menu-items');
    if (!list) {
      list = document.createElement('div');
      list.className = 'menu-items';
      dropdown.appendChild(list);
    }

    // Lägg till rad: Hantera spellistor
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = 'Hantera spellistor';
    Object.assign(item.style, {
      width: '100%',
      textAlign: 'left',
      padding: '.55rem .7rem',
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer'
    });
    item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,.08)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', () => {
      dropdown.style.display = 'none';
      if (typeof window.openManagePlaylists === 'function') {
        window.openManagePlaylists();
      } else {
        // Fallback: visa modalen direkt; data.js/legacy kod fyller sen innehåll
        const modal = document.getElementById('managePlaylistsModal');
        if (modal) show(modal);
      }
    });

    list.appendChild(item);
  })();

  // Exportera några UI-hjälpare om legacy-kod vill använda dem
  window.ns.ui = { show, hide, getFocusable, setSafeHTML, escapeHTML };
})();
