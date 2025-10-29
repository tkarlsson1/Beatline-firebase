/**
 * ui.js — cleaned
 * - Safe XSS helpers
 * - Modal helpers (show/hide), focus trap
 * - Menu hook adds "Hantera spellistor" item safely
 */
(function(){
  if (!window.ns) window.ns = {};

  // XSS-safe helpers
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
  window.ns.escapeHTML = escapeHTML;
  window.ns.setSafeHTML = setSafeHTML;

  function qs(id){ return document.getElementById(id); }
  function show(el){
    if (!el) return;
    el.style.display = 'block';
    el.dispatchEvent(new CustomEvent('modal:open', {bubbles:true}));
  }
  function hide(el){
    if (!el) return;
    el.style.display = 'none';
    el.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
  }

  function getFocusable(container){
    if (!container) return [];
    return Array.from(container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  }

  // README modal close wiring (guarded)
  (function initReadmeModal(){
    const readmeModal = qs('readmeModal');
    const closeBtn = document.getElementById('closeReadme') || readmeModal?.querySelector('.closeBtn');
    if (!readmeModal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => hide(readmeModal));
    window.addEventListener('click', (e)=>{ if (e.target === readmeModal) hide(readmeModal); });
  })();

  // Focus trap + ESC close for modals
  (function initFocusTrap(){
    document.addEventListener('modal:open', (e)=>{
      const modal = e.target.closest('.modal');
      if (!modal) return;
      const focusable = getFocusable(modal);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      function onKey(ev){
        if (ev.key === 'Escape'){
          modal.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
          return;
        }
        if (ev.key !== 'Tab') return;
        if (ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
      }
      modal.__trapKeyHandler = onKey;
      modal.addEventListener('keydown', onKey);
      (modal.querySelector('[autofocus]') || first).focus();
    });
    document.addEventListener('modal:close', (e)=>{
      const modal = e.target.closest('.modal');
      if (modal && modal.__trapKeyHandler){
        modal.removeEventListener('keydown', modal.__trapKeyHandler);
        modal.__trapKeyHandler = null;
      }
      document.body.classList.remove('modal-open');
    });
  })();

  // Add "Hantera spellistor" to menu/dropdown if containers exist
  (function initMenuHook(){
    const menu = document.getElementById('menuContainer') || document.body;
    let dropdown = document.getElementById('menuDropdown');

    if (!dropdown){
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

    let list = dropdown.querySelector('.menu-items');
    if (!list){
      list = document.createElement('div');
      list.className = 'menu-items';
      dropdown.appendChild(list);
    }

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
    item.addEventListener('mouseenter', ()=>{ item.style.background = 'rgba(255,255,255,.08)'; });
    item.addEventListener('mouseleave', ()=>{ item.style.background = 'transparent'; });
    item.addEventListener('click', ()=>{
      dropdown.style.display = 'none';
      if (typeof window.openManagePlaylists === 'function') window.openManagePlaylists();
      else {
        const modal = document.getElementById('managePlaylistsModal');
        if (modal) show(modal);
      }
    });

    list.appendChild(item);
  })();

  // Export some UI helpers for legacy code if needed
  window.ns.ui = { show, hide, getFocusable, setSafeHTML, escapeHTML };
})();
