
// /test/sessions.js (fixed)
console.log("TEST sessions bootstrap loaded (fixed)");

(function(){
  // Wait until /test/script.js has exposed window.db & window.auth
  function waitForFirebase(){
    return new Promise((resolve) => {
      const t = setInterval(()=>{
        if (window.db && window.auth) { clearInterval(t); resolve({db: window.db, auth: window.auth}); }
      }, 50);
    });
  }

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
  const activeTeam   = el("active-team");

  let sessionCode = null;
  let isHost = false;
  let myTeamId = null;
  let unsub = [];

  function randCode(n=4){
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s=""; for(let i=0;i<n;i++) s+=alphabet[Math.floor(Math.random()*alphabet.length)];
    return s;
  }
  function msToClock(ms){
    const s = Math.max(0, Math.floor(ms/1000));
    const m = Math.floor(s/60);
    const r = s%60;
    return `${m}:${r.toString().padStart(2,'0')}`;
  }
  function clearSubs(){ unsub.forEach(fn=>{ try{fn();}catch{} }); unsub.length=0; }

  roleHost?.addEventListener("click", ()=>{
    isHost = true; panelHost.style.display = ""; panelJoin.style.display = "none";
  });
  roleJoin?.addEventListener("click", ()=>{
    isHost = false; panelHost.style.display = "none"; panelJoin.style.display = "";
  });

  createBtn?.addEventListener("click", async ()=>{
    const { db, auth } = await waitForFirebase();
    const uid = auth.currentUser?.uid;
    if(!uid){ alert("Logga in först för att skapa rum."); return; }

    sessionCode = (el("input-custom-code").value || randCode()).toUpperCase();
    const cfg = {
      timers: {
        guessSeconds: parseInt(guessSeconds.value||"90",10),
        challengeWindow: parseInt(chWin.value||"10",10),
        challengePlace: parseInt(chPlace.value||"20",10),
      },
      targetTimelineSize: 11
    };

    const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
    await set(ref(db, `sessions/${sessionCode}`), {
      meta:{ hostUid: uid, createdAt: Date.now(), status: "waiting", phase: "lobby", activeTeamId: null, turnIndex: 0 },
      config: cfg, teams: {}, scoreboard: {}, timers: null, turn: null
    });

    // host joins as team
    const teamName = (hostTeamName?.value || "Lag 1").trim();
    await set(ref(db, `sessions/${sessionCode}/teams/host`), { name: teamName, tokens: 4, members: { [uid]: true } });

    myTeamId = "host";
    codeDisplay.textContent = sessionCode;
    panelRoom.style.display = "";
    attachSessionListeners(db);
  });

  joinBtn?.addEventListener("click", async ()=>{
    const { db, auth } = await waitForFirebase();
    const uid = auth.currentUser?.uid;
    if(!uid){ alert("Logga in först för att gå med i rum."); return; }

    sessionCode = inputCode.value.trim().toUpperCase();
    const teamName = (inputTeam.value || "Lag").trim();
    const { ref, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
    myTeamId = `t_${uid.slice(-6)}`;
    await set(ref(db, `sessions/${sessionCode}/teams/${myTeamId}`), { name: teamName, tokens: 4, members: { [uid]: true } });

    codeDisplay.textContent = sessionCode;
    panelRoom.style.display = "";
    attachSessionListeners(db);
  });

  startBtn?.addEventListener("click", async ()=>{
    const { db, auth } = await waitForFirebase();
    const uid = auth.currentUser?.uid;
    if(!uid){ alert("Logga in först."); return; }
    const duration = (parseInt(guessSeconds.value,10)||90) * 1000;

    const { ref, update, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
    // FIX: update child nodes directly (no dotted keys)
    await update(ref(db, `sessions/${sessionCode}/meta`), {
      phase: 'place',
      status: 'playing',
      activeTeamId: 'host'
    });
    // timers is its own child
    await set(ref(db, `sessions/${sessionCode}/timers`), {
      phase: 'place',
      startedAt: Date.now(),
      durationMs: duration
    });
  });

  async function attachSessionListeners(db){
    clearSubs();
    const { ref, onValue, off, set } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js");
    const mref = ref(db, `sessions/${sessionCode}/meta`);
    const tref = ref(db, `sessions/${sessionCode}/timers`);
    const teamref = ref(db, `sessions/${sessionCode}/teams`);
    const placementRef = ref(db, `sessions/${sessionCode}/turn/placement`);

    const un1 = onValue(mref, snap=>{
      const meta = snap.val(); if(!meta) return;
      activeTeam.textContent = meta.activeTeamId || "-"; timerPhase.textContent = meta.phase;
    });
    const un2 = onValue(tref, snap=>{
      const t = snap.val(); if(!t){ timerLeft.textContent = "—"; return; }
      function tick(){
        const left = (t.startedAt + t.durationMs) - Date.now();
        timerLeft.textContent = msToClock(left);
        if(left>0) requestAnimationFrame(tick); else timerLeft.textContent = "0:00";
      }
      tick();
    });
    const un3 = onValue(teamref, snap=>{ renderScoreboard(snap.val()||{}); });
    const un4 = onValue(placementRef, snap=>{
      document.querySelectorAll(".slot .pin").forEach(p=>p.remove());
      const p = snap.val(); if(!p) return;
      const idx = p.index|0;
      const el = document.querySelector(`.slot[data-idx="${idx}"]`); if(!el) return;
      const pin = document.createElement("div");
      pin.className = "pin solid"; pin.textContent = "PLACERING"; el.appendChild(pin);
    });

    unsub.push(()=>off(mref, 'value', un1));
    unsub.push(()=>off(tref, 'value', un2));
    unsub.push(()=>off(teamref, 'value', un3));
    unsub.push(()=>off(placementRef, 'value', un4));

    // Build timeline click slots (once)
    if (!timelineWrap.dataset.built){
      timelineWrap.dataset.built = "1";
      for(let i=0;i<11;i++){
        const slot = document.createElement("div");
        slot.className = "slot"; slot.dataset.idx = String(i);
        slot.addEventListener("click", async ()=>{
          await set(placementRef, { teamId: myTeamId||'team', index: i });
        });
        timelineWrap.appendChild(slot);
      }
    }
  }

  function renderScoreboard(teams){
    scoreboard.innerHTML = "";
    Object.entries(teams).forEach(([id,t])=>{
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<div class="hstack"><strong>${t.name||id}</strong><span class="right badge">tokens: ${t.tokens??0}</span></div>
      <div class="small">Medlemmar: ${t.members?Object.keys(t.members).length:0}</div>`;
      scoreboard.appendChild(div);
    });
  }
})();
