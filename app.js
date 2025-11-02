// Convert model text to clean, safe HTML for chat: remove markdown, build lists/paragraphs
function formatAiChatHtml(text) {
    try {
        let t = String(text || '').replace(/\r/g, '').trim();
        // Remove code fences/backticks and excess asterisks
        t = t.replace(/```[\s\S]*?```/g, '')
             .replace(/`+/g, '')
             .replace(/\*{2,}/g, '')
             .replace(/_{2,}/g, '')
             .replace(/^\s*\*\s*/gm, '• ') // normalize star bullets
             .replace(/^\s*-\s*/gm, '• ');  // normalize dash bullets

        const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const items = [];
        const paras = [];
        lines.forEach(l => {
            if (/^•\s+/.test(l)) items.push(l.replace(/^•\s+/, ''));
            else paras.push(l);
        });

        const parts = [];
        if (paras.length) {
            parts.push(...paras.map(p => `<p>${escapeHtml(p)}</p>`));
        }
        if (items.length) {
            parts.push(`<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
        }
        if (!parts.length) return `<p>${escapeHtml(t)}</p>`;
        return parts.join('');
    } catch (e) {
        return `<p>${escapeHtml(text)}</p>`;
    }
}

// Heuristic: ensure each glossary entry is on its own line (Term — definition ...)
function normalizeGlossaryList(text) {
    try {
        let t = String(text || '').replace(/\r/g, '').trim();
        // Normalize different dash types to an em-dash style separator
        t = t.replace(/\s+-\s+/g, ' — ').replace(/\s*–\s*/g, ' — ');
        // Insert newline breaks before a new "Term —" that follows punctuation or large spacing
        t = t.replace(/\)\s+(?=[A-Z][\w()\/,&\.\s]{1,40}\s—)/g, ')\n');
        t = t.replace(/\.\s+(?=[A-Z][\w()\/,&\.\s]{1,40}\s—)/g, '.\n');
        t = t.replace(/;\s+(?=[A-Z][\w()\/,&\.\s]{1,40}\s—)/g, ';\n');
        t = t.replace(/\s{2,}(?=[A-Z][\w()\/,&\.\s]{1,40}\s—)/g, '\n');
        t = t.replace(/\n{2,}/g, '\n');
        return t;
    } catch (_) { return text; }
}
// API Configuration - Load from config.js or environment variables
const GEMINI_API_URL = window.CONFIG?.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Make API key available globally for backward compatibility
if (window.CONFIG?.GEMINI_API_KEY) {
    window.GEMINI_API_KEY = window.CONFIG.GEMINI_API_KEY;
} else if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    // For production environment variables
    window.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
} else {
    // Fallback - you can set this directly for production
    window.GEMINI_API_KEY = 'AIzaSyCLWImqAa5u-7wqpwheMEaXf2rRAyfzHpw';
}

// Extract best-effort plain text from Gemini response
function extractModelText(data) {
    try {
        // Common path
        let content = data && data.candidates && data.candidates[0] && data.candidates[0].content;
        if (content && Array.isArray(content.parts)) {
            const joined = content.parts
                .map(p => (typeof p.text === 'string' ? p.text : (typeof p === 'string' ? p : ''))) 
                .filter(Boolean)
                .join('\n')
                .trim();
            if (joined) return joined;
        }
        // Some responses may include a direct text field
        const maybe = data?.candidates?.[0]?.content?.text || data?.candidates?.[0]?.text;
        if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
        return '';
    } catch (_) { return ''; }
}

// Generate glossary of legal terms based on the current analysis
async function generateGlossaryFromAnalysis(analysis) {
    const language = analysis.language || 'English';
    const docSnippet = (typeof currentTextDocument === 'string' && currentTextDocument)
        ? currentTextDocument.slice(0, 4000)
        : '';
    const prompt = `
        ROLE: You are a legal assistant for non-lawyers.

        TASK: Identify the key LEGAL TERMS and any COMPLEX/NON-LEGAL technical or financial terms in THIS document.
        For each term, provide a simple, context-aware explanation and why it matters here.

        REQUIREMENTS:
        - Return at least 12 items if available (max ~25). If fewer exist, list all you can find.
        - Include legal terms (e.g., indemnification, jurisdiction, assignment, force majeure) and also complex non-legal concepts present (e.g., KPIs, SLA, net 30, exclusivity period).
        - Use ONE LINE per item strictly in this format (no extra prose):
          Term — simple definition in context (why it matters here)
        - Plain text only. No markdown, no bullets, no numbering.
        - CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in ${language} language. ALL text including term names and definitions must be in ${language}. Do not mix English with ${language}.
        - If ${language} is Hindi, respond completely in Hindi (हिन्दी में). If Bengali, respond completely in Bengali (বাংলায়), etc.

        ANALYSIS CONTEXT:
        - Risk Score: ${analysis.risk_score}/10
        - Key Issues: ${analysis.key_issues.join(', ')}
        - Red Flags: ${analysis.red_flags.length > 0 ? analysis.red_flags.join(', ') : 'None detected'}
        - Summary: ${analysis.plain_summary}

        DOCUMENT TEXT SNIPPET (optional, may be empty):
        ${docSnippet}
    `;

    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) throw new Error(`Glossary generation failed (${response.status})`);
        const data = await response.json();
        // Debug minimal log to help diagnose empty payloads
        try { console.debug('[Glossary][raw]', JSON.stringify(data).slice(0, 1000)); } catch (_) {}
        const text = extractModelText(data);
        return (typeof text === 'string') ? text : '';
    } catch (error) {
        console.error('Error generating glossary:', error);
        throw error;
    }
}

// Handle glossary button click
async function handleExplainGlossary() {
    if (!analysisResults) {
        alert('Please analyze a document first!');
        return;
    }
    const resultsDiv = document.getElementById('action-results');
    resultsDiv.innerHTML = '<div class="loading-text">📖 Extracting and explaining key legal terms...</div>';
    try {
        const raw = await generateGlossaryFromAnalysis(analysisResults);
        // Do NOT run cleanText here as it collapses newlines; normalize first
        const normalized = normalizeGlossaryList(raw);
        const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
            const items = lines.map(l => `<li>${escapeHtml(l)}</li>`).join('');
            resultsDiv.innerHTML = `<div class="result-content"><h4>📖 Legal & Complex Terms Explained:</h4><ul>${items}</ul></div>`;
        } else {
            const msg = String(normalized || '').trim();
            resultsDiv.innerHTML = msg
                ? `<div class="result-content"><h4>📖 Legal & Complex Terms Explained:</h4><p>${escapeHtml(msg)}</p></div>`
                : `<div class="result-content">No glossary terms were detected for this document.</div>`;
        }
    } catch (err) {
        resultsDiv.innerHTML = '<div class="result-content">❌ Error generating glossary. Please try again.</div>';
    }
}

// Create a public, shareable link by saving analysis to Firestore and copying URL
async function shareCurrentAnalysis() {
    if (!window.firebaseAuth || !window.firebaseDB) throw new Error('Auth/DB not ready');
    if (!analysisResults) throw new Error('No analysis to share');
    const user = window.firebaseAuth.currentUser;
    if (!user) { alert('Please login to share your analysis.'); return; }
    const payload = {
        analysis: analysisResults,
        owner: user ? { uid: user.uid, email: user.email || null } : null,
        createdAt: new Date().toISOString(),
        appVersion: '1.0.0',
        public: true
    };
    try {
        const docRef = await window.firebaseDB.collection('sharedAnalyses').add(payload);
        const id = docRef.id;
        const url = `${location.origin}/share.html?id=${encodeURIComponent(id)}`;
        try { await navigator.clipboard.writeText(url); } catch (_) {}
        if (confirm('Share link created and copied to clipboard. Open it now?')) {
            window.open(url, '_blank');
        }
        return;
    } catch (e) {
        console.warn('[Share] Firestore write failed, using link-only fallback:', e && e.code);
        // Fallback: encode analysis in URL hash using LZ-String to avoid DB writes
        const safe = {
            analysis: payload.analysis,
            createdAt: payload.createdAt,
            document_type: payload.analysis.document_type || null,
            language: payload.analysis.language || null
        };
        const json = JSON.stringify(safe);
        const compressed = (window.LZString && window.LZString.compressToEncodedURIComponent)
            ? window.LZString.compressToEncodedURIComponent(json)
            : encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
        const url = `${location.origin}/share.html#data=${compressed}`;
        try { await navigator.clipboard.writeText(url); } catch (_) {}
        if (confirm('Share link (no database) created and copied. Open it now?')) {
            window.open(url, '_blank');
        }
    }
}

// Determine final analysis language: if user selected a language in the dropdown and it's not 'auto', use it; otherwise fallback to detected language
function getSelectedAnalysisLanguage(detectedLanguage) {
    try {
        const sel = document.getElementById('analysis-language');
        const val = sel && sel.value ? sel.value : 'auto';
        if (val && val !== 'auto') return val;
        return detectedLanguage || 'English';
    } catch (_) { return detectedLanguage || 'English'; }
}

function setTheme(mode) {
    if (mode === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.setAttribute('data-theme', 'light');
    }
}

// Tabs: show/hide result sections
function setupResultTabs() {
    try {
        const tabs = Array.from(document.querySelectorAll('#results-tabs .tab-btn'));
        if (!tabs.length) return;
        const sections = {
            analysis: ['#section-analysis-1', '#section-analysis-2', '#section-analysis-3'],
            clauses: ['#section-clauses'],
            tools: ['#section-tools'],
            compare: ['#section-compare'],
            lawyers: ['#section-lawyers']
        };
        function showTab(name) {
            // Active state
            tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === name));
            // Hide all first
            const all = [...new Set(Object.values(sections).flat())];
            all.forEach(sel => { const el = document.querySelector(sel); if (el) el.classList.add('hidden-section'); });
            // Show selected
            (sections[name] || []).forEach(sel => { const el = document.querySelector(sel); if (el) el.classList.remove('hidden-section'); });
        }
        tabs.forEach(btn => {
            btn.addEventListener('click', () => showTab(btn.getAttribute('data-tab')));
        });
        // Default
        showTab('analysis');
    } catch (e) { console.error('[Tabs] setup failed', e); }
}

