// ============================================
// MANAGE PLAYLISTS MODAL LOGIC
// ============================================

(function(){
  function qs(id){ return document.getElementById(id); }
  function show(el){ el.style.display = 'block'; el.dispatchEvent(new CustomEvent('modal:open', {bubbles:true})); }
  function hide(el){ el.style.display = 'none'; el.dispatchEvent(new CustomEvent('modal:close', {bubbles:true})); }
  
  async function fetchUserPlaylists(){
    if (!window.auth || !window.auth.currentUser) return null;
    return new Promise((resolve, reject) => {
      const userId = window.auth.currentUser.uid;
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
          const userId = window.auth.currentUser.uid;
          const refToList = window.firebaseRef(window.firebaseDb, 'userPlaylists/' + userId + '/' + name);
          await window.firebaseSet(refToList, null);
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
  
  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'closeManagePlaylists')){
      hide(qs('managePlaylistsModal'));
    }
    if (e.target && e.target.id === 'managePlaylistsModal'){
      hide(qs('managePlaylistsModal'));
    }
  });
})();
