# Slutresultat med beslutsregeln – baseline

Beslutsregeln i functions/year-review.js körd mot de sparade svaren för 186 låtar. Inga nya API-anrop.
Webbsökning räknas för låtar där Opus ändrade året eller var osäker.

| Utfall | Låtar |
|---|---|
| Spotifys år behålls | 102 |
| Sökningens år gäller, med källa | 81 |
| Minnet och sökningen överens trots svagt stöd | 2 |
| Till granskning | 1 |
| Grova fel (mer än 2 år från facit) | 0 |

- Exakt rätt: 172
- Inom ±1 år: 184
- Webbsökningar som regeln kräver: 84 av 186

## Grova fel, låtar till granskning och låtar godtagna på samstämmighet (3)

| Artist | Titel | Facit | Spotify | Beslutat år | Källa | Status | Orsak |
|---|---|---|---|---|---|---|---|
| Mr. Probz | Nothing Really Matters - Afrojack Remix | 2015 | 2015 | 2015 | spotify | needsReview | weak_support |
| Bag Raiders | Shooting Stars | 2008 | 2011 | 2008 | opus | ok |  |
| AKI, Kapten Röd | När solen går ner | 2012 | 2012 | 2012 | spotify | ok |  |