// Format comparison text into structured HTML
function formatComparisonResult(text) {
    try {
        // If model indicates insufficient input, show friendly message
        if (/INSUFFICIENT_INPUT/i.test(text)) {
            return '<div class="result-content">❌ Not enough content to compare. Please make sure both documents have readable text.</div>';
        }
        // Normalize bullets and whitespace to help parsing
        const normalized = String(text)
            .replace(/\r/g, '')
            .replace(/^\s*[-*]\s+/gm, '• ')
            .replace(/^\s*\u2022\s*/gm, '• ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        const sections = {
            comparison: '',
            differences: [],
            favorable: '',
            clauseDiffs: [],
            recommendation: ''
        };
        const getSection = (name, nextNames) => {
            const head = `${name}\s*:??`; // optional colon
            const regex = new RegExp(`${head}([\s\S]*?)(?=${nextNames.map(n=>n+"\\s*:??").join('|')}|$)`, 'i');
            const m = normalized.match(regex);
            return m ? m[1].trim() : '';
        };
        const next1 = ['KEY DIFFERENCES', 'WHICH IS MORE FAVORABLE', 'SPECIFIC CLAUSE DIFFERENCES', 'RECOMMENDATION'];
        sections.comparison = getSection('DOCUMENT COMPARISON', next1);
        const next2 = ['WHICH IS MORE FAVORABLE', 'SPECIFIC CLAUSE DIFFERENCES', 'RECOMMENDATION'];
        const diffs = getSection('KEY DIFFERENCES', next2);
        sections.differences = diffs
            .split('\n')
            .map(s => s.replace(/^•\s*/, '').trim())
            .filter(Boolean);
        const next3 = ['SPECIFIC CLAUSE DIFFERENCES', 'RECOMMENDATION'];
        sections.favorable = getSection('WHICH IS MORE FAVORABLE', next3);
        const next4 = ['RECOMMENDATION'];
        const clauseDiffs = getSection('SPECIFIC CLAUSE DIFFERENCES', next4);
        sections.clauseDiffs = clauseDiffs
            .split('\n')
            .map(s => s.replace(/^•\s*/, '').trim())
            .filter(Boolean);
        sections.recommendation = getSection('RECOMMENDATION', ['END_OF_DOC']);

        // If everything parsed empty, fallback to raw escaped text
        const nothingParsed = !sections.comparison && !sections.favorable && sections.differences.length === 0 && sections.clauseDiffs.length === 0 && !sections.recommendation;
        if (nothingParsed) {
            return `<div class="result-content" style="font-family: inherit;"><h4>⚖️ Document Comparison</h4><div style="white-space:pre-wrap;">${escapeHtml(normalized)}</div></div>`;
        }
        const diffsHTML = sections.differences.length ? `<ul>${sections.differences.map(d=>`<li>${escapeHtml(d)}</li>`).join('')}</ul>` : '<p>No clear differences detected.</p>';
        const clauseHTML = sections.clauseDiffs.length ? `<ul>${sections.clauseDiffs.map(d=>`<li>${escapeHtml(d)}</li>`).join('')}</ul>` : '<p>No specific clause differences detected.</p>';
        return `
            <div class="result-content">
                <h4>⚖️ Document Comparison</h4>
                ${sections.comparison ? `<p>${escapeHtml(sections.comparison)}</p>` : ''}
                <h5>Key Differences</h5>
                ${diffsHTML}
                <h5>Which Is More Favorable</h5>
                <p>${escapeHtml(sections.favorable)}</p>
                <h5>Specific Clause Differences</h5>
                ${clauseHTML}
                <h5>Recommendation</h5>
                <p>${escapeHtml(sections.recommendation)}</p>
            </div>
        `;
    } catch (e) {
        console.error('[Compare] format failed', e);
        return `<div class="result-content"><h4>⚖️ Document Comparison:</h4><p>${escapeHtml(text)}</p></div>`;
    }
}

// Flexible compare: supports mixing PDF (base64) and TEXT for either document
async function compareDocumentsFlexible(docA, docAType, docB, docBType, language = 'English') {
    const prompt = `
        You will compare TWO documents that appear after this instruction. They are clearly delimited as follows:
        --- BEGIN DOC A ---
        [Doc A content here]
        --- END DOC A ---
        --- BEGIN DOC B ---
        [Doc B content here]
        --- END DOC B ---
        
        Produce the comparison in EXACTLY these sections (plain text only, no markdown, no JSON):
        
        DOCUMENT COMPARISON:
        
        KEY DIFFERENCES:
        • item 1
        • item 2
        
        WHICH IS MORE FAVORABLE:
        [one short paragraph]
        
        SPECIFIC CLAUSE DIFFERENCES:
        • item 1
        • item 2
        
        RECOMMENDATION:
        [one short paragraph]
        
        STRICT RULES:
        - Do NOT fabricate any document content. Only use information present between the delimiters above.
        - If one document is too short or missing (no meaningful text), state: "INSUFFICIENT_INPUT" and stop.
        - Keep the response concise and structured as shown.
        - CRITICAL: You MUST respond ENTIRELY in ${language} language. ALL text including headings, labels, and content must be in ${language}. Do not mix English with ${language}.
        - If ${language} is Hindi, respond completely in Hindi (हिन्दी में). If Bengali, respond completely in Bengali (বাংলায়), etc.
    `;
    try {
        console.log('[CompareFlexible] Types:', docAType, docBType);
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const parts = [{ text: prompt }];
        // Always include the delimiters and inject content accordingly
        parts.push({ text: '--- BEGIN DOC A ---' });
        if (docAType === 'pdf') {
            parts.push({ inline_data: { mime_type: 'application/pdf', data: docA } });
        } else {
            const aText = String(docA || '');
            parts.push({ text: aText.slice(0, 30000) });
        }
        parts.push({ text: '--- END DOC A ---\n--- BEGIN DOC B ---' });
        if (docBType === 'pdf') {
            parts.push({ inline_data: { mime_type: 'application/pdf', data: docB } });
        } else {
            const bText = String(docB || '');
            parts.push({ text: bText.slice(0, 30000) });
        }
        parts.push({ text: '--- END DOC B ---' });
        const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] })
        });
        if (!response.ok) throw new Error(`Comparison failed (${response.status})`);
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty comparison response');
        return text;
    } catch (error) {
        console.error('[CompareFlexible] Error:', error);
        throw error;
    }
}

// Floating chat: handle question
async function handleFloatingQuestion(questionText = null) {
    try {
        const input = document.getElementById('floating-question-input');
        const messages = document.getElementById('floating-chat-messages');
        if (!input || !messages) {
            console.warn('[FloatingChat] Elements missing');
            return;
        }
        const question = questionText || (input.value || '').trim();
        if (!question) {
            alert('Please enter a question!');
            return;
        }
        if (!analysisResults) {
            alert('Please analyze a document first!');
            return;
        }
        
        // Remove quick action buttons if present
        const quickActions = document.getElementById('quick-action-buttons');
        if (quickActions) quickActions.remove();
        
        addFloatingChatMessage(question, 'user');
        if (!questionText) input.value = '';
        
        // Show typing indicator
        showTypingIndicator();
        
        try {
            const language = analysisResults.language || 'English';
            const response = await askQuestionAboutDocument(question, language);
            
            // Remove typing indicator
            removeTypingIndicator();
            
            addFloatingChatMessage(response, 'ai');
            
            // Show follow-up suggestions
            showFollowUpSuggestions(question);
        } catch (err) {
            console.error('[FloatingChat] Q&A failed', err);
            removeTypingIndicator();
            addFloatingChatMessage('Sorry, I had trouble understanding your question. Please try again.', 'ai');
        }
    } catch (e) {
        console.error('[FloatingChat] handleFloatingQuestion failed', e);
    }
}

function addFloatingChatMessage(message, sender) {
    try {
        const messages = document.getElementById('floating-chat-messages');
        if (!messages) return;
        const div = document.createElement('div');
        div.style.margin = '8px 0';
        div.style.padding = '10px 14px';
        div.style.borderRadius = '12px';
        div.style.maxWidth = '85%';
        div.style.lineHeight = '1.5';
        
        if (sender === 'user') {
            div.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
            div.style.color = '#fff';
            div.style.alignSelf = 'flex-end';
            div.style.marginLeft = 'auto';
            div.style.boxShadow = '0 2px 4px rgba(139,92,246,0.2)';
            div.innerHTML = escapeHtml(message);
        } else {
            div.style.background = '#f1f5f9';
            div.style.color = '#1e293b';
            div.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            div.innerHTML = `<div style="display:flex; align-items:flex-start; gap:8px;"><span style="font-size:1.2em;">🤖</span><div>${formatAiChatHtml(message)}</div></div>`;
        }
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    } catch (e) {
        console.error('[FloatingChat] addFloatingChatMessage failed', e);
    }
}

