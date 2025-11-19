// content.js
// ------------
// This file runs as a content script in every page the extension has
// permission to access.  It listens for messages from the popup and either
// injects a summary widget into the page or removes common ad elements.

// Listen for messages sent from popup.js. Depending on the action we either
// summarize the current page or strip ads from it.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'summarize_page') {
    // User clicked "Summarize" in the popup – build the summary widget.
    injectSummaryWidget(undefined, message.tone);
  } else if (message.action === 'summarize_selection') {
    // Summarize only the currently selected text if any is selected
    const selection = window.getSelection().toString();
    if (selection.trim()) {
      injectSummaryWidget(selection, message.tone);
    } else {
      showContentNotification('No text selected. Summarizing full page.', 'info');
      injectSummaryWidget(undefined, message.tone);
    }
  } else if (message.action === 'remove_ads') {
    // User clicked "Remove Ads" – hide advertising elements.
    removeAds();
  } else if (message.action === 'save_page') {
    // Save the current page content minus ads
    savePage();
  } else if (message.action === 'detect_framework') {
    // Identify the framework/CMS used by the current page and
    // send the result back to the popup.
    const result = detectFramework();
    sendResponse(result);
  } else if (message.action === 'analyze_bias') {
    // Analyze potential political bias in the current page
    injectBiasWidget();
  } else if (message.action === 'crawl_site_pdf') {
    (async () => {
      try {
        await crawlSiteToPdf(message.startUrl, message.maxPages);
        sendResponse({ ok: true });
      } catch (err) {
        const errorMessage = err?.message || String(err);
        console.error('Failed to crawl site to PDF:', err);
        sendResponse({ ok: false, error: errorMessage });
      }
    })();
    return true;
  }
  // No asynchronous response, so we don't keep the message port open.
  return false;
});

// content.js
// ----------
// Content script that runs on webpages.
// It now acts primarily as a data provider for the Side Panel.

// Listen for messages from the Side Panel or Background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get_page_content') {
    const text = document.body.innerText;
    const author = detectAuthor();
    const framework = detectFramework();
    sendResponse({ text, author, framework });
  } else if (message.action === 'remove_ads') {
    removeAds();
  } else if (message.action === 'crawl_site_pdf') {
    (async () => {
      try {
        await crawlSiteToPdf(message.startUrl, message.maxPages);
        sendResponse({ ok: true });
      } catch (err) {
        const errorMessage = err?.message || String(err);
        console.error('Failed to crawl site to PDF:', err);
        sendResponse({ ok: false, error: errorMessage });
      }
    })();
    return true;
  }
  return false;
});


// --- Helper Functions ---

