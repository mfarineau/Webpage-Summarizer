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

const CONTENT_TOAST_STYLE_ID = 'webpage-summarizer-toast-styles';
const CONTENT_TOAST_CONTAINER_ID = 'webpage-summarizer-toast-stack';

const CONTENT_TOAST_STYLES = `
.ws-toast-stack {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(320px, calc(100% - 32px));
  z-index: 2147483647;
  pointer-events: none;
  --ws-toast-bg: rgba(255, 255, 255, 0.95);
  --ws-toast-border: rgba(0, 0, 0, 0.12);
  --ws-toast-text: #1b1b1b;
  --ws-toast-info: #2962ff;
  --ws-toast-success: #2e7d32;
  --ws-toast-error: #c62828;
  --ws-toast-shadow: rgba(0, 0, 0, 0.25);
}

.ws-toast-stack.ws-toast-stack--page {
  top: 20px;
  bottom: auto;
  right: 24px;
  left: auto;
  transform: none;
  align-items: flex-end;
  width: min(360px, calc(100% - 32px));
}

@media (max-width: 600px) {
  .ws-toast-stack.ws-toast-stack--page {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    align-items: center;
    width: calc(100% - 32px);
  }
}

.ws-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--ws-toast-bg);
  color: var(--ws-toast-text);
  border: 1px solid var(--ws-toast-border);
  border-left: 4px solid var(--ws-toast-info);
  border-radius: 12px;
  box-shadow: 0 12px 32px var(--ws-toast-shadow);
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.4;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  white-space: pre-line;
  max-width: min(360px, calc(100vw - 32px));
}

.ws-toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.ws-toast__icon {
  font-size: 1.2rem;
  line-height: 1;
  margin-top: 2px;
}

.ws-toast__message {
  flex: 1;
  white-space: inherit;
}

.ws-toast--success {
  border-left-color: var(--ws-toast-success);
}

.ws-toast--error {
  border-left-color: var(--ws-toast-error);
}

.ws-toast--info {
  border-left-color: var(--ws-toast-info);
}

@media (prefers-color-scheme: dark) {
  .ws-toast-stack {
    --ws-toast-bg: rgba(24, 24, 24, 0.94);
    --ws-toast-border: rgba(255, 255, 255, 0.16);
    --ws-toast-text: #f5f5f5;
    --ws-toast-info: #82b1ff;
    --ws-toast-success: #81c784;
    --ws-toast-error: #ef9a9a;
    --ws-toast-shadow: rgba(0, 0, 0, 0.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ws-toast {
    transition: none;
  }
}
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
function createFloatingWidget(titleText, maxHeight = '70vh') {
  const container = document.createElement('div');
  container.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 420px;
    max-height: ${maxHeight};
    background: #fff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-radius: 8px;
    padding: 16px;
    font-family: Roboto, Arial, sans-serif;
    z-index: 999999;
    overflow: auto;
    resize: both;
    left: auto;
    top: auto;
    font-size: 1rem;
    line-height: 1.25;
    color: #222;
  `;

  const title = document.createElement('div');
  title.innerText = titleText;
  title.style = `
    font-weight: 500;
    margin: -16px -16px 12px -16px;
    font-size: 1.1rem;
    padding: 8px 12px;
    background: #6200ee;
    color: #fff;
    border-radius: 8px 8px 0 0;
    cursor: move;
  `;

  const content = document.createElement('div');
  content.style = 'line-height: 1.25; font-size: 1rem; margin-top: 8px; color: #222;';

  const copyBtn = document.createElement('button');
  copyBtn.innerText = 'Copy';
  copyBtn.style = `
    margin-top: 8px;
    width: 100%;
    background: #6200ee;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
  `;
  copyBtn.onclick = () => navigator.clipboard.writeText(content.innerText);

  const close = document.createElement('button');
  close.innerText = 'Dismiss';
  close.style = `
    margin-top: 12px;
    width: 100%;
    background: #6200ee;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
  `;
  close.onclick = () => container.remove();

  container.appendChild(title);
  container.appendChild(content);
  container.appendChild(copyBtn);
  container.appendChild(close);
  document.body.appendChild(container);

  title.addEventListener('mousedown', (e) => {
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
  const { container, content } = createFloatingWidget('🧠 Webpage Summary', '70vh');
  container.id = 'summary-widget';
  content.id = 'summary-content';

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

  // Grab the text to summarize. If a specific selection was provided use that,
  // otherwise fall back to the full page text.
  const pageText = selectionText || document.body.innerText;

  // Retrieve the user's OpenAI API key from extension storage. We need this
  // key to make requests to the chat completion endpoint.
  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      // Tell the user we can't continue without an API key.
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    // Fetch the summary and update the widget with the formatted text
    const summary = await fetchSummary(pageText, openai_api_key, tone);
    const formatted = formatSummary(summary);
    content.replaceChildren(formatted);
  });
}

