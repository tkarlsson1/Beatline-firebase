// assets/js/spotify.js
// Placeholder for future Spotify integration (Web Playback or external-device via QR)
export async function playOnExternalDevice(spotifyUri){
  // In MVP we rely on scanning a QR with spotify:track:... on a speaker-connected device.
  location.href = spotifyUri;
}
