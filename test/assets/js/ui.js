
/**
 * ui.js — hamburger menu (ported from legacy inline index.html)
 * - Always positioned top-right (fixed)
 * - Same items: Läs först, Startsida, Hantera spellistor, Logga ut
 * - Works without any HTML changes; builds its own DOM
 */
(function(){
  if (!window.ns) window.ns = {};

  function buildMenu(){
    // Avoid duplicates
    if (document.getElementById('menuContainer')) return;

    const menuContainer = document.createElement('div');
    menuContainer.id = 'menuContainer';
    Object.assign(menuContainer.style, {
      position: 'fixed',
      top: '10px',
      right: '2vw',
      zIndex: '3000',
      width: '60px'
    });

    const btn = document.createElement('button');
    btn.id = 'menuButton';
    btn.setAttribute('aria-label','Meny');
    btn.setAttribute('aria-haspopup','true');
    btn.setAttribute('aria-expanded','false');
    btn.innerHTML = '&#9776;';
    Object.assign(btn.style, {
      background: 'none',
      border: 'none',
      color: '#fff',
      fontSize: '2rem',
      cursor: 'pointer',
      lineHeight: '1'
    });
    menuContainer.appendChild(btn);

    const dd = document.createElement('div');
    dd.id = 'dropdownMenu';
    Object.assign(dd.style, {
      display: 'none',
      position: 'absolute',
      right: '0',
      top: '2.5rem',
      background: '#032934',
      border: '1px solid #fff',
      borderRadius: '4px',
      minWidth: '200px'
    });

    function addLink(text, handler){
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = text;
      Object.assign(a.style, {
        display: 'block',
        padding: '.5rem 1rem',
        color: '#fff',
        textDecoration: 'none',
        fontSize: '1rem'
      });
      a.addEventListener('mouseenter', ()=>{ a.style.background = '#0b939c'; });
      a.addEventListener('mouseleave', ()=>{ a.style.background = 'transparent'; });
      a.addEventListener('click', (e)=>{ e.preventDefault(); handler(); dd.style.display = 'none'; btn.setAttribute('aria-expanded','false'); });
      dd.appendChild(a);
      return a;
    }

    // === Items (exactly as in legacy) ===
    addLink('Läs först', () => {
      const modal = document.getElementById('readmeModal');
      if (modal) modal.style.display = 'block';
    });

    addLink('Startsida', () => {
      if (typeof window.goToFilter === 'function') window.goToFilter();
    });

    addLink('Hantera spellistor', () => {
      if (typeof window.openManagePlaylists === 'function') window.openManagePlaylists();
    });

    addLink('Logga ut', () => {
      try {
        const a = window.auth;
        if (a && typeof a.signOut === 'function') {
          a.signOut().then(()=>{
            const lm = document.getElementById('loginModal');
            if (lm) lm.style.display = 'flex';
          });
        } else if (window.firebase && window.firebase.auth) {
          // fallback in case of different auth exposure
          window.firebase.auth().signOut();
        }
      } catch(e){ console.error(e); }
    });

    menuContainer.appendChild(dd);
    document.body.appendChild(menuContainer);

    // Toggle behavior
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const open = dd.style.display !== 'block';
      dd.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e)=>{
      if (!menuContainer.contains(e.target)){
        dd.style.display = 'none';
        btn.setAttribute('aria-expanded','false');
      }
    });

    // Responsive nudge for very small screens
    const mql = window.matchMedia('(max-width: 600px)');
    function adjust(){
      menuContainer.style.right = mql.matches ? '5px' : '2vw';
    }
    mql.addEventListener('change', adjust);
    adjust();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildMenu);
  } else {
    buildMenu();
  }
})();
