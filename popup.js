document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  chrome.storage.local.set({ openai_api_key: key }, () => {
    alert('API Key saved!');
  });
});

document.getElementById('summarizeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_page' });
});
