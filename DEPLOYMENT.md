# Deployment Guide for LegalLens AI

## 🚀 Quick Deployment Options

### 1. GitHub Pages (Free)

**Steps:**
1. Push your code to GitHub repository
2. Go to repository Settings > Pages
3. Select "Deploy from a branch"
4. Choose "main" branch and "/ (root)" folder
5. Click "Save"
6. Your app will be live at: `https://yourusername.github.io/repository-name`

**Important:** 
- Make sure to create `config.js` with your API keys
- Never commit `config.js` to GitHub (it's in .gitignore)
- Use environment variables for production

### 2. Netlify (Recommended)

**Steps:**
1. Go to [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Set build settings:
   - Build command: `echo "No build required"`
   - Publish directory: `.`
5. Click "Deploy site"
6. Go to Site settings > Environment variables
7. Add your API keys:
   - `GEMINI_API_KEY`: your_gemini_api_key
   - `FIREBASE_API_KEY`: your_firebase_api_key
   - etc.

**Custom Domain:**
- Go to Domain settings
- Add your custom domain
- Update DNS records as instructed

### 3. Vercel

**Steps:**
1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Set framework: "Other"
4. Add environment variables in project settings
5. Deploy

### 4. Firebase Hosting

**Steps:**
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Init: `firebase init hosting`
4. Deploy: `firebase deploy`

## 🔐 Environment Variables Setup

### For Production (Netlify/Vercel):

```bash
# Gemini API
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent

# Firebase (if using)
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef123456
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### For Local Development:

Create `config.js` from `config.example.js`:
```javascript
const CONFIG = {
    GEMINI_API_KEY: 'your_gemini_api_key_here',
    GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    FIREBASE: {
        apiKey: 'your_firebase_api_key_here',
        authDomain: 'your_project.firebaseapp.com',
        projectId: 'your_project_id',
        storageBucket: 'your_project.appspot.com',
        messagingSenderId: '123456789',
        appId: '1:123456789:web:abcdef123456',
        measurementId: 'G-XXXXXXXXXX'
    }
};
```

## 🛡️ Security Checklist

- [ ] API keys are not committed to version control
- [ ] Environment variables are set in production
- [ ] `.gitignore` includes sensitive files
- [ ] API keys are rotated regularly
- [ ] HTTPS is enabled in production
- [ ] CORS is properly configured

## 📊 Monitoring

### API Usage Monitoring:
- Monitor Gemini API usage in Google Cloud Console
- Set up billing alerts
- Track API costs

### Application Monitoring:
- Use browser developer tools
- Monitor console errors
- Track user analytics

## 🔄 Updates and Maintenance

### Updating API Keys:
1. Update environment variables in hosting platform
2. Test the application
3. Monitor for any issues

### Code Updates:
1. Push changes to GitHub
2. Platform will auto-deploy (if configured)
3. Test the live application

## 🆘 Troubleshooting

### Common Issues:

**1. API Key Not Working:**
- Check if key is correctly set in environment variables
- Verify key has proper permissions
- Check API quota limits

**2. CORS Errors:**
- Ensure you're using HTTPS in production
- Check if API allows your domain

**3. Firebase Not Working:**
- Verify Firebase configuration
- Check if services are enabled
- Verify domain is authorized

**4. File Upload Issues:**
- Check file size limits
- Verify file type restrictions
- Check browser console for errors

### Debug Steps:
1. Check browser console for errors
2. Verify network requests in DevTools
3. Test API keys independently
4. Check hosting platform logs

## 📈 Performance Optimization

### For Production:
- Enable gzip compression
- Use CDN for static assets
- Optimize images
- Minify CSS/JS files
- Enable browser caching

### Monitoring:
- Use Google PageSpeed Insights
- Monitor Core Web Vitals
- Track loading times
- Monitor API response times
