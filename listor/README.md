# 🎵 Playlist Validator

Ett verktyg för att verifiera årtal i Spotify-spellistor genom att validera mot MusicBrainz-databasen.

## 📋 Översikt

Spotify API returnerar ofta fel årtal för låtar - särskilt för låtar som finns på samlingsalbum, remasters eller greatest hits-album. Exempelvis kan en 1985-låt som finns på ett 2010 samlingsalbum rapporteras som från 2010.

Detta verktyg löser problemet genom att:
1. Hämta spellista från Spotify
2. Validera varje låt mot MusicBrainz (världens största öppna musikdatabas)
3. Flagga suspekta årtal automatiskt
4. Låta dig granska och korrigera manuellt
5. Exportera verifierad spellista

## 🚀 Användning

### 1. Öppna verktyget
```
https://notestream.se/test/listor/
```

### 2. Klistra in Spotify Playlist URL
Format som stöds:
- `https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe`
- `spotify:playlist:37i9dQZF1DX4UtSsGT1Sbe`
- `37i9dQZF1DX4UtSsGT1Sbe` (bara ID:t)

### 3. Vänta på validering
- Verktyget hämtar alla låtar från Spotify
- Validerar varje låt mot MusicBrainz (1 request/sekund - MusicBrainz rate limit)
- För 50 låtar tar det ~50 sekunder

### 4. Granska flaggade låtar

Verktyget flaggar automatiskt låtar med potentiella problem:

**🔴 RÖDA (Måste granskas):**
- Spotify år > MusicBrainz år med >10 års skillnad
- Spotify år < MusicBrainz år (suspekt datafel)

**🟡 GULA (Bör granskas):**
- Flera artister (feat./ft./&) - kan vara modern version
- Remix/Remaster/Live i titeln
- Från samlingsalbum
- Osäker match i MusicBrainz
- Mindre årsskillnader (2-10 år)

**🟢 GRÖNA (Inga problem):**
- Exakt match mellan Spotify och MusicBrainz
- Eller bara liten avvikelse

### 5. Korrigera årtal

För varje flaggad låt:
- **Dropdown:** Välj mellan Spotify-år, MusicBrainz-år eller anpassat
- **🎵 Knapp:** Lyssna på 30-sekunders preview (om tillgänglig)
- **✓ Godkänn:** Spara valt årtal
- **✗ Ta bort:** Ta bort låt från spellistan

Tips:
- Använd "Auto-godkänn gröna" för att snabbt godkänna alla låtar utan problem
- Filtrera på "Flaggade" eller "Röda" för att fokusera på problemlåtar

### 6. Exportera

När alla låtar är verifierade:
- **📄 Ladda ner JSON-fil:** Spara lokalt som backup
- **🔥 Spara till Firebase:** Spara direkt till validator-databasen

## 🔍 Hur validering fungerar

### Steg 1: ISRC-sökning (mest exakt)
Varje inspelning har en unik ISRC-kod (International Standard Recording Code). Om den finns:
```
ISRC: USUYG1234567 → MusicBrainz recording → Tidigaste release-datum
```

### Steg 2: Artist + Titel-sökning (fallback)
Om ingen ISRC eller ingen match:
```
Artist: "a-ha"
Title: "Take On Me"
→ MusicBrainz search → String similarity matching → Tidigaste release-datum
```

### Steg 3: Automatisk flaggning
Baserat på:
- Årtalsskillnader
- Artistnamn (feat./remix)
- Albumtyp (compilation)
- Match-confidence

## 📊 Flaggor & Severity

| Flagga | Severity | Beskrivning |
|--------|----------|-------------|
| `multiple_artists` | ⚠️ Warning | Flera artister - kan vara modern feature |
| `modified_version` | ⚠️ Warning | Remix/Remaster/Live i titel |
| `compilation` | ℹ️ Info | Från samlingsalbum |
| `year_mismatch_newer` | ❌ Error (>10 år) / ⚠️ Warning | Spotify nyare än MusicBrainz |
| `suspicious_year` | ❌ Error | Spotify äldre än MusicBrainz (troligt fel) |
| `no_match` | ⚠️ Warning | Ingen match i MusicBrainz |
| `low_confidence` | ⚠️ Warning | Osäker match (similarity score <0.7) |
| `no_isrc` | ℹ️ Info | Ingen ISRC-kod tillgänglig |
| `old_on_compilation` | ⚠️ Warning | Gammal låt (<1990) på samlingsalbum |

## 🗄️ Export-format

### JSON-fil
```json
{
  "name": "80s Hits (Verified)",
  "spotifyUrl": "https://open.spotify.com/playlist/...",
  "verifiedAt": "2024-11-20T15:30:00.000Z",
  "verifiedBy": "admin",
  "isStandardPlaylist": true,
  "totalTracks": 48,
  "songs": [
    {
      "spotifyId": "2WfaOiMkCvy7F5fcp2zZ8L",
      "title": "Take On Me",
      "artist": "a-ha",
      "year": 1985
    }
  ],
  "_metadata": {
    "originalTrackCount": 50,
    "removedTracks": 2,
    "validationStats": { ... }
  }
}
```

