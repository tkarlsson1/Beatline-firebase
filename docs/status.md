# Notestream – Projektstatus

## Versioner just nu
| Fil | Version |
|---|---|
| index.html (spelet) | 0.839 |
| admin.html | 0.068 |
| spotify.js | 0.807 |
| game-cards.js (game.html) | 0.835 |
| game-render.js (game.html) | 0.837 |
| game-init.js (game.html) | 0.836 |
| game.css | v49 |
| service-worker | v43 |
| Firebase Functions Node runtime | 22 (1st Gen) |
| AI-modell | gpt-5.5 |
| functions/prompts.js | Delad prompt, v1 |

---

## Ändringslogg

| Datum | Ändring | Version |
|---|---|---|
| 2026-06-25 | Ny 8-regelsprompt – artist-ankare, anti-debut-bias, titeltillägg, batch-isolering | – |
| 2026-06-25 | Import UX – spinner + 2s infofas, inga hopp i räknare | – |
| 2026-06-25 | Review-modal – renare texter, knapp alltid "Spara årtal" | – |
| 2026-06-25 | Admin-import – 540s client-timeout + retry-logik (3 försök) | – |
| 2026-06-25 | Git/säkerhet – .gitignore för node_modules, .claude/, xcf-filer, temp-filer | – |
| 2026-06-26 | Admin-dashboard – delade upp stat-kort i "Låtar i standardlistor" + "I årtalsverifieringscachen" | 0.830 |
| 2026-06-26 | Race condition – spinner istället för felmeddelande när status ännu ej 'playing' | 0.829 |
| 2026-06-26 | Vinnarskärm – tog bort "Tack för att ni spelade Notestream!" | 0.830 |
| 2026-06-26 | Vinnarskärm – "Starta om" (fortsätter från currentSongIndex+1, inga upprepade låtar) | 0.831 |
| 2026-06-26 | Vinnarskärm – "Återgå till startsida" för host + "Lämna spelet" för gäster | 0.831 |
| 2026-06-26 | Bugg #6 – null-track guard: Spotify-listor med lokala/borttagna låtar kraschar inte | 0.832 |
| 2026-06-26 | Bugg #7 – Firebase-tecken (.#$[]) i spellistenamn saneras automatiskt till _ | 0.832 |
| 2026-06-26 | Bugg #9 – separata felmeddelanden: albumlänk, låtlänk, Spotify-genererad lista, privat lista | 0.833 |
| 2026-06-26 | Android vit navigation bar – manifest background_color + color-scheme: dark + html background | 0.834 |
| 2026-06-26 | getSongYearAi – lade till runWith 120s timeout (fixar CORS/503 vid cold start) | Functions |
| 2026-06-26 | Extraherade delad prompt till functions/prompts.js – regel 6 (samlingsalbum-spärr) tillagd | Functions |
| 2026-06-26 | getSongYearAi – uppgraderad till JSON-format + delade prompt (samma standard som batch) | Functions |
| 2026-06-26 | prompts.js – separata SINGLE/BATCH-prompts: batch-isolering och format-instruktioner rätt placerade | Functions |
| 2026-06-26 | Admin – "Skanna alla med AI"-knapp + godkännande/radering tar bort rad utan att ladda om listan | 0.063 |
| 2026-11-07 | Utmaning – utmanarens kort visades ett steg fel på aktiva lagets skärm (aktiva lagets dolda kort räknades inte där) | 0.835 |
| 2026-11-07 | Utmaning – utlagt men olåst utmanarkort räknas när Timer 3 går ut (gav tidigare "placerade inget kort") | 0.835 |
| 2026-11-07 | Flytt av kort med touch rensar inte längre kortet i Firebase när draget börjar (kortet försvann under draget och layouten flyttade sig) | 0.835 |
| 2026-11-07 | Utmanarens kort går inte längre att dra från aktiva lagets enhet; LÅS SVAR utan kort skriver inget | 0.835 |
| 2026-11-07 | Helskärm på Android – första touch på spelsidan begär helskärm (döljer adressfält + systemfält). Finns inte på iPhone | 0.836 |
| 2026-11-08 | Eruda (mobilkonsol) borttagen från game.html | 0.837 |
| 2026-11-08 | Databasregler: spel kan bara läsas/skrivas per spel-id (inte hela `games`), `flaggedTracks` bara admin, `reportedTracks` valideras och kan inte raderas av andra än admin | Regler |
| 2026-11-08 | Escaping av data från databasen i admin (rapporter, användare), lobby (tokens, kicka-knapp) och spel (poäng, tokens, årtal, rapportknapp) | 0.837 / 0.066 |
| 2026-11-08 | Functions: Node 22, inloggning krävs för AI-funktionerna och `getSpotifyToken`, max 500 låtar per batchanrop och max 300 tecken per titel/artist | Functions |
| 2026-11-08 | Functions: oanvända `hostStart` borttagen ur koden och raderad i Firebase | 0.838 |
| 2026-11-08 | Admin, rapporter: papperskorgen på en skannad rad raderar nu rapporten (laddade tidigare om hela listan, raderade inget och kastade alla skanningar). Skannade rader behåller kolumnen "Antal". "Skanna alla" hoppar över rader som raderats under skanningen | 0.068 |

