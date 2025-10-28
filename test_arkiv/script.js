// NOTESTREAM – boot
console.log("%cNOTESTREAM boot", "font-weight:bold;color:#64b5ff");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "notestreamfire.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "notestreamfire",
  storageBucket: "notestreamfire.appspot.com",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

signInAnonymously(auth).catch((error) => { console.error("Anonym inloggning misslyckades:", error); });

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Inloggad som:", user.uid);
    window.auth = auth;
    window.db = db;
    window.ns = { app, db, auth };
  } else {
    console.warn("Ej inloggad.");
  }
});
