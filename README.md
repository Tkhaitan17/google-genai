# LegalLens AI - Professional Legal Document Analysis

AI-powered legal document analysis that breaks down complex contracts and agreements into plain English, helping you make informed decisions with confidence.

## ⚠️ Security Notice for Demo

**This repository includes API keys for hackathon demonstration and judging purposes only.**

- ✅ Keys are rate-limited and monitored
- ✅ Keys will be rotated immediately after the hackathon
- ❌ Do NOT use these keys in production
- ❌ Do NOT abuse the provided keys

**For production deployment, see the Security & Production section below.**

## 🚀 Features

- **Multi-Indian Language Support**: Analyzes documents in 10+ Indian languages (Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu)
- **20+ Document Types**: Automatically identifies document types (Rental, Loan, Employment, NDA, etc.)
- **AI-Powered Analysis**: Uses Google Gemini 2.0 Flash for intelligent document analysis
- **Risk Assessment**: Provides risk scores and identifies potential issues
- **Clause-by-Clause Review**: Interactive highlighting and detailed analysis
- **Intelligent Chatbot**: Voice-enabled Q&A with context-aware suggestions
- **Plain English Summaries**: Converts legal jargon into understandable language
- **Privacy-First**: Secure document processing with user consent
- **Dark Mode**: Full dark theme support

## 🛠️ Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/legallens-ai.git
cd legallens-ai
```

### 2. Configure API Keys

#### Option A: Using config.js (Recommended)
1. Copy the example configuration:
   ```bash
   cp config.example.js config.js
   ```

2. Edit `config.js` and add your API keys:
   ```javascript
   const CONFIG = {
       GEMINI_API_KEY: 'your_actual_gemini_api_key',
       GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
       FIREBASE: {
           apiKey: 'your_firebase_api_key',
           authDomain: 'your_project.firebaseapp.com',
           // ... other Firebase config
       }
   };
   ```

#### Option B: Using Environment Variables
1. Create a `.env` file:
   ```bash
   cp env.example .env
   ```

2. Add your API keys to `.env`:
   ```
   GEMINI_API_KEY=your_actual_gemini_api_key
   FIREBASE_API_KEY=your_firebase_api_key
   ```

### 3. Get API Keys

#### Google Gemini API
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your configuration

#### Firebase (Optional)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication and Firestore
4. Copy the configuration to your config file

### 4. Run the Application
```bash
# Using a local server (recommended)
python -m http.server 8000
# or
npx serve .
# or
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

## 🔐 Security

- **Never commit API keys** to version control
- **Use environment variables** for production
- **Rotate API keys** regularly
- **Monitor API usage** for unusual activity

## 📁 Project Structure

```
legallens-ai/
├── index.html          # Main HTML file
├── app.js             # Main JavaScript application
├── styles.css         # CSS styles
├── config.example.js  # Configuration template
├── env.example        # Environment variables template
├── .gitignore         # Git ignore file
└── README.md          # This file
```

## 🌍 Supported Languages

- English, Spanish, French, German, Italian, Portuguese
- Chinese, Japanese, Korean, Arabic, Hindi
- And more through AI detection

## 📄 Supported Document Types

- Rental/Housing Documents
- Loan and Credit Agreements
- Employment Documents
- Terms of Service/Privacy Policies
- Insurance Policies
- General Legal Documents

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues:
1. Check the console for errors
2. Verify your API keys are correct
3. Ensure you're using a local server (not file://)
4. Check the browser's network tab for API calls

## 🔄 Updates

- **v1.0.0**: Initial release with multi-language support
- **v1.1.0**: Added document type detection
- **v1.2.0**: Enhanced security and privacy features
- **v1.3.0**: Added intelligent chatbot with voice input
- **v1.4.0**: Added clause-by-clause review with highlighting

## 🔐 Security & Production Deployment

### Current Demo Architecture
```
Browser → Gemini API (direct call with client-side key)
```

**This is acceptable for:**
- ✅ Hackathon demonstrations
- ✅ Local development
- ✅ Proof of concept

**NOT recommended for:**
- ❌ Production deployment
- ❌ Public websites
- ❌ Commercial use

### Recommended Production Architecture
```
Browser → Backend API Proxy → Gemini API
         (Netlify Functions)   (key hidden on server)
```

### Production Implementation Steps

**1. Create Netlify Function:**
```javascript
// netlify/functions/analyze.js
exports.handler = async (event) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Server-side only
  
  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: event.body
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify(await response.json())
  };
};
```

**2. Update Frontend:**
```javascript
// Call your function instead of Gemini directly
const response = await fetch('/.netlify/functions/analyze', {
  method: 'POST',
  body: JSON.stringify({ document: base64Data })
});
```

**3. Set Environment Variables in Netlify:**
- Go to: Site Settings → Environment Variables
- Add: `GEMINI_API_KEY` = your_actual_key
- Deploy

### Additional Production Recommendations

1. **Rate Limiting**: Implement per-user request throttling
2. **API Key Rotation**: Regular key rotation schedule
3. **Monitoring**: Track API usage and costs
4. **Error Handling**: Graceful degradation for API failures
5. **Caching**: Cache common queries to reduce API calls
6. **Input Validation**: Strict file size and type validation
7. **CORS Configuration**: Restrict to your domain only

## 🏆 Hackathon Submission

This project was created for the Google AI Hackathon 2024.

**Key Highlights:**
- 🇮🇳 First legal AI tool with 10+ Indian language support
- 🎤 Voice-enabled chatbot for accessibility
- 🎨 Interactive clause highlighting
- 🌙 Full dark mode support
- 📊 20+ document types supported
- 🔒 Privacy-first design