// Creates and displays a bias analysis widget on the page.
async function injectBiasWidget() {
  const old = document.getElementById('bias-widget');
  if (old) old.remove();
  const { container, content } = createFloatingWidget('📰 Bias Analysis', '50vh');
  container.id = 'bias-widget';

  const analyzingP = document.createElement('p');
  const analyzingEm = document.createElement('em');
  analyzingEm.textContent = 'Analyzing...';
  analyzingP.appendChild(analyzingEm);
  content.appendChild(analyzingP);

  const pageText = document.body.innerText;
  const author = detectAuthor();

  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    const analysis = await fetchBias(pageText, openai_api_key, author);
    const formatted = formatSummary(analysis);
    content.replaceChildren(formatted);
  });
}

// Calls the OpenAI API to generate a summary for the provided text.
// Returns the summary string on success or an error message on failure.
async function fetchSummary(text, apiKey, tone = 'Executive') {
  let summary;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(tone)
          },
          {
            role: 'user',
            content: `Summarize this:\n\n${text.substring(0, 8000)}`
          }
        ],
        temperature: 0.5
      }),
    });

    // The API returns an object with an array of choices. We take the first
    // choice's message content as our summary.
    if (!response.ok) {
      summary = `❌ Error fetching summary. (${response.status})`;
    } else {
      const data = await response.json();
      summary = data.choices?.[0]?.message?.content || '❌ No summary returned.';
    }
  } catch (err) {
    // Handle errors such as network failures or invalid API keys
    summary = '❌ Error fetching summary.';
  }

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

  return summary;
}

// Call OpenAI to analyze the political bias of the text.
async function fetchBias(text, apiKey, author = '') {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You analyze political bias in news articles and respond concisely.'
          },
          {
            role: 'user',
            content: `Analyze the political bias of the following article. Indicate if it leans left, right or is neutral and list signs of bias.\n\n${text.substring(0, 8000)}${author ? `\n\nThe author is "${author}". Research up to 25 recent articles by this author and provide an overall bias rating for the author's work.` : ''}`
          }
        ],
        temperature: 0
      }),
    });

    if (!response.ok) {
      return `❌ Error analyzing bias. (${response.status})`;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '❌ No analysis returned.';
  } catch (err) {
    return '❌ Error analyzing bias.';
  }
}

function getSystemPrompt(tone) {
  switch (tone) {
    case 'Bullet Points':
      return 'You are a helpful assistant that summarizes web pages using clear and concise bullet points.';
    case 'Casual':
      return 'You are a helpful assistant that summarizes web pages in a casual, conversational tone.';
    default:
      return 'You are a helpful assistant that summarizes web pages in the style of an executive summary.';
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
      const response = await fetch(currentUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const doc = parser.parseFromString(html, 'text/html');
      const title = doc.querySelector('title')?.textContent?.trim() || currentUrl;

      const cleanRoot = doc.documentElement?.cloneNode(true);
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
      const contentSelectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, article, section';
      let text = '';

      if (cleanBody) {
        const contentNodes = cleanBody.querySelectorAll(contentSelectors);
        const parts = [];

        contentNodes.forEach((node) => {
          const value = node.textContent?.trim();
          if (value) {
            parts.push(value);
          }
        });

        if (parts.length) {
          text = parts.join('\n\n');
        }
      }

      if (!text) {
        text = cleanBody?.innerText?.trim() || doc.body?.innerText?.trim() || '';
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
  let author = document.querySelector("meta[name='author']")?.content;
  if (author) {
    return author.trim();
  }

  const el = document.querySelector("[itemprop='author'] [itemprop='name'], [rel='author'], .byline, .author");
  if (el) {
    return el.textContent.trim();
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
