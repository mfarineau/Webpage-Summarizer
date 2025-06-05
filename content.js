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
    injectSummaryWidget();
  } else if (message.action === 'remove_ads') {
    // User clicked "Remove Ads" – hide advertising elements.
    removeAds();
  } else if (message.action === 'detect_framework') {
    // Identify the framework/CMS used by the current page and
    // send the result back to the popup.
    const result = detectFramework();
    sendResponse(result);
  }
  return true;
});

// Creates and displays the summary widget on the current page.
// The widget fetches text from the page, calls the OpenAI API and then
// displays the result to the user.
async function injectSummaryWidget() {
  // Remove any previous widget so we only have one instance.
  const old = document.getElementById('summary-widget');
  if (old) old.remove();

  // Build the outer container that will hold the summary text and close button
  const container = document.createElement('div');
  container.id = 'summary-widget';
  container.style = `
    position: fixed;        /* stay fixed in the corner */
    bottom: 20px;
    right: 20px;
    width: 400px;
    max-height: 60vh;       /* don't grow beyond 60% of viewport height */
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    border-radius: 4px;
    padding: 16px;
    font-family: Roboto, Arial, sans-serif;
    z-index: 999999;        /* appear on top of most things */
    overflow-y: auto;       /* scroll if the summary is long */
  `;

  // A simple title for the widget so users know what they're looking at
  const title = document.createElement('div');
  title.innerText = '🧠 Webpage Summary';
  title.style = `
    font-weight: 500;
    margin-bottom: 12px;
    font-size: 1.1rem;
  `;

  // This element will hold the summary text returned from the API.
  // We start with a placeholder while the request is in flight.
  const content = document.createElement('div');
  content.innerHTML = '<p><em>Summarizing...</em></p>';
  content.id = 'summary-content';
  content.style = 'line-height: 1.5; font-size: 14px;';

  // Users can dismiss the summary widget with this button
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

  // Assemble the widget and insert it into the page
  container.appendChild(title);
  container.appendChild(content);
  container.appendChild(close);
  document.body.appendChild(container);

  // Grab all text from the page to send to the API. We keep it simple by
  // using innerText which ignores HTML markup.
  const pageText = document.body.innerText;

  // Retrieve the user's OpenAI API key from extension storage. We need this
  // key to make requests to the chat completion endpoint.
  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      // Tell the user we can't continue without an API key.
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    // Fetch the summary and update the widget with the formatted text
    const summary = await fetchSummary(pageText, openai_api_key);
    const formatted = formatSummary(summary);
    content.innerHTML = formatted;
  });
}

// Calls the OpenAI API to generate a summary for the provided text.
// Returns the summary string on success or an error message on failure.
async function fetchSummary(text, apiKey) {
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
            content: 'You are a helpful assistant that summarizes web pages in the style of an executive summary.'
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
    return data.choices?.[0]?.message?.content || '❌ No summary returned.';
  } catch (err) {
    // Handle errors such as network failures or invalid API keys
    return '❌ Error fetching summary.';
  }
}
// Takes the raw summary text returned from the API and converts it into
// simple HTML. This allows us to keep sections and bullet points looking
// nice inside the widget.
function formatSummary(text) {
  // Split the text into paragraphs whenever there are two or more new lines.
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const formatted = paragraphs.map(p => {
    if (/^(Summary|Takeaways|Conclusion|Key Points|Introduction)/i.test(p)) {
      // Section headings become <h4> elements
      return `<h4>${p}</h4>`;
    } else if (/^(\d+[\.\)]|[-•])\s+/.test(p)) {
      // Bullet or numbered list item – indent slightly
      return `<p style="margin-left: 10px;">${p}</p>`;
    } else {
      // Regular paragraph
      return `<p>${p}</p>`;
    }
  });

  // Join the array back together as a single HTML string
  return formatted.join('\n');
}

// Simple ad remover used when the user presses the "Remove Ads" button in the
// popup.  It looks for elements that commonly contain advertisements and removes
// them from the page.
function removeAds() {
  const selectors = [
    '[id*="ad" i]',
    '[class*="ad" i]',
    'iframe[src*="ad" i]',
    'iframe[src*="doubleclick" i]',
    'iframe[src*="adservice" i]'
  ];
  document.querySelectorAll(selectors.join(',')).forEach(el => el.remove());
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