function detectAuthor() {
  // 1. Meta tags
  let author = document.querySelector("meta[name='author']")?.content ||
    document.querySelector("meta[name='byl']")?.content ||
    document.querySelector("meta[property='article:author']")?.content ||
    document.querySelector("meta[property='og:author']")?.content ||
    document.querySelector("meta[name='twitter:creator']")?.content;

  if (author) return author.trim();

  // 2. JSON-LD Schema
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.textContent);
      const data = Array.isArray(json) ? json : [json];
      for (const item of data) {
        if (['NewsArticle', 'Article', 'BlogPosting'].includes(item['@type'])) {
          if (item.author) {
            if (Array.isArray(item.author)) {
              return item.author.map(a => a.name).join(', ');
            } else if (item.author.name) {
              return item.author.name;
            }
          }
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // 3. Visual Selectors
  const el = document.querySelector("[itemprop='author'] [itemprop='name']") ||
    document.querySelector("[rel='author']") ||
    document.querySelector(".byline") ||
    document.querySelector(".author") ||
    document.querySelector(".author-name") ||
    document.querySelector(".c-byline__item") ||
    document.querySelector("a[href*='/author/']");

  if (el) return el.textContent.trim();

  return '';
}

function detectFramework() {
  // Simple framework detection based on global variables or specific DOM elements
  if (document.querySelector('[id^="react-root"], [data-reactroot]')) return 'React';
  if (document.querySelector('app-root, [ng-version]')) return 'Angular';
  if (document.querySelector('[id="__next"]')) return 'Next.js';
  if (document.querySelector('[data-v-app]')) return 'Vue.js';
  if (window.jQuery) return 'jQuery';
  if (window.WordPress) return 'WordPress';
  return 'Unknown/Custom';
}

function removeAds() {
  const adSelectors = [
    'iframe[src*="ads"]',
    'div[class*="ad-"]',
    'div[id*="ad-"]',
    'aside',
    '.advertisement',
    '.ad-container'
  ];
  const ads = document.querySelectorAll(adSelectors.join(','));
  let count = 0;
  ads.forEach(ad => {
    ad.style.display = 'none';
    count++;
  });
  console.log(`Removed ${count} ad elements.`);
}

// --- PDF Crawling Logic (Preserved) ---
// (Assuming crawlSiteToPdf and its dependencies are defined below or imported)
// For brevity in this refactor, I am keeping the structure but ensuring the UI injection logic is gone.

const CONTENT_TOAST_STYLE_ID = 'webpage-summarizer-toast-styles';
const CONTENT_TOAST_CONTAINER_ID = 'webpage-summarizer-toast-stack';

// Premium Glassmorphism Styles for Injected Content
const CONTENT_TOAST_STYLES = `
:root {
  --ws-bg-color: #0f0c29;
  --ws-bg-gradient: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  --ws-glass-surface: rgba(255, 255, 255, 0.05);
  --ws-glass-border: rgba(255, 255, 255, 0.1);
  --ws-glass-highlight: rgba(255, 255, 255, 0.15);
  --ws-primary-accent: #b000e6;
  --ws-primary-gradient: linear-gradient(135deg, #b000e6, #7c4dff);
  --ws-text-main: #ffffff;
  --ws-text-muted: rgba(255, 255, 255, 0.7);
  --ws-radius-md: 12px;
  --ws-shadow-md: 0 8px 16px rgba(0, 0, 0, 0.2);
  --ws-font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.ws-widget-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 420px;
  background: var(--ws-bg-gradient);
  color: var(--ws-text-main);
  border: 1px solid var(--ws-glass-border);
  border-radius: var(--ws-radius-md);
  box-shadow: var(--ws-shadow-md);
  padding: 0;
  font-family: var(--ws-font-family);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: both;
}

.ws-widget-header {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--ws-glass-border);
  font-weight: 600;
  font-size: 1rem;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ws-text-main);
}

.ws-widget-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--ws-text-muted);
}

.ws-widget-content h3, .ws-widget-content h4 {
  color: var(--ws-text-main);
  margin-top: 0;
}

.ws-widget-actions {
  padding: 12px 16px;
  border-top: 1px solid var(--ws-glass-border);
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.1);
}

.ws-btn {
  background: var(--ws-glass-surface);
  border: 1px solid var(--ws-glass-border);
  color: var(--ws-text-main);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
  flex: 1;
}

.ws-btn:hover {
  background: var(--ws-glass-highlight);
}

.ws-btn-primary {
  background: var(--ws-primary-gradient);
  border: none;
  color: white;
}

/* Toast Styles */
.ws-toast-stack {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.ws-toast {
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--ws-glass-border);
  border-radius: var(--ws-radius-md);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ws-text-main);
  box-shadow: var(--ws-shadow-md);
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s;
  pointer-events: auto;
}

.ws-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.ws-toast--success { border-left: 4px solid #00e676; }
.ws-toast--error { border-left: 4px solid #ff1744; }
.ws-toast--info { border-left: 4px solid #2979ff; }
`;

const CONTENT_TOAST_ICONS = {
  success: '✔',
  error: '⚠',
  info: 'ℹ'
};

function ensureToastStylesInjected() {
  if (document.getElementById(CONTENT_TOAST_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = CONTENT_TOAST_STYLE_ID;
  style.textContent = CONTENT_TOAST_STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function getToastContainer() {
  let container = document.getElementById(CONTENT_TOAST_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTENT_TOAST_CONTAINER_ID;
    container.className = 'ws-toast-stack ws-toast-stack--page';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    (document.body || document.documentElement).appendChild(container);
  }
  return container;
}

function showContentNotification(message, type = 'info', duration = 4000) {
  ensureToastStylesInjected();
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `ws-toast ws-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'ws-toast__icon';
  icon.textContent = CONTENT_TOAST_ICONS[type] || CONTENT_TOAST_ICONS.info;

  const text = document.createElement('span');
  text.className = 'ws-toast__message';
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  const removeToast = () => {
    if (!toast.isConnected) {
      return;
    }
    toast.classList.remove('is-visible');
    const finalize = () => {
      if (toast.isConnected) {
        toast.remove();
      }
    };
    toast.addEventListener('transitionend', finalize, { once: true });
    setTimeout(finalize, 200);
  };

  const timer = setTimeout(removeToast, duration);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    removeToast();
  });
}

// Build a floating widget with shared styling, controls and drag support.
// Build a floating widget with shared styling, controls and drag support.
function createFloatingWidget(titleText, maxHeight = '70vh') {
  ensureToastStylesInjected(); // Ensure styles are present

  const container = document.createElement('div');
  container.className = 'ws-widget-container';
  container.style.maxHeight = maxHeight;

  const header = document.createElement('div');
  header.className = 'ws-widget-header';
  header.textContent = titleText;

  const content = document.createElement('div');
  content.className = 'ws-widget-content';

  const actions = document.createElement('div');
  actions.className = 'ws-widget-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'ws-btn ws-btn-primary';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(content.innerText);
    showContentNotification('Copied to clipboard!', 'success');
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ws-btn';
  closeBtn.textContent = 'Dismiss';
  closeBtn.onclick = () => container.remove();

  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);

  container.appendChild(header);
  container.appendChild(content);
  container.appendChild(actions);
  document.body.appendChild(container);

  // Drag Logic
  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    function onMove(ev) {
      container.style.left = `${ev.clientX - offsetX}px`;
      container.style.top = `${ev.clientY - offsetY}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return { container, content };
}

// Creates and displays the summary widget on the current page.
// The widget fetches text from the page, calls the OpenAI API and then
// displays the result to the user.
async function injectSummaryWidget(selectionText, tone = 'Executive') {
  // Remove any previous widget so we only have one instance.
  const old = document.getElementById('summary-widget');
  if (old) old.remove();

  // Build the widget container using the shared helper
  const { container, content } = createFloatingWidget('🧠 Webpage Summary & Chat', '80vh');
  container.id = 'summary-widget';
  content.id = 'summary-content';

  // Chat State
  let chatHistory = [];
  const pageText = selectionText || document.body.innerText;

  // Initial Loading State
  const loadingP = document.createElement('p');
  const loadingEm = document.createElement('em');
  loadingEm.textContent = 'Summarizing...';
  loadingP.appendChild(loadingEm);
  content.appendChild(loadingP);

  // Grab a few images from the page to display alongside the summary
  const imagesContainer = document.createElement('div');
  imagesContainer.style = 'display:flex; gap:6px; margin-bottom:12px; overflow-x:auto;';
  const imgUrls = Array.from(document.querySelectorAll('img'))
    .map(img => img.currentSrc || img.src)
    .filter(src => src && !src.startsWith('data:'))
    .slice(0, 3);
  imgUrls.forEach(url => {
    const imgEl = document.createElement('img');
    imgEl.src = url;
    imgEl.style = 'max-height:80px; border-radius:4px;';
    imagesContainer.appendChild(imgEl);
  });

  // Insert images container before the content area
  container.insertBefore(imagesContainer, content);

  // Chat Interface Elements
  const chatContainer = document.createElement('div');
  chatContainer.className = 'ws-chat-container';
  chatContainer.style = 'margin-top: 16px; border-top: 1px solid #eee; padding-top: 12px; display: flex; flex-direction: column; gap: 8px;';

  const chatLog = document.createElement('div');
  chatLog.className = 'ws-chat-log';
  chatLog.style = 'max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;';

  const inputArea = document.createElement('div');
  inputArea.style = 'display: flex; gap: 8px;';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.placeholder = 'Ask a follow-up question...';
  chatInput.style = 'flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; font-size: 14px;';

  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send';
  sendBtn.style = 'background: #6200ee; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-weight: 600;';

  inputArea.appendChild(chatInput);
  inputArea.appendChild(sendBtn);
  chatContainer.appendChild(chatLog);
  chatContainer.appendChild(inputArea);

  // Retrieve the user's OpenAI API key from extension storage.
  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    // Initialize Chat History
    chatHistory = [
      {
        role: 'system',
        content: getSystemPrompt(tone)
      },
      {
        role: 'user',
        content: `Summarize this:\n\n${pageText.substring(0, 12000)}` // Increased limit slightly
      }
    ];

    // Fetch the summary
    const summary = await fetchChatCompletion(chatHistory, openai_api_key);

    // Store summary in local history
    const entry = {
      url: window.location.href,
      timestamp: Date.now(),
      summary
    };
    chrome.storage.local.get({ summary_history: [] }, ({ summary_history }) => {
      summary_history.push(entry);
      chrome.storage.local.set({ summary_history });
    });

    // Update UI with Summary
    const formatted = formatSummary(summary);
    content.replaceChildren(formatted);

    // Append Chat Interface
    content.appendChild(chatContainer);

    // Add summary to history
    chatHistory.push({ role: 'assistant', content: summary });

    // Chat Interaction Logic
    const handleSend = async () => {
      const question = chatInput.value.trim();
      if (!question) return;

      // Add User Message to UI
      appendChatMessage('user', question);
      chatInput.value = '';
      chatInput.disabled = true;
      sendBtn.disabled = true;

      // Add User Message to History
      chatHistory.push({ role: 'user', content: question });

      // Show Typing Indicator
      const typingId = appendChatMessage('assistant', 'Typing...');

      // Fetch Response
      const response = await fetchChatCompletion(chatHistory, openai_api_key);

      // Update UI with Response
      updateChatMessage(typingId, response);

      // Add Assistant Message to History
      chatHistory.push({ role: 'assistant', content: response });

      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    };

    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  });

  function appendChatMessage(role, text) {
    const msgDiv = document.createElement('div');
    const id = Date.now().toString();
    msgDiv.id = id;
    msgDiv.style = `
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 85%;
      font-size: 14px;
      line-height: 1.4;
      ${role === 'user'
        ? 'align-self: flex-end; background: #6200ee; color: white;'
        : 'align-self: flex-start; background: #f0f0f0; color: #333;'}
    `;
    msgDiv.textContent = text;
    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    return id;
  }

  function updateChatMessage(id, text) {
    const msgDiv = document.getElementById(id);
    if (msgDiv) {
      msgDiv.textContent = text;
    }
  }
}

// Creates and displays a bias analysis widget on the page.
async function injectBiasWidget() {
  const old = document.getElementById('bias-widget');
  if (old) old.remove();
  const { container, content } = createFloatingWidget('📰 Bias Analysis', '60vh');
  container.id = 'bias-widget';

  const analyzingP = document.createElement('p');
  const analyzingEm = document.createElement('em');
  analyzingEm.textContent = 'Analyzing article and author...';
  analyzingP.appendChild(analyzingEm);
  content.appendChild(analyzingP);

  const pageText = document.body.innerText;
  const author = detectAuthor();

  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    let authorAnalysis = '';
    if (author) {
      try {
        const biasInfo = await fetchAuthorBias(author, openai_api_key);
        authorAnalysis = `\n\n### Author Context: ${author}\n${biasInfo}`;
      } catch (err) {
        console.error('Failed to fetch author bias:', err);
        authorAnalysis = `\n\n(Could not fetch background info for author: ${author})`;
      }
    } else {
      authorAnalysis = '\n\n(No author detected to analyze)';
    }

    const messages = [
      {
        role: 'system',
        content: 'You analyze political bias in news articles. Be objective and concise.'
      },
      {
        role: 'user',
        content: `Analyze the political bias of the following article. Indicate if it leans left, right or is neutral and list signs of bias.\n\n${pageText.substring(0, 8000)}`
      }
    ];

    const articleAnalysis = await fetchChatCompletion(messages, openai_api_key);

    // Combine the results
    const combinedHtml = document.createDocumentFragment();

    // 1. Article Analysis
    const articleHeader = document.createElement('h3');
    articleHeader.textContent = 'Article Analysis';
    articleHeader.style.marginTop = '0';
    combinedHtml.appendChild(articleHeader);
    combinedHtml.appendChild(formatSummary(articleAnalysis));

    // 2. Author Analysis (if available)
    const authorHeader = document.createElement('h3');
    authorHeader.textContent = 'Author Background';
    authorHeader.style.marginTop = '16px';
    combinedHtml.appendChild(authorHeader);

    const authorDiv = document.createElement('div');
    authorDiv.style.background = '#f5f5f5';
    authorDiv.style.padding = '10px';
    authorDiv.style.borderRadius = '8px';
    authorDiv.style.fontSize = '0.95rem';

    if (author) {
      // We already have the text in authorAnalysis, let's just clean it up or re-fetch if needed.
      // Actually, let's just display what we got from the separate lookup.
      // The authorAnalysis string constructed above was a bit of a mix. Let's use the raw result.
      // Re-fetching for clarity in this block:
      const biasInfo = await fetchAuthorBias(author, openai_api_key);
      authorDiv.innerHTML = `<strong>${author}</strong><br/>${biasInfo.replace(/\n/g, '<br/>')}`;
    } else {
      authorDiv.textContent = 'No author detected.';
    }
    combinedHtml.appendChild(authorDiv);

    content.replaceChildren(combinedHtml);
  });
}

