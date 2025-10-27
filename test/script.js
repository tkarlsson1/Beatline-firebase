// NOTESTREAM /test – boot
console.log("%cNOTESTREAM /test boot","font-weight:bold;color:#64b5ff");

// Firebase (modul v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// OBS: config tillhör ursprungsprojektet, men vi kopplar RTDB till notestreamfire
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
// Viktigt: pekar explicit på NOTESTREAMFIRE RTDB
const db = getDatabase(app, "https://notestreamfire.europe-west1.firebasedatabase.app");

// Exponera globalt för sessions.js
window.ns = { app, db };
