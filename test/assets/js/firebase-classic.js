
if (!window.ns) window.ns = {};

// Extracted from legacy script.js into firebase-classic.js
const feedbackRef = window.firebaseRef(window.firebaseDb, 'feedback');
    window.firebasePush(feedbackRef, { text: feedbackText, timestamp: Date.now() })
      const userRef = window.firebaseRef(window.firebaseDb, 'userPlaylists/' + userId);
      window.firebaseOnValue(userRef, (snap) => {
          const refToList = window.firebaseRef(window.firebaseDb, 'userPlaylists/' + userId + '/' + name);
          await window.firebaseSet(refToList, null); // delete node
