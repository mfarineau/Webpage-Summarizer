// popup.js
// ---------
// Handles all of the interactions within the popup window. Users can save
// their OpenAI API key, request a summary of the current tab or remove ads
// from the page they are viewing.

// When the "Save Key" button is clicked we store the API key using
// chrome.storage so it can be accessed by the content script later.
const apiKeyInput = document.getElementById('apiKeyInput');
const toneSelect = document.getElementById('toneSelect');
const apiKeyStatus = document.getElementById('apiKeyStatus');

function updateKeyStatus(key) {
  if (key) {
    apiKeyStatus.textContent = 'API key saved';
    apiKeyStatus.classList.add('status-saved');
    apiKeyStatus.classList.remove('status-missing');
  } else {
    apiKeyStatus.textContent = 'API key missing';
    apiKeyStatus.classList.add('status-missing');
    apiKeyStatus.classList.remove('status-saved');
  }
}

chrome.storage.local.get('openai_api_key', ({ openai_api_key }) => {
  apiKeyInput.value = openai_api_key || '';
  updateKeyStatus(openai_api_key);
});

document.getElementById('saveKeyBtn').addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  chrome.storage.local.set({ openai_api_key: key }, () => {
    alert('API Key saved!');
    updateKeyStatus(key);
  });
});

// The "Summarize" button sends a message to the content script in the
// active tab instructing it to inject the summary widget.
document.getElementById('summarizeBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tone = toneSelect.value;
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_page', tone });
});

// The "Summarize Selection" button sends a message to the content script
// instructing it to summarize the currently highlighted text.
document.getElementById('summarizeSelectionBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tone = toneSelect.value;
  chrome.tabs.sendMessage(tab.id, { action: 'summarize_selection', tone });
});

// Request a bias analysis of the current page
document.getElementById('biasBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'analyze_bias' });
});

// The "Remove Ads" button triggers the ad removal routine on the current page.
document.getElementById('removeAdsBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'remove_ads' });
});

// Save the current page content for later reading
document.getElementById('savePageBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'save_page' });
});

// Reload the page with JavaScript disabled
document.getElementById('bypassBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url);
    const pattern = `${url.origin}/*`;
    chrome.contentSettings.javascript.set({ primaryPattern: pattern, setting: 'block' }, () => {
      chrome.tabs.reload(tab.id);
    });
  } catch (err) {
    alert('Unable to disable JavaScript for this page.');
  }
});

// Reload the page with JavaScript enabled
document.getElementById('enableJsBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url);
    const pattern = `${url.origin}/*`;
    chrome.contentSettings.javascript.set({ primaryPattern: pattern, setting: 'allow' }, () => {
      chrome.tabs.reload(tab.id);
    });
  } catch (err) {
    alert('Unable to enable JavaScript for this page.');
  }
});

// Simple descriptions for common tracking cookies
function getCookieDescription(name) {
  const lower = name.toLowerCase();
  const map = {
    '_ga': 'Google Analytics user identifier',
    '_gid': 'Google Analytics session identifier',
    '_gat': 'Google Analytics throttling cookie',
    '_fbp': 'Facebook Pixel tracking',
    'fr': 'Facebook advertising cookie'
  };
  for (const key in map) {
    if (lower.includes(key)) {
      return map[key];
    }
  }
  return 'Likely used for tracking or advertising';
}

function showCookieModal(cookies) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h4');
  title.textContent = 'Tracking Cookies';
  modal.appendChild(title);

  const list = document.createElement('ul');
  cookies.forEach(c => {
    const li = document.createElement('li');
    const nameEl = document.createElement('strong');
    nameEl.textContent = c.name;

    const br = document.createElement('br');

    const descEl = document.createElement('small');
    descEl.textContent = getCookieDescription(c.name);

    li.appendChild(nameEl);
    li.appendChild(br);
    li.appendChild(descEl);

    list.appendChild(li);
  });
  modal.appendChild(list);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn secondary';
  delBtn.textContent = 'Delete Cookies';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn tertiary';
  closeBtn.textContent = 'Close';

  modal.appendChild(delBtn);
  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  delBtn.addEventListener('click', () => {
    cookies.forEach(c => {
      const protocol = c.secure ? 'https:' : 'http:';
      const url = `${protocol}//${c.domain.replace(/^\./, '')}${c.path}`;
      chrome.cookies.remove({ url, name: c.name });
    });
    overlay.remove();
    alert('Tracking cookies deleted.');
  });

  closeBtn.addEventListener('click', () => overlay.remove());
}

// Identify tracking cookies for the current site and display them in a modal
document.getElementById('checkCookiesBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.cookies.getAll({ url: tab.url }, (cookies) => {
    const trackerPatterns = /(_ga|_gid|_fb|fr|track|ad|pixel|collect|analytics)/i;
    const tracking = cookies.filter(c => trackerPatterns.test(c.name));

    if (tracking.length === 0) {
      alert('No tracking cookies found.');
      return;
    }

    showCookieModal(tracking);
  });
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
    if (!dnsRes.ok) {
      alert('DNS lookup failed.');
      return;
    }
    const dnsData = await dnsRes.json();
    const ip = dnsData.Answer?.[0]?.data || 'Unknown';

    const whoisRes = await fetch(`https://rdap.org/domain/${domain}`);
    if (!whoisRes.ok) {
      alert('WHOIS lookup failed.');
      return;
    }
    const whoisData = await whoisRes.json();
    const registrant = (whoisData.entities || []).find(e => (e.roles || []).includes('registrant'));
    const owner = registrant?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || 'Unknown';

    let hostInfo = '';
    if (ip !== 'Unknown') {
      try {
        const ipRes = await fetch(`https://ipinfo.io/${ip}/json`);
        if (!ipRes.ok) {
          alert('IP info lookup failed.');
        } else {
          const ipData = await ipRes.json();
          hostInfo = ipData.org ? `${ipData.org} (${ipData.country})` : ipData.country || '';
        }
      } catch (err) {
        alert('IP info lookup failed.');
      }
    }

    const message = `Domain: ${domain}\nOwner: ${owner}\nIP: ${ip}${hostInfo ? `\nHost: ${hostInfo}` : ''}`;
    alert(message);
  } catch (err) {
    alert('Failed to lookup domain information.');
  }
});

// Open the summary history page
document.getElementById('historyBtn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  }
});

// Toggle visibility of the additional actions
const toggleMoreBtn = document.getElementById('toggleMoreBtn');
const moreActions = document.getElementById('moreActions');

toggleMoreBtn.addEventListener('click', () => {
  moreActions.hidden = !moreActions.hidden;
  toggleMoreBtn.classList.toggle('expanded', !moreActions.hidden);
});

// Switch between grouped extra features
const segmentButtons = document.querySelectorAll('.segmented-control .segment');
const groups = {
  analysis: document.getElementById('analysisGroup'),
  utilities: document.getElementById('utilitiesGroup'),
  settings: document.getElementById('settingsGroup')
};

segmentButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    segmentButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.keys(groups).forEach(key => {
      groups[key].hidden = key !== btn.dataset.group;
    });
  });
});
