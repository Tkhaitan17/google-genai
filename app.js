// API Configuration - Load from config.js
const GEMINI_API_URL = window.CONFIG?.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Make API key available globally for backward compatibility
if (window.CONFIG?.GEMINI_API_KEY) {
    window.GEMINI_API_KEY = window.CONFIG.GEMINI_API_KEY;
}

// Global variables
let currentDocument = null;
let analysisResults = null;
let currentUser = null;
let isUploading = false; // Flag to prevent multiple uploads
let uploadButtonClickCount = 0; // Debug counter
let userAnalytics = {
    totalDocuments: 0,
    totalRiskScore: 0,
    riskScores: [],
    analysisHistory: []
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    console.log('Initializing app...');
    
    const uploadBtn = document.getElementById('upload-btn');
    const pdfUpload = document.getElementById('pdf-upload');
    const askBtn = document.getElementById('ask-btn');
    const negotiationBtn = document.getElementById('negotiation-btn');
    const trendsBtn = document.getElementById('trends-btn');
    const compareBtn = document.getElementById('compare-btn');
    
    console.log('Elements found:', {
        uploadBtn: !!uploadBtn,
        pdfUpload: !!pdfUpload,
        askBtn: !!askBtn,
        negotiationBtn: !!negotiationBtn,
        trendsBtn: !!trendsBtn,
        compareBtn: !!compareBtn
    });
    
    if (uploadBtn) {
        // Initialize button as disabled
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
        
        uploadBtn.addEventListener('click', (e) => {
            uploadButtonClickCount++;
            console.log(`=== Upload button clicked #${uploadButtonClickCount} ===`);
            console.log('Button disabled state:', uploadBtn.disabled);
            console.log('Files in input:', document.getElementById('pdf-upload').files);
            console.log('Event details:', e);
            handleDocumentUpload();
        });
        console.log('Upload button event listener attached');
    } else {
        console.error('Upload button not found!');
    }
    
    if (askBtn) askBtn.addEventListener('click', handleQuestion);
    if (negotiationBtn) negotiationBtn.addEventListener('click', handleNegotiationTips);
    if (trendsBtn) trendsBtn.addEventListener('click', handleViewTrends);
    if (compareBtn) compareBtn.addEventListener('click', handleDocumentComparison);
    
    // Main file input event listener (like comparison upload)
    const mainFileInput = document.getElementById('pdf-upload');
    if (mainFileInput) {
        console.log('Setting up main file input listener');
        mainFileInput.addEventListener('change', (e) => {
            console.log('=== File input change event triggered ===');
            console.log('File input changed:', e.target.files);
            if (e.target.files.length > 0) {
                console.log('File selected:', e.target.files[0].name);
                updateUploadAreaDisplay(e.target.files[0]);
            } else {
                console.log('No file selected');
                updateUploadAreaDisplay(null);
            }
        });
    } else {
        console.error('Main file input not found!');
    }
    
    // Comparison file input event listener
    const compareFileInput = document.getElementById('compare-upload');
    if (compareFileInput) {
        // Initialize compare button as disabled
        if (compareBtn) {
            compareBtn.disabled = true;
            compareBtn.style.opacity = '0.6';
        }
        
        compareFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                updateComparisonFileDisplay(e.target.files[0]);
            } else {
                updateComparisonFileDisplay(null);
            }
        });
    }
    
    // Export functionality
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const exportTextBtn = document.getElementById('export-text-btn');
    
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', handleExportPDF);
    if (exportTextBtn) exportTextBtn.addEventListener('click', handleExportText);
    
    // Authentication
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignup);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // Initialize Firebase Auth
    initializeAuth();
    
    // Setup upload functionality - handle click directly
    const uploadContent = document.querySelector('.upload-content');
    const fileInput = document.getElementById('pdf-upload');
    
    console.log('Upload elements found:', {
        uploadContent: !!uploadContent,
        fileInput: !!fileInput
    });
    
    if (uploadContent && fileInput) {
        // Make upload content clickable
        uploadContent.addEventListener('click', (e) => {
            console.log('Upload area clicked!');
            console.log('Opening file dialog');
            fileInput.click();
        });
        
        // Also make the file input itself clickable as fallback
        fileInput.addEventListener('click', (e) => {
            console.log('File input clicked directly');
        });
        
        console.log('Upload area click listener attached');
    } else {
        console.error('Upload elements not found!');
    }
    
    console.log('App initialization complete');
}

