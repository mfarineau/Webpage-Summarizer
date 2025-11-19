// content.js
// ----------
// Content script that runs on webpages.
// It acts as a data provider for the Injected Sidebar and handles ad removal.

// Listen for messages from the Sidebar or Background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get_page_content') {
    const text = document.body.innerText;
    const author = detectAuthor();
    const framework = detectFramework();
    sendResponse({ text, author, framework });
  } else if (message.action === 'remove_ads') {
    removeAds();
  } else if (message.action === 'crawl_site_pdf') {
    (async () => {
      try {
        await crawlSiteToPdf(message.startUrl, message.maxPages);
        sendResponse({ ok: true });
      } catch (err) {
        const errorMessage = err?.message || String(err);
        console.error('Failed to crawl site to PDF:', err);
        sendResponse({ ok: false, error: errorMessage });
      }
    })();
    return true;
  } else if (message.action === 'toggle_sidebar') {
    toggleSidebar();
  }
  return false;
});

let sidebarIframe = null;
let sidebarOpen = false;
const SIDEBAR_ID = 'webpage-summarizer-sidebar';

function toggleSidebar() {
  if (sidebarOpen) {
    // Close
    if (sidebarIframe) {
      sidebarIframe.style.display = 'none';
    }
    document.body.style.marginRight = '0px';
    document.body.style.width = '100%';
    sidebarOpen = false;
  } else {
    // Open
    if (!sidebarIframe) {
      createSidebar();
    }
    sidebarIframe.style.display = 'block';
    document.body.style.marginRight = '400px';
    sidebarOpen = true;
  }
}

function createSidebar() {
  // Check if already exists
  if (document.getElementById(SIDEBAR_ID)) {
    sidebarIframe = document.getElementById(SIDEBAR_ID);
    return;
  }

  sidebarIframe = document.createElement('iframe');
  sidebarIframe.id = SIDEBAR_ID;
  sidebarIframe.src = chrome.runtime.getURL('sidebar.html');
  sidebarIframe.style.position = 'fixed';
  sidebarIframe.style.top = '0';
  sidebarIframe.style.right = '0';
  sidebarIframe.style.width = '400px';
  sidebarIframe.style.height = '100%';
  sidebarIframe.style.border = 'none';
  sidebarIframe.style.zIndex = '2147483647'; // Max z-index
  sidebarIframe.style.boxShadow = '-2px 0 5px rgba(0,0,0,0.2)';
  sidebarIframe.style.background = '#fff'; // Default bg
  document.body.appendChild(sidebarIframe);
}

function removeAds() {
  const adSelectors = [
    'iframe[src*="ads"]',
    'div[class*="ad-"]',
    'div[id*="ad-"]',
    'aside',
    '.advertisement',
    '.ad-container'
  ];
  const ads = document.querySelectorAll(adSelectors.join(','));
  let count = 0;
  ads.forEach(ad => {
    // Explicitly exclude our sidebar
    if (ad.id === SIDEBAR_ID) return;

    ad.style.display = 'none';
    count++;
  });
  console.log(`Removed ${count} ad elements.`);
}

// --- Helper Functions ---

function detectAuthor() {
  // 1. Meta tags
  let author = document.querySelector("meta[name='author']")?.content ||
    document.querySelector("meta[name='byl']")?.content ||
    document.querySelector("meta[property='article:author']")?.content ||
    document.querySelector("meta[property='og:author']")?.content ||
    document.querySelector("meta[name='twitter:creator']")?.content;

  if (author) return author.trim();

  // 2. JSON-LD Schema
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const json = JSON.parse(script.textContent);
      const data = Array.isArray(json) ? json : [json];
      for (const item of data) {
        if (['NewsArticle', 'Article', 'BlogPosting'].includes(item['@type'])) {
          if (item.author) {
            if (Array.isArray(item.author)) {
              return item.author.map(a => a.name).join(', ');
            } else if (item.author.name) {
              return item.author.name;
            }
          }
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // 3. Visual Selectors
  const el = document.querySelector("[itemprop='author'] [itemprop='name']") ||
    document.querySelector("[rel='author']") ||
    document.querySelector(".byline") ||
    document.querySelector(".author") ||
    document.querySelector(".author-name") ||
    document.querySelector(".c-byline__item") ||
    document.querySelector("a[href*='/author/']");

  if (el) return el.textContent.trim();

  return '';
}

function detectFramework() {
  // Simple framework detection based on global variables or specific DOM elements
  if (document.querySelector('[id^="react-root"], [data-reactroot]')) return 'React';
  if (document.querySelector('app-root, [ng-version]')) return 'Angular';
  if (document.querySelector('[id="__next"]')) return 'Next.js';
  if (document.querySelector('[data-v-app]')) return 'Vue.js';
  if (window.jQuery) return 'jQuery';
  if (window.WordPress) return 'WordPress';
  return 'Unknown/Custom';
}
  } catch (err) {
  return '❌ Error connecting to API.';
}
}

