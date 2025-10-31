
/**
 * ui.js — resilient hamburger menu injector (force version)
 * - Builds its own CSS so theme won't hide it
 * - Re-creates menu if something removes it
 * - Same items: Läs först, Startsida, Hantera spellistor, Logga ut
 * - Exposes window.nsMenuForce() and window.nsMenuDebug()
 */
(function(){
  if (!window.ns) window.ns = {};

  function ensureCss(){
    if (document.getElementById('ns-menu-css')) return;
    const s = document.createElement('style');
    s.id = 'ns-menu-css';
    s.textContent = `
      #menuContainer{position:fixed;top:10px;right:2vw;z-index:9999;width:auto}
      #menuButton{background:#0a6e73;color:#fff;border:0;border-radius:10px;padding:.35rem .6rem;font-size:1.4rem;line-height:1;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25)}
      #dropdownMenu{position:absolute;right:0;top:calc(100% + .5rem);min-width:220px;background:#032934;color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:.5rem;box-shadow:0 12px 30px rgba(0,0,0,.35);overflow:hidden}
      #dropdownMenu a{display:block;padding:.6rem .8rem;color:#fff;text-decoration:none;font-size:1rem}
      #dropdownMenu a:hover{background:#0b939c}
      @media (max-width:600px){#menuContainer{right:8px} #menuButton{font-size:1.35rem}}
    `;
    document.head.appendChild(s);
  }

  function buildMenu(){
    ensureCss();
    if (document.getElementById('menuContainer')) return true;

    const wrap = document.createElement('div');
    wrap.id = 'menuContainer';

    const btn = document.createElement('button');
    btn.id = 'menuButton';
    btn.setAttribute('aria-label','Meny');
    btn.setAttribute('aria-haspopup','true');
    btn.setAttribute('aria-expanded','false');
    btn.textContent = '☰';
    wrap.appendChild(btn);

    const dd = document.createElement('div');
    dd.id = 'dropdownMenu';
    dd.style.display = 'none';
    wrap.appendChild(dd);

    function addItem(label, handler){
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = label;
      a.addEventListener('click', (e)=>{
        e.preventDefault();
        try{ handler && handler(); }catch(err){ console.error('menu item error', err); }
        dd.style.display = 'none';
        btn.setAttribute('aria-expanded','false');
      });
      dd.appendChild(a);
      return a;
    }

    addItem('Läs först', ()=>{
      const m = document.getElementById('readmeModal');
      if (m) m.style.display = 'block';
      else console.warn('[menu] readmeModal saknas');
    });
    addItem('Startsida', ()=>{
      if (typeof window.goToFilter === 'function') window.goToFilter();
      else console.warn('[menu] goToFilter saknas');
    });
    addItem('Hantera spellistor', ()=>{
      if (typeof window.openManagePlaylists === 'function') window.openManagePlaylists();
      else console.warn('[menu] openManagePlaylists saknas');
    });
    addItem('Logga ut', async ()=>{
      try{
        // Try Firebase modular
        if (window.ns && window.ns.auth && typeof window.ns.auth.signOut === 'function'){
          await window.ns.auth.signOut();
        } else if (window.auth && typeof window.auth.signOut === 'function'){
          await window.auth.signOut();
        } else if (window.firebase?.auth){
          await window.firebase.auth().signOut();
        }
        const lm = document.getElementById('loginModal');
        if (lm) lm.style.display = 'flex';
      }catch(e){ console.error('signOut error', e); }
    });

    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const open = dd.style.display !== 'block';
      dd.style.display = open ? 'block' : 'none';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e)=>{
      if (!wrap.contains(e.target)){
        dd.style.display = 'none';
        btn.setAttribute('aria-expanded','false');
      }
    });
    document.body.appendChild(wrap);
    return true;
  }

  // Public hooks for debugging
  window.nsMenuForce = function(){ try{ buildMenu(); }catch(e){ console.error(e); } };
  window.nsMenuDebug = function(){
    return {
      container: !!document.getElementById('menuContainer'),
      button: !!document.getElementById('menuButton'),
      dropdown: !!document.getElementById('dropdownMenu'),
      authVariants: {
        nsAuth: !!(window.ns && window.ns.auth),
        auth: !!window.auth,
        firebaseAuth: !!(window.firebase && window.firebase.auth)
      }
    };
  };

  function init(){
    // Try to build immediately, then retry a few times in case other scripts touch the DOM late
    let attempts = 0;
    const t = setInterval(()=>{
      attempts++;
      if (buildMenu() || attempts > 10) clearInterval(t);
    }, 300);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
