# Notestream – Projektstatus

## Versioner just nu
| Fil | Version |
|---|---|
| index.html (spelet) | 0.853 |
| admin.html | 0.082 |
| spotify.js | 0.849 |
| game-cards.js (game.html) | 0.835 |
| game-render.js (game.html) | 0.847 |
| game-init.js (game.html) | 0.836 |
| game.css | v50 |
| service-worker | v57 |
| Firebase Functions Node runtime | 22 (1st Gen) |
| AI-modell | Claude Opus 5.5 (`claude-opus-5-5`), nyckel i Secret Manager (`ANTHROPIC_API_KEY`) |
| functions/year-review.js | Årtalsgranskningen: Opus ur minnet, webbsökning när året ändras eller är osäkert, beslutsregel |

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
| 2026-11-08 | AI bytt från gpt-5.5 (OpenAI) till Claude Opus 5.5 i `getSongYearAi` och `getSongYearsAiBatch`: officiella SDK:n `@anthropic-ai/sdk`, JSON-svar enligt schema, effort medium, server-side fallback vid nekande. Nyckeln i Secret Manager (`ANTHROPIC_API_KEY`), kostnaden dras från Ultra-krediterna. Samma prompt och samma svarsformat mot klienterna | 0.840 / Functions |
| 2026-11-14 | Mätning av ny årtalsgranskning i `tools/year-eval` mot ett facit på 186 låtar. Spotifys år har grovt fel (mer än 2 år) på 34, Opus ur minnet med Spotifys albumdata lämnar 6, och med webbsökning på de år Opus ändrar blir det 0. Resultat i `tools/year-eval/results/baseline/` | – |
| 2026-11-14 | Ny funktion `resolveSongYear` (bara admin): servern hämtar låten från Spotify, Opus granskar Spotifys år, webbsökning körs när året ändras, och en beslutsregel avgör året. Returnerar år, källa, förklaring och länk men skriver inget i databasen. "AI-Sök" i spellistedetaljer använder den, visar förklaring och källa under låten och sparar härkomsten i `verifiedTracks` vid Spara (`source`, `explanation`, `sourceUrl`, `sourceTitle`, `spotifyYear`, `albumName`, `albumType`, `releaseDate`, `checkedAt`). `getSpotifyToken` delar tokenhämtningen med den nya funktionen. Övriga flöden använder fortfarande de gamla funktionerna | 0.841 / 0.070 / Functions |
| 2026-11-14 | `resolveSongYear`: källsidans titel avkodas, så länken visar "Kung för en dag" och inte "Kung f%C3%B6r en dag". Hittat vid test live: 37 av 852 sökträffar i mätningen hade kodad titel, främst Wikipedia-sidor med å, ä, ö eller apostrof | 0.842 / 0.071 / Functions |
| 2026-11-14 | Admin, Databas: nytt kort "Granska alla årtal". Kör `resolveSongYear` över låtarna i standardlistorna, 10 per anrop och två anrop samtidigt, med valfritt antal per körning. Servern sparar varje resultat i den nya noden `yearReviews` (bara admin får läsa och skriva), så körningen går att stoppa och fortsätta. Sammanställningen visar oförändrade, ändrade, till granskning, låsta där granskningen säger annat, och ej hittade hos Spotify. Inget skrivs till `verifiedTracks` eller `standardLists` – verkställandet är ett eget steg | 0.843 / 0.072 / Functions / Regler |
| 2026-11-15 | Alla 2 225 låtar i standardlistorna granskade med `resolveSongYear` (cirka 64 dollar, 33 minuter, inga misslyckade anrop). Utfall mot spelets nuvarande år: 1 681 oförändrade, 265 ändras (98 med mer än två år), 3 behöver granskas, 276 låsta varav 39 där granskningen säger ett annat år. Resultaten ligger i `yearReviews`, inget i spelet är ändrat | – |
| 2026-11-15 | `resolveSongYear` får valet `forceWeb`, som kör webbsökningen även när Opus behåller Spotifys år. Beslutsregeln låter då en äkta och tydlig källa avgöra även för behållna år. Admin-kortet får knappen "Sök på osäkra" för låtar utan webbsökning där Opus var osäker eller där resultatet skiljer sig från spelets år. Bakgrund: Opus behöll Spotifys år men var osäker för 227 låtar, och minst ett sådant år var fel | 0.844 / 0.073 / Functions |
| 2026-11-15 | Extra webbsökning körd på 245 låtar (cirka 27 dollar). Den fångade två grova fel som annars legat kvar (*Stationen* 2015→2010, *Var ska vi sova inatt* 1993→1982). Läget efteråt: 1 645 oförändrade, 300 ändras (101 med mer än två år), 6 behöver granskas, 274 låsta varav 29 där granskningen säger ett annat år | – |
| 2026-11-15 | Admin-kortet "Granska alla årtal" får "Verkställ...": visar först vad som skulle skrivas och ber om bekräftelse, laddar ner en säkerhetskopia av `verifiedTracks` och `standardLists`, och skriver sedan de granskade åren. Olåsta låtar med status ok får en ny cachepost med härkomst, och året skrivs till varje lista där det skiljer sig. Låsta låtar, låtar som behöver granskas och låtar som saknas hos Spotify rörs inte. Går att köra om. Återställning från säkerhetskopian: dela filen i två JSON-filer och kör `firebase database:set /verifiedTracks <fil> --instance notestreamfire` och motsvarande för `/standardLists` | 0.845 / 0.074 |
| 2026-11-15 | **Årtalen verkställda.** 1 945 olåsta låtar fick ny cachepost med härkomst, 300 av dem ett nytt år (101 med mer än två år), och 395 år skrevs i de 16 standardlistorna. Kontrollerat mot en kopia tagen precis före: de 278 låsta posterna och de 1 258 posterna utanför standardlistorna är identiska, inga låtar tillkom eller försvann, och bara årsfältet ändrades i listorna. Två cacheposter fick listans stavning av artisten i stället för sin tidigare (*SexyBack*, *Billionaire*), vilket inte syns i spelet. Kvar att avgöra för hand: 6 låtar som behöver granskas och 29 låsta där granskningen säger ett annat år. Kopian före ligger i `tools/year-eval/backups/` | – |
| 2026-11-15 | Admin, Flaggat: nytt kort "Årtal att avgöra" med de låtar granskningen inte kunde avgöra och de låsta där granskningen säger ett annat år (35 vid start). Varje rad visar året idag, Spotifys år, Opus år ur minnet och sökningens år med källa, och har tre val: godta förslaget, behålla året eller skriva ett annat. Varje beslut låser låten (`manuallyVerified: true`), skriver året till alla listor och märker granskningen med `yearReviews/<id>/resolved`. Knappen "Lägg till källa och förklaring på låsta låtar" fyller på härkomst för låsta låtar där granskningen ger samma år, utan att röra år eller lås | 0.846 / 0.075 |
| 2026-11-15 | 244 låsta låtar fick källa och förklaring från granskningen (221 från webbsökning, 223 med länk). Kontrollerat mot en kopia tagen precis före: exakt 244 poster ändrades, alla var låsta och saknade härkomst, och år, lås, titel och artist är oförändrade. Listorna är orörda. 2 190 av 2 225 låtar i standardlistorna har nu en förklaring – de 35 som saknar väntar i kön "Årtal att avgöra" | – |
| 2026-11-15 | Spelet: när kortet vänds visas förklaringen till årtalet under låten, och "Källa: webbplats" som länk (ny flik) när låten har en kontrollerad källa. Varje enhet läser texten från `verifiedTracks/<id>` när låten börjar spelas, inte via spelnoden, och visar den bara om cachens år är samma som kortets. Låtar utan förklaring eller utanför cachen visas utan text. Rutans upplägg ändrat så att texten får plats i liggande mobil: "Fel årtal?" ligger på samma rad som +TOKEN och NÄSTA LÅT, knappraden ligger fast under en del som rullar vid behov, rutan blir aldrig högre än skärmen, och 16 px tom marginal under knapparna är borta. Mätt lokalt på 812×375 med riktiga låtar: den längsta texten med källa får plats utan rullning; vid utmaning rullar texten 12 px för den längsta texten, knapparna syns alltid. Inte provat i en riktig spelomgång, och inte om musiken påverkas när värden öppnar källänken | 0.847 / 0.076 |
| 2026-11-15 | Adminimporten av standardlistor går genom `resolveSongYear`. Låtar utan granskning skickas tio per anrop, och det nya valet `webWhenUncertain` kör webbsökningen även när Opus behåller året utan att vara säker. Låtar med status ok får cachepost med källa och förklaring och året skrivs i listan; en olåst cachepost utan källa ersätts då av granskningens. Övriga får cachens eller Spotifys år: de som inte går att avgöra hamnar i "Årtal att avgöra", de som misslyckades tas av "Starta / Fortsätt". Låsta låtar rörs inte. Cachen skrivs först och listan sist. En avbruten import kostar inget extra vid nytt försök, eftersom granskningarna redan är sparade. Borttaget: granskningsrutan efter adminimport och kortet "Städa databasen" (cirka 800 rader). `getSongYearsAiBatch` används nu bara av användarimporten, `getSongYearAi` bara av rapportflödet. Inte provat med en riktig import | 0.848 / 0.077 / Functions |
| 2026-11-15 | Användarimporten går genom den nya funktionen `reviewImportedTracks` (alla inloggade, högst tio låtar per anrop). Låtar i cachen eller med sparad granskning besvaras utan kostnad. Övriga granskas som i adminimporten, och servern skriver själv granskningen och cacheposten; en post som finns ersätts aldrig. Tak per svenskt kalenderdygn: 150 nya låtar per användare och 300 för alla tillsammans (cirka 12 dollar vid vanlig blandning, upp till cirka 37 om varje låt kräver webbsökning). Adminkontot är undantaget. Räknarna ligger i `importUsage/<datum>`, som saknar regel och därför bara nås av servern. Låtar över taket eller med misslyckad granskning får Spotifys år, och meddelandet efter importen säger hur många. Borttaget: användarnas ruta "AI-Granskning" och spärren på 12 timmar (koden som läser spärren ligger kvar). Kön "Årtal att avgöra" visar nu också låtar utanför standardlistorna som granskningen inte kunde avgöra; ett beslut där skriver bara cachen. Ingen sida anropar längre `getSongYearsAiBatch`. Inte provat med ett riktigt konto | 0.849 / 0.078 / Functions |
| 2026-11-15 | `getSongYearsAiBatch` borttagen ur koden och raderad i Firebase, tillsammans med batch-prompten, batch-schemat och gränserna som bara den använde. Den kunde anropas av alla registrerade konton med 500 låtar åt gången, utan tak. `getSongYearAi` och `prompts.js` ligger kvar för rapportflödets "Skanna med AI" tills det byggs om. En startsida som stått öppen sedan före 0.849 får fel vid import tills den laddas om, och importerar då med Spotifys år | 0.850 / 0.079 / Functions |
| 2026-11-15 | "Fel årtal?" i spelet startar en ny kontroll. Den nya databasutlösta funktionen `checkReportedTrack` körs när en rapport skapas i `reportedTracks` (databasen `notestreamfire`, europe-west1), kör hela kedjan med webbsökning och sparar resultatet i `yearReviews`. Ingen ny sökning om låten sökts de senaste 30 dagarna, och högst 20 kontroller per svenskt dygn (räknare i `reportUsage/<datum>`, som bara servern når). Inget i spelet ändras automatiskt. Admin: rapporterade låtar ligger först i "Årtal att avgöra" med kontrollens resultat och källa. Ett beslut låser låten och tar bort rapporten; "Kasta rapporten" tar bara bort rapporten. Kortet "Spelarnas rapporter" med "Skanna med AI" är borttaget, liksom hanteringen av `flaggedTracks`, som inget längre skriver. Ingen sida anropar längre `getSongYearAi`. Spelets kod är oförändrad. Provat live med en riktig rapport för *Africa* (TOTO): kontrollen var klar 11 sekunder efter rapporten, bekräftade 1982 med Wikipedia som källa och kostade cirka 10 cent; cachen och listorna var oförändrade, raden visades först i kön och "Kasta rapporten" tog bara bort rapporten. Inte provat live: ett beslut på en rapporterad rad, och en rapport skriven från själva spelet | 0.851 / 0.080 / Functions |
| 2026-11-15 | `getSongYearAi` borttagen ur koden och raderad i Firebase, tillsammans med `functions/prompts.js` och hjälpkoden som bara den använde. Därmed finns bara den nya årtalsgranskningen kvar: `resolveSongYear`, `reviewImportedTracks` och `checkReportedTrack`, alla genom `functions/year-review.js`. I `year-review.js` ändrades bara kommentarer | 0.852 / 0.081 / Functions |
| 2026-11-16 | De 35 låtarna i "Årtal att avgöra" avgjorda av admin, alla med "Godta". Kontrollerat mot databasen: varje låt har låst cachepost med beslutets år och samma år i alla listor. Alla 2 225 låtar i standardlistorna har därmed en förklaring | – |
| 2026-11-16 | Admin, kortet "Granska alla årtal": nytt val "Användarnas listor" för låtar som bara finns i användarnas egna listor (2 683 vid start: 2 081 utan cachepost, 464 med olåst cachepost utan källa, 138 låsta). Låtar utan cachepost körs först. Webbsökningen görs i samma körning när året ändras eller är osäkert. "Verkställ" skriver där bara cachen, och går att köra innan alla låtar är granskade; användarnas listor ändras inte, eftersom startsidan och lobbyn tar cachens år före listans. Kön "Årtal att avgöra" visar nu också låsta låtar utanför standardlistorna där granskningen säger ett annat år | 0.853 / 0.082 |

