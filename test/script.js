// NOTESTREAM /test – boot
console.log("%cNOTESTREAM /test boot", "font-weight:bold;color:#64b5ff");

// Firebase (modul v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

// Konfiguration för NOTESTREAMFIRE-projektet
const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "notestreamfire.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "notestreamfire",
  storageBucket: "notestreamfire.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// Initiera Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Logga in anonymt (för testläge)
signInAnonymously(auth).catch((error) => {
  console.error("Anonym inloggning misslyckades:", error);
});

// Lyssna på auth-status
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