// Show welcome message and quick action buttons
let chatbotWelcomeShown = false;
function showChatbotWelcomeMessage() {
    if (chatbotWelcomeShown) return;
    chatbotWelcomeShown = true;
    
    const messages = document.getElementById('floating-chat-messages');
    if (!messages || !analysisResults) return;
    
    const language = analysisResults.language || 'English';
    const docType = analysisResults.document_type || 'document';
    
    // Welcome message
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const welcomeDiv = document.createElement('div');
    welcomeDiv.style.margin = '12px 0';
    welcomeDiv.style.padding = '14px';
    welcomeDiv.style.borderRadius = '12px';
    welcomeDiv.style.background = isDarkMode ? '#1e293b' : '#f0f9ff';
    welcomeDiv.style.border = isDarkMode ? '1px solid #334155' : '1px solid #bfdbfe';
    welcomeDiv.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:10px;">
            <span style="font-size:1.5em;">👋</span>
            <div>
                <div style="font-weight:600; color:${isDarkMode ? '#a78bfa' : '#1e40af'}; margin-bottom:6px;">Hi! I'm your Legal Assistant</div>
                <div style="color:${isDarkMode ? '#cbd5e1' : '#1e3a8a'}; font-size:0.95em; line-height:1.6;">
                    I've analyzed your ${docType}. Ask me anything about:
                    <ul style="margin:8px 0 0 0; padding-left:20px;">
                        <li>Specific clauses or terms</li>
                        <li>Legal terminology</li>
                        <li>Risks and recommendations</li>
                        <li>Negotiation strategies</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    messages.appendChild(welcomeDiv);
    
    // Quick action buttons
    const quickActionsDiv = document.createElement('div');
    quickActionsDiv.id = 'quick-action-buttons';
    quickActionsDiv.style.margin = '12px 0';
    quickActionsDiv.style.display = 'flex';
    quickActionsDiv.style.flexDirection = 'column';
    quickActionsDiv.style.gap = '8px';
    
    const actions = getQuickActions(docType);
    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.textContent = action.text;
        btn.style.padding = '10px 14px';
        btn.style.border = isDarkMode ? '1px solid #475569' : '1px solid #c7d2fe';
        btn.style.borderRadius = '8px';
        btn.style.background = isDarkMode ? '#334155' : '#fff';
        btn.style.color = isDarkMode ? '#e0e7ff' : '#4f46e5';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'left';
        btn.style.fontSize = '0.9em';
        btn.style.transition = 'all 0.2s';
        btn.addEventListener('mouseenter', () => {
            btn.style.background = isDarkMode ? '#475569' : '#eef2ff';
            btn.style.borderColor = isDarkMode ? '#64748b' : '#a5b4fc';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = isDarkMode ? '#334155' : '#fff';
            btn.style.borderColor = isDarkMode ? '#475569' : '#c7d2fe';
        });
        btn.addEventListener('click', () => {
            handleFloatingQuestion(action.question);
        });
        quickActionsDiv.appendChild(btn);
    });
    
    messages.appendChild(quickActionsDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Get quick action buttons based on document type
function getQuickActions(docType) {
    const type = (docType || '').toLowerCase();
    
    if (type.includes('employment') || type.includes('offer')) {
        return [
            { text: '📋 What are the key terms?', question: 'What are the most important terms in this employment contract?' },
            { text: '⏰ What is the notice period?', question: 'What is the notice period for termination?' },
            { text: '💰 Tell me about compensation', question: 'What are the compensation and benefits details?' },
            { text: '🚪 How can I terminate this?', question: 'What are the termination conditions?' }
        ];
    } else if (type.includes('lease') || type.includes('rental')) {
        return [
            { text: '💰 When does rent increase?', question: 'When and how much can the rent increase?' },
            { text: '🔒 What about security deposit?', question: 'What are the security deposit terms?' },
            { text: '⏰ What are the deadlines?', question: 'What are the important dates and deadlines?' },
            { text: '🚪 How can I end the lease?', question: 'What are the lease termination conditions?' }
        ];
    } else if (type.includes('nda') || type.includes('non-disclosure')) {
        return [
            { text: '⏰ How long am I bound?', question: 'What is the duration of confidentiality obligations?' },
            { text: '🔒 What can\'t I share?', question: 'What information is considered confidential?' },
            { text: '⚠️ What are the penalties?', question: 'What happens if I breach this agreement?' },
            { text: '📋 Summarize key restrictions', question: 'What are the main restrictions in this NDA?' }
        ];
    } else {
        return [
            { text: '📋 Summarize key risks', question: 'What are the main risks in this document?' },
            { text: '💰 What are the payment terms?', question: 'What are the payment terms and conditions?' },
            { text: '⏰ What are the deadlines?', question: 'What are the important dates and deadlines?' },
            { text: '🚪 How can I terminate this?', question: 'What are the termination conditions?' }
        ];
    }
}

// Show typing indicator
function showTypingIndicator() {
    const messages = document.getElementById('floating-chat-messages');
    if (!messages) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.style.margin = '8px 0';
    indicator.style.padding = '10px 14px';
    indicator.style.borderRadius = '12px';
    indicator.style.background = '#f1f5f9';
    indicator.style.maxWidth = '85%';
    indicator.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.2em;">🤖</span>
            <div style="display:flex; gap:4px;">
                <span style="animation:typing-dot 1.4s infinite; animation-delay:0s;">●</span>
                <span style="animation:typing-dot 1.4s infinite; animation-delay:0.2s;">●</span>
                <span style="animation:typing-dot 1.4s infinite; animation-delay:0.4s;">●</span>
            </div>
        </div>
    `;
    
    // Add animation style if not exists
    if (!document.getElementById('typing-animation-style')) {
        const style = document.createElement('style');
        style.id = 'typing-animation-style';
        style.textContent = `
            @keyframes typing-dot {
                0%, 60%, 100% { opacity: 0.3; }
                30% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    messages.appendChild(indicator);
    messages.scrollTop = messages.scrollHeight;
}

// Remove typing indicator
function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

// Show follow-up suggestions
function showFollowUpSuggestions(previousQuestion) {
    const messages = document.getElementById('floating-chat-messages');
    if (!messages) return;
    
    const suggestions = getFollowUpSuggestions(previousQuestion);
    if (!suggestions.length) return;
    
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.style.margin = '12px 0';
    suggestionsDiv.innerHTML = `
        <div style="font-size:0.85em; color:#64748b; margin-bottom:6px;">Related questions:</div>
    `;
    
    suggestions.forEach(suggestion => {
        const btn = document.createElement('button');
        btn.textContent = suggestion;
        btn.style.display = 'block';
        btn.style.width = '100%';
        btn.style.padding = '8px 12px';
        btn.style.margin = '4px 0';
        btn.style.border = '1px solid #e2e8f0';
        btn.style.borderRadius = '8px';
        btn.style.background = '#fff';
        btn.style.color = '#475569';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'left';
        btn.style.fontSize = '0.85em';
        btn.style.transition = 'all 0.2s';
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#f8fafc';
            btn.style.borderColor = '#cbd5e1';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#fff';
            btn.style.borderColor = '#e2e8f0';
        });
        btn.addEventListener('click', () => {
            btn.parentElement.remove();
            handleFloatingQuestion(suggestion);
        });
        suggestionsDiv.appendChild(btn);
    });
    
    messages.appendChild(suggestionsDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Get follow-up suggestions based on previous question
function getFollowUpSuggestions(question) {
    const q = question.toLowerCase();
    
    if (q.includes('risk') || q.includes('danger')) {
        return [
            'How can I mitigate these risks?',
            'What should I negotiate to reduce risk?'
        ];
    } else if (q.includes('terminate') || q.includes('end') || q.includes('cancel')) {
        return [
            'What are the penalties for early termination?',
            'What notice period is required?'
        ];
    } else if (q.includes('payment') || q.includes('money') || q.includes('cost')) {
        return [
            'Are there any hidden fees?',
            'What happens if payment is late?'
        ];
    } else if (q.includes('deadline') || q.includes('date') || q.includes('time')) {
        return [
            'What happens if I miss a deadline?',
            'Can deadlines be extended?'
        ];
    } else {
        return [
            'What are the main risks here?',
            'Should I consult a lawyer about this?'
        ];
    }
}

// Handle voice input
function handleVoiceInput() {
    const voiceBtn = document.getElementById('voice-input-btn');
    const input = document.getElementById('floating-question-input');
    
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // Default to English, can be changed based on document language
    recognition.continuous = false;
    recognition.interimResults = false;
    
    // Visual feedback - recording
    voiceBtn.style.background = '#fee2e2';
    voiceBtn.style.color = '#dc2626';
    voiceBtn.style.animation = 'pulse 1s infinite';
    
    // Add pulse animation if not exists
    if (!document.getElementById('pulse-animation-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-animation-style';
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        input.value = transcript;
        
        // Reset button style
        voiceBtn.style.background = '#fff';
        voiceBtn.style.color = '#6366f1';
        voiceBtn.style.animation = '';
        
        // Optionally auto-send
        setTimeout(() => {
            handleFloatingQuestion();
        }, 500);
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        voiceBtn.style.background = '#fff';
        voiceBtn.style.color = '#6366f1';
        voiceBtn.style.animation = '';
        
        if (event.error === 'no-speech') {
            alert('No speech detected. Please try again.');
        } else if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please allow microphone access in your browser settings.');
        } else {
            alert('Voice input failed. Please try again.');
        }
    };
    
    recognition.onend = () => {
        voiceBtn.style.background = '#fff';
        voiceBtn.style.color = '#6366f1';
        voiceBtn.style.animation = '';
    };
    
    try {
        recognition.start();
    } catch (e) {
        console.error('Failed to start recognition:', e);
        voiceBtn.style.background = '#fff';
        voiceBtn.style.color = '#6366f1';
        voiceBtn.style.animation = '';
    }
}
// Highlight first match of the clause text in the text viewer and scroll to it
function jumpToTextSource(clauseText) {
    try {
        const container = document.getElementById('text-source');
        if (!container || container.style.display === 'none') {
            console.warn('[Jump] Text source not available');
            alert('Jump to source is available for text-based documents.');
            return;
        }
        const source = currentTextDocument || '';
        if (!source) {
            alert('No text available to search.');
            return;
        }
        const query = (clauseText || '').slice(0, 300);
        if (!query) return;
        // Case-insensitive search of a reasonable snippet
        const normalizedSource = source.toLowerCase();
        let target = query.toLowerCase();
        // Try to use first sentence up to period if long
        if (target.length > 220 && target.includes('.')) {
            target = target.split('.')[0];
        }
        let idx = normalizedSource.indexOf(target);
        if (idx === -1 && target.length > 40) {
            // Fallback: shorten target
            target = target.slice(0, Math.min(100, Math.max(40, Math.floor(target.length / 2))));
            idx = normalizedSource.indexOf(target);
        }
        if (idx === -1) {
            console.log('[Jump] Could not locate clause in text');
            alert('Could not locate this clause in the text.');
            return;
        }
        const before = source.slice(0, idx);
        const match = source.slice(idx, idx + target.length);
        const after = source.slice(idx + target.length);
        container.innerHTML = `${escapeHtml(before)}<mark id="jump-target" style="background:#fde68a;">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
        const el = document.getElementById('jump-target');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        console.error('[Jump] Failed to highlight:', e);
        alert('Failed to jump to source.');
    }
}

// Render the source viewer (left pane): PDF via PDF.js or plain text for non-PDF
async function renderSourceViewer() {
    const pane = document.getElementById('review-pane');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const textSource = document.getElementById('text-source');
    if (!pane || !pdfCanvas || !textSource) {
        console.warn('[SourceViewer] Elements not found');
        return;
    }
    if (!currentFileExt) {
        console.warn('[SourceViewer] No current file ext');
        return;
    }
    // Reset panes
    // Reset visibility and canvas state
    textSource.style.display = 'none';
    pdfCanvas.style.display = 'none';
    const ctx = pdfCanvas.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height); }

    if (currentFileExt === 'pdf' && currentDocument) {
        if (typeof window['pdfjsLib'] === 'undefined') {
            console.warn('[SourceViewer] PDF.js not loaded');
            return;
        }
        try {
            console.log('[SourceViewer] Rendering PDF first page');
            const data = base64ToUint8Array(currentDocument);
            const loadingTask = window.pdfjsLib.getDocument({ data });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1.25 });
            pdfCanvas.width = viewport.width;
            pdfCanvas.height = viewport.height;
            const renderContext = { canvasContext: pdfCanvas.getContext('2d'), viewport };
            await page.render(renderContext).promise;
            console.log('[SourceViewer] PDF rendered');
            pdfCanvas.style.display = 'block';
            textSource.style.display = 'none';
        } catch (e) {
            console.error('[SourceViewer] PDF render failed:', e);
        }
    } else {
        // Non-PDF: show text content
        console.log('[SourceViewer] Rendering text source');
        pdfCanvas.style.display = 'none';
        textSource.style.display = 'block';
        const raw = (currentTextDocument || '').slice(0, 200000) || 'No text source available.';
        textSource.innerHTML = escapeHtml(raw);
    }
}

function base64ToUint8Array(base64) {
    const raw = atob(base64);
    const len = raw.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

// Highlight clause in source viewer
function highlightClauseInSource(clauseText, isPinned = false, shouldScroll = false) {
    const textSource = document.getElementById('text-source');
    if (!textSource || !currentTextDocument) return;
    
    // Clean clause text for matching
    const cleanClause = clauseText.replace(/^(RED FLAG:|⚠️|⚖️|🚩)\s*/i, '').trim();
    if (!cleanClause || cleanClause.length < 10) return;
    
    // Find matching text in source (fuzzy match - look for key phrases)
    const sourceText = currentTextDocument;
    
    // Extract meaningful words (names, important terms)
    const words = cleanClause.split(/\s+/)
        .filter(w => w.length > 3)
        .filter(w => !/^(this|that|with|from|have|been|will|shall|must|should|could|would)$/i.test(w))
        .slice(0, 8); // Take up to 8 significant words
    
    let bestMatch = { index: -1, length: 0, score: 0 };
    
    // Try to find the best matching section with sliding window
    const windowSize = 300; // Larger window for better context
    for (let i = 0; i < sourceText.length - 50; i += 10) { // Step by 10 for performance
        const section = sourceText.substring(i, Math.min(i + windowSize, sourceText.length));
        let matchScore = 0;
        
        words.forEach(word => {
            const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const matches = section.match(regex);
            if (matches) {
                matchScore += matches.length; // Count multiple occurrences
            }
        });
        
        if (matchScore > bestMatch.score) {
            bestMatch = { index: i, length: Math.min(windowSize, sourceText.length - i), score: matchScore };
        }
    }
    
    // If we found a good match, highlight it
    if (bestMatch.score >= 2) {
        // Find sentence boundaries for cleaner highlight
        let startIndex = bestMatch.index;
        let endIndex = bestMatch.index + bestMatch.length;
        
        // Try to start at sentence beginning
        const beforeText = sourceText.substring(Math.max(0, startIndex - 50), startIndex);
        const sentenceStart = beforeText.lastIndexOf('.');
        if (sentenceStart !== -1) {
            startIndex = Math.max(0, startIndex - 50 + sentenceStart + 1);
        }
        
        const before = sourceText.substring(0, startIndex);
        const match = sourceText.substring(startIndex, endIndex);
        const after = sourceText.substring(endIndex);
        
        const highlightColor = isPinned ? '#d1fae5' : '#fef3c7';
        const borderColor = isPinned ? '#10b981' : '#f59e0b';
        const textColor = '#1f2937'; // Dark text for light highlight background
        
        textSource.innerHTML = `${escapeHtml(before)}<span id="highlighted-clause" style="background:${highlightColor}; color:${textColor}; border-left:4px solid ${borderColor}; padding:8px 12px; display:inline-block; border-radius:6px; animation:highlight-pulse 0.3s ease; box-shadow:0 2px 8px rgba(0,0,0,0.1);">${escapeHtml(match)}</span>${escapeHtml(after)}`;
        
        // Only scroll if explicitly requested (on click, not hover)
        if (shouldScroll) {
            const highlighted = document.getElementById('highlighted-clause');
            if (highlighted) {
                setTimeout(() => {
                    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }
}

// Clear clause highlight
function clearClauseHighlight() {
    const textSource = document.getElementById('text-source');
    if (!textSource || !currentTextDocument) return;
    textSource.textContent = currentTextDocument;
}

// Display source document in left panel
function displaySourceDocument() {
    const textSource = document.getElementById('text-source');
    const pdfCanvas = document.getElementById('pdf-canvas');
    
    if (!textSource || !pdfCanvas) return;
    
    // If we have text document, show it
    if (currentTextDocument) {
        textSource.style.display = 'block';
        pdfCanvas.style.display = 'none';
        textSource.textContent = currentTextDocument;
    }
    // If we have PDF, try to render it (basic support)
    else if (currentDocument) {
        textSource.style.display = 'none';
        pdfCanvas.style.display = 'block';
        // PDF rendering would require pdf.js library
        // For now, show a message
        textSource.style.display = 'block';
        pdfCanvas.style.display = 'none';
        textSource.innerHTML = '<div style="padding:20px; color:#6b7280; text-align:center;"><i class="fas fa-file-pdf" style="font-size:3em; margin-bottom:16px; display:block;"></i><p>PDF document uploaded</p><p style="font-size:0.9em; margin-top:8px;">Hover over clauses on the right to see highlights</p></div>';
    }
}

// Render clause-by-clause review (skeleton using existing analysis fields)
async function renderClauseReview(analysis) {
    const pane = document.getElementById('review-pane');
    const insights = document.getElementById('clause-insights');
    if (!pane || !insights) {
        console.warn('[ClauseReview] Pane elements not found');
        return;
    }
    pane.style.display = 'flex';
    
    // Add CSS animation for highlight pulse
    if (!document.getElementById('highlight-animation-style')) {
        const style = document.createElement('style');
        style.id = 'highlight-animation-style';
        style.textContent = `
            @keyframes highlight-pulse {
                0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
                50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
            }
        `;
        document.head.appendChild(style);
    }
    const keyClauses = (analysis.key_issues || []).slice(0, 10);
    const redFlags = (analysis.red_flags || []).slice(0, 10);
    
    // Display source document in left panel
    displaySourceDocument();
    
    // Show loading state while enriching clauses
    insights.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Analyzing clauses with industry standards...</div>';
    
    // Enrich clauses with intelligent analysis
    const enrichedClauses = await enrichClausesWithIntelligence(keyClauses, analysis);
    const enrichedFlags = await enrichClausesWithIntelligence(redFlags, analysis, true);
    
    const makeItem = (enrichedData, type) => {
        const priorityBadge = getPriorityBadge(enrichedData.priority);
        const comparisonBadge = enrichedData.comparison ? `
            <div style="margin-top:8px; padding:8px; background:#f0f9ff; border-left:3px solid #3b82f6; border-radius:4px; font-size:0.9em;">
                <strong>📊 Industry Comparison:</strong> ${escapeHtml(enrichedData.comparison)}
            </div>` : '';
        
        return `
        <div class="clause-item" style="border:1px solid #e5e7eb; border-radius:12px; padding:14px; margin-bottom:12px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                <div style="font-weight:600; color:#1f2937;">${type === 'flag' ? '🚩 Red Flag' : '⚖️ Key Clause'}</div>
                ${priorityBadge}
            </div>
            <div class="clause-text" style="margin-top:6px; color:#374151; line-height:1.6;" data-original="${encodeURIComponent(enrichedData.text)}">${escapeHtml(enrichedData.summary || enrichedData.text)}</div>
            ${comparisonBadge}
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="explain-btn" data-clause="${encodeURIComponent(enrichedData.text)}" style="padding:6px 12px; border:1px solid #d1d5db; border-radius:6px; background:#f9fafb; font-size:0.85em; cursor:pointer; transition:all 0.2s;">💡 Explain more</button>
            </div>
            <div class="explain-panel" style="display:none; margin-top:8px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:10px;"></div>
        </div>`;
    };
    
    let html = '';
    if (enrichedClauses.length) {
        html += `<h4 style="margin:8px 0 12px; color:#111827; font-size:1.1em;">🔍 Key Clauses Analysis</h4>`;
        html += enrichedClauses.map(t => makeItem(t, 'clause')).join('');
    }
    if (enrichedFlags.length) {
        html += `<h4 style="margin:20px 0 12px; color:#111827; font-size:1.1em;">⚠️ Red Flags & Risks</h4>`;
        html += enrichedFlags.map(t => makeItem(t, 'flag')).join('');
    }
    insights.innerHTML = html || '<div style="color:#6b7280;">No clause details available.</div>';

    // Wire Explain buttons with hover effects
    insights.querySelectorAll('.explain-btn').forEach(btn => {
        btn.addEventListener('mouseover', () => { btn.style.background = '#eef2ff'; btn.style.borderColor = '#c7d2fe'; });
        btn.addEventListener('mouseout', () => { btn.style.background = '#f9fafb'; btn.style.borderColor = '#d1d5db'; });
        btn.addEventListener('click', async (e) => {
            const clause = decodeURIComponent(e.currentTarget.getAttribute('data-clause') || '');
            const panel = e.currentTarget.closest('.clause-item').querySelector('.explain-panel');
            if (!clause || !panel) return;
            panel.style.display = 'block';
            panel.innerHTML = '<div>🤖 Explaining…</div>';
            try {
                const explanation = await explainMoreForClause(clause);
                panel.innerHTML = formatAiChatHtml(explanation);
            } catch (e) {
                panel.innerHTML = '<div style="color:#ef4444;">Error: ' + escapeHtml(e.message) + '</div>';
            }
        });
    });
    
    // Add clause highlighting on click only (no hover to avoid screen jumping)
    insights.querySelectorAll('.clause-item').forEach(item => {
        const clauseTextElement = item.querySelector('.clause-text');
        const clauseText = clauseTextElement ? decodeURIComponent(clauseTextElement.getAttribute('data-original') || '') : '';
        
        // Add hover effect for visual feedback (no highlighting)
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateX(4px)';
            item.style.transition = 'transform 0.2s ease';
            item.style.cursor = 'pointer';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateX(0)';
        });
        
        // Highlight and scroll on click
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking button
            if (e.target.closest('.explain-btn')) return;
            
            // Remove previous pin styling
            insights.querySelectorAll('.clause-item').forEach(i => {
                i.style.borderLeft = i.classList.contains('red-flag') ? '4px solid #ef4444' : '4px solid #3b82f6';
                i.style.background = i.classList.contains('red-flag') ? '#fef2f2' : '#fff';
            });
            
            // Pin this clause with green styling
            item.style.borderLeft = '4px solid #10b981';
            item.style.background = '#f0fdf4';
            
            // Highlight in source and scroll to it
            highlightClauseInSource(clauseText, true, true);
        });
    });
    // Jump to source removed per request; keeping UI simple.
}

// Escape HTML to prevent injection in clause text
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Convert model text to clean, safe HTML for chat: remove markdown, build lists/paragraphs
function formatAiChatHtml(text) {
    try {
        let t = String(text || '').replace(/\r/g, '').trim();
        // Remove code fences/backticks and excess asterisks
        t = t.replace(/```[\s\S]*?```/g, '')
             .replace(/`+/g, '')
             .replace(/\*{2,}/g, '')
             .replace(/_{2,}/g, '')
             .replace(/^\s*\*\s*/gm, '• ') // normalize star bullets
             .replace(/^\s*-\s*/gm, '• ');  // normalize dash bullets

        const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const items = [];
        const paras = [];
        lines.forEach(l => {
            if (/^•\s+/.test(l)) items.push(l.replace(/^•\s+/, ''));
            else paras.push(l);
        });

        const parts = [];
        if (paras.length) parts.push(...paras.map(p => `<p>${escapeHtml(p)}</p>`));
        if (items.length) parts.push(`<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
        return parts.length ? parts.join('') : `<p>${escapeHtml(t)}</p>`;
    } catch (e) {
        return `<p>${escapeHtml(text)}</p>`;
    }
}

// Get priority badge HTML based on priority level
function getPriorityBadge(priority) {
    const badges = {
        'critical': '<span style="padding:4px 10px; background:#fee2e2; color:#991b1b; border-radius:12px; font-size:0.8em; font-weight:600;">🔴 MUST NEGOTIATE</span>',
        'high': '<span style="padding:4px 10px; background:#fef3c7; color:#92400e; border-radius:12px; font-size:0.8em; font-weight:600;">🟡 BE CAREFUL</span>',
        'medium': '<span style="padding:4px 10px; background:#dbeafe; color:#1e40af; border-radius:12px; font-size:0.8em; font-weight:600;">🔵 REVIEW</span>',
        'low': '<span style="padding:4px 10px; background:#d1fae5; color:#065f46; border-radius:12px; font-size:0.8em; font-weight:600;">🟢 ACCEPTABLE</span>'
    };
    return badges[priority] || badges['medium'];
}

// Enrich clauses with intelligent analysis
async function enrichClausesWithIntelligence(clauses, analysis, isRedFlag = false) {
    if (!clauses || clauses.length === 0) return [];
    
    try {
        const documentType = analysis.document_type || 'General Legal Document';
        const riskScore = analysis.risk_score || 5;
        const language = analysis.language || 'English';
        
        const prompt = `
            You are analyzing clauses from a ${documentType}.
            Document Risk Score: ${riskScore}/10
            
            For each clause below, provide:
            1. PRIORITY: critical, high, medium, or low
            2. SUMMARY: A clear 1-sentence summary (15-20 words)
            3. COMPARISON: How it compares to industry standards (1 sentence)
            
            Clauses to analyze:
            ${clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}
            
            Respond in this EXACT format for each clause:
            ---CLAUSE ${isRedFlag ? 'FLAG' : 'ISSUE'} 1---
            PRIORITY: [critical/high/medium/low]
            SUMMARY: [concise summary]
            COMPARISON: [industry comparison]
            
            CRITICAL: Respond in ${language} language.
            
            Priority Guidelines:
            - critical: Unfair terms, legal risks, must negotiate
            - high: Unfavorable but common, should negotiate
            - medium: Standard terms, review recommended
            - low: Fair and acceptable terms
        `;
        
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        if (!response.ok) throw new Error('Enrichment failed');
        
        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Parse the response
        const enrichedData = [];
        const clauseBlocks = responseText.split(/---CLAUSE (?:FLAG|ISSUE) \d+---/).slice(1);
        
        clauses.forEach((clause, index) => {
            const block = clauseBlocks[index] || '';
            const priorityMatch = block.match(/PRIORITY:\s*([\w]+)/i);
            const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=\n|COMPARISON:|$)/is);
            const comparisonMatch = block.match(/COMPARISON:\s*(.+?)(?=\n---|\n\n|$)/is);
            
            enrichedData.push({
                text: clause,
                priority: (priorityMatch?.[1] || 'medium').toLowerCase(),
                summary: summaryMatch?.[1]?.trim() || clause,
                comparison: comparisonMatch?.[1]?.trim() || null
            });
        });
        
        return enrichedData;
    } catch (error) {
        console.error('Error enriching clauses:', error);
        // Fallback: return basic structure
        return clauses.map(c => ({
            text: c,
            priority: isRedFlag ? 'high' : 'medium',
            summary: c,
            comparison: null
        }));
    }
}

// Clause-specific explanation using Gemini
async function explainMoreForClause(clauseText) {
    const prompt = `Explain this clause in simple terms (2-4 sentences). Then include two labeled lines: Negotiation tip: <tip here> and Action: <action here>. Use plain text only. Do not use markdown, asterisks, or bullet symbols.\n\nClause:\n${clauseText}`;
    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!response.ok) throw new Error(`Explain failed (${response.status})`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty explanation');
    const cleaned = cleanText(text);
    const formatted = formatExplanation(cleaned);
    return formatted;
}

// Format explanation into clean paragraphs and separate lines for tip/action
function formatExplanation(text) {
    try {
        // Normalize whitespace
        let t = text.replace(/\s+$/g, '').trim();
        // Ensure Negotiation tip and Action appear on separate lines
        t = t.replace(/\s*Negotiation tip\s*:\s*/i, '\nNegotiation tip: ');
        t = t.replace(/\s*Action\s*:\s*/i, '\nAction: ');
        return t;
    } catch (e) {
        console.warn('[Explain] format failed, returning raw');
        return text;
    }
}

// Show document type confirmation for TEXT-based inputs
function showDocumentTypeConfirmationText(detectionResult, textContent) {
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
                    <button id="confirm-type-text-btn" class="confirm-btn">
                        ✅ Yes, Proceed
                    </button>
                    <button id="reject-type-text-btn" class="reject-btn">
                        ❌ No, Try Again
                    </button>
                </div>
            </div>
        </div>
    `;

    loading.classList.remove('hidden');
    results.classList.add('hidden');

    const confirmBtn = document.getElementById('confirm-type-text-btn');
    const rejectBtn = document.getElementById('reject-type-text-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
        proceedWithAnalysisText(documentType, language, textContent);
    });
    if (rejectBtn) rejectBtn.addEventListener('click', async () => {
        try {
            showDocumentTypeDetection();
            console.log('Re-detecting document type (text)...');
            const newDetection = await detectDocumentTypeFromText(textContent);
            console.log('Document type re-detected (text):', newDetection);
            showDocumentTypeConfirmationText(newDetection, textContent);
        } catch (e) {
            console.error('Error re-detecting (text):', e);
            alert('Error re-detecting document type: ' + e.message);
            isUploading = false;
            showLoading(false);
        }
    });
}

// Global variables
let currentDocument = null; // base64 (PDF)
let currentTextDocument = null; // raw extracted text (non-PDF)
let currentFileExt = null; // 'pdf' | 'docx' | 'txt' | 'md' | 'png' | 'jpg' | 'jpeg'
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

// Smooth scroll helper
function smoothScrollToId(id, offset = 80) {
    try {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const absoluteY = window.scrollY + rect.top - offset;
        window.scrollTo({ top: Math.max(absoluteY, 0), behavior: 'smooth' });
    } catch (_) {}
}

// Smooth scroll to element helper
function smoothScrollToEl(el, offset = 80) {
    try {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const absoluteY = window.scrollY + rect.top - offset;
        window.scrollTo({ top: Math.max(absoluteY, 0), behavior: 'smooth' });
    } catch (_) {}
}

function initializeApp() {
    console.log('Initializing app...');
    
    const uploadBtn = document.getElementById('upload-btn');
    const pdfUpload = document.getElementById('pdf-upload');
    const askBtn = document.getElementById('ask-btn');
    const floatingToggle = document.getElementById('floating-chat-toggle');
    const floatingPanel = document.getElementById('floating-chat');
    const floatingClose = document.getElementById('floating-chat-close');
    const floatingAskBtn = document.getElementById('floating-ask-btn');
    const floatingInput = document.getElementById('floating-question-input');
    const voiceInputBtn = document.getElementById('voice-input-btn');
    const negotiationBtn = document.getElementById('negotiation-btn');
    const glossaryBtn = document.getElementById('glossary-btn');
    const compareBtn = document.getElementById('compare-btn');
    const connectLawyerBtn = document.getElementById('connect-lawyer-btn');
    const lawyerListEl = document.getElementById('lawyer-list');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const languageSelect = document.getElementById('analysis-language');
    const shareBtn = document.getElementById('share-analysis-btn');
    
    console.log('Elements found:', {
        uploadBtn: !!uploadBtn,
        pdfUpload: !!pdfUpload,
        askBtn: !!askBtn,
        floatingToggle: !!floatingToggle,
        floatingPanel: !!floatingPanel,
        floatingClose: !!floatingClose,
        floatingAskBtn: !!floatingAskBtn,
        floatingInput: !!floatingInput,
        negotiationBtn: !!negotiationBtn,
        glossaryBtn: !!glossaryBtn,
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
    // Floating chat listeners
    if (floatingToggle) {
        floatingToggle.addEventListener('click', () => {
            try {
                if (!floatingPanel) return;
                floatingPanel.style.display = 'flex';
                // Hide launcher while panel is open
                try { floatingToggle.style.display = 'none'; } catch (_) {}
                
                // Show welcome message if first time opening
                showChatbotWelcomeMessage();
                
                setTimeout(() => { try { floatingInput && floatingInput.focus(); } catch (_) {} }, 50);
                console.log('[FloatingChat] Opened');
            } catch (e) { console.error('[FloatingChat] Open failed', e); }
        });
    }
    if (floatingClose) {
        floatingClose.addEventListener('click', () => {
            try {
                if (!floatingPanel) return;
                floatingPanel.style.display = 'none';
                // Show launcher again on close
                const launcher = document.getElementById('floating-chat-toggle');
                if (launcher) launcher.style.display = 'flex';
                console.log('[FloatingChat] Closed');
            } catch (e) { console.error('[FloatingChat] Close failed', e); }
        });
    }
    if (floatingAskBtn) {
        floatingAskBtn.addEventListener('click', () => {
            try {
                if (typeof handleFloatingQuestion === 'function') {
                    handleFloatingQuestion();
                } else {
                    console.error('[FloatingChat] handleFloatingQuestion not defined');
                }
            } catch (e) { console.error('[FloatingChat] Click handler failed', e); }
        });
    }
    if (floatingInput) {
        floatingInput.addEventListener('keydown', (e) => {
            try {
                if (e.key === 'Enter') {
                    if (typeof handleFloatingQuestion === 'function') {
                        handleFloatingQuestion();
                    } else {
                        console.error('[FloatingChat] handleFloatingQuestion not defined');
                    }
                }
            } catch (err) { console.error('[FloatingChat] Keydown handler failed', err); }
        });
    }
    
    // Voice input listener
    if (voiceInputBtn) {
        voiceInputBtn.addEventListener('click', () => {
            handleVoiceInput();
        });
    }
    if (negotiationBtn) negotiationBtn.addEventListener('click', handleNegotiationTips);
    if (glossaryBtn) glossaryBtn.addEventListener('click', handleExplainGlossary);
    if (compareBtn) compareBtn.addEventListener('click', handleDocumentComparison);

    // Do not auto-show floating chat on init; will be shown after results render
    
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
    const shareBtnInit = document.getElementById('share-analysis-btn');
    
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', handleExportPDF);
    if (exportTextBtn) exportTextBtn.addEventListener('click', handleExportText);
    if (shareBtnInit) {
        shareBtnInit.addEventListener('click', async () => {
            try {
                await shareCurrentAnalysis();
            } catch (e) {
                console.error('[Share] Failed', e);
                alert('Unable to create share link. Please analyze a document first and ensure you are logged in.');
            }
        });
    }
    
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
            // Prevent the file input from being triggered if it's already been clicked
            if (e.target === fileInput) {
                console.log('File input itself was clicked, allowing default behavior');
                return;
            }
            console.log('Opening file dialog');
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        
        // Prevent file input from triggering twice
        fileInput.addEventListener('click', (e) => {
            console.log('File input clicked directly');
            e.stopPropagation();
        });
        
        console.log('Upload area click listener attached');
    } else {
        console.error('Upload elements not found!');
    }
    
    console.log('App initialization complete');

    if (connectLawyerBtn) {
        connectLawyerBtn.addEventListener('click', () => {
            try {
                toggleLawyerList();
            } catch (e) { console.error('[Lawyers] Toggle failed', e); }
        });
    }

    // Results tab navigation
    setupResultTabs();

    // Theme: load and toggle
    try {
        const savedTheme = localStorage.getItem('ll_theme');
        if (savedTheme) setTheme(savedTheme);
    } catch (_) {}
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const current = (document.documentElement.getAttribute('data-theme') || 'light');
            const next = current === 'dark' ? 'light' : 'dark';
            setTheme(next);
            try { localStorage.setItem('ll_theme', next); } catch (_) {}
            try { themeToggleBtn.innerHTML = next === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>'; } catch (_) {}
        });
    }
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
        alert('Please select a file first!');
        return;
    }
    
    // Determine file type by extension
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    currentFileExt = ext;
    console.log('Detected file extension:', ext, 'mime:', file.type);
    
    console.log('File selected:', file.name);
    console.log('API Key available:', !!(window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY));
    
    // Show privacy notice every time
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
    await new Promise(resolve => setTimeout(resolve, 500));
    showDocumentTypeDetection();
    
    try {
        if (ext === 'pdf') {
            // PDF flow (existing)
            console.log('[PDF] Converting file to base64...');
            const base64 = await fileToBase64(file);
            console.log('[PDF] Base64 conversion complete, length:', base64.length);
            currentDocument = base64; // used for compare
            console.log('[PDF] Detecting document type and language...');
            const detectionResult = await detectDocumentType(base64);
            console.log('[PDF] Detection result:', detectionResult);
            showDocumentTypeConfirmation(detectionResult, base64);
            return;
        }
        
        // Non-PDF flows → extract text then analyze
        let extractedText = '';
        if (ext === 'docx') {
            console.log('[DOCX] Extracting text with Mammoth.js...');
            extractedText = await extractTextFromDocx(file);
        } else if (ext === 'txt' || ext === 'md') {
            console.log('[TEXT] Reading plain text...');
            extractedText = await readFileAsText(file);
        } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
            console.log('[IMAGE] Running OCR with Tesseract.js...');
            extractedText = await extractTextFromImage(file);
        } else {
            throw new Error('Unsupported file type. Please upload PDF, DOCX, TXT, MD, PNG, or JPG.');
        }
        
        if (!extractedText || extractedText.trim().length < 5) {
            throw new Error('Could not extract readable text from the file.');
        }
        
        // Detect document type from text
        console.log('[TEXT] Detecting document type and language from extracted text...');
        const detectionResult = await detectDocumentTypeFromText(extractedText);
        console.log('[TEXT] Detection result:', detectionResult);
        currentTextDocument = extractedText;
        // Show confirmation for non-PDF uploads (parity with PDF flow)
        showDocumentTypeConfirmationText(detectionResult, extractedText);
        return;
        
    } catch (error) {
        console.error('Error handling upload:', error);
        alert('Error: ' + error.message);
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

// Network helper with limited retries for 429
function fetchWithRetry(url, options, retries = 2, backoffMs = 800) {
    return fetch(url, options).then(async (res) => {
        if (res.status === 429 && retries > 0) {
            console.log('429 received, retrying after', backoffMs, 'ms');
            await new Promise(r => setTimeout(r, backoffMs));
            return fetchWithRetry(url, options, retries - 1, backoffMs * 2);
        }
        return res;
    });
}

// Security and Privacy Notice (parity helper)
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
    const modal = document.createElement('div');
    modal.className = 'privacy-modal';
    modal.innerHTML = privacyNotice;
    document.body.appendChild(modal);
    return new Promise((resolve) => {
        const accept = modal.querySelector('#accept-privacy');
        const decline = modal.querySelector('#decline-privacy');
        if (accept) accept.addEventListener('click', () => { document.body.removeChild(modal); resolve(true); });
        if (decline) decline.addEventListener('click', () => { document.body.removeChild(modal); resolve(false); });
    });
}