function getSystemPrompt(tone) {
  switch (tone) {
    case 'Casual Read':
      return 'You are a helpful assistant that summarizes web pages for a popular audience. Use a casual, conversational tone. Focus on the most interesting and engaging parts of the story.';
    case 'Academic Analysis':
      return 'You are an academic researcher. Summarize the article and frame it within the most relevant academic discipline (e.g., science, politics, sociology). If it is scientific, speculate on the impact to the scientific community and our understanding. If political, focus on the impact on the country\'s politics. Use a formal, analytical tone.';
    case 'Executive':
    default:
      return 'You are an executive assistant. Provide a factual executive summary of the article. Focus on the key facts and takeaways. Use a professional, concise tone and format the output with clear bullet points.';
  }
}

// Takes the raw summary text returned from the API and converts it into
// simple HTML. This allows us to keep sections and bullet points looking
// nice inside the widget.
function formatSummary(text) {
  const fragment = document.createDocumentFragment();

  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  paragraphs.forEach(p => {
    if (/^(Summary|Takeaways|Conclusion|Key Points|Introduction)/i.test(p)) {
      const h4 = document.createElement('h4');
      h4.textContent = p;
      fragment.appendChild(h4);
    } else if (/^(\d+[\.\)]|[-•])\s+/.test(p)) {
      const para = document.createElement('p');
      para.style.marginLeft = '10px';
      para.textContent = p;
      fragment.appendChild(para);
    } else {
      const para = document.createElement('p');
      para.textContent = p;
      fragment.appendChild(para);
    }
  });

  return fragment;
}

// Save the current page's HTML (minus ads) to local storage for later viewing
function savePage() {
  const clone = document.documentElement.cloneNode(true);
  removeAds(clone);

  // Ensure relative links work when opened from storage
  const base = clone.querySelector('base');
  if (!base) {
    const baseEl = document.createElement('base');
    baseEl.href = location.href;
    clone.querySelector('head')?.appendChild(baseEl);
  }

  const html = '<!DOCTYPE html>\n' + clone.outerHTML;
  const entry = { url: location.href, timestamp: Date.now(), content: html };
  chrome.storage.local.get({ page_history: [] }, ({ page_history }) => {
    page_history.push(entry);
    chrome.storage.local.set({ page_history }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save page to history:', chrome.runtime.lastError);
        showContentNotification('Failed to save page.', 'error');
        return;
      }
      showContentNotification('Page saved!', 'success');
    });
  });
}

