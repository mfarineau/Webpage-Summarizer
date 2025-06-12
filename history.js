// history.js
// Displays stored summaries and allows deleting entries.

document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('historyList');
  const pageList = document.getElementById('pageList');

  function renderSummaries(history) {
    list.innerHTML = '';
    history.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div><a href="${item.url}" target="_blank">${item.url}</a> - ${new Date(item.timestamp).toLocaleString()}</div>
        <div>${item.summary}</div>
        <button data-index="${idx}" class="btn tertiary">Delete</button>
      `;
      list.appendChild(li);
    });
  }

  function renderPages(pages) {
    pageList.innerHTML = '';
    pages.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const blob = new Blob([item.content], { type: 'text/html' });
      const viewUrl = URL.createObjectURL(blob);

      li.innerHTML = `
        <div><a href="${item.url}" target="_blank">${item.url}</a> - ${new Date(item.timestamp).toLocaleString()}</div>
        <iframe src="${viewUrl}" class="saved-page-frame"></iframe>
        <button data-index="${idx}" class="btn tertiary delete">Delete</button>
      `;
      pageList.appendChild(li);
    });
  }

  chrome.storage.local.get({ summary_history: [], page_history: [] }, ({ summary_history, page_history }) => {
    renderSummaries(summary_history);
    renderPages(page_history);
  });

  list.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const idx = parseInt(e.target.dataset.index, 10);
      chrome.storage.local.get({ summary_history: [] }, ({ summary_history }) => {
        summary_history.splice(idx, 1);
        chrome.storage.local.set({ summary_history }, () => renderSummaries(summary_history));
      });
    }
  });

  pageList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete')) {
      const idx = parseInt(e.target.dataset.index, 10);
      chrome.storage.local.get({ page_history: [] }, ({ page_history }) => {
        page_history.splice(idx, 1);
        chrome.storage.local.set({ page_history }, () => renderPages(page_history));
      });
    }
  });
});
