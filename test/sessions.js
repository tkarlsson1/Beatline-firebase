// /test/sessions.js — v2 (earlier state, before DnD/auto-timeouts)
console.log("TEST sessions bootstrap loaded");

const el = (id) => document.getElementById(id);

const roleHost     = el("role-host");
const roleJoin     = el("role-join");
const panelHost    = el("host-panel");
const panelJoin    = el("join-panel");
const panelRoom    = el("room-panel");
const codeDisplay  = el("room-code-display");

const createBtn    = el("btn-create-room");
const startBtn     = el("btn-start-game");
const joinBtn      = el("btn-join-room");
const inputTeam    = el("input-team-name");
const inputCode    = el("input-room-code");
const hostTeamName = el("input-host-team");

const guessSeconds = el("guess-seconds");
const chWin        = el("challenge-window");
const chPlace      = el("challenge-place");

const timerPhase   = el("timer-phase");
const timerLeft    = el("timer-left");
const scoreboard   = el("scoreboard");
const timelineWrap = el("timeline");
const activeTeamLbl= el("active-team");

const btnLockGuess = el("btn-lock-guess");
const btnChallenge = el("btn-challenge");
const btnLockCh    = el("btn-lock-challenge");
const actionHint   = el("action-hint");

let sessionCode = null;
let myTeamId = null;
let isSessionHost = false;
let currentPhase = "lobby";
let activeTeamId = null;

function msToClock(ms){
  const s = Math.max(0, Math.floor(ms/1000)), m = Math.floor(s/60), r = s%60;
  return `${m}:${r.toString().padStart(2,"0")}`;
}
function waitForFirebase(){
  return new Promise(res=>{
    const t = setInterval(()=>{
      if (window.db && window.auth){ clearInterval(t); res({db:window.db, auth:window.auth}); }
    }, 30);
  });
}

// Role toggles
roleHost && roleHost.addEventListener("click", ()=>{ panelHost.style.display=""; panelJoin.style.display="none"; });
roleJoin && roleJoin.addEventListener("click", ()=>{ panelHost.style.display="none"; panelJoin.style.display=""; });

// Create room (HOST)
createBtn && createBtn.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ alert("Logga in först."); return; }
  sessionCode = (document.getElementById("input-custom-code").value || "TEST").toUpperCase();

  const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  await set(ref(db, `sessions/${sessionCode}`), {
    meta:{ hostUid: uid, createdAt: Date.now(), status:"waiting", phase:"lobby", activeTeamId:null, turnIndex:0 },
    config:{ timers:{ guessSeconds: Number(guessSeconds?.value||90), challengeWindow: Number(chWin?.value||10), challengePlace: Number(chPlace?.value||20) }, targetTimelineSize: 11 },
    teams:{}, scoreboard:{}, timers:null, turn:null
  });

  const tName = (hostTeamName?.value || "Lag 1").trim();
  await set(ref(db, `sessions/${sessionCode}/teams/host`), { name:tName, tokens:4, members:{ [uid]:true } });
  myTeamId = "host";
  codeDisplay && (codeDisplay.textContent = sessionCode);
  panelRoom && (panelRoom.style.display = "");
});

// Join room (TEAM)
joinBtn && joinBtn.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ alert("Logga in först."); return; }
  sessionCode = inputCode.value.trim().toUpperCase();
  const tName = (inputTeam.value || "Lag").trim();

  const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  myTeamId = `t_${uid.slice(-6)}`;
  await set(ref(db, `sessions/${sessionCode}/teams/${myTeamId}`), { name:tName, tokens:4, members:{ [uid]:true } });
  codeDisplay && (codeDisplay.textContent = sessionCode);
  panelRoom && (panelRoom.style.display = "");
});

// Start guess-phase (HOST)
startBtn && startBtn.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ return; }
  const { ref, update, set, get } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  await update(ref(db, `sessions/${sessionCode}/meta`), { phase:"place", status:"playing", activeTeamId:"host" });
  const secsSnap = await get(ref(db, `sessions/${sessionCode}/config/timers/guessSeconds`));
  const secs = (secsSnap.exists()?secsSnap.val():90)|0;
  await set(ref(db, `sessions/${sessionCode}/timers`), { phase:"place", startedAt:Date.now(), durationMs:secs*1000 });
});

// Minimal listeners placeholder (to mirror earlier console behavior)
(async function minimalListeners(){
  const {db,auth} = await waitForFirebase();
  // In the earlier state these were either missing or incomplete.
  // Keeping it minimal to match the behavior you saw.
})();
