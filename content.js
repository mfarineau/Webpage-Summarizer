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
      alert('No text selected. Summarizing full page.');
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
  }
  // No asynchronous response, so we don't keep the message port open.
  return false;
});

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
    font-size: 14px;
    line-height: 1.5;
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
  content.style = 'line-height: 1.5; font-size: 14px; margin-top: 8px; color: #222;';

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
    const data = await response.json();
    summary = data.choices?.[0]?.message?.content || '❌ No summary returned.';
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
    chrome.storage.local.set({ page_history });
    alert('Page saved!');
  });
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
