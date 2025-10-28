(function(){
  // Namespace guard
  if (!window.ns) window.ns = {};

  // Ensure known fields exist (avoid ReferenceError)
  if (typeof window.ns.currentPlaylistName === 'undefined') window.ns.currentPlaylistName = null;
  if (typeof window.ns.currentSpotifyID === 'undefined') window.ns.currentSpotifyID = null;

  /**
   * Set the current track context so other parts of the app can read it.
   * @param {Object} p
   * @param {string} p.playlistName
   * @param {string} p.spotifyId - e.g. '3n3Ppam7vgaVa1iaRUc9Lp' OR 'spotify:track:...'
   */
  function setCurrentTrack(p = {}){
    window.ns.currentPlaylistName = p.playlistName || null;
    // Normalize ID: allow either pure ID or full URI
    const idOrUri = p.spotifyId || null;
    window.ns.currentSpotifyID = idOrUri
      ? (idOrUri.startsWith('spotify:track:') ? idOrUri.slice('spotify:track:'.length) : idOrUri)
      : null;
  }

  /**
   * Build a spotify:track: URI from an ID
   */
  function toSpotifyUri(id){
    if (!id) return null;
    return id.startsWith('spotify:track:') ? id : ('spotify:track:' + id);
  }

  /**
   * Trigger playback on an external device by navigating to the spotify: URI.
   * If no argument is given, uses window.ns.currentSpotifyID.
   */
  function playOnExternalDevice(spotifyIdOrUri){
    const id = (spotifyIdOrUri && spotifyIdOrUri.startsWith('spotify:track:'))
      ? spotifyIdOrUri.slice('spotify:track:'.length)
      : (spotifyIdOrUri || window.ns.currentSpotifyID);

    const uri = toSpotifyUri(id);
    if (!uri){
      console.warn('Spotify: no track ID/URI available to play.');
      return false;
    }
    // Using location.href keeps the current tab; adjust to window.open if you prefer a new intent.
    location.href = uri;
    return true;
  }

  function getCurrentTrack(){
    return {
      playlistName: window.ns.currentPlaylistName,
      spotifyId: window.ns.currentSpotifyID
    };
  }

  // Expose public API
  window.ns.setCurrentTrack = setCurrentTrack;
  window.ns.playOnExternalDevice = playOnExternalDevice;
  window.ns.getCurrentTrack = getCurrentTrack;
})();
