// Firebase configuration
// TODO: Replace with your actual Firebase config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyC0jsMw-eaxauMYLvjdzn-mc0_vUPzwnOo",
    authDomain: "legallens-ai-a2e96.firebaseapp.com",
    projectId: "legallens-ai-a2e96",
    storageBucket: "legallens-ai-a2e96.firebasestorage.app",
    messagingSenderId: "1076383855534",
    appId: "1:1076383855534:web:c41f79be9c262536c54e3f"
  };

// Initialize Firebase with error handling
let firebaseApp, firebaseAuth, firebaseStorage, firebaseDB;

try {
    if (typeof firebase !== 'undefined') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseAuth = firebase.auth();
        firebaseStorage = firebase.storage();
        firebaseDB = firebase.firestore();
        
        // Export for use in other files
        window.firebaseApp = firebaseApp;
        window.firebaseAuth = firebaseAuth;
        window.firebaseStorage = firebaseStorage;
        window.firebaseDB = firebaseDB;
        
        console.log('Firebase initialized successfully');
    } else {
        console.log('Firebase not loaded - running in demo mode');
    }
} catch (error) {
    console.log('Firebase initialization failed:', error);
    console.log('Running in demo mode without Firebase features');
}
