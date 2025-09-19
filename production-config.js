// Production configuration - This will be used in production
// Environment variables are injected by Netlify at build time

const PRODUCTION_CONFIG = {
    // Gemini API Configuration
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || window.GEMINI_API_KEY,
    GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    
    // Firebase Configuration
    FIREBASE: {
        apiKey: process.env.FIREBASE_API_KEY || window.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'legallens-ai-a2e96.firebaseapp.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'legallens-ai-a2e96',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'legallens-ai-a2e96.firebasestorage.app',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1076383855534',
        appId: process.env.FIREBASE_APP_ID || '1:1076383855534:web:c41f79be9c262536c54e3f'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PRODUCTION_CONFIG;
} else {
    window.PRODUCTION_CONFIG = PRODUCTION_CONFIG;
}
