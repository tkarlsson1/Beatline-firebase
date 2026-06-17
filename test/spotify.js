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
    if (addBtn) addBtn.disabled = true;
    
    console.log("Försöker hämta spellista:", playlistName);
    if (addBtn) addBtn.textContent = "Hämtar från Spotify...";
    
    const tracks = await fetchSpotifyPlaylist(playlistUrl);
    
    if (!tracks || Object.keys(tracks).length === 0) {
      alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = "Lägg till"; }
      return;
    }
    
    // --- VERIFIERING VID UPPLADDNING ---
    if (addBtn) addBtn.textContent = "Laddar cache...";
    
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
    let itunesCount = 0;
    let aiCount = 0;
    
    for (let i = 0; i < totalTracks; i++) {
      const trackId = trackKeys[i];
      const track = tracks[trackId];
      
      if (addBtn) addBtn.textContent = `Verifierar... ${i+1}/${totalTracks}`;
      
      // 1. Kolla cache (verifiedTracks)
      if (verifiedTracks[trackId] && verifiedTracks[trackId].year) {
        track.year = String(verifiedTracks[trackId].year);
        verifiedCount++;
        continue;
      }
      
      // 2. Kolla iTunes API
      let usedItunes = false;
      try {
        if (window.itunesApi) {
          const itunesData = await window.itunesApi.searchTrack(track.title, track.artist);
          if (itunesData && itunesData.releaseYear) {
            const itunesYear = parseInt(itunesData.releaseYear);
            const spotifyYear = parseInt(track.year);
            // Om iTunes har ett äldre årtal, lita på iTunes
            if (!isNaN(itunesYear) && !isNaN(spotifyYear) && itunesYear < spotifyYear) {
              track.year = String(itunesYear);
              itunesCount++;
              usedItunes = true;
            }
          }
          // Liten paus för att inte överbelasta iTunes API
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (e) {
        console.warn("iTunes API sökning misslyckades för", track.title);
      }
      
      // 3. Kolla AI via Backend (getSongYearAi) om varken Cache eller iTunes lyckades
      if (!usedItunes && !verifiedTracks[trackId]) {
        try {
          if (addBtn) addBtn.textContent = `Frågar AI... ${i+1}/${totalTracks}`;
          
          if (window.firebaseFunctions && window.httpsCallable) {
            const getSongYearAi = window.httpsCallable(window.firebaseFunctions, 'getSongYearAi');
            const result = await getSongYearAi({ title: track.title, artist: track.artist });
            
            if (result && result.data && result.data.year) {
              const aiYear = parseInt(result.data.year, 10);
              const spotifyYear = parseInt(track.year);
              if (!isNaN(aiYear) && !isNaN(spotifyYear) && aiYear < spotifyYear) {
                track.year = String(aiYear);
                aiCount++;
              }
            }
          } else {
            console.warn("Firebase Functions är inte initierat.");
          }
        } catch (e) {
          console.warn("Kunde inte anropa Backend AI för", track.title, e);
        }
      }
    }
    
    console.log(`Validering klar: ${verifiedCount} från cache, ${itunesCount} korrigerade via iTunes, ${aiCount} korrigerade via AI.`);
    if (addBtn) addBtn.textContent = "Sparar...";
    // -----------------------------------
    
    const userId = window.auth.currentUser.uid;
    const userPlaylistsRef = window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${playlistName}`);
    await window.firebaseSet(userPlaylistsRef, { songs: tracks });
    
    alert(`Spellistan "${playlistName}" har lagts till i dina spellistor! \n(Verifierades: ${verifiedCount} db, ${itunesCount} iTunes, ${aiCount} AI)`);
  } catch (error) {
    console.error("Fel vid lagring av spellista:", error);
    alert("Något gick fel vid lagring av spellistan.");
  } finally {
    const addBtn = document.getElementById("addPlaylistButton");
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = "Lägg till";
    }
  }
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
