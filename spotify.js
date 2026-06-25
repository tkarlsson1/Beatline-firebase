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
    console.log("Begär nytt token via Firebase backend...");
    const getSpotifyTokenFn = window.httpsCallable(window.firebaseFunctions, 'getSpotifyToken');
    const result = await getSpotifyTokenFn();
    const data = result.data;
    
    if (!data || !data.access_token) {
        throw new Error("Invalid response from token function");
    }
    
    const token = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const expiryTime = Date.now() + (expiresIn * 1000) - (60 * 1000);
    
    localStorage.setItem('spotifyToken', token);
    localStorage.setItem('spotifyTokenExpiry', expiryTime.toString());
    console.log("Hämtat nytt token via Firebase backend:", token);
    return token;
  } catch (error) {
    console.error("Fel vid hämtning av token via Firebase backend:", error);
    return null;
  }
}

async function fetchSpotifyPlaylist(playlistUrl) {
  console.log("fetchSpotifyPlaylist: Playlist URL mottagen:", playlistUrl);
  let playlistId = playlistUrl.trim();
  if (playlistId.includes("/playlist/")) {
      playlistId = playlistId.split("/playlist/")[1].split("?")[0];
  } else if (playlistId.includes("spotify:playlist:")) {
      playlistId = playlistId.split("spotify:playlist:")[1].split("?")[0];
  }
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
    const progressInfo = document.getElementById('importProgressInfo');
    const progressBar = document.getElementById('importProgressBar');
    const progressCount = document.getElementById('importProgressCount');
    const spinner = document.getElementById('importSpinner');

    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Importerar spellista...';
    }
    
    if (progressContainer) {
      progressContainer.style.display = 'block';
      if (progressInfo) progressInfo.textContent = '';
      if (progressBar) progressBar.style.width = '0%';
      if (progressCount) progressCount.textContent = '';
      progressText.textContent = 'Hämtar spellista från Spotify...';
    }
    
    const tracks = await fetchSpotifyPlaylist(playlistUrl);
    
    if (!tracks || Object.keys(tracks).length === 0) {
      alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Lägg till"; }
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }
    
    // --- VERIFIERING VID UPPLADDNING ---
    if (progressText) progressText.textContent = 'Kontrollerar kända låtar...';
    
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
    
    // Visa info-raden i 2 sekunder innan spinner startar
    if (tracksToAi.length > 0) {
      if (progressInfo) progressInfo.textContent = `${verifiedCount} av ${totalTracks} låtar finns redan i databasen. Kvalitetssäkrar de övriga ${tracksToAi.length}...`;
      if (progressText) progressText.textContent = '';
      await new Promise(r => setTimeout(r, 2000));
      if (progressText) progressText.textContent = 'Kvalitetssäkrar årtalen...';
      if (spinner) spinner.style.display = 'block';
    }

    if (addBtn) addBtn.textContent = 'Importerar spellista...';
    
    // Kör AI-frågor i batchar
    const BATCH_SIZE = 25;
    let processedAi = 0;
    
    if (window.firebaseFunctions && window.httpsCallable) {
      const getSongYearAi = window.httpsCallable(window.firebaseFunctions, 'getSongYearAi');
      
      for (let i = 0; i < tracksToAi.length; i += BATCH_SIZE) {
        const batch = tracksToAi.slice(i, i + BATCH_SIZE);

        // Skicka hela batchen till getSongYearsAiBatch med retry-logik
        const getSongYearsAiBatch = window.httpsCallable(window.firebaseFunctions, 'getSongYearsAiBatch', { timeout: 540000 });
        const batchPayload = batch.map(item => ({
          id: item.id,
          title: item.track.title,
          artist: item.track.artist
        }));

        let success = false;
        let retries = 0;
        const MAX_RETRIES = 3;
        let result = null;

        while (!success && retries < MAX_RETRIES) {
          try {
            result = await getSongYearsAiBatch({ songs: batchPayload });
            success = true;
          } catch (e) {
            retries++;
            const errMsg = e.message || String(e);
            console.warn(`[AI Retry] Batch misslyckades (försök ${retries}/${MAX_RETRIES}): ${errMsg}`);
            if (retries >= MAX_RETRIES) {
              console.error(`[AI] Batch misslyckades permanent efter ${MAX_RETRIES} försök. Felmeddelande: ${errMsg}`);
              aiErrors += batch.length;
            } else {
              await new Promise(r => setTimeout(r, 5000));
            }
          }
        }

        processedAi += batch.length;

        if (success && result && result.data && Array.isArray(result.data.results)) {
          if (progressText) progressText.textContent = 'Kvalitetssäkrar årtalen...';
          const aiResults = result.data.results;
          
          for (const aiItem of aiResults) {
            const originalItem = batch.find(b => b.id === aiItem.id);
            if (!originalItem) continue;
            
            if (aiItem.year && aiItem.year !== "UNKNOWN") {
              const aiYear = parseInt(aiItem.year, 10);
              const spotifyYear = parseInt(originalItem.track.year, 10);
              
              if (!isNaN(aiYear) && !isNaN(spotifyYear)) {
                const diff = Math.abs(spotifyYear - aiYear);
                if (diff <= 1) {
                  // SÄKERT: Auto-godkänn
                  originalItem.track.year = String(aiYear);
                  aiCount++;
                  
                  // Spara till Cache i bakgrunden
                  window.firebaseSet(window.firebaseRef(window.firebaseDb, `verifiedTracks/${originalItem.id}`), {
                    title: originalItem.track.title,
                    artist: originalItem.track.artist,
                    year: originalItem.track.year,
                    manuallyVerified: false
                  }).catch(e => console.warn("Kunde inte spara till cache", e));
                } else if (aiYear < spotifyYear) {
                  // OSÄKERT: Lägg till i granskningslistan
                  uncertainTracks.push({
                    id: originalItem.id,
                    title: originalItem.track.title,
                    artist: originalItem.track.artist,
                    spotifyYear: originalItem.track.year,
                    aiYear: String(aiYear)
                  });
                }
              }
            }
          }
        }
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
    const container = document.getElementById('importProgressContainer');
    const sp = document.getElementById('importSpinner');
    if (sp) sp.style.display = 'none';
    if (container) container.style.display = 'none';
    
    // 4. Hantera resultat
    if (aiErrors > 0) {
      alert(`"${playlistName}" har lagts till med ${totalTracks} låtar.\n\nNågra låtar kunde inte kvalitetssäkras och har importerats med Spotifys ursprungliga årtal.`);
    } else if (uncertainTracks.length > 0) {
      openReviewPlaylistModal(uncertainTracks, playlistName);
    } else {
      alert(`"${playlistName}" har lagts till med ${totalTracks} låtar.`);
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
        const expireTime = Date.now() + (12 * 60 * 60 * 1000); // 12 timmar
        const cooldownUpdates = {};
        cooldownIds.forEach(id => { cooldownUpdates[id] = expireTime; });
        
        await window.firebaseUpdate(window.firebaseRef(window.firebaseDb, `users/${userId}/cooldowns`), cooldownUpdates);
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
