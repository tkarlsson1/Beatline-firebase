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
let validatorDb = null;

function initValidatorFirebase() {
  if (!window.firebase) {
    console.error('Firebase not loaded');
    return null;
  }

  try {
    // Initialize app with unique name
    const validatorApp = firebase.initializeApp(validatorFirebaseConfig, 'validator');
    validatorDb = firebase.database(validatorApp);
    
    console.log('✅ Validator Firebase initialized');
    return validatorDb;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
}

// Helper functions for validator database
const validatorFirebase = {
  ref: (path) => validatorDb.ref(path),
  
  set: async (path, data) => {
    const ref = validatorDb.ref(path);
    return ref.set(data);
  },
  
  get: async (path) => {
    const ref = validatorDb.ref(path);
    return ref.once('value');
  },
  
  update: async (path, updates) => {
    const ref = validatorDb.ref(path);
    return ref.update(updates);
  },
  
  push: async (path, data) => {
    const ref = validatorDb.ref(path);
    return ref.push(data);
  },
  
  remove: async (path) => {
    const ref = validatorDb.ref(path);
    return ref.remove();
  }
};

// Export for use in other modules
window.validatorFirebase = validatorFirebase;
window.initValidatorFirebase = initValidatorFirebase;
