// ============================================
// INITIALIZATION - Accessibility, Viewport, Service Worker
// ============================================

// ========== ACCESSIBILITY: MODAL FOCUS TRAP & ESC ==========
(function(){
  let __scrollY = 0;
  function getFocusable(container){
    return container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  }
  function lockBody(){
    __scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${__scrollY}px`;
  }
  function unlockBody(){
    document.body.classList.remove('modal-open');
    const y = __scrollY || 0;
    document.body.style.top = '';
    window.scrollTo(0, y);
  }
  document.addEventListener('modal:open', function(e){
    const modal = e.target.closest('.modal');
    if (!modal) return;
    lockBody();
    const nodes = getFocusable(modal);
    if (nodes.length){
      const first = nodes[0];
      const last = nodes[nodes.length-1];
      function onKey(ev){
        if (ev.key === 'Escape'){ 
          modal.style.display = 'none';
          unlockBody();
          modal.dispatchEvent(new CustomEvent('modal:close', {bubbles:true}));
        } else if (ev.key === 'Tab'){
          if (ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
          else if (!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
        }
      }
      modal.__trapKeyHandler = onKey;
      modal.addEventListener('keydown', onKey);
      (modal.querySelector('[autofocus]') || first).focus();
    }
  });
  document.addEventListener('modal:close', function(e){
    const modal = e.target.closest('.modal');
    if (!modal) return;
    if (modal.__trapKeyHandler){
      modal.removeEventListener('keydown', modal.__trapKeyHandler);
      modal.__trapKeyHandler = null;
    }
    unlockBody();
  });
})();

// ========== VIEWPORT HEIGHT FIX FOR MOBILE ==========
(function(){
  function setVH(){ 
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px'); 
  }
  setVH(); 
  window.addEventListener('resize', setVH);
})();

// ========== SERVICE WORKER REGISTRATION ==========
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(registration => {
      console.log("Service Worker registrerad med scope:", registration.scope);
    })
    .catch(error => {
      console.error("Service Worker misslyckades:", error);
    });
}