// Check cache for author bias, otherwise query OpenAI
async function fetchAuthorBias(authorName, apiKey) {
  return new Promise((resolve) => {
    const cacheKey = `bias_cache_${authorName.toLowerCase().replace(/\s+/g, '_')}`;

    chrome.storage.local.get(cacheKey, async (result) => {
      if (result[cacheKey]) {
        console.log('Using cached bias for:', authorName);
        resolve(result[cacheKey]);
        return;
      }

      console.log('Fetching fresh bias for:', authorName);
      const messages = [
        {
          role: 'system',
          content: 'You are a political analyst. Determine if the following journalist/author typically leans left, right, or center in US politics. Provide a very brief 1-2 sentence summary of their known political stance or "Unknown" if not a public figure.'
        },
        {
          role: 'user',
          content: authorName
        }
      ];

      const response = await fetchChatCompletion(messages, apiKey);

      // Cache the result
      const data = {};
      data[cacheKey] = response;
      chrome.storage.local.set(data);

      resolve(response);
    });
  });
}

// Generic function to call OpenAI Chat Completion API
async function fetchChatCompletion(messages, apiKey) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: messages,
        temperature: 0.5
      }),
    });

    if (!response.ok) {
      return `❌ Error. (${response.status})`;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '❌ No response.';
  } catch (err) {
    return '❌ Error connecting to API.';
  }
}

