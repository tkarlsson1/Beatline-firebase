
if (!window.ns) window.ns = {};

// Extracted from legacy script.js into ui.js
// Helper to escape HTML to mitigate XSS when using innerHTML
  el.innerHTML = String(html).replace(/<script/gi,'&lt);script');
      const closeBtn = document.querySelector(".closeBtn");
    const focusable = modal.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (modal.querySelector('[autofocus]') || modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || modal).focus();
    container.innerHTML = '';
      container.innerHTML = '<p>Du har inga egna spellistor ännu.</p>';
      const item = document.createElement('div');
      const left = document.createElement('div');
      const title = document.createElement('strong');
      left.appendChild(title);
      const meta = document.createElement('span');
      left.appendChild(meta);
      const del = document.createElement('button');
            qs('managePlaylistsList').innerHTML = '<p>Du har inga egna spellistor ännu.</p>';
      item.appendChild(left);
      item.appendChild(del);
      container.appendChild(item);
      qs('managePlaylistsList').innerHTML = '';
    const menu = document.getElementById('menuContainer') || document.querySelector('#menuContainer');
    const dropdown = document.getElementById('menuDropdown') || document.querySelector('#menuDropdown');
    let list = host.querySelector('.menu-items');
      list = document.createElement('div');
        const dd = document.createElement('div');
        dd.appendChild(list);
        menu && menu.appendChild(dd);
        dropdown.appendChild(list);
    const item = document.createElement('button');
    list.appendChild(item);
    return container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (modal.querySelector('[autofocus]') || first).focus();
    document.body.classList.remove('modal-open');
