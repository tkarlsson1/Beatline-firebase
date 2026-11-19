# Projektregler & Kontext: Beatline

Denna fil innehåller kritiska systemregler och kontext för AI-assistenter som arbetar i detta projekt. Läs alltid denna fil innan du gör större arkitektoniska förändringar eller påbörjar felsökning.

## 1. Lyssna på instruktioner
- **Pausa vid uppmaning:** Om användaren skriver "gör inget" eller "ändra ingen kod förrän jag säger till", så **måste** detta respekteras strikt. Agera enbart som rådgivare och presentera svar i text utan att göra några `write_to_file`, `replace_file_content` eller köra modifierande kommandon förrän ett uttryckligt godkännande ges.

## 2. AI-Modeller och Backend
- **AI-modell:** Projektet använder **Claude Opus 5.5** (`claude-opus-5-5`) via Anthropics API i Firebase-funktionerna `resolveSongYear`, `reviewImportedTracks` och `checkReportedTrack` (sedan 2026-11-08, ersatte gpt-5.5). API-nyckeln ligger i Secret Manager som `ANTHROPIC_API_KEY` och kostnaden dras från Ultra-abonnemangets API-krediter (Console-organisationen Timmy's Individual Org). Ifrågasätt **inte** om modellen existerar och byt den inte mot en äldre modell på grund av föråldrad träningsdata. OpenAI används inte längre.
- **Endast AI för årssökning:** iTunes API har fasats ut som källa för att hämta årtal. Återskapa **aldrig** fallback-logik mot iTunes i klienten (t.ex. i `admin.html`), utan förlita dig uteslutande på AI-funktionerna via Firebase.

## 3. Deploy och Versionshantering
- **Versionsnummer i HTML:** Så fort vi gör *någon* förändring i kodbasen ska versionsnumret i `<title>`-taggen uppdateras i **både** `index.html` och `admin.html` samtidigt, oavsett vilken av filerna som redigerades. Detta är kritiskt för att användaren ska kunna verifiera att pushen gått igenom på båda ställena.
- **Service Worker Cache:** Vid ändringar i klientfiler ska cache-versionen i `service-worker.js` (variabeln `NS_CACHE`) alltid bumpas för att tvinga fram en uppdatering hos klienterna.
- **Automatiska Pushar:** Varje gång vi slutfört en ändring och uppdaterat versionsnumren, ska du köra `git add .`, `git commit -m "beskrivning"` och `git push` för att pusha koden till GitHub, eftersom detta automatiskt triggar en deploy till live-miljön (notestream.se).
- **Firebase Deploy:** Om ändringar görs i Firebase-specifika konfigurationsfiler (som `database.rules.json` eller `firebase.json`) ska dessa dessutom deployas direkt till Firebase via `firebase deploy --only database` (eller motsvarande för funktioner).

## 4. Kodningsfilosofi & Felsökning
- **Helhetssyn:** Innan du fixar ett `ReferenceError` (t.ex. en saknad funktion), stanna upp och kontrollera om funktionen faktiskt *ska* finnas, eller om felet beror på att gammal kod ligger kvar efter en ombyggnation. Skriv inte blind kod för att lappa krascher utan att förstå kontexten.

## 5. Utseende ("Affisch")
- **Ett formspråk:** Spelvyn, startsidan, lobbyn och anslutningssidan ser likadana ut sedan v0.864–0.867. Nya eller ändrade delar ska följa samma formspråk: platta ytor, 4 px-hörn, Anton i versaler för rubriker, knappar och siffror, Archivo Narrow för text.
- **Knappar och rutor:** Helvit knapp är huvudvalet och vit kontur andravalet. Rutor över sidan är mörka (`#111216`) med 2 px vit ram.
- **Färger:** Lagfärgen används som fyllning (kort i spelet, lagblock i lobbyn), med textfärg från `teamColors` i `game-utils.js` och `inkOn` i `ny/lobby-page.js` (samma regel på båda ställena). Signalfärger: grön `#4CAF50` för klart, gul `#FBBC04` för varning, röd `#EA4335` för fel.
- **Var stilarna ligger:** `game.css` (spelet), `ny/ny.css` (startsida, lobby och anslutning) och `ny/dialog.css` (frågerutor på alla sidor). `styles.css` delas med de gamla sidorna och ändras inte för de nya.
- **Bildfiler:** När en bild byts ligger den gamla filen kvar i repot (`logga.png`, `icon.png`, `icon-maskable.png`, `favicon.png`). App-ikoner får nytt filnamn när de byts, eftersom Chrome räknar en ikon som oförändrad så länge manifestets ikonfält är detsamma.

## 6. Säkerhet
- **Publikt repo:** Repot är publikt och `docs/status.md` går att läsa på notestream.se. Öppna säkerhetsfynd beskrivs därför bara i `docs/sakerhet-lokal.md` (lokal fil, står i `.gitignore`), aldrig i `status.md`, commit-meddelanden eller PR-texter förrän de är åtgärdade.
- **Aldrig rå HTML från data:** Värden från databasen, från Spotify eller från sidans adress läggs aldrig in som rå HTML. Använd `textContent`, eller `escapeHtml` i `admin.html`. Spelets `escapeHtml` (`game-utils.js`) skyddar inte citattecken och får bara användas som elementtext, inte inuti ett attribut.
- **Spel utan inloggning:** Spelare loggar inte in. Allt under ett spel i databasen kan därför skrivas av den som har spel-id:t och ska behandlas som opålitligt.