// Detect document type from PDF (base64 inline_data)
async function detectDocumentType(base64Data) {
    const detectionPrompt = `
        Analyze this PDF and determine:
        1) LANGUAGE: English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, or Other
        2) TYPE: Choose the closest from this set (use exact labels):
           - Residential Lease Agreement
           - Commercial Lease Agreement
           - Rental/Housing Document
           - Employment Offer Letter
           - Employment Contract
           - Non-Disclosure Agreement (NDA)
           - Non-Compete Agreement
           - Consulting/Service Agreement
           - Vendor/Supplier Agreement
           - Sales Contract / Purchase Agreement
           - Loan Agreement
           - Credit Card Terms & Conditions
           - Mortgage/Deed of Trust
           - Insurance Policy
           - Terms of Service
           - Privacy Policy
           - Software License / EULA
           - Data Processing Addendum (DPA)
           - Partnership Agreement
           - Shareholders Agreement
           - General Legal Document

        Respond strictly in this format:
        LANGUAGE: <language>
        TYPE: <one exact label from the list>

        Example:
        LANGUAGE: English
        TYPE: Non-Disclosure Agreement (NDA)
    `;

    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: detectionPrompt },
                        { inline_data: { mime_type: 'application/pdf', data: base64Data } }
                    ]
                }]
            })
        });

        if (!response.ok) throw new Error(`Detection failed (${response.status})`);
        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || '';
        const languageMatch = responseText.match(/LANGUAGE:\s*(.+)/i);
        const typeMatch = responseText.match(/TYPE:\s*(.+)/i);
        const detectedLanguage = languageMatch ? languageMatch[1].trim() : 'English';
        const detectedType = typeMatch ? typeMatch[1].trim() : 'General Legal Document';
        console.log('Detected language:', detectedLanguage);
        console.log('Detected document type:', detectedType);
        return { type: detectedType, language: detectedLanguage };
    } catch (error) {
        console.error('Error detecting document type:', error);
        return { type: 'General Legal Document', language: 'English' };
    }
}

