// assets/js/main.js
import { initMenus } from './menus.js';
import { renderRoute } from './ui.js';
import { initSW } from './sw-init.js';
import { initAuth } from './auth.js';

export function initApp(){
  // Single DOMContentLoaded init
  initMenus();
  initAuth(); // wire up login modal etc (stub for now)
  initSW();

  // Simple hash-based router
  const route = () => {
    const hash = (location.hash || '#/home');
    const page = hash.replace('#/','');
    renderRoute(page);
  };
  window.addEventListener('hashchange', route);
  route();
}
