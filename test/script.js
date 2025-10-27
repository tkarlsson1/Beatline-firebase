// NOTESTREAM /test bootstrap — v5 (endast Firebase init + export)

console.log("%cNOTESTREAM /test v0.533","font-weight:bold");
console.log("Using TEST RTDB: https://notestreamfire.europe-west1.firebasedatabase.app");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://beatlinefirebase-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app, "https://notestreamfire.europe-west1.firebasedatabase.app");
const auth = getAuth(app);

// Exponera till sessions.js
window.db = db;
window.auth = auth;

// Minimal logg
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Inloggad användare:", user.email);
  } else {
    console.log("Ingen användare inloggad ännu i /test.");
  }
});
