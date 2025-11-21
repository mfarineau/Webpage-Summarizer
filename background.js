// background.js
// -------------
// Manages side panel behavior and context menus.

// Open Sidebar on Action Click
// Open Sidebar on Action Click
// Open Sidebar on Action Click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) return;

  // Check if JS is enabled for this URL
  chrome.contentSettings.javascript.get({ primaryUrl: tab.url }, (details) => {
    if (details.setting === 'block') {
      // Enable JS and reload
      let pattern;
      try {
        pattern = new URL(tab.url).origin + '/*';
      } catch (e) {
        console.error('Invalid URL:', tab.url);
        return;
      }

      chrome.contentSettings.javascript.set({
        primaryPattern: pattern,
        setting: 'allow'
      }, () => {
        // Update storage
        chrome.storage.local.get({ js_exceptions: {} }, (data) => {
          const exceptions = data.js_exceptions;
          exceptions[pattern] = 'allow';
          chrome.storage.local.set({ js_exceptions: exceptions }, () => {
            chrome.tabs.reload(tab.id);
          });
        });
      });
    }
    // No else block needed; side panel opens automatically via setPanelBehavior
  });
});

chrome.runtime.onInstalled.addListener(() => {
  // Ensure context menu is created
  chrome.contextMenus.create({
    id: 'summarize-selection',
    title: 'Summarize Selection',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize-selection') {
    // Open the side panel if not open? 
    // Note: We can't force open side panel programmatically easily without user interaction context sometimes.
    // But we can send a message if it IS open.
    // For now, let's just focus on the main migration.
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download_pdf') {
    chrome.downloads.download({ url: message.dataUrl, filename: message.filename }, () => {
      const error = chrome.runtime.lastError;
      sendResponse({ ok: !error, error: error?.message });
    });
    return true;
  } else if (message.action === 'toggle_js') {
    const url = message.url;
    const tabId = message.tabId;

    if (!url) {
      sendResponse({ ok: false, error: 'No URL provided' });
      return true;
    }

    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      sendResponse({ ok: false, error: 'Invalid protocol. Only HTTP/HTTPS allowed.' });
      return true;
    }

    // Get current setting
    chrome.contentSettings.javascript.get({ primaryUrl: url }, (details) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      const currentSetting = details.setting;
      const newSetting = currentSetting === 'allow' ? 'block' : 'allow';
      let pattern;
      try {
        pattern = new URL(url).origin + '/*';
      } catch (e) {
        sendResponse({ ok: false, error: 'Invalid URL format' });
        return;
      }

      // Set new setting
      chrome.contentSettings.javascript.set({
        primaryPattern: pattern,
        setting: newSetting
      }, () => {
        if (chrome.runtime.lastError) {
          // Handle specific path error gracefully
          console.error('Content Setting Error:', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          // Update storage
          chrome.storage.local.get({ js_exceptions: {} }, (data) => {
            const exceptions = data.js_exceptions;
            exceptions[pattern] = newSetting;
            chrome.storage.local.set({ js_exceptions: exceptions }, () => {
              // Reload tab to apply changes
              chrome.tabs.reload(tabId);
              sendResponse({ ok: true, newSetting });
            });
          });
        }
      });
    });
    return true; // Async response
  }
  return false;
});
