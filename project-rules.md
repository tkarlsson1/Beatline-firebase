# Projektregler & Kontext: Beatline

Denna fil innehåller kritiska systemregler och kontext för AI-assistenter som arbetar i detta projekt. Läs alltid denna fil innan du gör större arkitektoniska förändringar eller påbörjar felsökning.

## 1. Lyssna på instruktioner
- **Pausa vid uppmaning:** Om användaren skriver "gör inget" eller "ändra ingen kod förrän jag säger till", så **måste** detta respekteras strikt. Agera enbart som rådgivare och presentera svar i text utan att göra några `write_to_file`, `replace_file_content` eller köra modifierande kommandon förrän ett uttryckligt godkännande ges.

## 2. AI-Modeller och Backend
- **OpenAI-modell:** Projektet använder **gpt-5.5** i Firebase-funktioner (t.ex. `getSongYearAi`). Ifrågasätt **inte** om denna modell existerar (den existerar och fungerar). Försök aldrig korrigera den till en äldre modell på grund av föråldrad träningsdata.
- **Endast AI för årssökning:** iTunes API har fasats ut som källa för att hämta årtal. Återskapa **aldrig** fallback-logik mot iTunes i klienten (t.ex. i `admin.html`), utan förlita dig uteslutande på AI-funktionerna via Firebase.

## 3. Deploy och Versionshantering
- **Versionsnummer i HTML:** Så fort vi gör *någon* förändring i kodbasen ska versionsnumret i `<title>`-taggen uppdateras i **både** `index.html` och `admin.html` samtidigt, oavsett vilken av filerna som redigerades. Detta är kritiskt för att användaren ska kunna verifiera att pushen gått igenom på båda ställena.
- **Service Worker Cache:** Vid ändringar i klientfiler ska cache-versionen i `service-worker.js` (variabeln `NS_CACHE`) alltid bumpas för att tvinga fram en uppdatering hos klienterna.

## 4. Kodningsfilosofi & Felsökning
- **Helhetssyn:** Innan du fixar ett `ReferenceError` (t.ex. en saknad funktion), stanna upp och kontrollera om funktionen faktiskt *ska* finnas, eller om felet beror på att gammal kod ligger kvar efter en ombyggnation. Skriv inte blind kod för att lappa krascher utan att förstå kontexten.