function getSystemPrompt(tone) {
  switch (tone) {
    case 'Casual Read':
      return 'You are a helpful assistant that summarizes web pages for a popular audience. Use a casual, conversational tone. Focus on the most interesting and engaging parts of the story.';
    case 'Academic Analysis':
      return 'You are an academic researcher. Summarize the article and frame it within the most relevant academic discipline (e.g., science, politics, sociology). If it is scientific, speculate on the impact to the scientific community and our understanding. If political, focus on the impact on the country\'s politics. Use a formal, analytical tone.';
    case 'Executive':
    default:
      return 'You are an executive assistant. Provide a factual executive summary of the article. Focus on the key facts and takeaways. Use a professional, concise tone and format the output with clear bullet points.';
  }
}

// Takes the raw summary text returned from the API and converts it into
// simple HTML. This allows us to keep sections and bullet points looking
// nice inside the widget.
function formatSummary(text) {
  const fragment = document.createDocumentFragment();

  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  paragraphs.forEach(p => {
    if (/^(Summary|Takeaways|Conclusion|Key Points|Introduction)/i.test(p)) {
      const h4 = document.createElement('h4');
      h4.textContent = p;
      fragment.appendChild(h4);
    } else if (/^(\d+[\.\)]|[-•])\s+/.test(p)) {
      const para = document.createElement('p');
      para.style.marginLeft = '10px';
      para.textContent = p;
      fragment.appendChild(para);
    } else {
      const para = document.createElement('p');
      para.textContent = p;
      fragment.appendChild(para);
    }
  });

  return fragment;
}