// Get document-type-specific prompt supplements
function getDocumentSpecificPrompt(documentType) {
    const type = (documentType || '').toLowerCase();
    if (type.includes('rental') || type.includes('lease') || type.includes('housing')) {
        return 'Focus on rent escalation, maintenance obligations, termination/notice, security deposit, automatic renewal, and penalty clauses.';
    }
    if (type.includes('loan') || type.includes('credit')) {
        return 'Focus on interest, APR, fees, late payment penalties, prepayment, collateral, cross-default, and acceleration clauses.';
    }
    if (type.includes('employment') || type.includes('nda') || type.includes('non-compete')) {
        return 'Focus on probation, termination, notice period, non-compete scope/duration, confidentiality, IP assignment, and arbitration.';
    }
    if (type.includes('terms of service') || type.includes('privacy')) {
        return 'Focus on unilateral changes, arbitration/venue, disclaimers, data collection/retention, and opt-out rights.';
    }
    if (type.includes('insurance')) {
        return 'Focus on coverage scope, exclusions, deductibles, claim process, cancellation, and renewal terms.';
    }
    return 'Focus on core obligations, liabilities, termination, dispute resolution, and any unusual or one-sided terms.';
}

// Proceed with analysis for PDF path
async function proceedWithAnalysis(documentType, language, base64Data) {
    showLoading(true);
    try {
        const finalLang = getSelectedAnalysisLanguage(language);
        console.log('Proceeding with analysis for document type:', documentType, 'language:', finalLang);
        const analysis = await analyzeDocumentWithGeminiWithType(base64Data, documentType, finalLang);
        console.log('Analysis complete');
        displayResults(analysis);
        updateUserAnalytics(analysis);
    } catch (error) {
        console.error('Error analyzing document:', error);
        alert('Error analyzing document: ' + error.message);
    } finally {
        isUploading = false;
        showLoading(false);
    }
}

