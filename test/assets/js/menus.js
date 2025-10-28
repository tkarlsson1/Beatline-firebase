// assets/js/menus.js
export function initMenus(){
  const side = document.getElementById('sideMenu');
  const openBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('closeMenuBtn');
  const open = ()=>{ side.classList.add('open'); side.setAttribute('aria-hidden','false'); };
  const close = ()=>{ side.classList.remove('open'); side.setAttribute('aria-hidden','true'); };
  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  side?.addEventListener('click', e=>{ if(e.target === side) close(); });
  side?.querySelectorAll('[data-route]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ location.hash = '#/' + btn.dataset.route; close(); });
  });
}
