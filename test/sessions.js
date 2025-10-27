// /test/sessions.js — v3 (place + challenge_window + challenge_place + reveal placeholder)
// Nytt i v3: auto-timeouts + pointer-baserad drag/drop för placering & utmaning

console.log("TEST sessions bootstrap v3");

const el = (id) => document.getElementById(id);

// UI refs
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

// State
let sessionCode = null;
let myTeamId = null;
let unsub = [];
let canPlace = false;
let isSessionHost = false;
let currentPhase = "lobby";
let activeTeamId = null;
let turnChByTeamId = null;

// Drag state
let dragging = false;
let dragPointerId = null;
let slotRects = null; // array of {el, left, right, mid, idx}

// Helpers
function randCode(n=4){
  const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s=""; for (let i=0;i<n;i++) s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
function msToClock(ms){
  const s = Math.max(0, Math.floor(ms/1000)), m = Math.floor(s/60), r = s%60;
  return `${m}:${r.toString().padStart(2,"0")}`;
}
function clearSubs(){ unsub.forEach(fn=>{ try{fn();}catch{} }); unsub.length=0; }
function waitForFirebase(){
  return new Promise(res=>{
    const t = setInterval(()=>{ if (window.db && window.auth){ clearInterval(t); res({db:window.db, auth:window.auth}); } }, 30);
  });
}
function computeSlotRects(){
  const nodes = [...timelineWrap.querySelectorAll(".slot")];
  return nodes.map(n=>{
    const r = n.getBoundingClientRect();
    return { el:n, left:r.left, right:r.right, mid:(r.left+r.right)/2, idx:parseInt(n.dataset.idx,10) };
  });
}
function nearestIndexByX(x){
  if (!slotRects || slotRects.length===0) return 0;
  let best = slotRects[0], bestDist = Math.abs(x - slotRects[0].mid);
  for (let i=1;i<slotRects.length;i++){
    const d = Math.abs(x - slotRects[i].mid);
    if (d < bestDist){ best=slotRects[i]; bestDist=d; }
  }
  return best.idx;
}

// Role toggles
roleHost?.addEventListener("click", ()=>{ panelHost.style.display=""; panelJoin.style.display="none"; });
roleJoin?.addEventListener("click", ()=>{ panelHost.style.display="none"; panelJoin.style.display=""; });

// Create room (HOST)
createBtn?.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ alert("Logga in först."); return; }
  sessionCode = (el("input-custom-code").value || randCode()).toUpperCase();

  const cfg = {
    timers: {
      guessSeconds: parseInt(guessSeconds.value||"90",10),
      challengeWindow: parseInt(chWin.value||"10",10),
      challengePlace: parseInt(chPlace.value||"20",10)
    },
    targetTimelineSize: 11
  };

  const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  await set(ref(db, `sessions/${sessionCode}`), {
    meta:{ hostUid: uid, createdAt: Date.now(), status:"waiting", phase:"lobby", activeTeamId:null, turnIndex:0 },
    config: cfg, teams:{}, scoreboard:{}, timers:null, turn:null
  });

  const tName = (hostTeamName?.value || "Lag 1").trim();
  await set(ref(db, `sessions/${sessionCode}/teams/host`), { name:tName, tokens:4, members:{ [uid]:true } });
  myTeamId = "host";
  codeDisplay.textContent = sessionCode;
  panelRoom.style.display = "";
  attachSessionListeners();
});

// Join room (TEAM)
joinBtn?.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ alert("Logga in först."); return; }
  sessionCode = inputCode.value.trim().toUpperCase();
  const tName = (inputTeam.value || "Lag").trim();

  const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  myTeamId = `t_${uid.slice(-6)}`;
  await set(ref(db, `sessions/${sessionCode}/teams/${myTeamId}`), { name:tName, tokens:4, members:{ [uid]:true } });
  codeDisplay.textContent = sessionCode;
  panelRoom.style.display = "";
  attachSessionListeners();
});

// Start guess-phase (HOST)
startBtn?.addEventListener("click", async ()=>{
  const {db,auth} = await waitForFirebase();
  const uid = auth.currentUser?.uid;
  if(!uid){ return; }
  const { ref, update, set, get } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
  await update(ref(db, `sessions/${sessionCode}/meta`), { phase:"place", status:"playing", activeTeamId:"host" });
  const secsSnap = await get(ref(db, `sessions/${sessionCode}/config/timers/guessSeconds`));
  const secs = (secsSnap.exists()?secsSnap.val():90)|0;
  await set(ref(db, `sessions/${sessionCode}/timers`), { phase:"place", startedAt:Date.now(), durationMs:secs*1000 });
});

