// Firebase Configuration for Playlist Validator
// This uses the separate validator database

const validatorFirebaseConfig = {
  apiKey: "AIzaSyDGm96SD8eu0ge-r3kRJtyHa5OGhuD80zU",
  authDomain: "notestream-9b3ef.firebaseapp.com",
  databaseURL: "https://notestream-validator.europe-west1.firebasedatabase.app",
  projectId: "notestream-9b3ef",
  storageBucket: "notestream-9b3ef.firebasestorage.app",
  messagingSenderId: "773400257256",
  appId: "1:773400257256:web:c35d8ed8dfff54b52c9fa1"
};

// Firebase Configuration for Live Game Database
const liveFirebaseConfig = {
  apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
  authDomain: "beatlinefirebase.firebaseapp.com",
  databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
  projectId: "beatlinefirebase",
  storageBucket: "beatlinefirebase.firebasestorage.app",
  messagingSenderId: "196231817325",
  appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
};

// Initialize Firebase for validator
let validatorApp = null;
let validatorDb = null;
let liveApp = null;
let liveDb = null;

function initValidatorFirebase() {
  if (!window.firebase) {
    console.error('❌ Firebase SDK not loaded');
    return null;
  }

  try {
    // Check if already initialized
    if (validatorDb) {
      console.log('✅ Validator Firebase already initialized');
      return validatorDb;
    }
    
    // Initialize app with unique name
    validatorApp = firebase.initializeApp(validatorFirebaseConfig, 'validator');
    console.log('✅ Firebase app initialized:', validatorApp.name);
    
    // Get database instance
    validatorDb = validatorApp.database();
    console.log('✅ Database instance created:', typeof validatorDb);
    
    // Validate database instance
    if (!validatorDb || typeof validatorDb.ref !== 'function') {
      throw new Error('Database instance is invalid');
    }
    
    console.log('✅ Validator Firebase fully initialized');
    return validatorDb;
    
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    
    // Try to clean up if partially initialized
    if (validatorApp) {
      try {
        validatorApp.delete();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    validatorApp = null;
    validatorDb = null;
    
    return null;
  }
}

function initLiveFirebase() {
  if (!window.firebase) {
    console.error('❌ Firebase SDK not loaded');
    return null;
  }

  try {
    // Check if already initialized
    if (liveDb) {
      console.log('✅ Live Firebase already initialized');
      return liveDb;
    }
    
    // Initialize app with unique name
    liveApp = firebase.initializeApp(liveFirebaseConfig, 'live');
    console.log('✅ Live Firebase app initialized:', liveApp.name);
    
    // Get database instance
    liveDb = liveApp.database();
    console.log('✅ Live database instance created:', typeof liveDb);
    
    // Validate database instance
    if (!liveDb || typeof liveDb.ref !== 'function') {
      throw new Error('Live database instance is invalid');
    }
    
    console.log('✅ Live Firebase fully initialized');
    return liveDb;
    
  } catch (error) {
    console.error('❌ Live Firebase initialization error:', error);
    
    // Try to clean up if partially initialized
    if (liveApp) {
      try {
        liveApp.delete();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    liveApp = null;
    liveDb = null;
    
    return null;
  }
}

// Helper functions for validator database
const validatorFirebase = {
  ref: (path) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad - anropa initValidatorFirebase() först');
    }
    return validatorDb.ref(path);
  },
  
  set: async (path, data) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad');
    }
    const ref = validatorDb.ref(path);
    return ref.set(data);
  },
  
  get: async (path) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad');
    }
    const ref = validatorDb.ref(path);
    const snapshot = await ref.once('value');
    return snapshot.val();  // Return actual data, not DataSnapshot
  },
  
  update: async (path, updates) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad');
    }
    const ref = validatorDb.ref(path);
    return ref.update(updates);
  },
  
  push: async (path, data) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad');
    }
    const ref = validatorDb.ref(path);
    return ref.push(data);
  },
  
  remove: async (path) => {
    if (!validatorDb) {
      throw new Error('Firebase inte initialiserad');
    }
    const ref = validatorDb.ref(path);
    return ref.remove();
  }
};

// Helper functions for live game database
const liveFirebase = {
  ref: (path) => {
    if (!liveDb) {
      throw new Error('Live Firebase inte initialiserad - anropa initLiveFirebase() först');
    }
    return liveDb.ref(path);
  },
  
  set: async (path, data) => {
    if (!liveDb) {
      throw new Error('Live Firebase inte initialiserad');
    }
    const ref = liveDb.ref(path);
    return ref.set(data);
  },
  
  get: async (path) => {
    if (!liveDb) {
      throw new Error('Live Firebase inte initialiserad');
    }
    const ref = liveDb.ref(path);
    const snapshot = await ref.once('value');
    return snapshot.val();
  },
  
  update: async (path, updates) => {
    if (!liveDb) {
      throw new Error('Live Firebase inte initialiserad');
    }
    const ref = liveDb.ref(path);
    return ref.update(updates);
  },
  
  remove: async (path) => {
    if (!liveDb) {
      throw new Error('Live Firebase inte initialiserad');
    }
    const ref = liveDb.ref(path);
    return ref.remove();
  }
};

// Export for use in other modules
window.validatorFirebase = validatorFirebase;
window.liveFirebase = liveFirebase;
window.initValidatorFirebase = initValidatorFirebase;
window.initLiveFirebase = initLiveFirebase;
