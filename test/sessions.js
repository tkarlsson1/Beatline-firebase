// sessions.js – helper för sessionshantering (ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

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
const auth = getAuth ? getAuth(app) : null; // getAuth import may differ depending on usage

export async function createSession(code) {
  if (!auth || !auth.currentUser) throw new Error("Not authenticated");
  const uid = auth.currentUser.uid;
  const sessionRef = ref(db, `sessions/${code}`);
  // Använd update för att inte radera eventuella teams
  return update(sessionRef, {
    meta: {
      hostUid: uid,
      phase: "waiting",
      activeTeamId: null,
      createdAt: Date.now()
    }
  });
}

export async function joinSession(code, teamName) {
  if (!auth || !auth.currentUser) throw new Error("Not authenticated");
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
