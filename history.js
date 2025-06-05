// history.js
// Displays stored summaries and allows deleting entries.

document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('historyList');

  function render(history) {
    list.innerHTML = '';
    history.forEach((item, idx) => {
      const li = document.createElement('li');
      li.style.marginBottom = '16px';
      li.innerHTML = `
        <div><a href="${item.url}" target="_blank">${item.url}</a> - ${new Date(item.timestamp).toLocaleString()}</div>
        <div>${item.summary}</div>
        <button data-index="${idx}" class="btn tertiary">Delete</button>
      `;
      list.appendChild(li);
    });
  }

  chrome.storage.local.get({ summary_history: [] }, ({ summary_history }) => {
    render(summary_history);
  });

  list.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
      const idx = parseInt(e.target.dataset.index, 10);
      chrome.storage.local.get({ summary_history: [] }, ({ summary_history }) => {
        summary_history.splice(idx, 1);
        chrome.storage.local.set({ summary_history }, () => render(summary_history));
      });
    }
  });
});
