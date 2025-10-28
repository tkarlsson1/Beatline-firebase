// assets/js/ui.js
import { safeHTML } from './util.js';

const view = () => document.getElementById('view');

export function renderRoute(page){
  switch(page){
    case 'home': return renderHome();
    case 'lobby': return renderLobby();
    case 'play': return renderPlay();
    default: return renderHome();
  }
}

function renderHome(){
  view().innerHTML = `
    <section class="grid grid--2">
      <div class="card">
        <h2>Välkommen</h2>
        <p>Välj spellistor och årtalsspann, skapa en lobby och låt lag gå med via QR.</p>
        <div class="grid">
          <label>År från
            <input id="yearMin" type="number" class="input" value="1970" min="1900" max="2025">
          </label>
          <label>År till
            <input id="yearMax" type="number" class="input" value="2025" min="1900" max="2025">
          </label>
          <label>Rundtid (sek)
            <input id="roundSeconds" type="number" class="input" value="90" min="30" max="240">
          </label>
        </div>
        <div style="margin-top: .75rem">
          <button id="createGame" class="btn btn--accent">Skapa spel</button>
        </div>
      </div>
      <div class="card">
        <h3>Hur det funkar</h3>
        <ol>
          <li>Host skapar spel med filter och spellistor.</li>
          <li>Visa QR – andra lag scannar och går med.</li>
          <li>Tur-baserat: aktivt lag placerar låt på sin tidslinje.</li>
          <li>Utmanare kan spendera tokens för att “steala”.</li>
        </ol>
      </div>
    </section>
    <footer>© ${new Date().getFullYear()} Notestream</footer>
  `;

  document.getElementById('createGame').addEventListener('click', ()=>{
    location.hash = '#/lobby';
  });
}

function renderLobby(){
  view().innerHTML = `
    <section class="card">
      <h2>Lobby</h2>
      <p>Visa QR-koden för att låta lag ansluta.</p>
      <div id="qr" class="card" style="display:grid;place-items:center;aspect-ratio:1;margin:.5rem 0;">Laddar QR…</div>
      <div class="teambar" id="teams"></div>
      <div style="display:flex; gap:.5rem; margin-top:.5rem">
        <button id="startGame" class="btn btn--accent">Starta spel</button>
        <button id="backHome" class="btn">Tillbaka</button>
      </div>
    </section>
  `;
  import('./qr.js').then(({ generateQR })=>{
    generateQR(document.getElementById('qr'), location.origin + '/#/play');
  });
  document.getElementById('backHome').addEventListener('click', ()=> location.hash = '#/home');
  document.getElementById('startGame').addEventListener('click', ()=> location.hash = '#/play');
}

function renderPlay(){
  view().innerHTML = `
    <section class="card">
      <div class="teambar">
        <span class="teamchip teamchip--active"><strong>Lag A</strong> <span class="badge">3 kort</span> <span class="badge">2 tokens</span></span>
        <span class="teamchip"><strong>Lag B</strong> <span class="badge">1 kort</span> <span class="badge">3 tokens</span></span>
      </div>
      <h2>Aktivt lags tidslinje</h2>
      <div class="timeline">
        <div class="timeline__years" id="timelineYears"></div>
      </div>
      <div style="display:flex; gap:.5rem; margin-top:.75rem">
        <button class="btn">Placera</button>
        <button class="btn">Utmana</button>
        <button class="btn">Reveal</button>
      </div>
    </section>
  `;

  // Demo: generera placeholders
  const yearsEl = document.getElementById('timelineYears');
  [1968, 1977, 1985].forEach(y=>{
    const el = document.createElement('span');
    el.className = 'timeline__card';
    el.textContent = ''+y;
    yearsEl.appendChild(el);
  });
}
