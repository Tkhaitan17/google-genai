# LegalLens AI - Professional Legal Document Analysis

AI-powered legal document analysis that breaks down complex contracts and agreements into plain English, helping you make informed decisions with confidence.

## 🚀 Features

- **Multi-Language Support**: Analyzes documents in 12+ languages
- **Document Type Detection**: Automatically identifies document types (Rental, Loan, Employment, etc.)
- **AI-Powered Analysis**: Uses Google Gemini AI for intelligent document analysis
- **Risk Assessment**: Provides risk scores and identifies potential issues
- **Plain English Summaries**: Converts legal jargon into understandable language
- **Privacy-First**: Secure document processing with user consent

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

## 🚀 Deployment

### GitHub Pages
1. Push your code to GitHub
2. Go to repository Settings > Pages
3. Select source branch
4. Your app will be available at `https://yourusername.github.io/legallens-ai`

### Netlify
1. Connect your GitHub repository
2. Set build command: `echo "No build required"`
3. Set publish directory: `.`
4. Add environment variables in Netlify dashboard

### Vercel
1. Import your GitHub repository
2. Set framework: Other
3. Add environment variables
4. Deploy

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

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
