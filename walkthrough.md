# Notestream – Projektstatus 2026-06-25 (kväll)

## Versioner just nu
| Fil | Version |
|---|---|
| index.html (spelet) | 0.828 |
| admin.html | 0.059 |
| spotify.js | 0.807 |
| Firebase Functions Node runtime | 20 (1st Gen) |
| AI-modell | gpt-5.5 |
| Spårade filer i git | 76 (rent repo) |

---

## Vad vi gjort idag

| # | Ändring |
|---|---|
| AI-prompt | Ny 8-regelsprompt – artist-ankare, anti-debut-bias, titeltillägg, batch-isolering |
| Import UX | Spinner + 2s infofas, inga hoppar i räknare, ingen fake-progress |
| Review-modal | Renare texter, bort "Magi:", knapp alltid "Spara årtal" |
| Admin-import | 540s client-timeout + retry-logik (3 försök) |
| Git/säkerhet | .gitignore för node_modules, .claude/, xcf-filer, temp-filer |

---

## Kända problem (prioritetsordning)

### Kritiska
| # | Problem | Deadline |
|---|---|---|
| 1 | **Node.js 20 deprecated** – måste uppgradera till 22 | 30 okt 2026 |
| 2 | **firebase-functions SDK 4.6.0** – uppgradera till >=5.1.0 | Samma |
| 3 | **functions.config() deprecated** – migrera till params-paketet | Mars 2027 |

### Icke-kritiska
| # | Problem |
|---|---|
| 4 | `/` i spellistenamn fungerar inte (Firebase-begränsning) |
| 5 | Race condition i `mergeSongs()` – UI-räknare kan visa fel antal |

### Buggar att åtgärda (inventerade 2026-06-25)
| # | Bug | Allvarlighet | Svårighet |
|---|---|---|---|
| 6 | **Null-spår i Spotify-playlist** – `item.track` kan vara null (lokala filer, borttagna låtar) → crash på import | Hög | Lätt |
| 7 | **Förbjudna Firebase-tecken i spellistenamn** – `.` `#` `$` `[` `]` orsakar tyst fel precis som `/` | Hög | Lätt |
| 8 | **År sparas som null** – låtar utan `release_date` på Spotify hamnar i databasen med `year: null` | Medel | Lätt |
| 9 | **Fel URL-typ** – album- eller track-URL ger generiskt felmeddelande istället för vägledning | Medel | Lätt |
| 10 | **Ingen validering på år-input i review-modalen** – kan spara "abc" eller tomt direkt till verifiedTracks-cachen | Medel | Lätt |
| 11 | **Ingen överskrivningsvarning** – importerar du en lista med befintligt namn skrivs den över utan fråga | Låg | Lätt |
| 12 | **Spotify-token kan gå ut** under mycket lång import (>60 min) → 401-fel utan retry | Låg | Medel |

---

## Förslag på förbättringar

### Lätta vinster
| # | Idé | Varför |
|---|---|---|
| A | **Stäng av `DEBUG = true`** i `spotify-auth.js` | Loggar massor av debug-info i produktion för alla användare |
| B | **Validera `/` i spellistenamn** | Visa ett felmeddelande direkt istället för tyst fel |
| C | **`listor/validation-results*.json`** ur git | 7 MB JSON-filer från gamla valideringssystemet, ingen anledning att ha i repot |

### UX-förbättringar
| # | Idé | Varför |
|---|---|---|
| D | **Cooldown-indikator i spelet** | Spelaren vet inte vilka låtar som är spärrade (12h) – visuellt fel just nu |
| E | **Bättre felmeddelande vid import-fail** | Om hela importen failar (t.ex. nätverksfel) är meddelandet generiskt |
| F | **Ångra-knapp i review-modalen** | Kan råka ändra ett år och vill tillbaka till AI-förslaget |

### Admin-panelen
| # | Idé | Varför |
|---|---|---|
| G | **Döp om spellistor** | Kan inte byta namn på en lista utan att ta bort och lägga till igen |
| H | **Ta bort enskilda låtar ur en lista** | Måste ta bort hela listan om en låt är fel |
| I | **AI-scan på befintliga listor** | Re-validera en hel standardlista mot ny AI-prompt utan att behöva re-importera |

### Tekniska förbättringar
| # | Idé | Varför |
|---|---|---|
| J | **Höj auto-accept-gränsen till ±2 år** | Den nya 8-regelspromten är pålitligare – vi diskuterade detta |
| K | **Rensa `listor/`-katalogen** | Gamla verktyg (iTunes API, LastFM, MusicBrainz) som ersatts av AI – dead code |
| L | **Deduplera `verifiedTracks` mot `standardLists`** | Låtar som finns i standardlistor behöver inte ligga dubbelt i verifiedTracks-cachen |

---

> **Repot är nu rent:** 76 filer, inga node_modules, inga secrets, inga onödiga binärfiler.
