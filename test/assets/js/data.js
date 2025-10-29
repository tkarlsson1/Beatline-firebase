/**
 * data.js — cleaned
 * - renderPlaylists(listMap) renders into #managePlaylistsList
 * - Safe for various data shapes: array, {songs:{}}, {count:n}
 */
(function(){
  if (!window.ns) window.ns = {};

  function renderPlaylists(listMap){
    const container = document.getElementById('managePlaylistsList');
    const info = document.getElementById('managePlaylistsInfo');
    if (!container){ return; }

    container.innerHTML = '';
    const map = listMap || {};
    const keys = Object.keys(map);

    if (!keys.length){
      if (info) info.textContent = 'Du har inga egna spellistor ännu.';
      return;
    }
    if (info) info.textContent = '';

    keys.forEach((name) => {
      const val = map[name];
      let songCount = 0;

      if (Array.isArray(val)) songCount = val.length;
      else if (val && typeof val === 'object') {
        if (val.songs && typeof val.songs === 'object') songCount = Object.keys(val.songs).length;
        else if (Number.isFinite(val.count)) songCount = val.count;
      }

      const item = document.createElement('div');
      item.className = 'playlist-row';
      Object.assign(item.style, {
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '.6rem .4rem',
        borderBottom: '1px solid rgba(255,255,255,.1)',
        textAlign: 'left'
      });

      const left = document.createElement('div');
      Object.assign(left.style, { display: 'flex', alignItems: 'flex-start', flexDirection: 'column', textAlign: 'left' });

      const title = document.createElement('strong');
      title.textContent = name;

      const meta = document.createElement('span');
      meta.textContent = songCount + ' låtar';
      meta.style.opacity = '.8';
      meta.style.fontSize = '.9rem';

      left.appendChild(title);
      left.appendChild(meta);

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Ta bort';
      del.className = 'btn-delete-playlist';
      Object.assign(del.style, {
        padding: '.4rem .7rem',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,.2)',
        background: 'transparent',
        color: '#fff',
        cursor: 'pointer'
      });

      del.addEventListener('click', async () => {
        if (!confirm('Ta bort spellistan "' + name + '"? Detta går inte att ångra.')) return;
        try {
          item.remove();
          if (!container.children.length && info) info.textContent = 'Inga spellistor kvar.';
          if (typeof window.ns?.deleteUserPlaylist === 'function') {
            await window.ns.deleteUserPlaylist(name);
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

  window.ns.renderPlaylists = renderPlaylists;
})();