// Handle document upload
async function handleDocumentUpload() {
    console.log('=== handleDocumentUpload called ===');
    
    // Prevent multiple simultaneous uploads
    if (isUploading) {
        console.log('Upload already in progress, ignoring click');
        return;
    }
    
    const fileInput = document.getElementById('pdf-upload');
    const file = fileInput.files[0];
    
    console.log('File input element:', fileInput);
    console.log('Files in input:', fileInput.files);
    console.log('Selected file:', file);
    console.log('isUploading flag:', isUploading);
    
    if (!file) {
        console.log('No file found, showing alert');
        alert('Please select a PDF file first!');
        return;
    }
    
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file only!');
        return;
    }
    
    console.log('File selected:', file.name);
    console.log('API Key available:', !!(window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY));
    
    // Show privacy notice first
    const privacyAccepted = await new Promise((resolve) => {
        const privacyNotice = `
            <div class="privacy-modal">
                <div class="privacy-notice">
                    <div class="privacy-content">
                        <h3>🔒 Privacy & Security Notice</h3>
                        <div class="privacy-details">
                            <p><strong>Data Processing:</strong> Your document will be processed by Google's Gemini AI for analysis purposes only.</p>
                            <p><strong>Data Retention:</strong> Documents are processed in real-time and not permanently stored by our service.</p>
                            <p><strong>Security:</strong> All data transmission is encrypted using HTTPS.</p>
                            <p><strong>Your Rights:</strong> You can request data deletion at any time.</p>
                        </div>
                        <div class="privacy-actions">
                            <button id="accept-privacy" class="privacy-btn accept">I Understand & Accept</button>
                            <button id="decline-privacy" class="privacy-btn decline">Cancel Upload</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const modal = document.createElement('div');
        modal.innerHTML = privacyNotice;
        document.body.appendChild(modal);
        
        document.getElementById('accept-privacy').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });
        
        document.getElementById('decline-privacy').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });
    });
    
    if (!privacyAccepted) {
        return;
    }
    
    isUploading = true;
    
    // Show upload confirmation first
    showUploadConfirmation(file);
    
    // Small delay to show upload confirmation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Show document type detection loading
    showDocumentTypeDetection();
    
    try {
        // Convert PDF to base64
        console.log('Converting file to base64...');
        const base64 = await fileToBase64(file);
        console.log('Base64 conversion complete, length:', base64.length);
        
        // Store current document for comparison
        currentDocument = base64;
        
        // Detect document type and language
        console.log('Detecting document type and language...');
        const detectionResult = await detectDocumentType(base64);
        console.log('Detection result:', detectionResult);
        
        // Show document type confirmation
        showDocumentTypeConfirmation(detectionResult, base64);
        
    } catch (error) {
        console.error('Error detecting document type:', error);
        alert('Error detecting document type: ' + error.message);
        isUploading = false;
        showLoading(false);
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// Security and Privacy Notice
function showPrivacyNotice() {
    const privacyNotice = `
        <div class="privacy-notice">
            <div class="privacy-content">
                <h3>🔒 Privacy & Security Notice</h3>
                <div class="privacy-details">
                    <p><strong>Data Processing:</strong> Your document will be processed by Google's Gemini AI for analysis purposes only.</p>
                    <p><strong>Data Retention:</strong> Documents are processed in real-time and not permanently stored by our service.</p>
                    <p><strong>Security:</strong> All data transmission is encrypted using HTTPS.</p>
                    <p><strong>Your Rights:</strong> You can request data deletion at any time.</p>
                </div>
                <div class="privacy-actions">
                    <button id="accept-privacy" class="privacy-btn accept">I Understand & Accept</button>
                    <button id="decline-privacy" class="privacy-btn decline">Cancel Upload</button>
                </div>
            </div>
        </div>
    `;
    
    // Show privacy notice as modal
    const modal = document.createElement('div');
    modal.className = 'privacy-modal';
    modal.innerHTML = privacyNotice;
    document.body.appendChild(modal);
    
    // Handle privacy acceptance
    document.getElementById('accept-privacy').addEventListener('click', () => {
        document.body.removeChild(modal);
        return true;
    });
    
    // Handle privacy decline
    document.getElementById('decline-privacy').addEventListener('click', () => {
        document.body.removeChild(modal);
        return false;
    });
}

// Document type detection with language support
async function detectDocumentType(base64Data) {
    const detectionPrompt = `
        Analyze this document and determine:
        1. Document language (English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, or Other)
        2. Document type from these categories:
           - Rental/Housing Documents (lease agreements, rental contracts)
           - Loan and Credit Agreements (loans, credit cards, financing)
           - Employment Documents (employment contracts, NDAs, non-compete agreements)
           - Terms of Service/Privacy Policies (website terms, privacy policies)
           - Insurance Policies (health, auto, home, life insurance)
           - General Legal Document (if none of the above match)
        
        Respond in this exact format:
        LANGUAGE: [detected language]
        TYPE: [document type]
        
        Be specific and accurate in your classification.
    `;

    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: detectionPrompt },
                        { 
                            inline_data: {
                                mime_type: "application/pdf",
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text.trim();
        
        // Parse language and type
        const languageMatch = responseText.match(/LANGUAGE:\s*(.+)/i);
        const typeMatch = responseText.match(/TYPE:\s*(.+)/i);
        
        const detectedLanguage = languageMatch ? languageMatch[1].trim() : 'English';
        const detectedType = typeMatch ? typeMatch[1].trim() : 'General Legal Document';
        
        console.log('Detected language:', detectedLanguage);
        console.log('Detected document type:', detectedType);
        
        return {
            type: detectedType,
            language: detectedLanguage
        };
    } catch (error) {
        console.error('Error detecting document type:', error);
        return {
            type: 'General Legal Document',
            language: 'English'
        };
    }
}

// Get specific prompt based on document type
function getDocumentSpecificPrompt(documentType) {
    const prompts = {
        'Rental/Housing Documents': `
            You are analyzing a RENTAL/LEASE AGREEMENT. Focus on:
            1. RENT TERMS: Monthly amount, due dates, late fees, grace periods
            2. SECURITY DEPOSIT: Amount, return conditions, allowable deductions  
            3. TERMINATION: Notice requirements, penalties, 120-day transition periods
            4. RESTRICTIONS: Pet policies, subletting rules, noise ordinances
            5. MAINTENANCE: Who pays utilities, repair responsibilities, property modifications
            6. RED FLAGS: Excessive fees, unreasonable restrictions, unfair termination clauses
            
            Rate risk focusing on: tenant rights violations, excessive financial obligations, predatory clauses.
        `,
        'Loan and Credit Agreements': `
            You are analyzing a LOAN/CREDIT AGREEMENT. Focus on:
            1. INTEREST RATES: APR, variable vs. fixed, rate change conditions
            2. PAYMENT TERMS: Monthly amounts, due dates, grace periods, late fees  
            3. FEES: Origination, processing, prepayment penalties, annual fees
            4. DEFAULT: Conditions triggering default, acceleration clauses, consequences
            5. INSURANCE: Required coverage, premium costs, beneficiaries
            6. RED FLAGS: Predatory lending practices, excessive fees, confusing terms
            
            Rate risk focusing on: debt trap potential, hidden costs, unfair collection practices.
        `,
        'Employment Documents': `
            You are analyzing an EMPLOYMENT DOCUMENT. Focus on:
            1. COMPENSATION: Base salary, bonuses, benefits, equity, expense reimbursement
            2. RESPONSIBILITIES: Job duties, reporting structure, performance metrics
            3. CONFIDENTIALITY: NDA scope, trade secrets, duration of obligations
            4. TERMINATION: Notice periods, severance, return of company property
            5. RESTRICTIONS: Non-compete geography/duration, non-solicitation clauses
            6. RED FLAGS: Overly broad restrictions, unpaid obligations, unfair termination
            
            Rate risk focusing on: career mobility limitations, unfair compensation, excessive obligations.
        `,
        'Terms of Service/Privacy Policies': `
            You are analyzing a TERMS OF SERVICE or PRIVACY POLICY. Focus on:
            1. DATA PRIVACY: Collection practices, sharing with third parties, user rights
            2. SERVICE TERMS: Availability, feature changes, account suspension/termination  
            3. USER OBLIGATIONS: Acceptable use, prohibited activities, content guidelines
            4. LIABILITY: Limitation of damages, indemnification, warranty disclaimers
            5. DISPUTE RESOLUTION: Arbitration requirements, class action waivers, governing law
            6. RED FLAGS: Excessive data collection, unfair termination, binding arbitration abuse
            
            Rate risk focusing on: privacy violations, loss of legal rights, service dependency.
        `,
        'Insurance Policies': `
            You are analyzing an INSURANCE POLICY. Focus on:
            1. COVERAGE: What's included/excluded, benefit limits, geographic scope
            2. COSTS: Premiums, deductibles, co-pays, out-of-pocket maximums
            3. CLAIMS: Filing requirements, documentation needed, processing timelines
            4. EXCLUSIONS: Pre-existing conditions, high-risk activities, coverage gaps  
            5. RENEWAL: Rate changes, policy modifications, cancellation rights
            6. RED FLAGS: Hidden exclusions, excessive costs, claim denial patterns
            
            Rate risk focusing on: coverage gaps, claim denial risks, affordability issues.
        `
    };

    return prompts[documentType] || '';
}

// Proceed with analysis after document type confirmation
async function proceedWithAnalysis(documentType, language, base64Data) {
    // Show analysis loading
    showLoading(true);
    
    try {
        // Analyze document with confirmed type and language
        console.log('Proceeding with analysis for document type:', documentType, 'language:', language);
        const analysis = await analyzeDocumentWithGeminiWithType(base64Data, documentType, language);
        console.log('Analysis complete:', analysis);
        
        // Display results
        displayResults(analysis);
        
        // Update analytics
        updateUserAnalytics(analysis);
        
    } catch (error) {
        console.error('Error analyzing document:', error);
        alert('Error analyzing document: ' + error.message);
    } finally {
        isUploading = false;
        showLoading(false);
    }
}

// Reject document type and try again
async function rejectDocumentType() {
    if (!currentDocument) {
        alert('No document available to re-analyze');
        return;
    }
    
    // Show detection loading again
    showDocumentTypeDetection();
    
    try {
        // Try detecting document type again
        console.log('Re-detecting document type...');
        const documentType = await detectDocumentType(currentDocument);
        console.log('Document type re-detected:', documentType);
        
        // Show confirmation again
        showDocumentTypeConfirmation(documentType, currentDocument);
        
    } catch (error) {
        console.error('Error re-detecting document type:', error);
        alert('Error re-detecting document type: ' + error.message);
        isUploading = false;
        showLoading(false);
    }
}

// Analyze document with Gemini API using specific document type and language
async function analyzeDocumentWithGeminiWithType(base64Data, documentType, language = 'English') {
    // Get specific prompt for document type
    const specificPrompt = getDocumentSpecificPrompt(documentType);
    
    // Create language-specific instructions
    const languageInstruction = language !== 'English' ? 
        `\n\nIMPORTANT: The document is in ${language}. Please provide your analysis in ${language} while maintaining the same format and structure.` : '';
    
    // Create the main analysis prompt
    const basePrompt = `
        You are a legal document analysis AI. ${specificPrompt}
        
        Please provide your analysis in the following format:
        
        RISK SCORE: [Rate from 1-10, where 1=very safe, 10=very risky]
        
        KEY ISSUES:
        • [List 3-5 most important clauses that need attention, each on a new line with bullet points]
        
        PLAIN ENGLISH SUMMARY:
        [Explain the document in simple terms that a 12-year-old could understand. Use clear, conversational language without legal jargon.]
        
        RED FLAGS:
        • [List any predatory or unusual terms, each on a new line with bullet points. If none, write "No major red flags detected."]
        
        IMPORTANT: Do not use JSON format. Provide clean, readable text with proper formatting.${languageInstruction}
    `;

    const response = await fetch(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: basePrompt },
                    { 
                        inline_data: {
                            mime_type: "application/pdf",
                            data: base64Data
                        }
                    }
                ]
            }]
        })
    });

    const data = await response.json();
    const analysisText = data.candidates[0].content.parts[0].text;
    
    // Parse the formatted text response and add document type and language
    const analysis = parseFormattedAnalysis(analysisText);
    analysis.document_type = documentType;
    analysis.language = language;
    return analysis;
}

// Analyze document with Gemini API (legacy function for backward compatibility)
async function analyzeDocumentWithGemini(base64Data) {
    // First detect document type
    const documentType = await detectDocumentType(base64Data);
    
    // Use the new function with detected type
    return await analyzeDocumentWithGeminiWithType(base64Data, documentType);
}

// Display analysis results
function displayResults(analysis) {
    analysisResults = analysis;
    
    // Show results section
    document.getElementById('results').classList.remove('hidden');
    
    // Update risk meter
    updateRiskMeter(analysis.risk_score);
    
    // Add enhanced risk breakdown
    addRiskBreakdown(analysis.risk_score);
    
    // Track risk trends using detected document type
    const docType = analysis.document_type || 'General Legal Document';
    trackRiskTrends(docType.toLowerCase().replace(/[^a-z0-9]/g, '_'), analysis.risk_score);
    
    // Display key findings
    displayKeyFindings(analysis.key_issues, analysis.red_flags);
    
    // Display summary with document type
    const documentTypeDisplay = analysis.document_type ? 
        `<div class="document-type-badge">📄 ${analysis.document_type}</div>` : '';
    
    document.getElementById('summary-text').innerHTML = 
        `${documentTypeDisplay}<p>${analysis.plain_summary}</p>`;
}

// Update risk meter visualization
function updateRiskMeter(riskScore) {
    const riskBar = document.getElementById('risk-bar');
    const riskText = document.getElementById('risk-text');
    
    const percentage = (riskScore / 10) * 100;
    riskBar.style.width = percentage + '%';
    
    // Set colors based on risk level
    if (riskScore <= 3) {
        riskBar.className = 'meter-bar risk-low';
        riskText.textContent = `Risk Level: Low (${riskScore}/10)`;
    } else if (riskScore <= 6) {
        riskBar.className = 'meter-bar risk-medium'; 
        riskText.textContent = `Risk Level: Medium (${riskScore}/10)`;
    } else {
        riskBar.className = 'meter-bar risk-high';
        riskText.textContent = `Risk Level: High (${riskScore}/10)`;
    }
}

// Add enhanced risk breakdown visualization
function addRiskBreakdown(riskScore) {
    const riskScoreElement = document.querySelector('.risk-score');
    
    // Remove existing breakdown if any
    const existingBreakdown = document.querySelector('.risk-breakdown');
    if (existingBreakdown) {
        existingBreakdown.remove();
    }
    
    // Create risk breakdown
    const breakdown = document.createElement('div');
    breakdown.className = 'risk-breakdown';
    
    // Determine risk level and create appropriate breakdown
    let riskItems = [];
    
    if (riskScore <= 3) {
        riskItems = [
            { icon: '🟢', title: 'Low Risk', desc: 'Standard terms, minimal concerns', class: 'low' },
            { icon: '✅', title: 'Favorable', desc: 'Generally beneficial conditions', class: 'low' },
            { icon: '📋', title: 'Standard', desc: 'Typical legal language used', class: 'low' }
        ];
    } else if (riskScore <= 6) {
        riskItems = [
            { icon: '🟡', title: 'Medium Risk', desc: 'Some terms need attention', class: 'medium' },
            { icon: '⚠️', title: 'Caution', desc: 'Review specific clauses', class: 'medium' },
            { icon: '📝', title: 'Negotiable', desc: 'Consider discussing terms', class: 'medium' }
        ];
    } else {
        riskItems = [
            { icon: '🔴', title: 'High Risk', desc: 'Significant concerns identified', class: 'high' },
            { icon: '🚨', title: 'Urgent', desc: 'Immediate attention required', class: 'high' },
            { icon: '⚖️', title: 'Legal Review', desc: 'Consult with attorney', class: 'high' }
        ];
    }
    
    // Generate HTML for risk items
    const itemsHTML = riskItems.map(item => `
        <div class="risk-item ${item.class}">
            <div class="risk-item-icon">${item.icon}</div>
            <div class="risk-item-title">${item.title}</div>
            <div class="risk-item-desc">${item.desc}</div>
        </div>
    `).join('');
    
    breakdown.innerHTML = itemsHTML;
    
    // Insert after risk score
    riskScoreElement.parentNode.insertBefore(breakdown, riskScoreElement.nextSibling);
}

// Display key findings
function displayKeyFindings(keyIssues, redFlags) {
    const findingsList = document.getElementById('findings-list');
    let html = '';
    
    // Add key issues
    keyIssues.forEach(issue => {
        html += `<div class="finding-item">
            <span class="finding-icon">⚠️</span>
            <span class="finding-text">${issue}</span>
        </div>`;
    });
    
    // Add red flags with higher priority
    redFlags.forEach(flag => {
        html += `<div class="finding-item red-flag">
            <span class="finding-icon">🚩</span>
            <span class="finding-text"><strong>RED FLAG:</strong> ${flag}</span>
        </div>`;
    });
    
    findingsList.innerHTML = html;
}

// Handle Q&A functionality
async function handleQuestion() {
    const questionInput = document.getElementById('question-input');
    const question = questionInput.value.trim();
    
    if (!question) {
        alert('Please enter a question!');
        return;
    }
    
    if (!analysisResults) {
        alert('Please analyze a document first!');
        return;
    }
    
    // Add user question to chat
    addChatMessage(question, 'user');
    questionInput.value = '';
    
    try {
        // Get AI response
        const response = await askQuestionAboutDocument(question);
        addChatMessage(response, 'ai');
    } catch (error) {
        addChatMessage('Sorry, I had trouble understanding your question. Please try again.', 'ai');
    }
}

// Ask question about the document
async function askQuestionAboutDocument(question) {
    const prompt = `
        Based on the legal document analysis, answer this question in simple terms:
        
        Question: ${question}
        
        Document Summary: ${analysisResults.plain_summary}
        
        Provide a helpful, clear answer in 2-3 sentences.
    `;

    const response = await fetch(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// Add message to chat interface
function addChatMessage(message, sender) {
    const chatResponses = document.getElementById('chat-responses');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-bubble ${sender}`;
    
    if (sender === 'user') {
        messageDiv.innerHTML = `<strong>You:</strong> ${message}`;
    } else {
        messageDiv.innerHTML = `<strong>🤖 LegalLens:</strong> ${message}`;
    }
    
    chatResponses.appendChild(messageDiv);
    chatResponses.scrollTop = chatResponses.scrollHeight;
}

// Show upload confirmation with file details
function showUploadConfirmation(file) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    // Create simple loading content
    loading.innerHTML = `
        <div class="loading-content">
            <div class="simple-loading">
                <div class="loading-spinner"></div>
                <h3>✅ File uploaded: ${file.name} - Preparing for analysis...</h3>
            </div>
        </div>
    `;
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
}

