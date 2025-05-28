chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'summarize_page') {
    injectSummaryWidget();
  }
});

async function injectSummaryWidget() {
  // Remove old widget if exists
  const old = document.getElementById('summary-widget');
  if (old) old.remove();

  const container = document.createElement('div');
  container.id = 'summary-widget';
  container.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    max-height: 60vh;
    background: white;
    border: 1px solid #ccc;
    box-shadow: 0 0 12px rgba(0,0,0,0.2);
    border-radius: 8px;
    padding: 16px;
    font-family: Arial, sans-serif;
    z-index: 999999;
    overflow-y: auto;
  `;

  const title = document.createElement('div');
  title.innerText = '🧠 Webpage Summary';
  title.style = 'font-weight: bold; margin-bottom: 8px;';

  const content = document.createElement('div');
  content.innerHTML = '<p><em>Summarizing...</em></p>';
  content.id = 'summary-content';
  content.style = 'line-height: 1.5; font-size: 14px;';

  const close = document.createElement('button');
  close.innerText = 'Dismiss';
  close.style = 'margin-top: 10px; width: 100%;';
  close.onclick = () => container.remove();

  container.appendChild(title);
  container.appendChild(content);
  container.appendChild(close);
  document.body.appendChild(container);

  const pageText = document.body.innerText;

  chrome.storage.local.get('openai_api_key', async ({ openai_api_key }) => {
    if (!openai_api_key) {
      content.innerText = '⚠️ No API key found. Please save it in the extension popup.';
      return;
    }

    const summary = await fetchSummary(pageText, openai_api_key);
    const formatted = formatSummary(summary);
    content.innerHTML = formatted;
  });
}

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
          { role: 'system', content: 'You are a helpful assistant that summarizes web pages in the style of an executive summary.' },
          { role: 'user', content: `Summarize this:\n\n${text.substring(0, 8000)}` }
        ],
        temperature: 0.5
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '❌ No summary returned.';
  } catch (err) {
    return '❌ Error fetching summary.';
  }
}
function formatSummary(text) {
  // Split into paragraphs at double line breaks or numbered headers
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const formatted = paragraphs.map(p => {
    if (/^(Summary|Takeaways|Conclusion|Key Points|Introduction)/i.test(p)) {
      return `<h4>${p}</h4>`;
    } else if (/^(\d+[\.\)]|[-•])\s+/.test(p)) {
      // Bullet or numbered list item — keep as <li>
      return `<p style="margin-left: 10px;">${p}</p>`;
    } else {
      return `<p>${p}</p>`;
    }
  });

  return formatted.join('\n');
}
