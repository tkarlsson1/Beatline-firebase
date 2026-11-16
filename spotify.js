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
  let input = playlistUrl.trim();

  // Bug #9: Detektera fel URL-typ innan API-anrop
  if (input.includes("/album/") || input.includes("spotify:album:")) {
    throw new Error("Det där är en albumlänk, inte en spellista.\n\nGå till en Spotify-spellista, kopiera dess länk och försök igen.");
  }
  if (input.includes("/track/") || input.includes("spotify:track:")) {
    throw new Error("Det där är en låtlänk, inte en spellista.\n\nGå till en Spotify-spellista, kopiera dess länk och försök igen.");
  }

  let playlistId = input;
  if (playlistId.includes("/playlist/")) {
      playlistId = playlistId.split("/playlist/")[1].split("?")[0];
  } else if (playlistId.includes("spotify:playlist:")) {
      playlistId = playlistId.split("spotify:playlist:")[1].split("?")[0];
  }

  // Spotify-genererade listor (Discover Weekly, Daily Mix, Release Radar etc.)
  // har alltid ID som börjar med 37i9dQ
  if (playlistId.startsWith("37i9dQ")) {
    throw new Error("Det här är en personlig spellista genererad av Spotify (t.ex. Discover Weekly, Daily Mix eller Release Radar).\n\nSådana listor är privata och kan inte importeras. Skapa en egen spellista i Spotify, lägg till låtarna och importera den istället.");
  }

  console.log("fetchSpotifyPlaylist: Extraherat playlist-ID:", playlistId);
  const token = await getBackendSpotifyToken();
  let tracks = {};
  let unavailable = 0;
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        throw new Error("Spellistan är privat eller finns inte.\n\nSe till att spellistan är publik i Spotify: öppna spellistan → klicka de tre prickarna (···) → Dela → markera 'Offentlig'.");
      }
      throw new Error(`Spotify svarade med ett oväntat fel (Status: ${response.status}). Kontrollera att länken är korrekt och försök igen.`);
    }
    
    const data = await response.json();
    data.items.forEach(item => {
      // Bug #6: Skip null tracks (local files, deleted songs)
      if (!item.track || !item.track.id) return;
      // A song Spotify has withdrawn comes back as an empty shell: no name, no artist and the
      // date "0000". It cannot be played or reviewed, so it is left out and counted.
      if (typeof item.track.name !== "string" || item.track.name.trim() === "") {
        unavailable++;
        return;
      }
      const trackId = item.track.id;
      tracks[trackId] = {
        title: item.track.name,
        artist: item.track.artists.map(artist => artist.name).join(", "),
        year: item.track.album.release_date ? item.track.album.release_date.substring(0, 4) : null
      };
    });
    nextUrl = data.next;
  }
  return { tracks, unavailable };
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
    
    const { tracks, unavailable } = await fetchSpotifyPlaylist(playlistUrl);
    
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

    // Songs in the cache get the cache's year. The rest are sent to the server for review.
    const idsToReview = [];
    for (const trackId of trackKeys) {
      const track = tracks[trackId];
      if (verifiedTracks[trackId] && verifiedTracks[trackId].year) {
        track.year = String(verifiedTracks[trackId].year);
        verifiedCount++;
      } else {
        idsToReview.push(trackId);
      }
    }

    // Visa info-raden i 2 sekunder innan spinner startar
    if (idsToReview.length > 0) {
      if (progressInfo) progressInfo.textContent = `${verifiedCount} av ${totalTracks} låtar finns redan i databasen. Kvalitetssäkrar de övriga ${idsToReview.length}...`;
      if (progressText) progressText.textContent = '';
      await new Promise(r => setTimeout(r, 2000));
      if (progressText) progressText.textContent = 'Kvalitetssäkrar årtalen...';
      if (spinner) spinner.style.display = 'block';
    }

    if (addBtn) addBtn.textContent = 'Importerar spellista...';

    // The server reviews the songs: Spotify's year is checked, with a web search when it is
    // needed. A song the server cannot review now keeps Spotify's year.
    const reviewResults = await reviewImportedTracks(idsToReview, (handled, total) => {
      if (progressText) progressText.textContent = `Kvalitetssäkrar årtalen... ${handled} / ${total}`;
    });
    const reviewCounts = applyImportReview(tracks, idsToReview, reviewResults);
    console.log(`Validering klar: ${verifiedCount} från cache.`, reviewCounts);

    if (progressText) {
      progressText.textContent = 'Sparar...';
      if (progressCount) progressCount.textContent = '';
      if (progressBar) progressBar.style.width = '100%';
    }

    // Bug #7: Sanitera förbjudna Firebase-tecken i spellistenamnet
    const safePlaylistName = playlistName.replace(/[.#$\[\]/]/g, '_');
    if (safePlaylistName !== playlistName) {
      console.warn(`Spellistenamn sanererat: "${playlistName}" → "${safePlaylistName}"`);
    }
    const userId = window.auth.currentUser.uid;
    const userPlaylistsRef = window.firebaseRef(window.firebaseDb, `userPlaylists/${userId}/${safePlaylistName}`);
    await window.firebaseSet(userPlaylistsRef, { songs: tracks });
    
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = "Lägg till";
    }
    const container = document.getElementById('importProgressContainer');
    const sp = document.getElementById('importSpinner');
    if (sp) sp.style.display = 'none';
    if (container) container.style.display = 'none';
    
    alert(importResultMessage(playlistName, totalTracks, reviewCounts, unavailable));

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
// YEAR REVIEW OF IMPORTED SONGS
// ============================================
const IMPORT_REVIEW_BATCH_SIZE = 10;      // the server accepts at most 10 songs per call
const IMPORT_REVIEW_PARALLEL_CALLS = 2;

/**
 * Sends songs to the server function reviewImportedTracks, ten per call and two calls at a
 * time. The server finds the year, stores the review and writes the cache itself.
 *
 * onProgress: called with (handled, total) at the start and after every call
 * Returns { trackId: { id, status, year? } }. A song whose call failed twice has no entry.
 */
async function reviewImportedTracks(trackIds, onProgress) {
  const results = {};
  if (trackIds.length === 0) return results;
  if (!window.firebaseFunctions || !window.httpsCallable) {
    console.warn("Firebase Functions är inte initierat.");
    return results;
  }

  // A call with web searches can take a few minutes, so the default limit of 70 s is raised
  const callReview = window.httpsCallable(window.firebaseFunctions, 'reviewImportedTracks', { timeout: 540000 });
  const batches = [];
  for (let i = 0; i < trackIds.length; i += IMPORT_REVIEW_BATCH_SIZE) {
    batches.push(trackIds.slice(i, i + IMPORT_REVIEW_BATCH_SIZE));
  }

  let handled = 0;
  let nextBatch = 0;
  // A call that fails is tried once more. What the first try managed to review is stored on
  // the server, so the second try does not pay for it again.
  const runBatch = async (ids) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await callReview({ trackIds: ids });
        const list = response && response.data && Array.isArray(response.data.results) ? response.data.results : null;
        if (!list) throw new Error("The answer has no results.");
        list.forEach(result => {
          if (result && typeof result.id === 'string') results[result.id] = result;
        });
        return;
      } catch (error) {
        console.warn(`[Import] Granskningen misslyckades (försök ${attempt}/2):`, error);
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };
  const worker = async () => {
    while (nextBatch < batches.length) {
      const ids = batches[nextBatch++];
      await runBatch(ids);
      handled += ids.length;
      onProgress(handled, trackIds.length);
    }
  };
  onProgress(0, trackIds.length);
  await Promise.all(Array.from({ length: Math.min(IMPORT_REVIEW_PARALLEL_CALLS, batches.length) }, worker));
  return results;
}

