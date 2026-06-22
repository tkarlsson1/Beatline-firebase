// ============================================
// SPOTIFY INTEGRATION
// ============================================

async function getBackendSpotifyToken() {
  console.log("getBackendSpotifyToken: Kontrollerar om cachat token finns...");
  const cachedToken = localStorage.getItem('spotifyToken');
  const tokenExpiry = localStorage.getItem('spotifyTokenExpiry');
  if (cachedToken && tokenExpiry && Date.now() < Number(tokenExpiry)) {
    console.log("Använder cachad token från backend:", cachedToken);
    return cachedToken;
  }
  try {
    console.log("Begär nytt token via backend...");
    const response = await fetch('https://api-grl2mze3sa-uc.a.run.app/getSpotifyToken', {
      method: 'POST'
    });
    if (!response.ok) {
      throw new Error(`HTTP-fel: ${response.status}`);
    }
    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in;
    const expiryTime = Date.now() + (expiresIn * 1000) - (60 * 1000);
    localStorage.setItem('spotifyToken', token);
    localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());
    console.log("Hämtat nytt token via backend:", token);
    return token;
  } catch (error) {
    console.error("Fel vid hämtning av token via backend:", error);
    return null;
  }
}

async function fetchSpotifyPlaylist(playlistUrl) {
  console.log("fetchSpotifyPlaylist: Playlist URL mottagen:", playlistUrl);
  const playlistId = playlistUrl.split("/playlist/")[1].split("?")[0];
  console.log("fetchSpotifyPlaylist: Extraherat playlist-ID:", playlistId);
  const token = await getBackendSpotifyToken();
  let tracks = {};
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Spotify svarade med ett fel (Status: ${response.status}). Kontrollera att spellistan är offentlig (publik) och inte en personlig "Mix" skapad av Spotify.`);
    }
    
    const data = await response.json();
    data.items.forEach(item => {
      const trackId = item.track.id;
      tracks[trackId] = {
        title: item.track.name,
        artist: item.track.artists.map(artist => artist.name).join(", "),
        year: item.track.album.release_date ? item.track.album.release_date.substring(0, 4) : null
      };
    });
    nextUrl = data.next;
  }
  return tracks;
}

async function addPlaylistToFirebase(playlistName, playlistUrl) {
  try {
    const addBtn = document.getElementById("addPlaylistButton");
    const progressContainer = document.getElementById('importProgressContainer');
    const progressText = document.getElementById('importProgressText');
    const progressCount = document.getElementById('importProgressCount');
    const progressBar = document.getElementById('importProgressBar');

    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Laddar låtar...';
    }
    
    if (progressContainer) {
      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.textContent = 'Hämtar från Spotify...';
      progressCount.textContent = '';
    }
    
    const tracks = await fetchSpotifyPlaylist(playlistUrl);
    
    if (!tracks || Object.keys(tracks).length === 0) {
      alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Lägg till"; }
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }
    
    // --- VERIFIERING VID UPPLADDNING ---
    if (progressText) progressText.textContent = 'Laddar cache...';
    
    // Hämta verifiedTracks från Firebase
    let verifiedTracks = {};
    try {
      const verifiedRef = window.firebaseRef(window.firebaseDb, 'verifiedTracks');
      const snapshot = await new Promise((resolve, reject) => {
        window.firebaseOnValue(verifiedRef, snap => resolve(snap), err => reject(err), { onlyOnce: true });
      });
      if (snapshot.exists()) {
        verifiedTracks = snapshot.val();
      }
    } catch (e) {
      console.warn("Kunde inte hämta verifiedTracks:", e);
    }
    
    const trackKeys = Object.keys(tracks);
    const totalTracks = trackKeys.length;
    let verifiedCount = 0;
    let aiCount = 0;
    let aiErrors = 0;
    
    // Array to hold uncertain tracks for manual review
    const uncertainTracks = [];
    
    // Separera spår som behöver AI från de som finns i cachen
    const tracksToAi = [];
    
    for (let i = 0; i < totalTracks; i++) {
      const trackId = trackKeys[i];
      const track = tracks[trackId];
      
      if (verifiedTracks[trackId] && verifiedTracks[trackId].year) {
        track.year = String(verifiedTracks[trackId].year);
        verifiedCount++;
      } else {
        tracksToAi.push({ id: trackId, track: track, index: i });
      }
    }
    
    if (progressText && tracksToAi.length > 0) {
      progressText.textContent = 'Kör AI-validering...';
      progressCount.textContent = `0 / ${tracksToAi.length}`;
    }
    
    if (addBtn) addBtn.textContent = `AI granskar ${tracksToAi.length} låtar...`;
    
    // Kör AI-frågor i parallella batchar (t.ex. 25 åt gången) för att spara enormt med tid
    const BATCH_SIZE = 25;
    let processedAi = 0;
    
    if (window.firebaseFunctions && window.httpsCallable) {
      const getSongYearAi = window.httpsCallable(window.firebaseFunctions, 'getSongYearAi');
      
      for (let i = 0; i < tracksToAi.length; i += BATCH_SIZE) {
        const batch = tracksToAi.slice(i, i + BATCH_SIZE);
        
        // Uppdatera UI och Progress Bar
        processedAi += batch.length;
        if (progressCount) {
          progressCount.textContent = `${processedAi} / ${tracksToAi.length}`;
        }
        if (progressBar) {
          const percent = Math.round((processedAi / tracksToAi.length) * 100);
          progressBar.style.width = `${percent}%`;
        }
        
        // Starta alla anrop i batchen parallellt
        const batchPromises = batch.map(async (item) => {
          try {
            const result = await getSongYearAi({ title: item.track.title, artist: item.track.artist });
            if (result && result.data && result.data.year && result.data.year !== "UNKNOWN") {
              const aiYear = parseInt(result.data.year, 10);
              const spotifyYear = parseInt(item.track.year, 10);
              
              if (!isNaN(aiYear) && !isNaN(spotifyYear)) {
                const diff = Math.abs(spotifyYear - aiYear);
                if (diff <= 1) {
                  // SÄKERT: Auto-godkänn
                  item.track.year = String(aiYear);
                  aiCount++;
                  
                  // Spara till Cache i bakgrunden
                  window.firebaseSet(window.firebaseRef(window.firebaseDb, `verifiedTracks/${item.id}`), {
                    title: item.track.title,
                    artist: item.track.artist,
                    year: item.track.year,
                    manuallyVerified: false
                  }).catch(e => console.warn("Kunde inte spara till cache", e));
                } else if (aiYear < spotifyYear) {
                  // OSÄKERT: Lägg till i granskningslistan
                  uncertainTracks.push({
                    id: item.id,
                    title: item.track.title,
                    artist: item.track.artist,
                    spotifyYear: item.track.year,
                    aiYear: String(aiYear)
                  });
                }
              }
            }
          } catch (e) {
            console.warn("Kunde inte anropa Backend AI för", item.track.title, e);
            aiErrors++;
          }
        });
        
        // Vänta tills hela batchen är klar innan vi går vidare till nästa
        await Promise.all(batchPromises);
      }
    } else {
      console.warn("Firebase Functions är inte initierat.");
    }
    
    console.log(`Validering klar: ${verifiedCount} från cache, ${aiCount} säkra från AI, ${uncertainTracks.length} osäkra.`);
    
    if (progressText) {
      progressText.textContent = 'Sparar...';
      if (progressCount) progressCount.textContent = '';
      if (progressBar) progressBar.style.width = '100%';
    }
    
    // 3. Spara spellistan till användarens konto
    const userId = window.auth.currentUser.uid;
    const userPlaylistsRef = window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${playlistName}`);
    await window.firebaseSet(userPlaylistsRef, { songs: tracks });
    
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = "Lägg till";
    }
    if (progressContainer) progressContainer.style.display = 'none';
    
    // 4. Hantera resultat
    if (aiErrors > 0) {
      alert(`⚠️ Ett fel uppstod med AI-valideringen (t.ex. OpenAI-krediter slut) för ${aiErrors} låtar.\n\nDessa låtar sparades i din spellista med Spotifys original-årtal, men lades INTE till i den globala verifierade databasen.`);
    } else if (uncertainTracks.length > 0) {
      openReviewPlaylistModal(uncertainTracks, playlistName);
    } else {
      alert(`Spellistan "${playlistName}" har lagts till! \nAlla låtar verifierades snyggt och prydligt.`);
    }
    
    // Rensa fälten
    document.getElementById('playlistLinkInput').value = '';
    document.getElementById('playlistNameInput').value = '';
    
  } catch (error) {
    console.error("Fel vid lagring av spellista:", error);
    alert("Något gick fel vid lagring av spellistan.");
    const addBtn = document.getElementById("addPlaylistButton");
    const progressContainer = document.getElementById("importProgressContainer");
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = "Lägg till";
    }
    if (progressContainer) {
      progressContainer.style.display = "none";
    }
  }
}

