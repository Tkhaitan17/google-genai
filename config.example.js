// Configuration example file
// Copy this to config.js and fill in your actual values
// Never commit config.js to version control

const CONFIG = {
    // Gemini API Configuration
    GEMINI_API_KEY: 'your_gemini_api_key_here',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    
    // Firebase Configuration
    FIREBASE: {
        apiKey: 'your_firebase_api_key_here',
        authDomain: 'your_project.firebaseapp.com',
        projectId: 'your_project_id',
        storageBucket: 'your_project.appspot.com',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef123456',
        measurementId: 'G-XXXXXXXXXX'
    },
    
    // App Configuration
    APP: {
        name: 'LegalLens AI',
        version: '1.0.0',
        environment: 'development' // development, staging, production
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
