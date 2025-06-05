// popup.js
// ---------
// Handles all of the interactions within the popup window. Users can save
// their OpenAI API key, request a summary of the current tab or remove ads
// from the page they are viewing.

// When the "Save Key" button is clicked we store the API key using
// chrome.storage so it can be accessed by the content script later.
document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  chrome.storage.local.set({ openai_api_key: key }, () => {
    alert('API Key saved!');
  });
});

// The "Summarize" button sends a message to the content script in the
// active tab instructing it to inject the summary widget.
document.getElementById('summarizeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_page' });
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
