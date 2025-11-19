// background.js
// -------------
// Manages side panel behavior and context menus.

// Open Side Panel on Action Click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

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
  }
  return false;
});