// Detect document type from plain text (non-PDF inputs)
async function detectDocumentTypeFromText(text) {
    const detectionPrompt = `
        Analyze the following document TEXT and determine:
        1) LANGUAGE: English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, or Other
        2) TYPE: Choose the closest from this set (use exact labels):
           - Residential Lease Agreement
           - Commercial Lease Agreement
           - Rental/Housing Document
           - Employment Offer Letter
           - Employment Contract
           - Non-Disclosure Agreement (NDA)
           - Non-Compete Agreement
           - Consulting/Service Agreement
           - Vendor/Supplier Agreement
           - Sales Contract / Purchase Agreement
           - Loan Agreement
           - Credit Card Terms & Conditions
           - Mortgage/Deed of Trust
           - Insurance Policy
           - Terms of Service
           - Privacy Policy
           - Software License / EULA
           - Data Processing Addendum (DPA)
           - Partnership Agreement
           - Shareholders Agreement
           - General Legal Document

        Respond strictly in this format:
        LANGUAGE: <language>
        TYPE: <one exact label from the list>

        Example:
        LANGUAGE: English
        TYPE: Employment Contract
    `;

    try {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const snippet = text.slice(0, 15000);
        const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: detectionPrompt + '\n\n' + snippet }] }] })
        });
        if (!response.ok) throw new Error(`Detection failed (${response.status})`);
        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || '';
        const languageMatch = responseText.match(/LANGUAGE:\s*(.+)/i);
        const typeMatch = responseText.match(/TYPE:\s*(.+)/i);
        const detectedLanguage = languageMatch ? languageMatch[1].trim() : 'English';
        const detectedType = typeMatch ? typeMatch[1].trim() : 'General Legal Document';
        return { type: detectedType, language: detectedLanguage };
    } catch (error) {
        console.error('Error detecting document type from text:', error);
        return { type: 'General Legal Document', language: 'English' };
    }
}

// Analyze text content (non-PDF inputs)
async function proceedWithAnalysisText(documentType, language, textContent) {
    showLoading(true);
    try {
        const finalLang = getSelectedAnalysisLanguage(language);
        console.log('[TEXT] Proceeding with analysis for document type:', documentType, 'language:', finalLang);
        const analysis = await analyzeTextWithGeminiWithType(textContent, documentType, finalLang);
        console.log('[TEXT] Analysis complete');
        displayResults(analysis);
        updateUserAnalytics(analysis);
    } catch (error) {
        console.error('Error analyzing text document:', error);
        alert('Error analyzing document: ' + error.message);
    } finally {
        isUploading = false;
        showLoading(false);
    }
}

