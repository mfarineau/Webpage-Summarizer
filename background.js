// background.js
// -------------
// Registers a context menu item that allows users to summarize highlighted
// text directly from the page. When the menu item is clicked we forward a
// message to the content script in the active tab instructing it to summarize
// the selected text.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'summarize-selection',
    title: 'Summarize Selection',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize-selection') {
    chrome.tabs.sendMessage(tab.id, { action: 'summarize_selection' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'download_pdf') {
    return false;
  }

  chrome.downloads.download(
    { url: message.dataUrl, filename: message.filename },
    () => {
      const error = chrome.runtime.lastError;

      if (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
        return;
      }

      sendResponse({ ok: true });
    }
  );

  return true;
});