---

## Kända problem

### Kritiska (deadline)
| # | Problem | Deadline |
|---|---|---|
| 1 | **Node.js runtime** – uppgraderad från 20 (avvecklad 30 okt 2026) till 22, deployad 2026-11-08 (alla fem funktioner kör nodejs22). Node 22 är sista Node-versionen för 1st gen och avvecklas 2027-10-31 – därefter krävs 2nd gen (docs.cloud.google.com/functions/docs/runtime-support) | 31 okt 2027 |
| 2 | **firebase-functions SDK 4.9.0** – senaste är 7.4.0. v6 bytte standardimporten till v2-API:t (nuvarande kod kräver då `firebase-functions/v1`), v7 tog bort `functions.config()` | Samma som 1 |
| 3 | **functions.config() deprecated** – nya deployer med det misslyckas efter mars 2027 och API:t finns inte i SDK v7. OpenAI-nyckeln och Spotify-hemligheten ligger där idag – migrera till Secret Manager (`firebase functions:config:export`, `defineJsonSecret`) | Mars 2027 |

### Säkerhet
Fynd #17–21 finns i `docs/sakerhet-lokal.md`, som står i `.gitignore` och inte pushas.

### Buggar
| # | Bug | Prio | Status |
|---|---|---|---|
| 5 | Race condition i `mergeSongs()` – UI-räknare kan visa fel antal | Låg | Öppen |
| 8 | `year: null` – låtar utan `release_date` på Spotify hamnar med null | Medel | Öppen |
| 10 | Ingen validering på år-input i review-modalen – kan spara "abc" till cachen | Medel | Öppen |
| 11 | Ingen överskrivningsvarning – lista med befintligt namn skrivs över utan fråga | Låg | Öppen |
| 12 | Spotify-token kan gå ut vid import >60 min → 401-fel utan retry | Låg | Öppen |
| 13 | Paus under Timer 2/3 – "Fortsätt" startar alltid Timer 1, `challengeState` ligger kvar → aktiva laget kan lägga ett andra kort och spelet stannar vid nästa Timer 2 | Medel | Öppen |
| 14 | Dubbelvalidering av utmaning om hostens klocka går >~1 s före utmanarens – hostens backup validerar samtidigt, andra körningen byter lag/låt en extra gång och `isValidatingChallenge` fastnar | Låg | Öppen (ej verifierad) |
| 15 | Musiken har pausat två gånger när första kortet drogs i ett nytt spel. Ingen kod i spelet pausar Spotify och SDK:n lyssnar inte på touch. Fungerade när kortet drogs på samma enhet som spelar musiken. Att testa: dra på en annan enhet med musikenhetens konsol öppen via `chrome://inspect` på en dator (telefonen ansluten med USB), leta efter `Playback state` med `paused: true`,, och kontrollera om samma Spotify-konto spelar på en annan enhet samtidigt | Låg | Öppen (ej reproducerad) |
| 16 | Vid LÅS SVAR på hostens telefon (den som spelar musiken) har låten börjat om, kortet gått att dra igen och ett spökkort legat kvar. Hänt minst två gånger, även före helskärmsändringen (0.836). Koden kan inte starta samma låt två gånger under en sidladdning (`currentPlayingTrackId`), så troligast laddades hostens sida om strax efter låsningen: startpausen (Timer 4, game-render.js) körs igen och skriver över Timer 2, Timer 1 startar för samma lag och låt, och det låsta kortet valideras aldrig eftersom `window.pendingValidationCard` bara finns i den gamla sidans minne. Att helskärmen låg kvar utesluter inte omladdning – nästa touch begär helskärm igen. Orsak till omladdningen okänd (ej verifierat: Chromes dra-ned-för-att-uppdatera). Androids bakåt-gest är troligen inte orsaken: hostens lobby-URL saknar teamId, så vägen via lobbyn slutar i "Ditt lag finns inte i spelet" i stället för ett omstartat spel. Att testa: visas "NÄSTA TUR: eget lag" ~10 s innan låten börjar om? Ha hostens konsol öppen via `chrome://inspect` på en dator (telefonen ansluten med USB) – tom logg från före låsningen betyder omladdning. Separat bekräftad lucka: mellan LÅS SVAR och Firebase-bekräftelsen är det fortfarande Timer 1, så kortet kan dras igen och LÅS SVAR är aktiv (`lockInPlacement`, game-cards.js) | Medel | Öppen (ej reproducerad) |
| 22 | Hostens reserv tar bara över när timern redan har stoppats (game-timers.js `updateTimer`). Somnar eller tappar det aktiva lagets telefon uppkopplingen under Timer 1 står spelet på 0:00. Timer 2 har ingen reserv. Om hosten låser kortet åt laget ligger `pendingValidationCard` på hosten, men Timer 2 hanteras av lagets telefon, som inte hittar kortet – spelet stannar | Hög | Öppen |
| 23 | "Nästa →" under Timer 2/3 lämnar det låsta kortet ovänt i tidslinjen för alltid (game-host.js `forceNextTeam`). Vinstkontrollen räknar alla kort i tidslinjen, även ovända (game-init.js `checkAndApplyWinCondition`) – spökkort ger poäng, gäller även #16 | Hög | Öppen |
| 24 | Slut på kortleken låser spelet: `closeValidationModal` (game-cards.js) avbryter utan lagbyte, Timer 4 startar ändå, valideringsrutan fastnar i "bearbetar" och "Nästa →" vägrar så länge rutan är öppen. Kan hända med små spellistor eller många BYT LÅT | Hög | Öppen |
| 25 | Orättvis vinstkontroll: rundan räknas som slut när turen går till första laget i `Object.keys(teams)`, men startlaget slumpas (lobby.html). Lagen efter startlaget har alltid haft en tur mer när vinsten kontrolleras | Medel | Öppen |
| 26 | Timern jämför den skrivande enhetens `Date.now()` med den läsandes (game-timers.js) – varje telefon räknar ner olika, hänger ihop med #14. Firebase serverklocka (`.info/serverTimeOffset`) löser det | Medel | Öppen |
| 27 | Två lag kan utmana samtidigt – båda betalar en token och den sista skrivningen vinner (ingen transaction på `challengeState`, game-cards.js) | Medel | Öppen (ej verifierad) |
| 28 | `validateChallenge` släpper inte `isValidatingChallenge` om inget ovänt kort hittas (game-cards.js) – den enheten validerar aldrig mer en utmaning | Medel | Öppen (ej verifierad) |
| 29 | "Starta om" nollställer inte tokens (game-host.js `restartGame`) | Låg | Öppen |
| 30 | En paus på 0 s blir 10 s, eftersom koden använder `betweenSongsTime \|\| 10` (game-render.js, lobby.html) | Låg | Öppen |
| 31 | `reportedByTeam` blir alltid "Unknown" – `teamId` är en `let` och finns inte på `window` (game-utils.js `reportTrack`) | Låg | Öppen |
| 32 | En titel med `"` (t.ex. "Heroes") bryter rapportknappens onclick i valideringsrutan – `escapeHtml` escapar inte citattecken (game-render.js) | Låg | Åtgärdad (0.837) – knappen får låtdatan via en lyssnare |
| 33 | Spotify-spelaren startar bara om access-tokenen gäller (spotify-player.js), refresh-tokenen används aldrig vid sidladdning. Öppnas spelet mer än en timme efter senaste förnyelsen blir det ingen musik och inget felmeddelande | Medel | Öppen |
| 34 | Startkort dras med återläggning och tas inte bort ur kortleken (lobby.html). Två lag kan få samma startkort, och ett startkort kan komma igen som låt att placera | Medel | Öppen |
| 35 | Samma låt kan hamna två gånger i kortleken om den finns i två valda listor (lobby.html) | Medel | Öppen (ej verifierad) |
| 36 | Host som laddar om lobbyn efter spelstart skickas till `game.html?teamId=null` ("Ditt lag finns inte i spelet") – hostens lobbyadress saknar teamId (lobby.html) | Medel | Öppen |
| 37 | join.html läser lagen en gång vid sidladdning – om alla ansluter samtidigt kan alla få samma färg, och kontrollen av dubbla namn och max 8 lag går förbi | Medel | Öppen (ej verifierad) |
| 38 | Granskningsrutan vid användarimport (spotify.js) fungerar bara för admin: steg 1 skriver till `verifiedTracks`, som bara admin får skriva till, så alla andra får "Något gick fel". Steg 2 skriver till fel sökväg, `songs/<id>/year/year` | Medel | Öppen |
| 39 | Service workern (stale-while-revalidate) kan servera gammal JS: `spotify.js` ändrades i 0.832 och 0.833 utan att `?v=` höjdes, och `lobby.js` och `styles.css` saknar `?v=` | Medel | Öppen (ej verifierad) |
| 40 | "Städa databasen": filtret ">5 år nyare än Spotify" slås aldrig på, eftersom `fixedBy` alltid är "AI" (admin.html) | Medel | Öppen |
| 41 | "Städa databasen": avbockade rader hoppas inte över utan låses med Spotifys år och `manuallyVerified: true`. Fallet där AI säger mer än 5 år tidigare än Spotify (nyutgåvor, samlingsskivor) är avbockat från början – Spara utan genomgång låser Spotifys år permanent (admin.html) | Medel | Öppen |
| 42 | "AI-Sök" i spellistedetaljer: funktionen svarar `null`, men koden letar efter "UNKNOWN", så "AI Hittade!" visas med tomt fält. Spara skriver "" och låten försvinner ur spelen (admin.html) | Medel | Öppen |
| 43 | Import i admin: misslyckas en AI-batch visas inte granskningen av osäkra låtar från de andra batcharna. AI-svar som inte används (null, mer än 1 år senare än Spotify) försvinner tyst och räknas inte | Medel | Öppen |
| 44 | manifest.json har `"orientation": "portrait-primary"` – en installerad hemskärmsapp bör låsas i stående läge, medan spelet kräver liggande | Låg | Öppen (ej testad på enhet) |

