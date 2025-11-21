// sidebar.js
// ------------
// Handles all logic for the Side Panel UI.
// Combines functionality from the old popup.js and the injected content widgets.

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const toneSelect = document.getElementById('toneSelect');
    const outputSection = document.getElementById('outputSection');
    const outputTitle = document.getElementById('outputTitle');
    const outputArea = document.getElementById('outputArea');
    const chatInterface = document.getElementById('chatInterface');
    const chatLog = document.getElementById('chatLog');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const toastContainer = document.getElementById('toastContainer');

    // State
    let currentChatHistory = [];
    let currentApiKey = '';
    let adsHidden = false;

    // --- Toast Logic ---
    const TOAST_ICONS = { success: '✔', error: '⚠', info: 'ℹ' };
    function showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `ws-toast ws-toast--${type}`;
        toast.innerHTML = `<span class="ws-toast__icon">${TOAST_ICONS[type]}</span><span class="ws-toast__message">${message}</span>`;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }

    // --- API Key Management ---
    function updateKeyStatus(key) {
        if (key) {
            apiKeyStatus.textContent = 'Saved';
            apiKeyStatus.classList.add('status-saved');
            apiKeyStatus.classList.remove('status-missing');
            currentApiKey = key;
        } else {
            apiKeyStatus.textContent = 'Missing';
            apiKeyStatus.classList.add('status-missing');
            apiKeyStatus.classList.remove('status-saved');
            currentApiKey = '';
        }
    }

    chrome.storage.local.get('openai_api_key', ({ openai_api_key }) => {
        apiKeyInput.value = openai_api_key || '';
        updateKeyStatus(openai_api_key);
    });

    document.getElementById('saveKeyBtn').addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        chrome.storage.local.set({ openai_api_key: key }, () => {
            showToast('API Key saved!', 'success');
            updateKeyStatus(key);
        });
    });

    // --- Settings Toggle ---
    document.getElementById('toggleSettingsBtn').addEventListener('click', () => {
        const settingsPanel = document.getElementById('settingsPanel');
        settingsPanel.hidden = !settingsPanel.hidden;
    });

    document.getElementById('apiKeyBtn').addEventListener('click', () => {
        const settingsPanel = document.getElementById('settingsPanel');
        settingsPanel.hidden = false;
        settingsPanel.scrollIntoView({ behavior: 'smooth' });
    });

    // --- OpenAI Helpers ---
    async function fetchChatCompletion(messages) {
        if (!currentApiKey) {
            showToast('Please save your OpenAI API Key first.', 'error');
            return null;
        }
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: messages,
                    temperature: 0.5
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'API Error');
            return data.choices?.[0]?.message?.content;
        } catch (err) {
            console.error(err);
            showToast(`Error: ${err.message}`, 'error');
            return null;
        }
    }

    function getSystemPrompt(tone) {
        switch (tone) {
            case 'Casual Read':
                return 'You are a helpful assistant that summarizes web pages for a popular audience. Use a casual, conversational tone. Focus on the most interesting and engaging parts of the story.';
            case 'Academic Analysis':
                return 'You are an academic researcher. Summarize the article and frame it within the most relevant academic discipline. Speculate on impact. Use a formal, analytical tone.';
            case 'Executive':
            default:
                return 'You are an executive assistant. Provide a factual executive summary. Focus on key facts. Use a professional, concise tone with bullet points.';
        }
    }

    // --- Content Script Communication ---
    async function getPageContent() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return null;

        // Check for restricted protocols
        if (!tab.url.startsWith('http')) {
            showToast('This page is restricted. Extension disabled.', 'error');
            return null;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'get_page_content' });
            return response;
        } catch (err) {
            console.error('Failed to get page content:', err);
            if (err.message.includes('Could not establish connection')) {
                showToast('Please reload the page to use the extension.', 'error');
            } else {
                showToast('Could not read page content.', 'error');
            }
            return null;
        }
    }

    // --- Features ---

    // 1. Summarize
    document.getElementById('summarizeBtn').addEventListener('click', async () => {
        const data = await getPageContent();
        if (!data) return;

        outputSection.hidden = false;
        outputTitle.textContent = 'Summary';
        outputArea.innerHTML = '<em>Summarizing...</em>';
        chatInterface.hidden = true;
        chatLog.innerHTML = '';

        const tone = toneSelect.value;
        const systemPrompt = getSystemPrompt(tone);

        currentChatHistory = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Summarize this:\n\n${data.text.substring(0, 12000)}` }
        ];

        const summary = await fetchChatCompletion(currentChatHistory);
        if (summary) {
            outputArea.innerHTML = formatSummary(summary);
            currentChatHistory.push({ role: 'assistant', content: summary });
            chatInterface.hidden = false;
        } else {
            outputArea.textContent = 'Failed to generate summary.';
        }
    });

    // 2. Bias Analysis
    document.getElementById('biasBtn').addEventListener('click', async () => {
        const data = await getPageContent();
        if (!data) return;

        outputSection.hidden = false;
        outputTitle.textContent = 'Bias Analysis';
        outputArea.innerHTML = '<em>Analyzing bias...</em>';
        chatInterface.hidden = true; // No chat for bias initially

        // Author Bias Lookup
        let authorContext = '';
        if (data.author) {
            const cacheKey = `bias_cache_${data.author.toLowerCase().replace(/\s+/g, '_')}`;
            const cached = await chrome.storage.local.get(cacheKey);

            if (cached[cacheKey]) {
                authorContext = cached[cacheKey];
            } else {
                const lookupMsg = [
                    { role: 'system', content: 'You are a political analyst. Determine if the author leans left, right, or center in US politics. Brief 1-2 sentences.' },
                    { role: 'user', content: data.author }
                ];
                const result = await fetchChatCompletion(lookupMsg);
                if (result) {
                    authorContext = result;
                    chrome.storage.local.set({ [cacheKey]: result });
                }
            }
        }

        const messages = [
            { role: 'system', content: 'You analyze political bias in news articles. Be objective and concise.' },
            { role: 'user', content: `Analyze the political bias of this article:\n\n${data.text.substring(0, 8000)}` }
        ];

        const analysis = await fetchChatCompletion(messages);
        if (analysis) {
            let html = `<h3>Article Analysis</h3>${formatSummary(analysis)}`;
            if (data.author) {
                html += `<h3>Author Background</h3><div style="background:rgba(255,255,255,0.1);padding:8px;border-radius:8px;"><strong>${data.author}</strong><br>${authorContext || 'No background info found.'}</div>`;
            }
            outputArea.innerHTML = html;
        } else {
            outputArea.textContent = 'Failed to analyze bias.';
        }
    });

    // 3. Chat Logic
    chatSendBtn.addEventListener('click', async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        // User Msg
        const userDiv = document.createElement('div');
        userDiv.className = 'chat-msg user';
        userDiv.textContent = text;
        chatLog.appendChild(userDiv);
        chatInput.value = '';

        currentChatHistory.push({ role: 'user', content: text });

        // Assistant Msg (Typing)
        const botDiv = document.createElement('div');
        botDiv.className = 'chat-msg assistant';
        botDiv.textContent = '...';
        chatLog.appendChild(botDiv);
        chatLog.scrollTop = chatLog.scrollHeight;

        const response = await fetchChatCompletion(currentChatHistory);
        if (response) {
            botDiv.textContent = response;
            currentChatHistory.push({ role: 'assistant', content: response });
        } else {
            botDiv.textContent = 'Error.';
        }
        chatLog.scrollTop = chatLog.scrollHeight;
    });

    // 4. Utilities
    document.getElementById('removeAdsBtn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'remove_ads' }, (response) => {
                if (response && response.adsHidden !== undefined) {
                    adsHidden = response.adsHidden;
                    const btn = document.getElementById('removeAdsBtn');
                    const icon = btn.querySelector('use');
                    const text = btn.querySelector('span');

                    if (adsHidden) {
                        icon.setAttribute('href', 'sf-symbols.svg#checkmark.circle');
                        text.textContent = 'Ads Off';
                        showToast('Ads hidden', 'success');
                    } else {
                        icon.setAttribute('href', 'sf-symbols.svg#eye.slash');
                        text.textContent = 'No Ads';
                        showToast('Ads restored', 'info');
                    }
                }
            });
        }
    });

    document.getElementById('checkCookiesBtn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            // For cookies, we can just run the logic here since we have the permission
            chrome.cookies.getAll({ url: tab.url }, (cookies) => {
                const trackerPatterns = /(_ga|_gid|_fb|fr|track|ad|pixel|collect|analytics)/i;
                const tracking = cookies.filter(c => trackerPatterns.test(c.name));
                showToast(`Found ${tracking.length} potential tracking cookies.`, tracking.length > 0 ? 'info' : 'success');
            });
        }
    });

    document.getElementById('detectFrameworkBtn').addEventListener('click', async () => {
        const data = await getPageContent();
        if (data) {
            showToast(`Framework: ${data.framework}`, 'info');
        }
    });

    document.getElementById('savePageBtn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'save_page' }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast('Failed to save page.', 'error');
                } else {
                    showToast('Page saved to history!', 'success');
                }
            });
        }
    });

    document.getElementById('exportPdfBtn').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            showToast('Starting PDF export...', 'info');
            chrome.tabs.sendMessage(tab.id, {
                action: 'crawl_site_pdf',
                startUrl: tab.url,
                maxPages: 20
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast('PDF export failed.', 'error');
                } else if (response?.ok) {
                    showToast('PDF export complete!', 'success');
                } else {
                    showToast(`PDF export failed: ${response?.error || 'Unknown error'}`, 'error');
                }
            });
        }
    });

    // 5. JS Management
    const jsPanel = document.getElementById('jsPanel');
    const jsAllowedList = document.getElementById('jsAllowedList');
    const jsBlockedList = document.getElementById('jsBlockedList');
    const jsCurrentSiteHost = document.getElementById('jsCurrentSiteHost');
    const jsToggleCurrentBtn = document.getElementById('jsToggleCurrentBtn');

    function renderJsPanel() {
        // Clear lists
        jsAllowedList.innerHTML = '';
        jsBlockedList.innerHTML = '';

        // Get stored exceptions
        chrome.storage.local.get({ js_exceptions: {} }, (data) => {
            const exceptions = data.js_exceptions;
            const allowed = [];
            const blocked = [];

            for (const [pattern, setting] of Object.entries(exceptions)) {
                const host = pattern.replace('/*', '').replace(/https?:\/\//, '');
                if (setting === 'allow') allowed.push({ host, pattern });
                else blocked.push({ host, pattern });
            }

            const createListItem = (host, pattern) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${host}</span>
                    <button class="js-site-delete-btn" title="Remove exception">
                        <svg><use href="sf-symbols.svg#trash" /></svg>
                    </button>
                `;
                li.querySelector('.js-site-delete-btn').addEventListener('click', () => {
                    delete exceptions[pattern];
                    chrome.storage.local.set({ js_exceptions: exceptions }, () => {
                        // Also reset the content setting for this pattern
                        chrome.contentSettings.javascript.clear({ primaryPattern: pattern }, () => {
                            renderJsPanel();
                            showToast(`Removed ${host}`, 'success');
                        });
                    });
                });
                return li;
            };

            if (allowed.length === 0) jsAllowedList.innerHTML = '<li><em>No allowed sites</em></li>';
            else {
                jsAllowedList.innerHTML = '';
                allowed.forEach(({ host, pattern }) => jsAllowedList.appendChild(createListItem(host, pattern)));
            }

            if (blocked.length === 0) jsBlockedList.innerHTML = '<li><em>No blocked sites</em></li>';
            else {
                jsBlockedList.innerHTML = '';
                blocked.forEach(({ host, pattern }) => jsBlockedList.appendChild(createListItem(host, pattern)));
            }
        });

        // Update Current Site Status
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab && tab.url) {
                try {
                    const url = new URL(tab.url);
                    if (!url.protocol.startsWith('http')) {
                        jsCurrentSiteHost.textContent = 'Restricted Page';
                        jsToggleCurrentBtn.disabled = true;
                        jsToggleCurrentBtn.textContent = 'N/A';
                        return;
                    }

                    jsCurrentSiteHost.textContent = url.hostname;
                    jsToggleCurrentBtn.disabled = false;

                    // Check actual setting
                    chrome.contentSettings.javascript.get({ primaryUrl: tab.url }, (details) => {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError);
                            return;
                        }
                        const isAllowed = details.setting === 'allow';
                        jsToggleCurrentBtn.innerHTML = `
                            <svg class="icon"><use href="sf-symbols.svg#bolt" /></svg>
                            <span>${isAllowed ? 'Disable JS' : 'Enable JS'}</span>
                        `;
                        jsToggleCurrentBtn.className = isAllowed ? 'btn secondary small-btn' : 'btn primary small-btn';
                    });
                } catch (e) {
                    jsCurrentSiteHost.textContent = 'Invalid URL';
                    jsToggleCurrentBtn.disabled = true;
                }
            }
        });
    }

    document.getElementById('toggleJsBtn').addEventListener('click', () => {
        // Hide other main sections
        document.querySelector('.control-panel').hidden = true;
        document.querySelector('.tools-panel').hidden = true;
        if (!outputSection.hidden) outputSection.hidden = true;

        jsPanel.hidden = false;
        renderJsPanel();
    });

    document.getElementById('jsBackBtn').addEventListener('click', () => {
        jsPanel.hidden = true;
        document.querySelector('.control-panel').hidden = false;
        document.querySelector('.tools-panel').hidden = false;
    });

    jsToggleCurrentBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.runtime.sendMessage({ action: 'toggle_js', url: tab.url, tabId: tab.id }, (response) => {
                if (chrome.runtime.lastError || !response.ok) {
                    showToast('Failed to toggle JS.', 'error');
                } else {
                    showToast(`JS ${response.newSetting === 'allow' ? 'Enabled' : 'Disabled'}. Reloading...`, 'success');
                    // Re-render panel after short delay to allow storage update
                    setTimeout(renderJsPanel, 500);
                }
            });
        }
    });

    document.getElementById('historyBtn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Helper: Format Summary Text to HTML
    function formatSummary(text) {
        return text.split(/\n{2,}/).map(p => `<p>${p}</p>`).join('');
    }
});
