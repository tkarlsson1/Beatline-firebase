const fs = require('fs');
const path = require('path');

// 1. Skapa en fejkad miljö för att kunna ladda vår browser-kod i Node.js
global.window = {};
const validatorCode = fs.readFileSync(path.join(__dirname, 'validator.js'), 'utf8');
eval(validatorCode);

// 2. Hitta alla validation-results-filer
const dir = path.join(__dirname);
const files = fs.readdirSync(dir).filter(f => f.startsWith('validation-results') && f.endsWith('.json'));

console.log(`🔍 Hittade ${files.length} filer att uppdatera...`);

let totalTracks = 0;
let newGreen = 0;

// 3. Gå igenom varje fil
files.forEach(file => {
  const filePath = path.join(dir, file);
  const tracks = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  console.log(`\nBearbetar ${file} (${tracks.length} låtar)...`);
  totalTracks += tracks.length;

  // Spara undan ifall vissa låtar var manuellt verifierade innan
  // Vi nollställer previouslyVerified temporärt så vår nya logik får utvärdera dem
  const tracksToRevalidate = tracks.map(track => {
    return {
      ...track,
      _wasPreviouslyVerified: track.previouslyVerified, 
      previouslyVerified: false // Tvinga ny analys
    };
  });

  // 4. Kör den Nya logiken!
  const updatedTracks = window.validator.analyzeAndFlagTracks(tracksToRevalidate);

  // Återställ previouslyVerified för de som var det
  updatedTracks.forEach(track => {
    if (track._wasPreviouslyVerified) {
      track.previouslyVerified = true;
      track.status = 'green';
      track.flags = [];
    }
    
    if (track.status === 'green' && !track._wasPreviouslyVerified) {
      newGreen++;
    }
    delete track._wasPreviouslyVerified;
  });

  // 5. Spara över filen med de nya resultaten
  fs.writeFileSync(filePath, JSON.stringify(updatedTracks, null, 2));
  console.log(`✅ Uppdaterade ${file}`);
});

console.log(`\n🎉 Klart! Totalt ${totalTracks} låtar uppdaterade.`);
console.log(`🟢 Den nya logiken gav grönt ljus till ${newGreen} låtar som inte var manuellt godkända sedan tidigare!`);