// Analyze plain text using Gemini with document type guidance
async function analyzeTextWithGeminiWithType(textContent, documentType, language = 'English') {
    const specificPrompt = getDocumentSpecificPrompt(documentType);
    const languageInstruction = language !== 'English'
        ? `\n\nIMPORTANT: The document is in ${language}. Please provide your analysis in ${language} while maintaining the same format and structure.`
        : '';
    const basePrompt = `
        You are a legal document analysis AI. ${specificPrompt}
        The following is the document TEXT (not a PDF):
        ---
        ${textContent.slice(0, 30000)}
        ---
        Please provide your analysis in the following format:
        
        RISK SCORE: [Rate from 1-10, where 1=very safe, 10=very risky]
        
        KEY ISSUES:
        • [List 3-5 most important clauses that need attention, each on a new line with bullet points]
        
        PLAIN ENGLISH SUMMARY:
        [Write a friendly, conversational summary that explains what this document is about in VERY SIMPLE language. Imagine you're explaining it to someone who has never seen a legal document before. Use everyday words, short sentences, and avoid ALL legal jargon. Focus on: 1) What is this document? 2) What are you agreeing to? 3) What are your main rights? 4) What are your main responsibilities? 5) What happens if something goes wrong? Make it sound like a helpful friend explaining things, not a lawyer.]
        
        RED FLAGS:
        • [List any predatory or unusual terms, each on a new line with bullet points. If none, write "No major red flags detected."]
        
        IMPORTANT OUTPUT RULES:
        - Always produce the sections above, even if the document is unconventional or outside typical legal categories (e.g., resume/CV, letter, certificate).
        - Never apologize, refuse, or say the categories are not applicable. If categories don't fit, infer sensible KEY ISSUES (e.g., notable statements, dates, obligations implied, sensitive data handling) and produce a practical summary.
        - If true legal risk is minimal (e.g., informational documents), return a low risk score (1-3) and explain why.
        - Do not use JSON format. Provide clean, readable text with bullet points as indicated.
        ${languageInstruction}
    `;
    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: basePrompt }] }] })
    });
    if (!response.ok) throw new Error(`Analysis failed (${response.status})`);
    const data = await response.json();
    const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysisText) throw new Error('Empty response from AI');
    const analysis = parseFormattedAnalysis(analysisText);
    analysis.document_type = documentType;
    analysis.language = language;
    return analysis;
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
        [Write a friendly, conversational summary that explains what this document is about in VERY SIMPLE language. Imagine you're explaining it to someone who has never seen a legal document before. Use everyday words, short sentences, and avoid ALL legal jargon. Focus on: 1) What is this document? 2) What are you agreeing to? 3) What are your main rights? 4) What are your main responsibilities? 5) What happens if something goes wrong? Make it sound like a helpful friend explaining things, not a lawyer.]
        
        RED FLAGS:
        • [List any predatory or unusual terms, each on a new line with bullet points. If none, write "No major red flags detected."]
        
        IMPORTANT OUTPUT RULES:
        - Always produce the sections above, even if the document is unconventional or outside typical legal categories (e.g., resume/CV, letter, certificate).
        - Never apologize, refuse, or say the categories are not applicable. If categories don't fit, infer sensible KEY ISSUES (e.g., notable statements, dates, obligations implied, sensitive data handling) and produce a practical summary.
        - If true legal risk is minimal (e.g., informational documents), return a low risk score (1-3) and explain why.
        - Do not use JSON format. Provide clean, readable text with bullet points as indicated.
        ${languageInstruction}
    `;

    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
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

    if (!response.ok) {
        throw new Error(`Analysis failed (${response.status})`);
    }

    const data = await response.json();
    const analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysisText) {
        throw new Error('Empty response from AI');
    }
    
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

    // Render clause review skeleton (non-intrusive)
    try {
        renderClauseReview(analysis);
    } catch (e) {
        console.error('[ClauseReview] Failed to render review pane:', e);
    }

    // Render source viewer (PDF or Text)
    try {
        renderSourceViewer();
    } catch (e) {
        console.error('[SourceViewer] Failed to render source:', e);
    }

    // Make floating chat launcher visible now that results exist
    try {
        const floatingToggle = document.getElementById('floating-chat-toggle');
        if (floatingToggle) floatingToggle.style.display = 'flex';
    } catch (e) { console.error('[FloatingChat] Failed to show launcher post-results', e); }

    // Bring results header into view for the user (anchor to section header)
    try {
        const header = document.querySelector('#results .section-header');
        if (header) {
            smoothScrollToEl(header, 90);
        } else {
            smoothScrollToId('results', 90);
        }
    } catch (_) {
        smoothScrollToId('results', 90);
    }
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

// Display key findings with enhanced summaries and actionable advice
async function displayKeyFindings(keyIssues, redFlags) {
    const findingsList = document.getElementById('findings-list');
    
    // Show loading state
    findingsList.innerHTML = '<div style="text-align:center; padding:20px; color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Generating enhanced summaries...</div>';
    
    // Get enhanced summaries with actionable advice
    const enhancedIssues = await getEnhancedClauseSummaries(keyIssues, analysisResults || {});
    const enhancedFlags = await getEnhancedClauseSummaries(redFlags, analysisResults || {}, true);
    
    let html = '';
    
    // Add enhanced key issues
    enhancedIssues.forEach(item => {
        const actionAdvice = getActionAdviceHTML(item.action);
        
        html += `<div class="finding-item" style="border-left:4px solid #3b82f6; border-radius:8px; padding:16px; margin-bottom:14px; background:#fff; box-shadow:0 2px 4px rgba(0,0,0,0.06);">
            <div style="display:flex; align-items:flex-start; gap:12px;">
                <span style="font-size:1.5em; flex-shrink:0;">⚖️</span>
                <div style="flex:1;">
                    <div style="font-weight:600; color:#1f2937; font-size:1.05em; margin-bottom:8px;">${escapeHtml(item.title)}</div>
                    <div style="color:#4b5563; line-height:1.7; margin-bottom:10px;">${escapeHtml(item.summary)}</div>
                    ${actionAdvice}
                </div>
            </div>
        </div>`;
    });
    
    // Add enhanced red flags
    enhancedFlags.forEach(item => {
        const actionAdvice = getActionAdviceHTML(item.action);
        
        html += `<div class="finding-item red-flag" style="border-left:4px solid #ef4444; border-radius:8px; padding:16px; margin-bottom:14px; background:#fef2f2; box-shadow:0 2px 4px rgba(239,68,68,0.1);">
            <div style="display:flex; align-items:flex-start; gap:12px;">
                <span style="font-size:1.5em; flex-shrink:0;">🚩</span>
                <div style="flex:1;">
                    <div style="font-weight:700; color:#991b1b; font-size:1.05em; margin-bottom:8px;">⚠️ ${escapeHtml(item.title)}</div>
                    <div style="color:#7f1d1d; line-height:1.7; margin-bottom:10px;">${escapeHtml(item.summary)}</div>
                    ${actionAdvice}
                </div>
            </div>
        </div>`;
    });
    
    findingsList.innerHTML = html || '<div style="color:#6b7280; text-align:center; padding:20px;">No findings available.</div>';
}

// Get action advice HTML badge
function getActionAdviceHTML(action) {
    const adviceTypes = {
        'consult_lawyer': {
            icon: '👨‍⚖️',
            text: 'Consult a lawyer',
            bg: '#fef3c7',
            color: '#92400e',
            border: '#fbbf24'
        },
        'important': {
            icon: '⭐',
            text: 'Important - Review carefully',
            bg: '#dbeafe',
            color: '#1e40af',
            border: '#3b82f6'
        },
        'negotiate': {
            icon: '🤝',
            text: 'Consider negotiating',
            bg: '#e0e7ff',
            color: '#3730a3',
            border: '#6366f1'
        },
        'urgent': {
            icon: '🔥',
            text: 'Urgent attention needed',
            bg: '#fee2e2',
            color: '#991b1b',
            border: '#ef4444'
        },
        'clarify': {
            icon: '❓',
            text: 'Seek clarification',
            bg: '#fef3c7',
            color: '#78350f',
            border: '#f59e0b'
        },
        'acceptable': {
            icon: '✅',
            text: 'Standard clause',
            bg: '#d1fae5',
            color: '#065f46',
            border: '#10b981'
        }
    };
    
    const advice = adviceTypes[action] || adviceTypes['important'];
    
    return `<div style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:${advice.bg}; color:${advice.color}; border:1px solid ${advice.border}; border-radius:20px; font-size:0.85em; font-weight:600; margin-top:4px;">
        <span>${advice.icon}</span>
        <span>${advice.text}</span>
    </div>`;
}

// Get enhanced clause summaries with actionable advice
async function getEnhancedClauseSummaries(clauses, analysis, isRedFlag = false) {
    if (!clauses || clauses.length === 0) return [];
    
    try {
        const documentType = analysis.document_type || 'General Legal Document';
        const language = analysis.language || 'English';
        
        const prompt = `
            You are analyzing clauses from a ${documentType}.
            
            For each clause below, provide:
            1. TITLE: A short, clear title (3-5 words)
            2. SUMMARY: An enhanced explanation (25-35 words) explaining what it means and why it matters
            3. ACTION: One of these exact words: consult_lawyer, important, negotiate, urgent, clarify, acceptable
            
            Clauses to analyze:
            ${clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}
            
            Respond in this EXACT format for each clause:
            ---CLAUSE ${isRedFlag ? 'FLAG' : 'ISSUE'} 1---
            TITLE: [short title]
            SUMMARY: [detailed explanation]
            ACTION: [one of: consult_lawyer, important, negotiate, urgent, clarify, acceptable]
            
            CRITICAL: Respond in ${language} language.
            
            Action Guidelines:
            - consult_lawyer: Legal complexity, potential legal issues
            - important: Significant impact on rights or obligations
            - negotiate: Unfavorable but negotiable terms
            - urgent: Critical issues requiring immediate attention
            - clarify: Ambiguous or unclear terms
            - acceptable: Standard, fair terms
        `;
        
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.GEMINI_API_KEY;
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        if (!response.ok) throw new Error('Enhancement failed');
        
        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Parse the response
        const enhancedData = [];
        const clauseBlocks = responseText.split(/---CLAUSE (?:FLAG|ISSUE) \d+---/).slice(1);
        
        clauses.forEach((clause, index) => {
            const block = clauseBlocks[index] || '';
            const titleMatch = block.match(/TITLE:\s*(.+?)(?=\n|SUMMARY:|$)/is);
            const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=\n|ACTION:|$)/is);
            const actionMatch = block.match(/ACTION:\s*(\w+)/i);
            
            enhancedData.push({
                original: clause,
                title: titleMatch?.[1]?.trim() || 'Key Clause',
                summary: summaryMatch?.[1]?.trim() || clause,
                action: (actionMatch?.[1] || (isRedFlag ? 'urgent' : 'important')).toLowerCase()
            });
        });
        
        return enhancedData;
    } catch (error) {
        console.error('Error enhancing summaries:', error);
        // Fallback: return basic structure
        return clauses.map(c => ({
            original: c,
            title: 'Key Clause',
            summary: c,
            action: isRedFlag ? 'urgent' : 'important'
        }));
    }
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
async function askQuestionAboutDocument(question, language = 'English') {
    const languageInstruction = language !== 'English' 
        ? `\n\nCRITICAL: You MUST respond ENTIRELY in ${language} language. ALL text must be in ${language}, including your answer.`
        : '';
    
    const prompt = `
        Based on the legal document analysis, answer this question in simple terms:
        
        Question: ${question}
        
        Document Summary: ${analysisResults.plain_summary}
        
        Provide a helpful, clear answer in 2-3 sentences.${languageInstruction}
    `;

    const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${window.GEMINI_API_KEY}`, {
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

    if (!response.ok) {
        throw new Error(`Q&A failed (${response.status})`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Q&A response');
    return text;
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
            <div class="enhanced-loading">
                <div class="loading-spinner"></div>
                <div class="loading-dots" aria-hidden="true">
                    <span></span><span></span><span></span>
                </div>
                <h3>🔍 Detecting document type...</h3>
                <div class="loading-progress"><div class="loading-progress-bar"></div></div>
            </div>
        </div>
    `;
    
    loading.classList.remove('hidden');
    results.classList.add('hidden');
    // Focus the loading section for immediate feedback
    smoothScrollToId('loading', 90);
}

async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
    });
}

async function extractTextFromDocx(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer });
        const html = result.value || '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const text = tmp.textContent || tmp.innerText || '';
        console.log('[DOCX] Extracted characters:', text.length);
        return text;
    } catch (e) {
        console.error('[DOCX] Extraction failed:', e);
        throw new Error('Failed to extract text from DOCX');
    }
}

async function extractTextFromImage(file) {
    try {
        const { data } = await Tesseract.recognize(file, 'eng', { logger: m => console.log('[OCR]', m.status, m.progress) });
        const text = data && data.text ? data.text : '';
        console.log('[IMAGE] OCR extracted characters:', text.length);
        return text;
    } catch (e) {
        console.error('[IMAGE] OCR failed:', e);
        throw new Error('Failed to OCR the image');
    }
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
                <div class="enhanced-loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-dots" aria-hidden="true">
                        <span></span><span></span><span></span>
                    </div>
                    <h3>🤖 Analyzing your document…</h3>
                    <p class="loading-text">This usually takes a few seconds.</p>
                    <div class="loading-progress"><div class="loading-progress-bar"></div></div>
                </div>
            </div>
        `;
        
        loading.classList.remove('hidden');
        results.classList.add('hidden');
        // Scroll into view so user sees progress
        smoothScrollToId('loading', 90);
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

        if (!response.ok) {
            throw new Error(`Comparison failed (${response.status})`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty comparison response');
        return text;
    } catch (error) {
        console.error('Error comparing documents:', error);
        throw error;
    }
}

// Generate negotiation suggestions
async function generateNegotiationTips(analysis) {
    const language = analysis.language || 'English';
    const prompt = `
        Based on this legal document analysis, provide practical negotiation advice.
        
        Document Analysis:
        - Risk Score: ${analysis.risk_score}/10
        - Key Issues: ${analysis.key_issues.join(', ')}
        - Summary: ${analysis.plain_summary}
        - Red Flags: ${analysis.red_flags.length > 0 ? analysis.red_flags.join(', ') : 'None detected'}
        
        Please provide 3-5 specific, actionable negotiation points that could improve the terms for the user. 
        Be practical and specific. Format your response as clear, numbered points without any special formatting characters.
        
        CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in ${language} language. ALL text must be in ${language}. Do not mix English with ${language}.
        - If ${language} is Hindi, respond completely in Hindi (हिन्दी में)
        - If ${language} is Bengali, respond completely in Bengali (বাংলায়)
        - If ${language} is Tamil, respond completely in Tamil (தமிழில்)
        - And so on for other Indian languages
        Use plain text only. No JSON, no special characters, no bullet points. Just clear, readable advice in ${language}.
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

        if (!response.ok) {
            throw new Error(`Negotiation tips failed (${response.status})`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty negotiation tips response');
        return text;
    } catch (error) {
        console.error('Error generating negotiation tips:', error);
        throw error;
    }
}

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
        alert('Please select a file to compare!');
        return;
    }
    
    if (!analysisResults) {
        alert('Please analyze a document first to compare against!');
        return;
    }
    
    const resultsDiv = document.getElementById('compare-results');
    resultsDiv.innerHTML = '<div class="loading-text">🤖 Comparing documents...</div>';
    
    try {
        // Determine main doc representation
        let mainType = 'pdf';
        let mainPayload = currentDocument;
        if (!currentDocument && currentTextDocument) {
            mainType = 'text';
            mainPayload = currentTextDocument;
        }
        if (mainType === 'pdf' && (!mainPayload || typeof mainPayload !== 'string' || mainPayload.length < 50)) {
            throw new Error('Main PDF data not available. Please re-analyze or upload again.');
        }
        // Determine compare file representation
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        let compareType = 'pdf';
        let comparePayload;
        if (ext === 'pdf') {
            comparePayload = await fileToBase64(file);
            compareType = 'pdf';
        } else if (ext === 'docx') {
            const text = await extractTextFromDocx(file);
            comparePayload = text;
            compareType = 'text';
        } else if (ext === 'txt' || ext === 'md') {
            const text = await readFileAsText(file);
            comparePayload = text;
            compareType = 'text';
        } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
            const text = await extractTextFromImage(file);
            comparePayload = text;
            compareType = 'text';
        } else {
            throw new Error('Unsupported compare file type. Use PDF, DOCX, TXT, MD, PNG, or JPG.');
        }
        if (compareType === 'text' && (!comparePayload || String(comparePayload).trim().length < 20)) {
            throw new Error('Could not extract readable text from the compare file. Please try another file.');
        }
        console.log('[Compare] Main type/payload:', mainType, mainType === 'pdf' ? (mainPayload?.length || 0) : (String(mainPayload).length));
        console.log('[Compare] Compare type/payload:', compareType, compareType === 'pdf' ? (comparePayload?.length || 0) : (String(comparePayload).length));
        // Compare using flexible function with language support
        const language = analysisResults?.language || 'English';
        const comparison = await compareDocumentsFlexible(mainPayload, mainType, comparePayload, compareType, language);
        const cleanComparison = cleanText(comparison);
        const formatted = formatComparisonResult(cleanComparison);
        resultsDiv.innerHTML = formatted;
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
        
        // Enable compare button only if main analysis exists
        if (compareBtn) {
            const canCompare = !!analysisResults;
            compareBtn.disabled = !canCompare;
            compareBtn.style.opacity = canCompare ? '1' : '0.6';
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
    const reportContent = generateReportContent();
    const printWindow = window.open('', '_blank');
    if (!printWindow || !printWindow.document) {
        alert('Popup blocked. Please allow popups to export.');
        return;
    }
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
                @media print { body { margin: 0; }
                    .header, .section, .footer { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            ${reportContent}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        try { printWindow.print(); } catch (e) { console.error('Print failed', e); }
        try { printWindow.close(); } catch (e) { /* noop */ }
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
    
    // Update app hero stats (unique metrics)
    const recentActivity = document.getElementById('recent-activity');
    const successRate = document.getElementById('success-rate');
    const timeSaved = document.getElementById('time-saved');
    
    if (recentActivity) {
        if (userAnalytics.totalDocuments === 0) {
            recentActivity.textContent = 'Ready';
        } else {
            const lastAnalysis = userAnalytics.analysisHistory[userAnalytics.analysisHistory.length - 1];
            if (lastAnalysis) {
                const now = new Date();
                const lastDate = new Date(lastAnalysis.date);
                const diffHours = Math.floor((now - lastDate) / (1000 * 60 * 60));
                if (diffHours < 1) recentActivity.textContent = 'Just now';
                else if (diffHours < 24) recentActivity.textContent = diffHours + 'h ago';
                else recentActivity.textContent = Math.floor(diffHours / 24) + 'd ago';
            }
        }
    }
    
    if (successRate) {
        // Success rate based on documents with low risk scores
        if (userAnalytics.totalDocuments > 0) {
            const lowRiskCount = userAnalytics.riskScores.filter(s => s <= 5).length;
            const rate = Math.round((lowRiskCount / userAnalytics.totalDocuments) * 100);
            successRate.textContent = rate + '%';
        }
    }
    
    if (timeSaved) {
        // Estimate 2 hours saved per document analyzed
        const hours = userAnalytics.totalDocuments * 2;
        if (hours === 0) timeSaved.textContent = '0h';
        else if (hours < 24) timeSaved.textContent = hours + 'h';
        else timeSaved.textContent = Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
    }
    
    // Update charts
    updateRiskChart();
    updateTrendsChart();
}

// --- Chart utilities ---
function getChartPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
        text: styles.getPropertyValue('--gray-700').trim() || '#374151',
        textDark: styles.getPropertyValue('--gray-900').trim() || '#F9FAFB',
        axis: styles.getPropertyValue('--gray-300').trim() || '#D1D5DB',
        primary: styles.getPropertyValue('--primary-color').trim() || '#2563EB',
        gradientA: styles.getPropertyValue('--success-color').trim() || '#10B981',
        gradientB: styles.getPropertyValue('--warning-color').trim() || '#F59E0B',
        gradientC: styles.getPropertyValue('--danger-color').trim() || '#EF4444'
    };
}

function makeSVG(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}

function updateRiskChart() {
    const mount = document.getElementById('risk-chart');
    if (!mount) return;

    // Histogram 1..10
    const bins = new Array(10).fill(0);
    userAnalytics.riskScores.forEach(s => { if (s >= 1 && s <= 10) bins[s - 1]++; });

    const width = Math.max(mount.clientWidth || 320, 320);
    const height = 220;
    const margin = { top: 16, right: 12, bottom: 28, left: 28 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const maxY = Math.max(...bins, 1);
    const barW = w / bins.length - 6;

    const palette = getChartPalette();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? palette.textDark : palette.text;

    // Clear
    mount.innerHTML = '';
    const svg = makeSVG('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: height });

    // Axes
    const g = makeSVG('g', { transform: `translate(${margin.left},${margin.top})` });
    const axisX = makeSVG('line', { x1: 0, y1: h, x2: w, y2: h, stroke: palette.axis, 'stroke-width': 1 });
    g.appendChild(axisX);

    // Bars
    bins.forEach((count, i) => {
        const x = i * (w / bins.length) + 3;
        const bh = (count / maxY) * (h - 10);
        const y = h - bh;
        const bar = makeSVG('rect', {
            x, y, width: barW, height: Math.max(bh, 1), rx: 6,
            fill: `url(#grad${i})`
        });
        g.appendChild(bar);

        const label = makeSVG('text', { x: x + barW / 2, y: h + 18, 'text-anchor': 'middle', 'font-size': '10', fill: textColor });
        label.textContent = i + 1;
        g.appendChild(label);

        if (count > 0) {
            const val = makeSVG('text', { x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', 'font-size': '10', fill: textColor });
            val.textContent = count;
            g.appendChild(val);
        }
    });

    // Gradients
    const defs = makeSVG('defs');
    bins.forEach((_, i) => {
        const lg = makeSVG('linearGradient', { id: `grad${i}`, x1: '0%', y1: '100%', x2: '0%', y2: '0%' });
        lg.appendChild(makeSVG('stop', { offset: '0%', 'stop-color': palette.gradientA }));
        lg.appendChild(makeSVG('stop', { offset: '50%', 'stop-color': palette.primary }));
        lg.appendChild(makeSVG('stop', { offset: '100%', 'stop-color': palette.gradientC }));
        defs.appendChild(lg);
    });
    svg.appendChild(defs);
    svg.appendChild(g);
    mount.appendChild(svg);
}

function updateTrendsChart() {
    const mount = document.getElementById('trends-chart');
    if (!mount) return;

    // Build time series from analysisHistory (last 30 entries)
    const data = userAnalytics.analysisHistory.slice(-30).map(d => ({
        t: new Date(d.date),
        v: d.riskScore
    }));
    if (data.length === 0) {
        mount.innerHTML = '<div class="result-content">No trend data yet.</div>';
        return;
    }
    // Sort by time
    data.sort((a, b) => a.t - b.t);

    const width = Math.max(mount.clientWidth || 320, 320);
    const height = 220;
    const margin = { top: 16, right: 20, bottom: 28, left: 32 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const tMin = data[0].t.getTime();
    const tMax = data[data.length - 1].t.getTime();
    const x = ts => (w * (ts - tMin)) / Math.max(tMax - tMin, 1);
    const y = v => h - (h * (v - 1)) / 9; // risk 1..10 mapped to top-down

    const palette = getChartPalette();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? palette.textDark : palette.text;

    mount.innerHTML = '';
    const svg = makeSVG('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: height });
    const g = makeSVG('g', { transform: `translate(${margin.left},${margin.top})` });

    // Axes
    g.appendChild(makeSVG('line', { x1: 0, y1: h, x2: w, y2: h, stroke: palette.axis, 'stroke-width': 1 }));
    // y ticks 1,5,10
    [1,5,10].forEach(val => {
        const yy = y(val);
        g.appendChild(makeSVG('line', { x1: 0, y1: yy, x2: w, y2: yy, stroke: palette.axis, 'stroke-dasharray': '2,3' }));
        const lbl = makeSVG('text', { x: -8, y: yy + 4, 'text-anchor': 'end', 'font-size': '10', fill: textColor });
        lbl.textContent = val;
        g.appendChild(lbl);
    });

    // Line path
    let dStr = '';
    data.forEach((p, i) => {
        const X = x(p.t.getTime());
        const Y = y(p.v);
        dStr += (i === 0 ? 'M' : 'L') + (X) + ',' + (Y) + ' ';
    });
    const path = makeSVG('path', { d: dStr, fill: 'none', stroke: palette.primary, 'stroke-width': 2.5 });
    g.appendChild(path);

    // Points
    data.forEach(p => {
        const X = x(p.t.getTime());
        const Y = y(p.v);
        g.appendChild(makeSVG('circle', { cx: X, cy: Y, r: 3, fill: palette.primary }));
    });

    // X labels (first and last date)
    const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
    const firstLbl = makeSVG('text', { x: 0, y: h + 18, 'text-anchor': 'start', 'font-size': '10', fill: textColor });
    firstLbl.textContent = fmt(data[0].t);
    g.appendChild(firstLbl);
    const lastLbl = makeSVG('text', { x: w, y: h + 18, 'text-anchor': 'end', 'font-size': '10', fill: textColor });
    lastLbl.textContent = fmt(data[data.length - 1].t);
    g.appendChild(lastLbl);

    svg.appendChild(g);
    mount.appendChild(svg);
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

// Lawyer directory integration
const LAWYER_DIRECTORY = [
    { name: 'Aarav Sharma', specialty: 'Contract Law', email: 'aarav.sharma@example.com', location: 'Mumbai' },
    { name: 'Isha Patel', specialty: 'Employment Law', email: 'isha.patel@example.com', location: 'Delhi' },
    { name: 'Rohan Mehta', specialty: 'Real Estate', email: 'rohan.mehta@example.com', location: 'Bengaluru' },
    { name: 'Neha Gupta', specialty: 'Corporate Law', email: 'neha.gupta@example.com', location: 'Pune' },
    { name: 'Kabir Singh', specialty: 'Intellectual Property', email: 'kabir.singh@example.com', location: 'Hyderabad' },
    { name: 'Ananya Rao', specialty: 'Privacy & Data', email: 'ananya.rao@example.com', location: 'Chennai' },
    { name: 'Vikram Desai', specialty: 'Banking & Finance', email: 'vikram.desai@example.com', location: 'Ahmedabad' },
    { name: 'Simran Kaur', specialty: 'Family Law', email: 'simran.kaur@example.com', location: 'Chandigarh' },
    { name: 'Arjun Verma', specialty: 'Taxation', email: 'arjun.verma@example.com', location: 'Kolkata' },
    { name: 'Pooja Nair', specialty: 'Insurance', email: 'pooja.nair@example.com', location: 'Kochi' }
];

function toggleLawyerList() {
    const el = document.getElementById('lawyer-list');
    if (!el) return;
    if (el.style.display === 'none' || !el.style.display) {
        renderLawyerList();
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

function renderLawyerList() {
    const el = document.getElementById('lawyer-list');
    if (!el) return;
    let html = '';
    LAWYER_DIRECTORY.forEach((lawyer, idx) => {
        html += `
            <div class="finding-item" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:8px;">
                <div style="display:flex; flex-direction:column;">
                    <div style="font-weight:600;">${escapeHtml(lawyer.name)}</div>
                    <div style="color:#6b7280; font-size:14px;">${escapeHtml(lawyer.specialty)} • ${escapeHtml(lawyer.location)}</div>
                    <div style="color:#6b7280; font-size:13px;">${escapeHtml(lawyer.email)}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="tool-btn" data-invite="${idx}" style="padding:8px 12px;">
                        <i class="fas fa-video"></i>
                        <span style="margin-left:6px;">Invite to Google Meet</span>
                    </button>
                    <button class="tool-btn" data-email="${idx}" style="padding:8px 12px;">
                        <i class="fas fa-envelope"></i>
                        <span style="margin-left:6px;">Notify by Email</span>
                    </button>
                </div>
            </div>
        `;
    });
    el.innerHTML = html || '<div style="color:#6b7280;">No lawyers available.</div>';
    el.querySelectorAll('[data-invite]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const i = Number(e.currentTarget.getAttribute('data-invite'));
            const lw = LAWYER_DIRECTORY[i];
            if (!lw) return;
            handleInviteLawyer(lw);
        });
    });
    el.querySelectorAll('[data-email]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const i = Number(e.currentTarget.getAttribute('data-email'));
            const lw = LAWYER_DIRECTORY[i];
            if (!lw) return;
            handleNotifyLawyer(lw);
        });
    });
}

function handleInviteLawyer(lawyer) {
    try {
        window.open('https://meet.google.com/new', '_blank');
        alert(`A new Google Meet has been opened in a new tab. Share the meeting link with ${lawyer.name} at ${lawyer.email}.`);
    } catch (e) {
        console.error('[Lawyers] Invite failed', e);
    }
}

function handleNotifyLawyer(lawyer) {
    try {
        const clientName = (currentUser && currentUser.email) ? currentUser.email : 'a client';
        const meetLink = prompt('Paste the Google Meet link to include (you can leave blank and add later):', '');
        const subjectRaw = 'Invitation to Google Meet – LegalLens AI';
        const bodyRaw = `Hello ${lawyer.name},\n\n${clientName} wishes to connect with you regarding a legal document review.\n\nPlease join the Google Meet at this link:\n${meetLink || '[PASTE_MEET_LINK_HERE]'}\n\nThank you!\nLegalLens AI`;

        const subject = encodeURIComponent(subjectRaw);
        const body = encodeURIComponent(bodyRaw);

        // Ask user which service to use to avoid Edge mailto issues
        const svc = (prompt('Send via (gmail | outlook | office365 | yahoo | mailto):', 'gmail') || 'gmail').toLowerCase();
        let url = '';
        const to = encodeURIComponent(lawyer.email);
        if (svc === 'gmail') {
            url = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
        } else if (svc === 'outlook') {
            url = `https://outlook.live.com/owa/?path=/mail/action/compose&to=${to}&subject=${subject}&body=${body}`;
        } else if (svc === 'office365') {
            url = `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
        } else if (svc === 'yahoo') {
            url = `https://compose.mail.yahoo.com/?to=${to}&subject=${subject}&body=${body}`;
        } else {
            url = `mailto:${to}?subject=${subject}&body=${body}`;
        }

        const w = window.open(url, '_blank');
        // Fallback: copy to clipboard if popup blocked or no handler
        setTimeout(async () => {
            try {
                if (!w || w.closed) {
                    await navigator.clipboard.writeText(`To: ${lawyer.email}\nSubject: ${subjectRaw}\n\n${bodyRaw}`);
                    alert('Could not open your email compose window.\nThe email content was copied to your clipboard.\nOpen your email and paste it to send.');
                }
            } catch (_) {
                // As a final fallback, try mailto without opening new tab
                try { window.location.href = `mailto:${to}?subject=${subject}&body=${body}`; } catch (e2) {}
            }
        }, 400);
    } catch (e) {
        console.error('[Lawyers] Email notify failed', e);
        alert('Failed to open email compose. You can copy the text manually from the console.');
        try { console.log('Email draft:', { to: lawyer.email, subject: 'Invitation to Google Meet – LegalLens AI', body: bodyRaw }); } catch (_) {}
    }
}
