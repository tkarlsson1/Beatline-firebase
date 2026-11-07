# Notestream – Projektstatus

## Versioner just nu
| Fil | Version |
|---|---|
| index.html (spelet) | 0.835 |
| admin.html | 0.064 |
| spotify.js | 0.807 |
| game-cards.js / game-render.js (game.html) | 0.835 |
| game.css | v49 |
| service-worker | v40 |
| Firebase Functions Node runtime | 20 (1st Gen) |
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

---

## Kända problem

### Kritiska (deadline)
| # | Problem | Deadline |
|---|---|---|
| 1 | **Node.js 20 deprecated** – uppgradera till 22 | 30 okt 2026 |
| 2 | **firebase-functions SDK 4.9.0** – uppgradera till >=5.1.0 | Samma |
| 3 | **functions.config() deprecated** – migrera till params-paketet | Mars 2027 |

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
| 15 | Musiken har pausat två gånger när första kortet drogs i ett nytt spel. Ingen kod i spelet pausar Spotify och SDK:n lyssnar inte på touch. Fungerade när kortet drogs på samma enhet som spelar musiken. Att testa: dra på en annan enhet med Eruda-konsolen öppen på musikenheten (leta efter `Playback state` med `paused: true`), och kontrollera om samma Spotify-konto spelar på en annan enhet samtidigt | Låg | Öppen (ej reproducerad) |

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
| A | Stäng av `DEBUG = true` i `spotify-auth.js` (loggar i produktion) |
| J | Höj auto-accept-gränsen till ±2 år (8-regelspromten är pålitligare) |
| K | Rensa `listor/`-katalogen – dead code från gamla verktyg |
| L | Deduplera `verifiedTracks` mot `standardLists` |

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
