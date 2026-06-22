const fs = require('fs');
const https = require('https');
const path = require('path');

const dir = path.join(__dirname);
const files = fs.readdirSync(dir).filter(f => f.startsWith('validation-results') && f.endsWith('.json'));

const updates = {};
let count = 0;

files.forEach(f => {
  const tracks = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  tracks.forEach(track => {
    // Endast uppdatera de som är godkända (gröna)
    if (track.status === 'green') {
      updates[track.spotifyId] = {
        artist: track.artist,
        title: track.title,
        year: String(track.recommendedYear || track.spotifyYear),
        verifiedBy: 'system-revalidation',
        verifiedAt: new Date().toISOString()
      };
      count++;
    }
  });
});

console.log(`🪄 Hittade ${count} gröna låtar över de ${files.length} lokala listorna.`);
console.log(`🚀 Pushar uppdateringar till Live-databasen (Firebase)...`);

const dataString = JSON.stringify(updates);

const options = {
  hostname: 'notestreamfire.europe-west1.firebasedatabase.app',
  port: 443,
  path: '/verifiedTracks.json',
  method: 'PATCH', // PATCH uppdaterar bara dessa nycklar, raderar inte befintliga
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(dataString)
  }
};

const req = https.request(options, (res) => {
  console.log(`\nSvar från Firebase: ${res.statusCode} ${res.statusCode === 200 ? '✅ SUCCESS' : '❌ ERROR'}`);
  let responseData = '';
  res.on('data', (d) => responseData += d);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`🎉 Firebase är nu uppdaterad med de senaste årtalen för ${count} låtar!`);
    } else {
      console.log(`Error data: ${responseData}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`Fel vid anslutning: ${e.message}`);
});

req.write(dataString);
req.end();