/**
 * Puts the reviewed years into the songs and counts what happened. A song without a reviewed
 * year keeps the year it has, which is Spotify's.
 *
 * tracks:      { trackId: { title, artist, year } }, changed in place
 * reviewedIds: the ids that were sent for review
 * results:     the answer from reviewImportedTracks
 * Returns { reviewed, overLimit, failed, unsettled }.
 */
function applyImportReview(tracks, reviewedIds, results) {
  const counts = { reviewed: 0, overLimit: 0, failed: 0, unsettled: 0 };
  for (const trackId of reviewedIds) {
    const result = results[trackId];
    const status = result ? result.status : null;
    if ((status === 'reviewed' || status === 'cached') && Number.isInteger(result.year)) {
      tracks[trackId].year = String(result.year);
      counts.reviewed++;
    } else if (status === 'overLimit') {
      counts.overLimit++;
    } else if (status === 'needsReview' || status === 'notFound' || status === 'noSpotifyYear') {
      // The review could not settle the year. The admin settles it; until then Spotify's year stands.
      counts.unsettled++;
    } else {
      counts.failed++;
    }
  }
  return counts;
}

// The message shown when an import is done. unavailable is how many songs in the playlist
// Spotify has withdrawn; they were left out.
function importResultMessage(playlistName, totalTracks, counts, unavailable = 0) {
  let message = `"${playlistName}" har lagts till med ${totalTracks} låtar.`;
  if (counts.overLimit > 0) {
    message += `\n\n${counts.overLimit} låtar granskades inte eftersom dagens gräns för nya låtar är nådd. De har Spotifys årtal. Importera listan igen i morgon så granskas de.`;
  }
  if (counts.failed > 0) {
    message += `\n\n${counts.failed} låtar kunde inte kvalitetssäkras just nu och har Spotifys årtal. Importera listan igen för att försöka på nytt.`;
  }
  if (unavailable > 0) {
    message += `\n\n${unavailable} låtar i spellistan finns inte längre hos Spotify och togs inte med.`;
  }
  return message;
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
