import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "DIN_API_KEY",
  authDomain: "notestreamfire.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "notestreamfire",
  storageBucket: "notestreamfire.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export function createSession(code) {
  const uid = auth.currentUser.uid;
  const sessionRef = ref(db, `sessions/${code}`);
  return set(sessionRef, {
    meta: {
      hostUid: uid,
      phase: "waiting",
      activeTeamId: null,
      createdAt: Date.now()
    },
    teams: {}
  });
}

export function joinSession(code, teamName) {
  const uid = auth.currentUser.uid;
  const teamId = `team-${uid}`;
  const teamRef = ref(db, `sessions/${code}/teams/${teamId}`);
  return set(teamRef, {
    name: teamName,
    tokens: 4,
    years: [],
    members: {
      [uid]: true
    }
  });
}

export function listenToTeams(code, callback) {
  const teamsRef = ref(db, `sessions/${code}/teams`);
  onValue(teamsRef, (snapshot) => {
    const data = snapshot.val() || {};
    callback(data);
  });
}

export function updatePhase(code, phase, activeTeamId = null) {
  const metaRef = ref(db, `sessions/${code}/meta`);
  return update(metaRef, {
    phase,
    activeTeamId
  });
}

export function addYearToTeam(code, teamId, year) {
  const teamYearsRef = ref(db, `sessions/${code}/teams/${teamId}/years`);
  return push(teamYearsRef, year);
}