// ============================================
// REVIEW PLAYLIST MODAL LOGIC
// ============================================
function openReviewPlaylistModal(uncertainTracks, playlistName) {
  const modal = document.getElementById("reviewPlaylistModal");
  const listContainer = document.getElementById("reviewPlaylistList");
  
  if (!modal || !listContainer) return;
  
  listContainer.innerHTML = "";
  
  uncertainTracks.forEach((t, i) => {
    const row = document.createElement("div");
    row.style.padding = "10px";
    row.style.borderBottom = i < uncertainTracks.length - 1 ? "1px solid rgba(255,255,255,0.1)" : "none";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
    
    const info = document.createElement("div");
    info.style.flex = "1";
    info.style.minWidth = "200px";
    info.innerHTML = `
      <strong style="font-size: 1.1rem; display: block;">${t.title}</strong>
      <span style="font-size: 0.9rem; color: #aaa;">${t.artist}</span>
    `;
    
    const years = document.createElement("div");
    years.style.display = "flex";
    years.style.alignItems = "center";
    years.style.gap = "15px";
    years.innerHTML = `
      <div style="text-align: center;">
        <span style="font-size: 0.75rem; color: #aaa; display: block;">Spotify</span>
        <span style="text-decoration: line-through; color: #ef4444; font-weight: bold;">${t.spotifyYear}</span>
      </div>
      <div style="font-size: 1.2rem;">➡️</div>
      <div style="text-align: center;">
        <span style="font-size: 0.75rem; color: #10b981; display: block;">AI Föreslog</span>
        <span style="color: #10b981; font-weight: bold;">${t.aiYear}</span>
      </div>
      <div style="font-size: 1.2rem;">➡️</div>
      <div style="text-align: center;">
        <span style="font-size: 0.75rem; color: #fff; display: block;">Ditt val</span>
        <input type="text" class="review-year-input" data-id="${t.id}" data-title="${t.title.replace(/"/g, '&quot;')}" data-artist="${t.artist.replace(/"/g, '&quot;')}" value="${t.aiYear}" style="width: 60px; text-align: center; padding: 5px; border-radius: 4px; border: 1px solid #fff; background: #222; color: #fff; font-weight: bold;">
      </div>
      <a href="https://www.google.com/search?q=${encodeURIComponent(t.artist + ' ' + t.title + ' release year')}" target="_blank" style="text-decoration: none; font-size: 1.2rem; margin-left: 10px; opacity: 0.8; hover: opacity: 1;" title="Sök på Google">🔍</a>
    `;
    
    row.appendChild(info);
    row.appendChild(years);
    listContainer.appendChild(row);
  });
  
  // Bind spara-knappen
  const saveBtn = document.getElementById("saveReviewPlaylistBtn");
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  
  // Hantera kryssrutan för dynamisk text
  const checkbox = document.getElementById("disableCooldownCheckbox");
  checkbox.checked = false; // Återställ alltid till av
  newSaveBtn.textContent = "Spara Årtal & Aktivera Spärr";
  
  checkbox.onchange = (e) => {
    if (e.target.checked) {
      newSaveBtn.textContent = "Spara Årtal";
    } else {
      newSaveBtn.textContent = "Spara Årtal & Aktivera Spärr";
    }
  };
  
  newSaveBtn.addEventListener("click", async () => {
    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Sparar...";
    
    const disableCooldown = checkbox.checked;
    const inputs = document.querySelectorAll(".review-year-input");
    const userId = window.auth.currentUser.uid;
    
    // Förbered sparning till Cache och Spellista
    const cacheUpdates = {};
    const playlistUpdates = {};
    const cooldownIds = [];
    
    inputs.forEach(input => {
      const trackId = input.getAttribute("data-id");
      const title = input.getAttribute("data-title");
      const artist = input.getAttribute("data-artist");
      const chosenYear = input.value.trim();
      
      // Spara till Cache
      cacheUpdates[trackId] = {
        title: title,
        artist: artist,
        year: chosenYear,
        manuallyVerified: true
      };
      
      // Spara till användarens nyligen importerade spellista
      playlistUpdates[`${trackId}/year`] = chosenYear;
      
      if (!disableCooldown) {
        cooldownIds.push(trackId);
      }
    });
    
    try {
      // 1. Spara till Cache
      for (const [tId, tData] of Object.entries(cacheUpdates)) {
        await window.firebaseSet(window.firebaseRef(window.firebaseDb, `verifiedTracks/${tId}`), tData);
      }
      
      // 2. Uppdatera spelarens spellista med de nya årtalen
      const userListRef = window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${playlistName}/songs`);
      for (const [tId, newYear] of Object.entries(playlistUpdates)) {
        await window.firebaseSet(window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${playlistName}/songs/${tId}/year`), newYear);
      }
      
      // 3. Lägg till Spoiler Cooldown
      if (cooldownIds.length > 0) {
        let existingCooldowns = {};
        try {
          const stored = localStorage.getItem('spoilerCooldowns');
          if (stored) existingCooldowns = JSON.parse(stored);
        } catch (e) {}
        
        const expireTime = Date.now() + (12 * 60 * 60 * 1000); // 12 timmar
        cooldownIds.forEach(id => { existingCooldowns[id] = expireTime; });
        
        localStorage.setItem('spoilerCooldowns', JSON.stringify(existingCooldowns));
      }
      
      modal.style.display = "none";
      alert("Tack! Årtalen är sparade." + (!disableCooldown ? "\n\nDessa låtar kommer nu döljas från spelet i 12 timmar för att du inte ska kunna fuska! 😉" : ""));
      
    } catch (e) {
      console.error("Fel vid sparande av review:", e);
      alert("Något gick fel när vi sparade. Försök igen.");
      newSaveBtn.disabled = false;
      newSaveBtn.textContent = "Spara Årtal & Aktivera Spärr";
    }
  });
  
  // Bind close-knapp
  document.getElementById("closeReviewPlaylist").onclick = () => {
    modal.style.display = "none";
  };
  
  modal.style.display = "block";
}

// Initialize Spotify handlers
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addPlaylistButton").addEventListener("click", async () => {
    const playlistName = document.getElementById("playlistNameInput").value.trim();
    const playlistLink = document.getElementById("playlistLinkInput").value.trim();
    
    if (!playlistName || !playlistLink) {
      alert("Fyll i både spellistans namn och länk!");
      return;
    }
    
    await addPlaylistToFirebase(playlistName, playlistLink);
  });
});