### Firebase-struktur
```
notestream-validator (database)
└── verifiedPlaylists/
    └── playlist_1732115400123/
        ├── name: "80s Hits (Verified)"
        ├── spotifyUrl: "https://..."
        ├── verifiedAt: 1732115400123
        ├── verifiedBy: "admin"
        ├── isStandardPlaylist: true
        └── songs: [ ... ]
```

## 🔧 Teknisk info

### API:er som används

**Spotify API:**
- Backend token service (ingen user auth krävs)
- Endpoint: `GET /v1/playlists/{id}`
- Data: title, artist, year, ISRC, preview URL

**MusicBrainz API:**
- Rate limit: 1 request/sekund (enligt MusicBrainz guidelines)
- Endpoints:
  - `GET /ws/2/recording?query=isrc:{isrc}`
  - `GET /ws/2/recording?query=artist:"{artist}" AND recording:"{title}"`
- Data: recording ID, tidigaste release-datum, artist, title

### Firebase
- Databas: `notestream-validator.europe-west1.firebasedatabase.app`
- Namespace: Helt separerad från live-spelet
- Struktur: `verifiedPlaylists/{playlistId}`

### Dependencies
- Firebase SDK 9.22.0 (compat mode)
- Inga andra externa libraries

### Filstruktur
```
root/test/listor/
├── index.html          # Main page
├── firebase-config.js  # Firebase init för validator-DB
├── spotify-helper.js   # Spotify API wrapper
├── musicbrainz.js      # MusicBrainz API + rate limiting
├── validator.js        # Core validation logic
├── ui.js               # UI rendering & events
├── styles.css          # Styling
└── README.md           # This file
```

## 📝 Exempel-workflow

### Scenario: 80s playlist med remasters

1. **Input:** `https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe`

2. **Laddar:** 50 låtar från Spotify
   - "Take On Me" - a-ha (2015) ← Remastered album
   - "Bad Moon Rising" - DJ Snake feat. John Fogerty (2025) ← Modern version

3. **Validerar:** 50 requests till MusicBrainz (~50 sekunder)
   - "Take On Me": ISRC match → Original 1985
   - "Bad Moon Rising": ISRC match → Recording från 2025

4. **Flaggar:**
   - 🟡 "Take On Me": Compilation + Year mismatch (2015 vs 1985)
   - 🔴 "Bad Moon Rising": Multiple artists + Year mismatch (2025 vs 1969)

5. **Granska:**
   - "Take On Me": Välj 1985 (original) → ✓ Godkänn
   - "Bad Moon Rising": Det ÄR en 2025-inspelning → Välj 2025 → ✓ Godkänn
   - (Alternativt: ✗ Ta bort om du bara vill ha originalet)

6. **Exportera:** 50 verifierade låtar med korrekta årtal

## ⚠️ Kända begränsningar

1. **MusicBrainz täckning:** Inte alla låtar finns i MusicBrainz (särskilt mycket nya eller obskyra låtar)
2. **ISRC-kod:** Inte alla Spotify-låtar har ISRC-kod exponerad i API:n
3. **Rate limiting:** 1 request/sekund gör att stora playlists (>100 låtar) tar lång tid
4. **Preview URL:** Inte alla låtar har 30-sekunders preview tillgänglig
5. **String matching:** Fallback-sökning kan ge fel match om artist/titel är väldigt generiskt

## 🎯 Best practices

### För bästa resultat:
- ✅ Använd Spotify-officiella playlists (de är ofta mer accurate)
- ✅ Granska ALLA röda låtar manuellt
- ✅ Lyssna på preview om osäker
- ✅ Verifiera "feat."-låtar noga (ofta moderna versioner)

### Undvik:
- ❌ Stora playlists med >200 låtar (tar >3 minuter)
- ❌ Auto-godkänna allt utan att kolla
- ❌ Använda user-genererade playlists med många remix/live-versioner

## 🐛 Troubleshooting

### "Ogiltig Spotify URL"
- Kontrollera att URL:en är en **playlist**-URL (inte album eller track)
- Format: `https://open.spotify.com/playlist/...`

### "Misslyckades att ladda spellista"
- Playlist kan vara privat
- Spotify API kan vara nere
- Kontrollera browser console för mer detaljer

### "Ingen match i MusicBrainz"
- Låten kanske inte finns i MusicBrainz-databasen
- Försök manuell sökning på https://musicbrainz.org
- Använd Spotify-året som fallback

### Validering går långsamt
- Detta är normalt! MusicBrainz rate limit är 1 request/sekund
- För 50 låtar = ~50 sekunder
- Ha tålamod eller filtrera bort låtar i Spotify först

### Firebase-fel
- Kontrollera att validator-databasen är korrekt konfigurerad
- Kolla Firebase Console för error logs
- Verifiera security rules tillåter write

## 📞 Support

- GitHub Issues: [länk till repo]
- Email: [din email]

## 📜 License

MIT License - Free to use and modify

---

**Version:** 1.0  
**Senast uppdaterad:** 2024-11-21  
**Skapad av:** NOTESTREAM Team