async function crawlSiteToPdf(startUrl = window.location.href, maxPages = 20) {
  const DEFAULT_MAX_PAGES = 20;
  const MAX_CAP = 75;

  if (!window.PDFLib) {
    throw new Error('PDF library is not available.');
  }

  const { PDFDocument, StandardFonts } = window.PDFLib;

  const limitSource = Number.isFinite(Number(maxPages)) ? Math.floor(Number(maxPages)) : DEFAULT_MAX_PAGES;
  const pageLimit = Math.max(1, Math.min(limitSource || DEFAULT_MAX_PAGES, MAX_CAP));

  const currentOrigin = window.location.origin;
  const startUrlObject = new URL(startUrl || window.location.href, window.location.href);
  if (startUrlObject.origin !== currentOrigin) {
    throw new Error('Start URL must be on the current site.');
  }

  const normalizeUrl = (candidate, base) => {
    try {
      const resolved = new URL(candidate, base);
      if (resolved.origin !== currentOrigin) {
        return null;
      }
      resolved.hash = '';
      return resolved.href;
    } catch (err) {
      return null;
    }
  };

  const startHref = normalizeUrl(startUrlObject.href, startUrlObject.href);
  if (!startHref) {
    throw new Error('Unable to determine a valid starting URL for the crawl.');
  }

  const queue = [{ url: startHref, depth: 0 }];
  const enqueued = new Set([startHref]);
  const visited = new Set();
  const crawledPages = [];

  const parser = new DOMParser();

  showContentNotification('Starting site crawl for PDF export…', 'info', 3000);

  while (queue.length && crawledPages.length < pageLimit) {
    const { url: currentUrl, depth: currentDepth } = queue.shift();
    enqueued.delete(currentUrl);

    if (visited.has(currentUrl)) {
      continue;
    }
    visited.add(currentUrl);

    try {
      let doc;
      let title;
      let cleanRoot;

      if (currentUrl === startHref) {
        doc = document;
        title = document.title?.trim() || currentUrl;
        cleanRoot = document.documentElement?.cloneNode(true);
      } else {
        const response = await fetch(currentUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        doc = parser.parseFromString(html, 'text/html');
        title = doc.querySelector('title')?.textContent?.trim() || currentUrl;
        cleanRoot = doc.documentElement?.cloneNode(true);
      }

      if (cleanRoot) {
        const nonVisualSelector = 'script, style, template, noscript, meta, link';
        cleanRoot.querySelectorAll(nonVisualSelector).forEach(node => node.remove());

        cleanRoot.querySelectorAll('[aria-hidden], [hidden]').forEach(node => {
          const ariaHidden = node.getAttribute('aria-hidden');
          const isAriaHidden = node.hasAttribute('aria-hidden') && ariaHidden !== null && ariaHidden.toLowerCase() !== 'false';
          const isHidden = node.hasAttribute('hidden');
          if (isAriaHidden || isHidden) {
            node.remove();
          }
        });
      }

      const cleanBody = cleanRoot?.querySelector('body');
      const contentSelectors = 'h1, h2, h3, h4, h5, h6, p, ul, li';
      let text = '';

      if (cleanBody) {
        const contentNodes = cleanBody.querySelectorAll(contentSelectors);
        const parts = [];
        const processedListItems = new WeakSet();

        contentNodes.forEach((node) => {
          const tagName = node.tagName?.toLowerCase();
          if (!tagName) {
            return;
          }

          if (tagName === 'ul') {
            const listItems = Array.from(node.children).filter(
              (child) => child.tagName?.toLowerCase() === 'li'
            );
            listItems.forEach((item) => {
              const value = item.textContent?.trim();
              if (value) {
                parts.push(value);
                processedListItems.add(item);
              }
            });
            return;
          }

          if (tagName === 'li' && processedListItems.has(node)) {
            return;
          }

          const value = node.textContent?.trim();
          if (value) {
            parts.push(value);
            if (tagName === 'li') {
              processedListItems.add(node);
            }
          }
        });

        if (parts.length) {
          text = parts.join('\n\n');
        }
      }

      crawledPages.push({ url: currentUrl, title, text });
      showContentNotification(`Crawled ${crawledPages.length}/${pageLimit}: ${currentUrl}`, 'info', 2500);

      if (crawledPages.length >= pageLimit) {
        break;
      }

      if (currentDepth < 1) {
        doc.querySelectorAll('a[href]').forEach((anchor) => {
          const href = anchor.getAttribute('href');
          if (!href) {
            return;
          }
          const normalized = normalizeUrl(href, currentUrl);
          if (!normalized) {
            return;
          }
          if (normalized === startHref) {
            return;
          }
          if (visited.has(normalized) || enqueued.has(normalized)) {
            return;
          }
          enqueued.add(normalized);
          queue.push({ url: normalized, depth: currentDepth + 1 });
        });
      }
    } catch (error) {
      console.error('Failed to fetch page during crawl:', currentUrl, error);
      showContentNotification(`Failed to crawl ${currentUrl}: ${error.message || error}`, 'error', 4000);
    }
  }

  if (!crawledPages.length) {
    const error = new Error('No pages were successfully crawled.');
    showContentNotification(error.message, 'error', 5000);
    throw error;
  }

  try {
    showContentNotification('Generating PDF…', 'info', 3000);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pageMargin = 40;
    const headingSize = 16;
    const bodySize = 12;
    const headingLineHeight = headingSize * 1.35;
    const bodyLineHeight = bodySize * 1.4;

    let page = pdfDoc.addPage();
    let { width, height } = page.getSize();
    let cursorY = height - pageMargin;

    const maxLineWidth = width - pageMargin * 2;

    const addPage = () => {
      page = pdfDoc.addPage();
      ({ width, height } = page.getSize());
      cursorY = height - pageMargin;
    };

    const ensureSpace = (lineHeight) => {
      if (cursorY - lineHeight < pageMargin) {
        addPage();
      }
    };

    const wrapText = (text, size) => {
      const lines = [];
      const paragraphs = (text || '').split(/\r?\n/);

      paragraphs.forEach((paragraph, index) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) {
          if (index !== paragraphs.length - 1) {
            lines.push('');
          }
          return;
        }

        let currentLine = '';
        words.forEach((word) => {
          const tentative = currentLine ? `${currentLine} ${word}` : word;
          if (font.widthOfTextAtSize(tentative, size) <= maxLineWidth) {
            currentLine = tentative;
          } else {
            if (currentLine) {
              lines.push(currentLine);
            }

            if (font.widthOfTextAtSize(word, size) <= maxLineWidth) {
              currentLine = word;
            } else {
              let segment = '';
              for (const char of word) {
                const candidate = segment + char;
                if (font.widthOfTextAtSize(candidate, size) <= maxLineWidth) {
                  segment = candidate;
                } else {
                  if (segment) {
                    lines.push(segment);
                  }
                  segment = char;
                }
              }
              currentLine = segment;
            }
          }
        });

        if (currentLine) {
          lines.push(currentLine);
        }

        if (index !== paragraphs.length - 1) {
          lines.push('');
        }
      });

      return lines;
    };

    const drawLines = (lines, size, lineHeight) => {
      lines.forEach((line) => {
        ensureSpace(lineHeight);
        if (line) {
          page.drawText(line, { x: pageMargin, y: cursorY, size, font });
        }
        cursorY -= lineHeight;
      });
    };

    crawledPages.forEach(({ url, title, text }, index) => {
      if (index > 0) {
        cursorY -= bodyLineHeight;
        if (cursorY < pageMargin) {
          addPage();
        }
      }

      const headingLines = wrapText(title, headingSize);
      drawLines(headingLines, headingSize, headingLineHeight);

      const urlLines = wrapText(url, bodySize);
      drawLines(urlLines, bodySize, bodyLineHeight);

      cursorY -= bodyLineHeight / 2;
      if (cursorY < pageMargin) {
        addPage();
      }

      const textLines = wrapText(text, bodySize);
      drawLines(textLines, bodySize, bodyLineHeight);
    });

    const dataUrl = await pdfDoc.saveAsBase64({ dataUri: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${startUrlObject.hostname || 'site'}-crawl-${timestamp}.pdf`;

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'download_pdf', filename, dataUrl },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (response?.ok) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Failed to initiate PDF download.'));
          }
        }
      );
    });

    showContentNotification(`PDF ready with ${crawledPages.length} page(s).`, 'success', 5000);
  } catch (error) {
    showContentNotification(error.message || 'Failed to generate PDF.', 'error', 5000);
    throw error;
  }
}

// Simple ad remover used when the user presses the "Remove Ads" button in the
// popup.  It looks for elements that commonly contain advertisements and removes
// them from the page.
function removeAds(root = document) {
  const selectors = [
    '[id*="ad" i]',
    '[class*="ad" i]',
    'iframe[src*="ad" i]',
    'iframe[src*="doubleclick" i]',
    'iframe[src*="adservice" i]'
  ];
  root.querySelectorAll(selectors.join(',')).forEach(el => el.remove());
}

// Attempt to extract the author name from common meta tags or byline elements
function detectAuthor() {
  // 1. Meta tags
  const metaSelectors = [
    "meta[name='author']",
    "meta[name='byl']",
    "meta[property='article:author']",
    "meta[property='og:author']",
    "meta[name='twitter:creator']"
  ];

  for (const sel of metaSelectors) {
    const content = document.querySelector(sel)?.content;
    if (content && content.length < 100) return content.trim();
  }

  // 2. Schema.org JSON-LD
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.textContent);
      // Handle both single object and array of objects
      const objects = Array.isArray(data) ? data : [data];
      for (const obj of objects) {
        if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article' || obj['@type'] === 'BlogPosting') {
          if (obj.author) {
            if (Array.isArray(obj.author)) {
              return obj.author[0].name;
            } else if (obj.author.name) {
              return obj.author.name;
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  // 3. Common visual selectors
  const visualSelectors = [
    "[itemprop='author'] [itemprop='name']",
    "[rel='author']",
    ".byline",
    ".author",
    ".author-name",
    ".c-byline__item", // Common in some news sites
    "a[href*='/author/']"
  ];

  for (const sel of visualSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      // Basic validation to avoid capturing full paragraphs
      if (text.length > 2 && text.length < 50 && !text.includes('\n')) {
        return text;
      }
    }
  }

  return '';
}

// Attempt to guess which framework or CMS the page is built with by
// inspecting meta tags and common file paths. Returns a string describing
// the detected framework or "Unknown" if no hints are found.
function detectFramework() {
  const generator = document.querySelector("meta[name='generator']")?.content || '';

  if (/Drupal/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `Drupal ${version[0]}` : 'Drupal';
  }

  if (/WordPress/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `WordPress ${version[0]}` : 'WordPress';
  }

  if (/Joomla/i.test(generator)) {
    const version = generator.match(/\d+(\.\d+)+/);
    return version ? `Joomla ${version[0]}` : 'Joomla';
  }

  if (document.querySelector("link[href*='wp-content'], script[src*='wp-content']")) {
    return 'WordPress';
  }

  if (document.querySelector("script[src*='drupal'], link[href*='drupal'], [data-drupal-selector]")) {
    return 'Drupal';
  }

  return 'Unknown';
}