---

## Kända problem

### Kritiska (deadline)
| # | Problem | Deadline |
|---|---|---|
| 1 | **Node.js runtime** – uppgraderad från 20 (avvecklad 30 okt 2026) till 22, deployad 2026-11-08 (alla fem funktioner kör nodejs22). Node 22 är sista Node-versionen för 1st gen och avvecklas 2027-10-31 – därefter krävs 2nd gen (docs.cloud.google.com/functions/docs/runtime-support) | 31 okt 2027 |
| 2 | **firebase-functions SDK 4.9.0** – senaste är 7.4.0. v6 bytte standardimporten till v2-API:t (nuvarande kod kräver då `firebase-functions/v1`), v7 tog bort `functions.config()` | Samma som 1 |
| 3 | **functions.config() deprecated** – nya deployer med det misslyckas efter mars 2027 och API:t finns inte i SDK v7. Spotify-hemligheten ligger där idag (AI-nyckeln ligger redan i Secret Manager) – migrera till Secret Manager (`firebase functions:config:export`, `defineJsonSecret`) | Mars 2027 |

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
| 42 | "AI-Sök" i spellistedetaljer: funktionen svarar `null`, men koden letar efter "UNKNOWN", så "AI Hittade!" visas med tomt fält. Spara skriver "" och låten försvinner ur spelen (admin.html) | Medel | Åtgärdad (0.070) – "AI-Sök" använder `resolveSongYear`, som alltid svarar med ett år eller en status |
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
| Q | Död kod: game-init.js läser `hostTeam` som aldrig skrivs, tom fil `manifest` i roten, och spärren på 12 timmar läses fortfarande i firebase-config.js och lobby.html fast inget skriver den längre |

---

## Prompter (functions/year-review.js)

All årtalsgranskning går genom `functions/year-review.js`, som har två prompter:

- `YEAR_REVIEW_PROMPT` – Opus granskar Spotifys år ur minnet och svarar med år, förklaring och säkerhet.
- `YEAR_WEB_PROMPT` – webbsökningen, som svarar med år, källa, förklaring och hur tydligt källan stöder året.

Tre funktioner använder dem: `resolveSongYear` (admin), `reviewImportedTracks` (användarnas importer) och `checkReportedTrack` (rapporter från spelet). En ändring i prompterna ska mätas mot facit i `tools/year-eval` innan den deployas. De äldre funktionerna `getSongYearAi` och `getSongYearsAiBatch` och filen `functions/prompts.js` togs bort 2026-11-15.
