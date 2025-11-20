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

// Initialize Firebase for validator
let validatorApp = null;
let validatorDb = null;

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
    return ref.once('value');
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

// Export for use in other modules
window.validatorFirebase = validatorFirebase;
window.initValidatorFirebase = initValidatorFirebase;
