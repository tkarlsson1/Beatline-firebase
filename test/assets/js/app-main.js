import { ensureAuthed } from './firebase.js';
import './firebase.js';
import './app-legacy.js';
import './auth.js';
import './spotify.js';
import './data.js';
import './ui.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

// Kick anonymous auth early
ensureAuthed().catch(()=>{});

import './game.js';