// Listeners
async function attachSessionListeners(){
  clearSubs();
  const {db,auth} = await waitForFirebase();
  const { ref, onValue, off, set, update, get } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");

  const mref = ref(db, `sessions/${sessionCode}/meta`);
  const tref = ref(db, `sessions/${sessionCode}/timers`);
  const teamref = ref(db, `sessions/${sessionCode}/teams`);
  const placementRef = ref(db, `sessions/${sessionCode}/turn/placement`);
  const challengeRef = ref(db, `sessions/${sessionCode}/turn/challenge`);

  const un1 = onValue(mref, snap=>{
    const meta = snap.val(); if(!meta) return;
    activeTeamLbl.textContent = meta.activeTeamId || "-";
    timerPhase.textContent = meta.phase;
    currentPhase = meta.phase;
    activeTeamId = meta.activeTeamId || null;
    const uid = auth.currentUser?.uid || null;
    isSessionHost = !!(uid && meta.hostUid === uid);
    canPlace = !!(uid && currentPhase==="place" && myTeamId && activeTeamId===myTeamId);

    // Buttons visibility
    btnLockGuess.style.display = (canPlace ? "" : "none");
    btnChallenge.style.display = (currentPhase==="challenge_window" && myTeamId && activeTeamId!==myTeamId ? "" : "none");
    btnLockCh.style.display = (currentPhase==="challenge_place" && myTeamId && turnChByTeamId===myTeamId ? "" : "none");
    actionHint.textContent = isSessionHost ? "Du är Host" : "";

    // Recompute slot rects when phase changes (layout might change)
    if (timelineWrap.dataset.built === "1") slotRects = computeSlotRects();
  });
  unsub.push(()=>off(mref,"value",un1));

  const un2 = onValue(tref, snap=>{
    const t = snap.val();
    if(!t){ timerLeft.textContent = "—"; return; }
    function tick(){
      const left = (t.startedAt + t.durationMs) - Date.now();
      timerLeft.textContent = msToClock(left);
      if (left <= 0) {
        // Auto-timeouts (host only)
        if (isSessionHost) handleAutoTimeout(t.phase);
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
  unsub.push(()=>off(tref,"value",un2));

  const un3 = onValue(teamref, snap=>{
    const teams = snap.val() || {};
    scoreboard.innerHTML = "";
    Object.entries(teams).forEach(([id,t])=>{
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<div class="hstack"><strong>${t.name||id}</strong><span class="right badge">tokens: ${t.tokens??0}</span></div>
      <div class="small">Medlemmar: ${t.members?Object.keys(t.members).length:0}</div>`;
      scoreboard.appendChild(div);
    });
  });
  unsub.push(()=>off(teamref,"value",un3));

  const un4 = onValue(placementRef, async snap=>{
    // Clear previous pins
    document.querySelectorAll(".slot .pin").forEach(p=>p.remove());

    // Solid pin (active team placement)
    const p = snap.val();
    const baseIdx = p && typeof p.index==="number" ? p.index|0 : null;
    if(baseIdx!==null){
      const el = document.querySelector(`.slot[data-idx="${baseIdx}"]`);
      if(el){ const pin = document.createElement("div"); pin.className="pin solid"; pin.textContent="PLACERING"; el.appendChild(pin); }
    }

    // Dashed pin (challenger)
    const chSnap = await get(ref(db, `sessions/${sessionCode}/turn/challenge/index`));
    if (chSnap.exists()){
      const chIdx = chSnap.val()|0;
      const el2 = document.querySelector(`.slot[data-idx="${chIdx}"]`);
      if(el2){ const pin2 = document.createElement("div"); pin2.className="pin dashed"; pin2.textContent="UTMANING"; el2.appendChild(pin2); }
    }
  });
  unsub.push(()=>off(placementRef,"value",un4));

  const un5 = onValue(challengeRef, snap=>{
    const ch = snap.val() || null;
    turnChByTeamId = ch && ch.byTeamId ? ch.byTeamId : null;
    if(currentPhase==="challenge_place"){
      btnLockCh.style.display = (myTeamId && turnChByTeamId===myTeamId) ? "" : "none";
    } else {
      btnLockCh.style.display = "none";
    }
  });
  unsub.push(()=>off(challengeRef,"value",un5));

  // Build timeline (once) + pointer-based DnD
  if (!timelineWrap.dataset.built){
    timelineWrap.dataset.built = "1";
    for(let i=0;i<11;i++){
      const slot = document.createElement("div");
      slot.className = "slot"; slot.dataset.idx = String(i);
      timelineWrap.appendChild(slot);
    }
    slotRects = computeSlotRects();

    // Pointer listeners on the whole timeline area
    timelineWrap.addEventListener("pointerdown", async (ev)=>{
      // Who is allowed to start drag?
      const isChallengerPhase = (currentPhase==="challenge_place" && myTeamId && myTeamId===turnChByTeamId);
      if (!canPlace && !isChallengerPhase) return;
      dragging = true; dragPointerId = ev.pointerId;
      timelineWrap.setPointerCapture(ev.pointerId);
      timelineWrap.classList.add("dragging");
      slotRects = computeSlotRects(); // refresh
      const idx = nearestIndexByX(ev.clientX);
      if (isChallengerPhase){
        const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
        await update(ref(window.db, `sessions/${sessionCode}/turn/challenge`), { index: idx });
      } else {
        const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
        await set(ref(window.db, `sessions/${sessionCode}/turn/placement`), { teamId: myTeamId||"team", index: idx });
      }
      highlightSlot(idx);
    });

    timelineWrap.addEventListener("pointermove", async (ev)=>{
      if (!dragging || ev.pointerId !== dragPointerId) return;
      const idx = nearestIndexByX(ev.clientX);
      highlightSlot(idx);
      const isChallengerPhase = (currentPhase==="challenge_place" && myTeamId && myTeamId===turnChByTeamId);
      if (isChallengerPhase){
        const { ref, update } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
        await update(ref(window.db, `sessions/${sessionCode}/turn/challenge`), { index: idx });
      } else if (canPlace){
        const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
        await set(ref(window.db, `sessions/${sessionCode}/turn/placement`), { teamId: myTeamId||"team", index: idx });
      }
    });

    timelineWrap.addEventListener("pointerup", (ev)=>{
      if (ev.pointerId !== dragPointerId) return;
      dragging = false; dragPointerId = null;
      timelineWrap.releasePointerCapture(ev.pointerId);
      timelineWrap.classList.remove("dragging");
      clearHighlight();
    });

    window.addEventListener("resize", ()=>{ if (timelineWrap.dataset.built==="1") slotRects = computeSlotRects(); });
  }

  // Buttons
  btnLockGuess?.addEventListener("click", async ()=>{
    if(currentPhase!=="place" || !canPlace) return;
    await update(placementRef, { locked:true });
    if(isSessionHost){
      const ws = await get(ref(db, `sessions/${sessionCode}/config/timers/challengeWindow`));
      const secs = (ws.exists()?ws.val():10)|0;
      await update(mref, { phase:"challenge_window" });
      await set(tref, { phase:"challenge_window", startedAt:Date.now(), durationMs:secs*1000 });
    }
  });

  btnChallenge?.addEventListener("click", async ()=>{
    if(currentPhase!=="challenge_window" || (myTeamId && myTeamId===activeTeamId)) return;
    await set(challengeRef, { opted:true, byTeamId: myTeamId, locked:false });
    if(isSessionHost){
      const cs = await get(ref(db, `sessions/${sessionCode}/config/timers/challengePlace`));
      const secs = (cs.exists()?cs.val():20)|0;
      await update(mref, { phase:"challenge_place" });
      await set(tref, { phase:"challenge_place", startedAt:Date.now(), durationMs:secs*1000 });
    }
  });

  btnLockCh?.addEventListener("click", async ()=>{
    if(currentPhase!=="challenge_place" || !myTeamId || myTeamId!==turnChByTeamId) return;
    await update(challengeRef, { locked:true });
    if(isSessionHost){
      await update(mref, { phase:"reveal" });
      await set(tref, { phase:"reveal", startedAt:Date.now(), durationMs:0 });
    }
  });

  // ---- Auto-timeouts (host only) ----
  async function handleAutoTimeout(phase){
    if (!isSessionHost) return;
    if (phase === "place"){
      // Auto-lock placement if inte låst, gå vidare till challenge_window
      const plcSnap = await get(placementRef);
      if (!plcSnap.exists()) return; // inget att göra
      if (!plcSnap.val().locked) await update(placementRef, { locked:true });
      const ws = await get(ref(db, `sessions/${sessionCode}/config/timers/challengeWindow`));
      const secs = (ws.exists()?ws.val():10)|0;
      await update(mref, { phase:"challenge_window" });
      await set(tref, { phase:"challenge_window", startedAt:Date.now(), durationMs:secs*1000 });
    } else if (phase === "challenge_window"){
      // Ingen utmaning? Reveal direkt
      const ch = await get(challengeRef);
      if (!ch.exists() || ch.val().opted !== true){
        await update(mref, { phase:"reveal" });
        await set(tref, { phase:"reveal", startedAt:Date.now(), durationMs:0 });
      }
    } else if (phase === "challenge_place"){
      // Challenger hann inte låsa → reveal ändå
      await update(mref, { phase:"reveal" });
      await set(tref, { phase:"reveal", startedAt:Date.now(), durationMs:0 });
    }
  }

  // ---- UI helpers ----
  function clearHighlight(){
    timelineWrap.querySelectorAll(".slot").forEach(s=>s.classList.remove("active"));
  }
  function highlightSlot(idx){
    clearHighlight();
    const node = timelineWrap.querySelector(`.slot[data-idx="${idx}"]`);
    if (node) node.classList.add("active");
  }
}