---

## Förbättringsförslag

### Admin-panelen
| | Idé |
|---|---|
| G | Döp om spellistor utan att ta bort och lägga till igen |
| H | Ta bort enskilda låtar ur en lista |
| I | AI-scan på befintliga listor (re-validera utan re-import) |

### Spelet
| | Idé |
|---|---|
| D | Cooldown-indikator – spelaren vet inte vilka låtar som är spärrade (12h) |

### Tekniskt
| | Idé |
|---|---|
| A | Stäng av `DEBUG = true` i `spotify-auth.js` (loggar i produktion, och skriver och tar bort 1 MB i localStorage vid varje sidladdning – det senare ej verifierat) |
| J | Höj auto-accept-gränsen till ±2 år (8-regelspromten är pålitligare) |
| K | Rensa `listor/`-katalogen – dead code från gamla verktyg. index.html laddar fortfarande `listor/itunes-api.js`, som inget anropar – ta bort den raden först |
| L | Deduplera `verifiedTracks` mot `standardLists` |
| M | Timerstapeln byggs om med innerHTML 20 gånger i sekunden på alla telefoner (game-timers.js `renderTimer`) – CSS-övergången och pulseringen körs därför aldrig |
| N | Hosten startar en ny 2 s-`setTimeout` var 50:e ms så länge Timer 1 står på 0 (game-timers.js `updateTimer`) |
| O | Hela spelnoden lyssnas på och hela vyn ritas om vid varje ändring. Valideringsrutan skapas om, så animationen spelas igen vid varje skrivning (ej verifierat) |
| P | Stora bilder: `logga.png` på startsidan är 490 KB, `icon.png` 358 KB |
| Q | Död kod och gammal text: game-init.js läser `hostTeam` som aldrig skrivs, tom fil `manifest` i roten, admin-texten för "Städa databasen" nämner fortfarande iTunes |

---

## Prompt-arkitektur (functions/prompts.js)

```
BASE_RULES  (regler 1–8, gemensamma)
     │
     ├── + format {"year": ...}         →  MUSIC_YEAR_SINGLE_PROMPT  (getSongYearAi)
     │
     └── + regel 9 (batch-isolering)
         + format {"songs": [...]}      →  MUSIC_YEAR_BATCH_PROMPT   (getSongYearsAiBatch)
```

Uppdatera ENBART `functions/prompts.js` – deploya sedan berörda funktioner.
