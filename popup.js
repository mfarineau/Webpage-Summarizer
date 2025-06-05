// popup.js
// ---------
// Handles all of the interactions within the popup window. Users can save
// their OpenAI API key, request a summary of the current tab or remove ads
// from the page they are viewing.

// When the "Save Key" button is clicked we store the API key using
// chrome.storage so it can be accessed by the content script later.
const apiKeyInput = document.getElementById('apiKeyInput');

function updateKeyColor(key) {
  if (key) {
    apiKeyInput.classList.remove('key-missing');
    apiKeyInput.classList.add('key-stored');
  } else {
    apiKeyInput.classList.remove('key-stored');
    apiKeyInput.classList.add('key-missing');
  }
}

chrome.storage.local.get('openai_api_key', ({ openai_api_key }) => {
  apiKeyInput.value = openai_api_key || '';
  updateKeyColor(openai_api_key);
});

document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.local.set({ openai_api_key: key }, () => {
    alert('API Key saved!');
    updateKeyColor(key);
  });
});

// The "Summarize" button sends a message to the content script in the
// active tab instructing it to inject the summary widget.
document.getElementById('summarizeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_page' });
});

// The "Summarize Selection" button sends a message to the content script
// instructing it to summarize the currently highlighted text.
document.getElementById('summarizeSelectionBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_selection' });
});

// The "Remove Ads" button triggers the ad removal routine on the current page.
document.getElementById('removeAdsBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'remove_ads' });
});

// The "Detect Framework" button attempts to identify what CMS or
// framework the current site is built with and alerts the result.
document.getElementById('detectFrameworkBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'detect_framework' }, (response) => {
    alert(`Framework: ${response || 'Unknown'}`);
  });
});

// The "Domain Info" button attempts to look up DNS and WHOIS data for the
// current tab's domain and displays a simple alert with the results.
document.getElementById('lookupBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  const domain = url.hostname;

  try {
    const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const dnsData = await dnsRes.json();
    const ip = dnsData.Answer?.[0]?.data || 'Unknown';

    const whoisRes = await fetch(`https://rdap.org/domain/${domain}`);
    const whoisData = await whoisRes.json();
    const registrant = (whoisData.entities || []).find(e => (e.roles || []).includes('registrant'));
    const owner = registrant?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'Unknown';

    let hostInfo = '';
    if (ip !== 'Unknown') {
      try {
        const ipRes = await fetch(`https://ipinfo.io/${ip}/json`);
        const ipData = await ipRes.json();
        hostInfo = ipData.org ? `${ipData.org} (${ipData.country})` : ipData.country || '';
      } catch (err) {
        hostInfo = '';
      }
    }

    const message = `Domain: ${domain}\nOwner: ${owner}\nIP: ${ip}${hostInfo ? `\nHost: ${hostInfo}` : ''}`;
    alert(message);
  } catch (err) {
    alert('Failed to lookup domain information.');
  }
});