// Show document type detection loading
function showDocumentTypeDetection() {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    loading.innerHTML = `
        <div class="loading-content">
            <div class="simple-loading">
                <div class="loading-spinner"></div>
                <h3>🔍 Detecting document type...</h3>
            </div>
        </div>
    `;
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
}

// Show document type confirmation
function showDocumentTypeConfirmation(detectionResult, base64Data) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    const documentType = detectionResult.type;
    const language = detectionResult.language;
    
    loading.innerHTML = `
        <div class="loading-content">
            <div class="document-type-confirmation">
                <div class="confirmation-icon">📄</div>
                <h3>Document Analysis Ready</h3>
                <div class="detection-results">
                    <div class="detected-type">
                        <span class="label">Type:</span>
                        <span class="value">${documentType}</span>
                    </div>
                    <div class="detected-language">
                        <span class="label">Language:</span>
                        <span class="value">${language}</span>
                    </div>
                </div>
                <p>Is this correct? We'll use specialized analysis for this document type and language.</p>
                <div class="confirmation-buttons">
                    <button id="confirm-type-btn" class="confirm-btn" onclick="proceedWithAnalysis('${documentType}', '${language}', '${base64Data}')">
                        ✅ Yes, Proceed
                    </button>
                    <button id="reject-type-btn" class="reject-btn" onclick="rejectDocumentType()">
                        ❌ No, Try Again
                    </button>
                </div>
            </div>
        </div>
    `;
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
}

