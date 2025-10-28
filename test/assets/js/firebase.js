/* Firebase module (ESM) — Realtime Database + Anonymous Auth
   Uses official ESM CDN imports so no bundler is required. */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase, ref, get, set, update, remove, push, child } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

/** ---- Config (provided by you) ---- */
const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://beatlinefirebase-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

/** ---- Init ---- */
let app;
if (!getApps().length) app = initializeApp(firebaseConfig);
else app = getApps()[0];

const auth = getAuth(app);
const db = getDatabase(app);

/** ---- State exposed via window.ns for legacy code ---- */
if (!window.ns) window.ns = {};
window.ns.currentUser = null;
window.ns.requireLogin = false; // flip to true if du vill kräva inlogg för vissa features

onAuthStateChanged(auth, (user) => {
  window.ns.currentUser = user || null;
});

/** Anonymous sign-in to ensure we have a uid for writes */
export async function ensureAuthed(){
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    console.error('Anonymous auth failed:', e);
    throw e;
  }
}

/** ---- Feedback ---- */
export async function saveFeedback(text){
  await ensureAuthed();
  const uid = auth.currentUser?.uid || null;
  const entryRef = push(ref(db, 'feedback'));
  const payload = { uid, ts: Date.now(), text: String(text || '') };
  await set(entryRef, payload);
  return { id: entryRef.key, ...payload };
}
window.ns.saveFeedback = saveFeedback;

/** ---- Playlists (per-user) ----
 * Struktur (förslag):
 * /users/{uid}/playlists/{name} : { count: number, ... } eller { tracks: {id: true, ...} }
 */
export async function fetchUserPlaylists(){
  await ensureAuthed();
  const uid = auth.currentUser?.uid;
  if (!uid) return {};
  const snap = await get(ref(db, `users/${uid}/playlists`));
  return snap.exists() ? snap.val() : {};
}
window.ns.fetchUserPlaylists = fetchUserPlaylists;

export async function deleteUserPlaylist(name){
  await ensureAuthed();
  const uid = auth.currentUser?.uid;
  const key = String(name || '').trim();
  if (!uid || !key) return;
  await remove(ref(db, `users/${uid}/playlists/${key}`));
}
window.ns.deleteUserPlaylist = deleteUserPlaylist;

/** ---- Custom Year Override ----
 * Lagrar ett frivilligt år för en låt (per spotifyId), med källinfo
 */
export async function updateCustomYear(playlistName, spotifyId, newYear){
  await ensureAuthed();
  const uid = auth.currentUser?.uid;
  const id = String(spotifyId || '').trim();
  const y = parseInt(newYear, 10);
  if (!id || !(y >= 0)) return;
  const payload = { year: y, playlistName: String(playlistName || ''), by: uid || null, ts: Date.now() };
  await set(ref(db, `customYears/${id}`), payload);
  return payload;
}
window.ns.updateCustomYear = updateCustomYear;

/** ---- Helpers to expose Firebase pieces if needed ---- */
export { auth, db, ref, get, set, update, remove, push, child };
