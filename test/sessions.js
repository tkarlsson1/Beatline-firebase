// /test sessions – minimal fungerande
import { ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const $ = (id) => document.getElementById(id);
const ns = window.ns; // { app, db }

// UI element
const roleHost = $("role-host");
const roleJoin = $("role-join");
const hostPanel = $("host-panel");
const joinPanel = $("join-panel");
const roomPanel = $("room-panel");
const codeDisplay = $("room-code-display");
const codeActive = $("room-code-active");

const btnNewRoom = $("btn-new-room");
const inputCustomCode = $("input-custom-code");
const inputJoinCode = $("input-join-code");
const btnJoinRoom = $("btn-join-room");

const actionPlace = $("action-place");
const actionChallengeWindow = $("action-challenge-window");
const actionChallengePlace = $("action-challenge-place");
const actionReveal = $("action-reveal");
const btnLockPlace = $("btn-lock-place");
const btnLockChallenge = $("btn-lock-challenge");
const actionHint = $("action-hint");

const timeline = $("timeline");
const slots = $("slots");
const pin = $("pin");
const centerBtn = $("btn-center-pin");
const phaseIndicator = $("phase-indicator");

// app state
let currentCode = null;
let role = null; // "host" | "join"
let phase = "idle"; // "place" | "challenge_window" | "challenge_place" | "reveal"
let locked = { place:false, challenge:false };

// helpers
function randCode(n = 4) {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<n;i++) s += a[Math.floor(Math.random()*a.length)];
  return s;
}

// layout helpers
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }
function setPhase(p){
  phase = p;
  phaseIndicator.textContent = `Fas: ${p.replace("_"," ")}`;
  update(ref(ns.db, `/test/sessions/${currentCode}`), { phase:p });
}
function setLocked(kind, v){
  locked[kind] = v;
  update(ref(ns.db, `/test/sessions/${currentCode}`), { [`locked_${kind}`]: !!v });
}

// RTDB binding for room
function bindRoom(code){
  const roomRef = ref(ns.db, `/test/sessions/${code}`);
  onValue(roomRef, (snap)=>{
    const data = snap.val() || {};
    // synka fas + lås
    if (data.phase && data.phase !== phase){
      phase = data.phase;
      phaseIndicator.textContent = `Fas: ${phase.replace("_"," ")}`;
    }
    if (typeof data.locked_place === "boolean") locked.place = data.locked_place;
    if (typeof data.locked_challenge === "boolean") locked.challenge = data.locked_challenge;

    // synka pin position (om finns)
    if (typeof data.pinIndex === "number"){
      movePinToIndex(data.pinIndex, false);
    }
  });
}

// DnD pin -> slot
let dragging = false;
let slotRects = [];
function cacheSlotRects(){
  slotRects = [...document.querySelectorAll(".slot")].map((el, idx) => {
    const r = el.getBoundingClientRect();
    return { el, idx, left:r.left, right:r.right, mid:(r.left+r.right)/2 };
  });
}
function nearestSlotIndex(x){
  let best = 0, bestd = Infinity;
  for (const s of slotRects){
    const d = Math.abs(x - s.mid);
    if (d < bestd){ bestd = d; best = s.idx; }
  }
  return best;
}
function movePinToIndex(idx, write=true){
  const target = slots.querySelector(`.slot[data-index="${idx}"]`);
  if (!target) return;
  const r = target.getBoundingClientRect();
  const cont = slots.getBoundingClientRect();
  const mid = (r.left + r.right)/2;
  const offset = mid - cont.left;
  pin.style.left = `${offset}px`;
  pin.style.transform = `translateX(-50%)`;
  // highlight
  document.querySelectorAll(".slot").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  if (write && currentCode){
    update(ref(ns.db, `/test/sessions/${currentCode}`), { pinIndex: idx });
  }
}

function beginDrag(){
  if (phase !== "place" || locked.place) return;
  dragging = true;
  timeline.classList.add("dragging");
  cacheSlotRects();
}
function onMove(e){
  if (!dragging) return;
  const x = (e.touches?.[0]?.clientX ?? e.clientX);
  const idx = nearestSlotIndex(x);
  movePinToIndex(idx);
}
function endDrag(){
  if (!dragging) return;
  dragging = false;
  timeline.classList.remove("dragging");
}

// wire events
roleHost.addEventListener("click", ()=>{
  role = "host";
  show(hostPanel); hide(joinPanel);
});
roleJoin.addEventListener("click", ()=>{
  role = "join";
  hide(hostPanel); show(joinPanel);
});

btnNewRoom.addEventListener("click", ()=>{
  const code = (inputCustomCode.value || randCode(4)).toUpperCase();
  currentCode = code;
  codeDisplay.textContent = code;
  codeActive.textContent = code;
  show(roomPanel);
  set(ref(ns.db, `/test/sessions/${code}`), {
    createdAt: Date.now(),
    phase: "idle",
    pinIndex: 5,
    locked_place:false,
    locked_challenge:false
  });
  bindRoom(code);
  movePinToIndex(5, false);
});

btnJoinRoom.addEventListener("click", ()=>{
  const code = (inputJoinCode.value || "").toUpperCase();
  if (!code) { alert("Ange rumskod"); return; }
  currentCode = code;
  codeActive.textContent = code;
  show(roomPanel);
  bindRoom(code);
});

actionPlace.addEventListener("click", ()=> setPhase("place"));
actionChallengeWindow.addEventListener("click", ()=> setPhase("challenge_window"));
actionChallengePlace.addEventListener("click", ()=> setPhase("challenge_place"));
actionReveal.addEventListener("click", ()=> setPhase("reveal"));
btnLockPlace.addEventListener("click", ()=> setLocked("place", !locked.place ));
btnLockChallenge.addEventListener("click", ()=> setLocked("challenge", !locked.challenge ));
actionHint.addEventListener("click", ()=> alert("Tips: dra markören till rätt plats."));

centerBtn.addEventListener("click", ()=> movePinToIndex(5));

slots.addEventListener("mousedown", beginDrag);
slots.addEventListener("touchstart", beginDrag, {passive:true});
window.addEventListener("mousemove", onMove);
window.addEventListener("touchmove", onMove, {passive:true});
window.addEventListener("mouseup", endDrag);
window.addEventListener("touchend", endDrag);

// init visual
movePinToIndex(5, false);
