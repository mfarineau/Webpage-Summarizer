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

      const topDiv = document.createElement('div');
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.textContent = item.url;
      topDiv.appendChild(link);
      topDiv.appendChild(document.createTextNode(` - ${new Date(item.timestamp).toLocaleString()}`));

      const summaryDiv = document.createElement('div');
      summaryDiv.textContent = item.summary;

      const delBtn = document.createElement('button');
      delBtn.dataset.index = idx;
      delBtn.className = 'btn tertiary';
      delBtn.textContent = 'Delete';

      li.appendChild(topDiv);
      li.appendChild(summaryDiv);
      li.appendChild(delBtn);
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

      const topDiv = document.createElement('div');
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.textContent = item.url;
      topDiv.appendChild(link);
      topDiv.appendChild(document.createTextNode(` - ${new Date(item.timestamp).toLocaleString()}`));

      const iframe = document.createElement('iframe');
      iframe.src = viewUrl;
      iframe.className = 'saved-page-frame';

      const delBtn = document.createElement('button');
      delBtn.dataset.index = idx;
      delBtn.className = 'btn tertiary delete';
      delBtn.textContent = 'Delete';

      li.appendChild(topDiv);
      li.appendChild(iframe);
      li.appendChild(delBtn);
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
