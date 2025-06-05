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
