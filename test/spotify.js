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
    console.log("Försöker hämta spellista:", playlistName);
    const tracks = await fetchSpotifyPlaylist(playlistUrl);
    
    if (!tracks || Object.keys(tracks).length === 0) {
      alert("Ingen data hämtades från spellistan. Kontrollera att länken är korrekt!");
      return;
    }
    
    const userId = window.auth.currentUser.uid;
    const userPlaylistsRef = window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${playlistName}`);
    await window.firebaseSet(userPlaylistsRef, { songs: tracks });
    
    alert(`Spellistan "${playlistName}" har lagts till i dina spellistor!`);
  } catch (error) {
    console.error("Fel vid lagring av spellista:", error);
    alert("Något gick fel vid lagring av spellistan.");
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
