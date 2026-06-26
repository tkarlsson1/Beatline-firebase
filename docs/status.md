# Notestream – Projektstatus

## Versioner just nu
| Fil | Version |
|---|---|
| index.html (spelet) | 0.833 |
| admin.html | 0.062 |
| spotify.js | 0.807 |
| service-worker | v38 |
| Firebase Functions Node runtime | 20 (1st Gen) |
| AI-modell | gpt-5.5 |

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

---

## Kända problem

### Kritiska (deadline)
| # | Problem | Deadline |
|---|---|---|
| 1 | **Node.js 20 deprecated** – uppgradera till 22 | 30 okt 2026 |
| 2 | **firebase-functions SDK 4.6.0** – uppgradera till >=5.1.0 | Samma |
| 3 | **functions.config() deprecated** – migrera till params-paketet | Mars 2027 |

### Buggar
| # | Bug | Prio | Status |
|---|---|---|---|
| 5 | Race condition i `mergeSongs()` – UI-räknare kan visa fel antal | Låg | Öppen |
| 8 | `year: null` – låtar utan `release_date` på Spotify hamnar med null | Medel | Öppen |
| 10 | Ingen validering på år-input i review-modalen – kan spara "abc" till cachen | Medel | Öppen |
| 11 | Ingen överskrivningsvarning – lista med befintligt namn skrivs över utan fråga | Låg | Öppen |
| 12 | Spotify-token kan gå ut vid import >60 min → 401-fel utan retry | Låg | Öppen |

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
