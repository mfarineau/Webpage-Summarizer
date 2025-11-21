// history.js
// ----------
// Manages the History Dashboard logic.

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const navSummaries = document.getElementById('navSummaries');
  const navPages = document.getElementById('navPages');
  const pageTitle = document.getElementById('pageTitle');
  const searchInput = document.getElementById('searchInput');
  const contentGrid = document.getElementById('contentGrid');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // Modal Elements
  const viewerModal = document.getElementById('viewerModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalLink = document.getElementById('modalLink');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // State
  let currentView = 'summaries'; // 'summaries' | 'pages'
  let allData = [];
  let searchQuery = '';

  // --- Initialization ---
  loadData();

  // --- Event Listeners ---
  navSummaries.addEventListener('click', () => switchView('summaries'));
  navPages.addEventListener('click', () => switchView('pages'));

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderGrid();
  });

  clearAllBtn.addEventListener('click', () => {
    if (confirm(`Are you sure you want to delete all ${currentView === 'summaries' ? 'summaries' : 'saved pages'}?`)) {
      const key = currentView === 'summaries' ? 'summary_history' : 'page_history';
      chrome.storage.local.set({ [key]: [] }, () => {
        loadData();
      });
    }
  });

  closeModalBtn.addEventListener('click', closeModal);
  viewerModal.addEventListener('click', (e) => {
    if (e.target === viewerModal) closeModal();
  });

  // --- Core Functions ---

  function switchView(view) {
    currentView = view;

    // Update Nav
    navSummaries.classList.toggle('active', view === 'summaries');
    navPages.classList.toggle('active', view === 'pages');

    // Update Header
    pageTitle.textContent = view === 'summaries' ? 'Summaries' : 'Saved Pages';

    loadData();
  }

  function loadData() {
    const key = currentView === 'summaries' ? 'summary_history' : 'page_history';
    chrome.storage.local.get({ [key]: [] }, (result) => {
      allData = result[key] || [];
      // Sort by newest first
      allData.sort((a, b) => b.timestamp - a.timestamp);
      renderGrid();
    });
  }

  function renderGrid() {
    contentGrid.innerHTML = '';

    const filtered = allData.filter(item => {
      if (!searchQuery) return true;
      const text = (item.url + (item.summary || '') + (item.title || '')).toLowerCase();
      return text.includes(searchQuery);
    });

    if (filtered.length === 0) {
      contentGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No items found.</div>';
      return;
    }

    filtered.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const date = new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const urlObj = new URL(item.url);
      const domain = urlObj.hostname.replace('www.', '');

      let contentPreview = '';
      let actionBtn = '';

      if (currentView === 'summaries') {
        contentPreview = `<div class="card-preview">${item.summary}</div>`;
        actionBtn = `<button class="btn secondary small-btn read-btn">Read</button>`;
      } else {
        contentPreview = `<div class="card-preview">Saved HTML content from ${domain}</div>`;
        actionBtn = `<button class="btn secondary small-btn view-btn">View</button>`;
      }

      card.innerHTML = `
                <div class="card-header">
                    <h4 class="card-title">${item.title || domain}</h4>
                    <span class="card-date">${date}</span>
                </div>
                <div class="card-domain">${domain}</div>
                ${contentPreview}
                <div class="card-actions">
                    ${actionBtn}
                    <button class="btn-icon delete-btn" title="Delete">
                        <svg class="icon"><use href="sf-symbols.svg#trash" /></svg>
                    </button>
                </div>
            `;

      // Attach Listeners
      card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(item);
      });

      if (currentView === 'summaries') {
        card.querySelector('.read-btn').addEventListener('click', () => openSummaryModal(item));
      } else {
        card.querySelector('.view-btn').addEventListener('click', () => openPageModal(item));
      }

      contentGrid.appendChild(card);
    });
  }

  function deleteItem(itemToDelete) {
    if (!confirm('Delete this item?')) return;

    const key = currentView === 'summaries' ? 'summary_history' : 'page_history';
    const newData = allData.filter(i => i.timestamp !== itemToDelete.timestamp);

    chrome.storage.local.set({ [key]: newData }, () => {
      loadData();
    });
  }

  // --- Modal Logic ---

  function openSummaryModal(item) {
    modalTitle.textContent = 'Summary';
    modalBody.innerHTML = formatSummary(item.summary);
    modalLink.href = item.url;
    viewerModal.hidden = false;
  }

  function openPageModal(item) {
    modalTitle.textContent = 'Saved Page';
    modalLink.href = item.url;

    // Create blob for iframe
    const blob = new Blob([item.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    modalBody.innerHTML = `<iframe src="${url}" class="saved-page-frame"></iframe>`;
    viewerModal.hidden = false;
  }

  function closeModal() {
    viewerModal.hidden = true;
    modalBody.innerHTML = ''; // Clear content (stops iframe)
  }

  // Helper: Format Summary Text to HTML (Reused)
  function formatSummary(text) {
    return text.split(/\n{2,}/).map(p => `<p>${p}</p>`).join('');
  }
});