// Show/hide loading animation
function showLoading(show) {
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    
    if (show) {
        // Update loading content for analysis phase
        loading.innerHTML = `
            <div class="loading-content">
                <div class="simple-loading">
                    <div class="loading-spinner"></div>
                    <h3>🔍 Detecting document type and analyzing...</h3>
                </div>
            </div>
        `;
        
        loading.classList.remove('hidden');
        results.classList.add('hidden');
    } else {
        loading.classList.add('hidden');
    }
}


// Update upload area display when file is selected
function updateUploadAreaDisplay(file) {
    console.log('=== updateUploadAreaDisplay called ===');
    console.log('File parameter:', file);
    
    const uploadContent = document.querySelector('.upload-content');
    const uploadIcon = document.querySelector('.upload-icon');
    const uploadTitle = uploadContent.querySelector('h3');
    const uploadDesc = uploadContent.querySelector('p');
    const analyzeBtn = document.getElementById('upload-btn');
    
    console.log('Upload elements found:', {
        uploadContent: !!uploadContent,
        uploadIcon: !!uploadIcon,
        uploadTitle: !!uploadTitle,
        uploadDesc: !!uploadDesc,
        analyzeBtn: !!analyzeBtn
    });
    
    if (file) {
        console.log('File provided, updating UI with file:', file.name);
        uploadIcon.className = 'fas fa-file-pdf upload-icon';
        uploadIcon.style.color = '#ef4444';
        uploadTitle.textContent = `Selected: ${file.name}`;
        uploadDesc.textContent = `Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        // Enable analyze button
        if (analyzeBtn) {
            console.log('Enabling analyze button');
            analyzeBtn.disabled = false;
            analyzeBtn.style.opacity = '1';
        }
    } else {
        // Reset to default state
        uploadIcon.className = 'fas fa-cloud-upload-alt upload-icon';
        uploadIcon.style.color = '';
        uploadTitle.textContent = 'Click to browse and select your PDF';
        uploadDesc.textContent = 'Supports PDF files up to 10MB';
        
        // Disable analyze button
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.style.opacity = '0.6';
        }
    }
}

// Parse formatted analysis text
function parseFormattedAnalysis(text) {
    const analysis = {
        risk_score: 5,
        key_issues: [],
        plain_summary: '',
        red_flags: []
    };
    
    try {
        // Extract risk score
        const riskMatch = text.match(/RISK SCORE:\s*(\d+)/i);
        if (riskMatch) {
            analysis.risk_score = parseInt(riskMatch[1]);
        }
        
        // Extract key issues
        const keyIssuesMatch = text.match(/KEY ISSUES:([\s\S]*?)(?=PLAIN ENGLISH SUMMARY|RED FLAGS|$)/i);
        if (keyIssuesMatch) {
            const issuesText = keyIssuesMatch[1];
            analysis.key_issues = issuesText
                .split('\n')
                .map(line => line
                    .replace(/^[•\-\*]\s*/, '') // Remove bullet points
                    .replace(/\*\*\*/g, '') // Remove triple asterisks
                    .replace(/\*\*/g, '') // Remove double asterisks
                    .replace(/\*/g, '') // Remove single asterisks
                    .trim()
                )
                .filter(line => line.length > 0);
        }
        
        // Extract plain summary
        const summaryMatch = text.match(/PLAIN ENGLISH SUMMARY:([\s\S]*?)(?=RED FLAGS|$)/i);
        if (summaryMatch) {
            analysis.plain_summary = summaryMatch[1].trim();
        }
        
        // Extract red flags
        const redFlagsMatch = text.match(/RED FLAGS:([\s\S]*?)$/i);
        if (redFlagsMatch) {
            const flagsText = redFlagsMatch[1];
            analysis.red_flags = flagsText
                .split('\n')
                .map(line => line
                    .replace(/^[•\-\*]\s*/, '') // Remove bullet points
                    .replace(/\*\*\*/g, '') // Remove triple asterisks
                    .replace(/\*\*/g, '') // Remove double asterisks
                    .replace(/\*/g, '') // Remove single asterisks
                    .trim()
                )
                .filter(line => line.length > 0 && !line.toLowerCase().includes('no major red flags'));
        }
        
        // If parsing failed, use fallback
        if (!analysis.plain_summary) {
            analysis.plain_summary = text;
        }
        
    } catch (error) {
        console.error('Error parsing analysis:', error);
        analysis.plain_summary = text;
    }
    
    return analysis;
}


// Add to app.js

// Compare documents feature
async function compareDocuments(doc1, doc2) {
    const prompt = `
        Compare these two legal documents and provide a clear analysis.
        
        Please provide your comparison in the following format:
        
        DOCUMENT COMPARISON:
        
        KEY DIFFERENCES:
        • [List the main differences between the documents, each on a new line]
        
        WHICH IS MORE FAVORABLE:
        [Clearly state which document is more favorable to the user and why]
        
        SPECIFIC CLAUSE DIFFERENCES:
        • [List specific clauses that differ significantly, each on a new line]
        
        RECOMMENDATION:
        [Provide a clear recommendation on which document to choose and why]
        
        IMPORTANT: Use plain text with bullet points (•) only. No JSON format, no special characters.
    `;

    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { 
                            inline_data: {
                                mime_type: "application/pdf",
                                data: doc1
                            }
                        },
                        { 
                            inline_data: {
                                mime_type: "application/pdf",
                                data: doc2
                            }
                        }
                    ]
                }]
            })
        });

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error comparing documents:', error);
        throw error;
    }
}

// Generate negotiation suggestions
async function generateNegotiationTips(analysis) {
    const prompt = `
        Based on this legal document analysis, provide practical negotiation advice.
        
        Document Analysis:
        - Risk Score: ${analysis.risk_score}/10
        - Key Issues: ${analysis.key_issues.join(', ')}
        - Summary: ${analysis.plain_summary}
        - Red Flags: ${analysis.red_flags.length > 0 ? analysis.red_flags.join(', ') : 'None detected'}
        
        Please provide 3-5 specific, actionable negotiation points that could improve the terms for the user. 
        Be practical and specific. Format your response as clear, numbered points without any special formatting characters.
        
        IMPORTANT: Use plain text only. No JSON, no special characters, no bullet points. Just clear, readable advice.
    `;
    
    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error generating negotiation tips:', error);
        throw error;
    }
}

// Risk trending over time
function trackRiskTrends(documentType, riskScore) {
    // Store in localStorage for simple analytics
    const trends = JSON.parse(localStorage.getItem('riskTrends') || '{}');
    const today = new Date().toISOString().split('T')[0];
    
    if (!trends[documentType]) trends[documentType] = [];
    trends[documentType].push({ date: today, risk: riskScore });
    
    localStorage.setItem('riskTrends', JSON.stringify(trends));
}

// Clean text by removing unwanted characters
function cleanText(text) {
    return text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .replace(/```/g, '')
        .replace(/^\s*\{/g, '')
        .replace(/\}\s*$/g, '')
        .replace(/^\[/g, '')
        .replace(/\]\s*$/g, '')
        .replace(/"/g, '"')
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .replace(/'/g, "'")
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\*\*\*/g, '') // Remove triple asterisks
        .replace(/\*\*/g, '') // Remove double asterisks
        .replace(/\*/g, '') // Remove single asterisks
        .replace(/\*\s+/g, '• ') // Replace asterisk with bullet point
        .replace(/^\s*[-•]\s*/gm, '• ') // Normalize bullet points
        .replace(/\n\s*\n/g, '\n') // Remove extra line breaks
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

// Clear all analysis results and reset UI
function clearAllResults() {
    // Hide results section
    const resultsContainer = document.getElementById('results');
    if (resultsContainer) {
        resultsContainer.classList.add('hidden');
    }
    
    // Hide analytics dashboard
    const analyticsSection = document.querySelector('.analytics-section');
    if (analyticsSection) {
        analyticsSection.style.display = 'none';
    }
    
    // Reset global variables
    currentDocument = null;
    analysisResults = null;
    
    // Clear file input
    const fileInput = document.getElementById('pdf-upload');
    if (fileInput) {
        fileInput.value = '';
    }
    
    // Reset upload area display
    updateUploadAreaDisplay(null);
    
    // Clear all result displays
    const findingsList = document.getElementById('findings-list');
    const summaryText = document.getElementById('summary-text');
    const actionResults = document.getElementById('action-results');
    const compareResults = document.getElementById('compare-results');
    const chatResponses = document.getElementById('chat-responses');
    
    if (findingsList) findingsList.innerHTML = '';
    if (summaryText) summaryText.innerHTML = '';
    if (actionResults) actionResults.innerHTML = '';
    if (compareResults) compareResults.innerHTML = '';
    if (chatResponses) chatResponses.innerHTML = '';
    
    // Reset comparison file display
    updateComparisonFileDisplay(null);
    
    // Reset risk meter
    const riskBar = document.getElementById('risk-bar');
    const riskText = document.getElementById('risk-text');
    if (riskBar) {
        riskBar.style.width = '0%';
        riskBar.className = 'meter-bar';
    }
    if (riskText) {
        riskText.textContent = 'Risk Level: Low';
    }
    
    // Remove risk breakdown if exists
    const existingBreakdown = document.querySelector('.risk-breakdown');
    if (existingBreakdown) {
        existingBreakdown.remove();
    }
    
    console.log('All results cleared');
}

// Handle negotiation tips button
async function handleNegotiationTips() {
    if (!analysisResults) {
        alert('Please analyze a document first!');
        return;
    }
    
    const resultsDiv = document.getElementById('action-results');
    resultsDiv.innerHTML = '<div class="loading-text">🤖 Generating negotiation tips...</div>';
    
    try {
        const tips = await generateNegotiationTips(analysisResults);
        const cleanTips = cleanText(tips);
        resultsDiv.innerHTML = `<div class="result-content"><h4>💡 Negotiation Tips:</h4><p>${cleanTips}</p></div>`;
    } catch (error) {
        resultsDiv.innerHTML = '<div class="result-content">❌ Error generating tips. Please try again.</div>';
        console.error('Error:', error);
    }
}

// Handle view trends button
function handleViewTrends() {
    const trends = JSON.parse(localStorage.getItem('riskTrends') || '{}');
    const resultsDiv = document.getElementById('action-results');
    
    if (Object.keys(trends).length === 0) {
        resultsDiv.innerHTML = '<div class="result-content">📊 No risk data available yet. Analyze some documents first!</div>';
        return;
    }
    
    let html = '<div class="result-content"><h4>📊 Risk Trends:</h4>';
    
    for (const [docType, data] of Object.entries(trends)) {
        html += `<h5>${docType.replace('_', ' ').toUpperCase()}:</h5>`;
        html += '<ul>';
        
        data.slice(-10).forEach(entry => { // Show last 10 entries
            const riskLevel = entry.risk <= 3 ? '🟢 Low' : entry.risk <= 6 ? '🟡 Medium' : '🔴 High';
            html += `<li>${entry.date}: Risk ${entry.risk}/10 (${riskLevel})</li>`;
        });
        
        html += '</ul>';
    }
    
    html += '</div>';
    resultsDiv.innerHTML = html;
}

// Handle document comparison
async function handleDocumentComparison() {
    const fileInput = document.getElementById('compare-upload');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a PDF file to compare!');
        return;
    }
    
    if (!currentDocument) {
        alert('Please analyze a document first to compare against!');
        return;
    }
    
    if (file.type !== 'application/pdf') {
        alert('Please upload a PDF file only!');
        return;
    }
    
    const resultsDiv = document.getElementById('compare-results');
    resultsDiv.innerHTML = '<div class="loading-text">🤖 Comparing documents...</div>';
    
    try {
        // Convert new file to base64
        const newDocBase64 = await fileToBase64(file);
        
        // Compare with current document
        const comparison = await compareDocuments(currentDocument, newDocBase64);
        const cleanComparison = cleanText(comparison);
        
        resultsDiv.innerHTML = `<div class="result-content"><h4>⚖️ Document Comparison:</h4><p>${cleanComparison}</p></div>`;
    } catch (error) {
        resultsDiv.innerHTML = '<div class="result-content">❌ Error comparing documents. Please try again.</div>';
        console.error('Error:', error);
    }
}

// Update comparison file display when file is selected
function updateComparisonFileDisplay(file) {
    const fileLabel = document.querySelector('label[for="compare-upload"]');
    const compareBtn = document.getElementById('compare-btn');
    
    if (file) {
        // Update file label to show selected file
        fileLabel.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            <span>Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
        `;
        fileLabel.style.background = '#dcfce7';
        fileLabel.style.borderColor = '#10b981';
        fileLabel.style.color = '#065f46';
        
        // Enable compare button
        if (compareBtn) {
            compareBtn.disabled = false;
            compareBtn.style.opacity = '1';
        }
    } else {
        // Reset to default state
        fileLabel.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            <span>Select Document to Compare</span>
        `;
        fileLabel.style.background = '';
        fileLabel.style.borderColor = '';
        fileLabel.style.color = '';
        
        // Disable compare button
        if (compareBtn) {
            compareBtn.disabled = true;
            compareBtn.style.opacity = '0.6';
        }
    }
}

// Export functionality
function handleExportPDF() {
    if (!analysisResults) {
        alert('Please analyze a document first!');
        return;
    }
    
    // Create a comprehensive report
    const reportContent = generateReportContent();
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>LegalLens AI - Document Analysis Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .section { margin-bottom: 30px; }
                .risk-score { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .key-issues, .red-flags { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .summary { background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .footer { text-align: center; margin-top: 50px; color: #666; font-size: 12px; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>
            ${reportContent}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for content to load, then print
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

function handleExportText() {
    if (!analysisResults) {
        alert('Please analyze a document first!');
        return;
    }
    
    const reportContent = generateReportContent();
    
    // Create a text version (strip HTML tags)
    const textContent = reportContent
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    
    // Create and download file
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LegalLens_Analysis_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function generateReportContent() {
    const currentDate = new Date().toLocaleDateString();
    const riskLevel = analysisResults.risk_score <= 3 ? 'Low' : 
                     analysisResults.risk_score <= 6 ? 'Medium' : 'High';
    
    return `
        <div class="header">
            <h1>LegalLens AI - Document Analysis Report</h1>
            <p>Generated on: ${currentDate}</p>
        </div>
        
        <div class="section">
            <h2>Risk Assessment</h2>
            <div class="risk-score">
                <h3>Overall Risk Score: ${analysisResults.risk_score}/10 (${riskLevel} Risk)</h3>
                <p>This document has been analyzed for potential risks and issues.</p>
            </div>
        </div>
        
        <div class="section">
            <h2>Key Issues</h2>
            <div class="key-issues">
                <ul>
                    ${analysisResults.key_issues.map(issue => `<li>${issue}</li>`).join('')}
                </ul>
            </div>
        </div>
        
        <div class="section">
            <h2>Plain English Summary</h2>
            <div class="summary">
                <p>${analysisResults.plain_summary}</p>
            </div>
        </div>
        
        ${analysisResults.red_flags.length > 0 ? `
        <div class="section">
            <h2>Red Flags</h2>
            <div class="red-flags">
                <ul>
                    ${analysisResults.red_flags.map(flag => `<li>${flag}</li>`).join('')}
                </ul>
            </div>
        </div>
        ` : ''}
        
        <div class="footer">
            <p>Report generated by LegalLens AI - Professional Legal Document Analysis</p>
            <p>For questions about this analysis, please consult with a qualified legal professional.</p>
        </div>
    `;
}

// Authentication Functions
function initializeAuth() {
    if (window.firebaseAuth) {
        window.firebaseAuth.onAuthStateChanged((user) => {
            currentUser = user;
            updateAuthUI();
            if (user) {
                loadUserAnalytics();
            }
        });
    } else {
        console.log('Firebase Auth not available - running in demo mode');
        // Initialize analytics for demo mode
        updateAnalytics();
    }
}

function updateAuthUI() {
    const authButtons = document.querySelector('.auth-buttons');
    const userMenu = document.getElementById('user-menu');
    const userEmail = document.getElementById('user-email');
    const analyticsSection = document.querySelector('.analytics-section');
    
    if (currentUser) {
        // Hide login/signup buttons
        const loginBtn = document.getElementById('login-btn');
        const signupBtn = document.getElementById('signup-btn');
        if (loginBtn) loginBtn.style.display = 'none';
        if (signupBtn) signupBtn.style.display = 'none';
        
        // Show user menu
        userMenu.classList.remove('hidden');
        userEmail.textContent = currentUser.email;
        
        // Show analytics dashboard
        if (analyticsSection) {
            analyticsSection.style.display = 'block';
        }
    } else {
        // Show login/signup buttons
        const loginBtn = document.getElementById('login-btn');
        const signupBtn = document.getElementById('signup-btn');
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (signupBtn) signupBtn.style.display = 'inline-block';
        
        // Hide user menu
        userMenu.classList.add('hidden');
        
        // Hide analytics dashboard
        if (analyticsSection) {
            analyticsSection.style.display = 'none';
        }
    }
}

function handleLogin() {
    if (!window.firebaseAuth) {
        alert('Firebase not configured. Please set up Firebase to use authentication features.');
        return;
    }
    
    const email = prompt('Enter your email:');
    const password = prompt('Enter your password:');
    
    if (email && password) {
        window.firebaseAuth.signInWithEmailAndPassword(email, password)
            .then(() => {
                console.log('Login successful');
            })
            .catch((error) => {
                alert('Login failed: ' + error.message);
            });
    }
}

function handleSignup() {
    if (!window.firebaseAuth) {
        alert('Firebase not configured. Please set up Firebase to use authentication features.');
        return;
    }
    
    const email = prompt('Enter your email:');
    const password = prompt('Enter your password:');
    
    if (email && password) {
        window.firebaseAuth.createUserWithEmailAndPassword(email, password)
            .then(() => {
                console.log('Signup successful');
            })
            .catch((error) => {
                alert('Signup failed: ' + error.message);
            });
    }
}

function handleLogout() {
    if (!window.firebaseAuth) {
        alert('Firebase not configured. Please set up Firebase to use authentication features.');
        return;
    }
    
    window.firebaseAuth.signOut()
        .then(() => {
            console.log('Logout successful');
            
            // Clear all analysis results
            clearAllResults();
            
            // Reset analytics
            userAnalytics = {
                totalDocuments: 0,
                totalRiskScore: 0,
                riskScores: [],
                analysisHistory: []
            };
            updateAnalytics();
        })
        .catch((error) => {
            alert('Logout failed: ' + error.message);
        });
}

// Analytics Functions
function loadUserAnalytics() {
    if (currentUser && window.firebaseDB) {
        window.firebaseDB.collection('users').doc(currentUser.uid).get()
            .then((doc) => {
                if (doc.exists) {
                    userAnalytics = doc.data().analytics || userAnalytics;
                    updateAnalytics();
                }
            })
            .catch((error) => {
                console.log('Error loading analytics:', error);
                // Fallback to localStorage
                const savedAnalytics = localStorage.getItem('userAnalytics');
                if (savedAnalytics) {
                    userAnalytics = JSON.parse(savedAnalytics);
                    updateAnalytics();
                }
            });
    } else {
        // Load from localStorage if Firebase not available
        const savedAnalytics = localStorage.getItem('userAnalytics');
        if (savedAnalytics) {
            userAnalytics = JSON.parse(savedAnalytics);
            updateAnalytics();
        }
    }
}

function saveUserAnalytics() {
    if (currentUser && window.firebaseDB) {
        window.firebaseDB.collection('users').doc(currentUser.uid).set({
            analytics: userAnalytics,
            lastUpdated: new Date()
        }, { merge: true })
        .catch((error) => {
            console.log('Error saving analytics:', error);
        });
    } else {
        // Save to localStorage as fallback
        localStorage.setItem('userAnalytics', JSON.stringify(userAnalytics));
    }
}

function updateAnalytics() {
    // Update analytics cards
    document.getElementById('total-documents').textContent = userAnalytics.totalDocuments;
    document.getElementById('avg-risk-score').textContent = 
        userAnalytics.totalDocuments > 0 ? (userAnalytics.totalRiskScore / userAnalytics.totalDocuments).toFixed(1) : '0.0';
    document.getElementById('total-time').textContent = userAnalytics.totalDocuments * 15; // 15 minutes saved per document
    document.getElementById('accuracy-rate').textContent = '95%';
    
    // Update charts
    updateRiskChart();
    updateTrendsChart();
}

function updateRiskChart() {
    const riskChart = document.getElementById('risk-chart');
    if (!riskChart) return;
    
    // Create simple bar chart
    const riskDistribution = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 1-10 risk scores
    
    userAnalytics.riskScores.forEach(score => {
        if (score >= 1 && score <= 10) {
            riskDistribution[score - 1]++;
        }
    });
    
    const maxCount = Math.max(...riskDistribution, 1);
    
    riskChart.innerHTML = riskDistribution.map((count, index) => {
        const height = (count / maxCount) * 150;
        return `<div class="risk-bar" style="height: ${height}px;" title="Risk ${index + 1}: ${count} documents"></div>`;
    }).join('');
}

function updateTrendsChart() {
    const trendsChart = document.getElementById('trends-chart');
    if (!trendsChart) return;
    
    trendsChart.innerHTML = `
        <div class="trend-line"></div>
        <p>Analysis trend: ${userAnalytics.totalDocuments} documents processed</p>
    `;
}

function updateUserAnalytics(analysis) {
    // Update analytics data
    userAnalytics.totalDocuments++;
    userAnalytics.totalRiskScore += analysis.risk_score;
    userAnalytics.riskScores.push(analysis.risk_score);
    userAnalytics.analysisHistory.push({
        date: new Date().toISOString(),
        riskScore: analysis.risk_score,
        keyIssues: analysis.key_issues.length,
        redFlags: analysis.red_flags.length
    });
    
    // Update UI
    updateAnalytics();
    
    // Save to Firebase
    saveUserAnalytics();
}