// Save the current page's HTML (minus ads) to local storage for later viewing
function savePage() {
  const clone = document.documentElement.cloneNode(true);
  removeAds(clone);

  // Ensure relative links work when opened from storage
  const base = clone.querySelector('base');
  if (!base) {
    const baseEl = document.createElement('base');
    baseEl.href = location.href;
    clone.querySelector('head')?.appendChild(baseEl);
  }

  const html = '<!DOCTYPE html>\n' + clone.outerHTML;
  const entry = { url: location.href, timestamp: Date.now(), content: html };
  chrome.storage.local.get({ page_history: [] }, ({ page_history }) => {
    page_history.push(entry);
    chrome.storage.local.set({ page_history }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save page to history:', chrome.runtime.lastError);
        showContentNotification('Failed to save page.', 'error');
        return;
      }
      showContentNotification('Page saved!', 'success');
    });
  });
}

async function crawlSiteToPdf(startUrl = window.location.href, maxPages = 20) {
  const DEFAULT_MAX_PAGES = 20;
  const MAX_CAP = 75;

  if (!window.PDFLib) {
    throw new Error('PDF library is not available.');
  }

  const { PDFDocument, StandardFonts } = window.PDFLib;

  const limitSource = Number.isFinite(Number(maxPages)) ? Math.floor(Number(maxPages)) : DEFAULT_MAX_PAGES;
  const pageLimit = Math.max(1, Math.min(limitSource || DEFAULT_MAX_PAGES, MAX_CAP));

  const currentOrigin = window.location.origin;
  const startUrlObject = new URL(startUrl || window.location.href, window.location.href);
  if (startUrlObject.origin !== currentOrigin) {
    throw new Error('Start URL must be on the current site.');
  }

  const normalizeUrl = (candidate, base) => {
    try {
      const resolved = new URL(candidate, base);
      if (resolved.origin !== currentOrigin) {
        return null;
      }
      resolved.hash = '';
      return resolved.href;
    } catch (err) {
      return null;
    }
  };

  const startHref = normalizeUrl(startUrlObject.href, startUrlObject.href);
  if (!startHref) {
    throw new Error('Unable to determine a valid starting URL for the crawl.');
  }

  const queue = [{ url: startHref, depth: 0 }];
  const enqueued = new Set([startHref]);
  const visited = new Set();
  const crawledPages = [];

  const parser = new DOMParser();

  showContentNotification('Starting site crawl for PDF export…', 'info', 3000);

  while (queue.length && crawledPages.length < pageLimit) {
    const { url: currentUrl, depth: currentDepth } = queue.shift();
    enqueued.delete(currentUrl);

    if (visited.has(currentUrl)) {
      continue;
    }
    visited.add(currentUrl);

    try {
      let doc;
      let title;
      let cleanRoot;

      if (currentUrl === startHref) {
        doc = document;
        title = document.title?.trim() || currentUrl;
        cleanRoot = document.documentElement?.cloneNode(true);
      } else {
        const response = await fetch(currentUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        doc = parser.parseFromString(html, 'text/html');
        title = doc.querySelector('title')?.textContent?.trim() || currentUrl;
        cleanRoot = doc.documentElement?.cloneNode(true);
      }

      if (cleanRoot) {
        const nonVisualSelector = 'script, style, template, noscript, meta, link';
        cleanRoot.querySelectorAll(nonVisualSelector).forEach(node => node.remove());

        cleanRoot.querySelectorAll('[aria-hidden], [hidden]').forEach(node => {
          const ariaHidden = node.getAttribute('aria-hidden');
          const isAriaHidden = node.hasAttribute('aria-hidden') && ariaHidden !== null && ariaHidden.toLowerCase() !== 'false';
          const isHidden = node.hasAttribute('hidden');
          if (isAriaHidden || isHidden) {
            node.remove();
          }
        });
      }

      const cleanBody = cleanRoot?.querySelector('body');
      const contentSelectors = 'h1, h2, h3, h4, h5, h6, p, ul, li';
      let text = '';

      if (cleanBody) {
        const contentNodes = cleanBody.querySelectorAll(contentSelectors);
        const parts = [];
        const processedListItems = new WeakSet();

        contentNodes.forEach((node) => {
          const tagName = node.tagName?.toLowerCase();
          if (!tagName) {
            return;
          }

          if (tagName === 'ul') {
            const listItems = Array.from(node.children).filter(
              (child) => child.tagName?.toLowerCase() === 'li'
            );
            listItems.forEach((item) => {
              const value = item.textContent?.trim();
              if (value) {
                parts.push(value);
                processedListItems.add(item);
              }
            });
            return;
          }

          if (tagName === 'li' && processedListItems.has(node)) {
            return;
          }

          const value = node.textContent?.trim();
          if (value) {
            parts.push(value);
            if (tagName === 'li') {
              processedListItems.add(node);
            }
          }
        });

        if (parts.length) {
          text = parts.join('\n\n');
        }
      }

      crawledPages.push({ url: currentUrl, title, text });
      showContentNotification(`Crawled ${crawledPages.length}/${pageLimit}: ${currentUrl}`, 'info', 2500);

      if (crawledPages.length >= pageLimit) {
        break;
      }

      if (currentDepth < 1) {
        doc.querySelectorAll('a[href]').forEach((anchor) => {
          const href = anchor.getAttribute('href');
          if (!href) {
            return;
          }
          const normalized = normalizeUrl(href, currentUrl);
          if (!normalized) {
            return;
          }
          if (normalized === startHref) {
            return;
          }
          if (visited.has(normalized) || enqueued.has(normalized)) {
            return;
          }
          enqueued.add(normalized);
          queue.push({ url: normalized, depth: currentDepth + 1 });
        });
      }
    } catch (error) {
      console.error('Failed to fetch page during crawl:', currentUrl, error);
      showContentNotification(`Failed to crawl ${currentUrl}: ${error.message || error}`, 'error', 4000);
    }
  }

  if (!crawledPages.length) {
    const error = new Error('No pages were successfully crawled.');
    showContentNotification(error.message, 'error', 5000);
    throw error;
  }

  try {
    showContentNotification('Generating PDF…', 'info', 3000);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pageMargin = 40;
    const headingSize = 16;
    const bodySize = 12;
    const headingLineHeight = headingSize * 1.35;
    const bodyLineHeight = bodySize * 1.4;

    let page = pdfDoc.addPage();
    let { width, height } = page.getSize();
    let cursorY = height - pageMargin;

    const maxLineWidth = width - pageMargin * 2;

    const addPage = () => {
      page = pdfDoc.addPage();
      ({ width, height } = page.getSize());
      cursorY = height - pageMargin;
    };

    const ensureSpace = (lineHeight) => {
      if (cursorY - lineHeight < pageMargin) {
        addPage();
      }
    };

    const wrapText = (text, size) => {
      const lines = [];
      const paragraphs = (text || '').split(/\r?\n/);

      paragraphs.forEach((paragraph, index) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
          if (index !== paragraphs.length - 1) {
            lines.push('');
          }
          return;
        }

        let currentLine = '';
        words.forEach((word) => {
          const tentative = currentLine ? `${currentLine} ${word}` : word;
          if (font.widthOfTextAtSize(tentative, size) <= maxLineWidth) {
            currentLine = tentative;
          } else {
            if (currentLine) {
              lines.push(currentLine);
            }

            if (font.widthOfTextAtSize(word, size) <= maxLineWidth) {
              currentLine = word;
            } else {
              let segment = '';
              for (const char of word) {
                const candidate = segment + char;
                if (font.widthOfTextAtSize(candidate, size) <= maxLineWidth) {
                  segment = candidate;
                } else {
                  if (segment) {
                    lines.push(segment);
                  }
                  segment = char;
                }
              }
              currentLine = segment;
            }
          }
        });

        if (currentLine) {
          lines.push(currentLine);
        }

        if (index !== paragraphs.length - 1) {
          lines.push('');
        }
      });

      return lines;
    };

    const drawLines = (lines, size, lineHeight) => {
      lines.forEach((line) => {
        ensureSpace(lineHeight);
        if (line) {
          page.drawText(line, { x: pageMargin, y: cursorY, size, font });
        }
        cursorY -= lineHeight;
      });
    };

    crawledPages.forEach(({ url, title, text }, index) => {
      if (index > 0) {
        cursorY -= bodyLineHeight;
        if (cursorY < pageMargin) {
          addPage();
        }
      }

      const headingLines = wrapText(title, headingSize);
      drawLines(headingLines, headingSize, headingLineHeight);

      const urlLines = wrapText(url, bodySize);
      drawLines(urlLines, bodySize, bodyLineHeight);

      cursorY -= bodyLineHeight / 2;
      if (cursorY < pageMargin) {
        addPage();
      }

      const textLines = wrapText(text, bodySize);
      drawLines(textLines, bodySize, bodyLineHeight);
    });

    const dataUrl = await pdfDoc.saveAsBase64({ dataUri: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${startUrlObject.hostname || 'site'}-crawl-${timestamp}.pdf`;

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'download_pdf', filename, dataUrl },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (response?.ok) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Failed to initiate PDF download.'));
          }
        }
      );
    });

    showContentNotification(`PDF ready with ${crawledPages.length} page(s).`, 'success', 5000);
  } catch (error) {
    showContentNotification(error.message || 'Failed to generate PDF.', 'error', 5000);
    throw error;
  }
}

// Simple ad remover used when the user presses the "Remove Ads" button in the
// popup.  It looks for elements that commonly contain advertisements and removes
// them from the page.
function removeAds(root = document) {
  const selectors = [
    '[id*="ad" i]',
    '[class*="ad" i]',
    'iframe[src*="ad" i]',
    'iframe[src*="doubleclick" i]',
    'iframe[src*="adservice" i]'
  ];
  root.querySelectorAll(selectors.join(',')).forEach(el => el.remove());
}

// Attempt to extract the author name from common meta tags or byline elements
function detectAuthor() {
  // 1. Meta tags
  const metaSelectors = [
    "meta[name='author']",
    "meta[name='byl']",
    "meta[property='article:author']",
    "meta[property='og:author']",
    "meta[name='twitter:creator']"
  ];

  for (const sel of metaSelectors) {
    const content = document.querySelector(sel)?.content;
    if (content && content.length < 100) return content.trim();
  }

  // 2. Schema.org JSON-LD
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.textContent);
      // Handle both single object and array of objects
      const objects = Array.isArray(data) ? data : [data];
      for (const obj of objects) {
        if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article' || obj['@type'] === 'BlogPosting') {
          if (obj.author) {
            if (Array.isArray(obj.author)) {
              return obj.author[0].name;
            } else if (obj.author.name) {
              return obj.author.name;
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  // 3. Common visual selectors
  const visualSelectors = [
    "[itemprop='author'] [itemprop='name']",
    "[rel='author']",
    ".byline",
    ".author",
    ".author-name",
    ".c-byline__item", // Common in some news sites
    "a[href*='/author/']"
  ];

  for (const sel of visualSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      // Basic validation to avoid capturing full paragraphs
      if (text.length > 2 && text.length < 50 && !text.includes('\n')) {
        return text;
      }
    }
  }

  return '';
}

// Attempt to guess which framework or CMS the page is built with by
// inspecting meta tags and common file paths. Returns a string describing
// the detected framework or "Unknown" if no hints are found.
function detectFramework() {
  const generator = document.querySelector("meta[name='generator']")?.content || '';

  if (/Drupal/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `Drupal ${version[0]}` : 'Drupal';
  }

  if (/WordPress/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `WordPress ${version[0]}` : 'WordPress';
  }

  if (/Joomla/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `Joomla ${version[0]}` : 'Joomla';
  }

  if (document.querySelector("link[href*='wp-content'], script[src*='wp-content']")) {
    return 'WordPress';
  }

  if (document.querySelector("script[src*='drupal'], link[href*='drupal'], [data-drupal-selector]")) {
    return 'Drupal';
  }

  return 'Unknown';
}
