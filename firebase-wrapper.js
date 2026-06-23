// ============================================
// FIREBASE-WRAPPER.JS
// Lightweight Firebase initialization for non-module pages
// Exposes Firebase globally for lobby.html, join.html, game.html
// ============================================

(function() {
  'use strict';
  
  console.log('[Firebase Wrapper] Initializing...');
  
  // ============================================
  // FIREBASE CONFIGURATION
  // ============================================
  const firebaseConfig = {
    apiKey: "AIzaSyAfv4yGrI7Vj5PaX0A_XFRn0P4U--S9tFA",
    authDomain: "beatlinefirebase.firebaseapp.com",
    databaseURL: "https://notestreamfire.europe-west1.firebasedatabase.app",
    projectId: "beatlinefirebase",
    storageBucket: "beatlinefirebase.firebasestorage.app",
    messagingSenderId: "196231817325",
    appId: "1:196231817325:web:d5603a36a9c2c5f247f764"
  };
  
  // ============================================
  // CHECK IF FIREBASE IS ALREADY LOADED
  // ============================================
  if (typeof firebase === 'undefined') {
    console.error('[Firebase Wrapper] Firebase SDK not loaded! Make sure to load Firebase compat scripts before this file.');
    return;
  }
  
  // ============================================
  // INITIALIZE FIREBASE
  // ============================================
  try {
    // Check if already initialized (avoid double initialization)
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      console.log('[Firebase Wrapper] Firebase initialized successfully');
    } else {
      console.log('[Firebase Wrapper] Firebase already initialized');
    }
  } catch (error) {
    console.error('[Firebase Wrapper] Error initializing Firebase:', error);
    return;
  }
  
  // ============================================
  // GET FIREBASE SERVICES
  // ============================================
  const database = firebase.database();
  const auth = firebase.auth();
  
  console.log('[Firebase Wrapper] Firebase services ready');
  
  // ============================================
  // EXPOSE FIREBASE GLOBALLY
  // Matching modular SDK signatures for compatibility
  // ============================================
  
  // Database instance
  window.firebaseDb = database;
  
  // Auth instance
  window.auth = auth;
  
  // Database functions - wrapped to match modular SDK signatures
  // Modular SDK: ref(database, path)
  // Compat SDK: database.ref(path)
  window.firebaseRef = function(db, path) {
    // If only one argument (path), use default database
    if (typeof db === 'string') {
      return database.ref(db);
    }
    return db.ref(path);
  };
  
  // Modular SDK: set(ref, value)
  // Compat SDK: ref.set(value)
  window.firebaseSet = function(ref, value) {
    return ref.set(value);
  };
  
  // Modular SDK: update(ref, values)
  // Compat SDK: ref.update(values)
  window.firebaseUpdate = function(ref, values) {
    return ref.update(values);
  };
  
  // Modular SDK: remove(ref)
  // Compat SDK: ref.remove()
  window.firebaseRemove = function(ref) {
    return ref.remove();
  };
  
  // Modular SDK: onValue(ref, callback, options)
  // Compat SDK: ref.on('value', callback) or ref.once('value')
  window.firebaseOnValue = function(ref, callback, options) {
    if (options && options.onlyOnce) {
      // One-time read
      ref.once('value', callback);
    } else {
      // Continuous listener
      ref.on('value', callback);
    }
    // Return unsubscribe function
    return () => ref.off('value', callback);
  };
  
  // Modular SDK: push(ref, value)
  // Compat SDK: ref.push(value)
  window.firebasePush = function(ref, value) {
    return ref.push(value);
  };
  
  // Modular SDK: get(ref)
  // Compat SDK: ref.once('value')
  window.firebaseGet = function(ref) {
    return ref.once('value');
  };
  
  console.log('[Firebase Wrapper] Global Firebase functions exposed:');
  console.log('  - window.firebaseDb (database instance)');
  console.log('  - window.auth (auth instance)');
  console.log('  - window.firebaseRef(db, path) (ref function)');
  console.log('  - window.firebaseSet(ref, value) (set function)');
  console.log('  - window.firebaseUpdate(ref, values) (update function)');
  console.log('  - window.firebaseRemove(ref) (remove function)');
  console.log('  - window.firebaseOnValue(ref, callback, options) (onValue function)');
  console.log('  - window.firebasePush(ref, value) (push function)');
  console.log('  - window.firebaseGet(ref) (get function)');
  
  // ============================================
  // READY EVENT
  // ============================================
  
  // Dispatch custom event when Firebase is ready
  window.dispatchEvent(new Event('firebaseReady'));
  console.log('[Firebase Wrapper] firebaseReady event dispatched');
  
  // Set flag for other scripts to check
  window.firebaseInitialized = true;
  
  console.log('[Firebase Wrapper] Initialization complete ✓');
  
})();
