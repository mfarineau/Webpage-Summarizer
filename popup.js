// Save the API key
document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) {
    chrome.storage.local.set({ openai_api_key: key }, () => {
      alert('API Key saved in browser extension storage.');
    });
  } else {
    alert('Please enter a valid API key.');
  }
});

// When "Summarize" is clicked
document.getElementById('summarizeBtn').addEventListener('click', async () => {
  chrome.storage.local.get(['openai_api_key'], async (result) => {
    const apiKey = result.openai_api_key;
    if (!apiKey) {
      alert('Please enter and save your API key first.');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getPageContent,
    }, async (results) => {
      const pageText = results[0].result;
      const summary = await getSummary(pageText, apiKey);
      document.getElementById('summary').textContent = summary;
    });
  });
});

function getPageContent() {
  return document.body.innerText;
}

async function getSummary(text, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes web pages.' },
        { role: 'user', content: `Summarize this content:\n\n${text.substring(0, 8000)}` }
      ],
      temperature: 0.5
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No summary returned.';
}
