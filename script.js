/**
 * ============================================================
 * Apink 8th Concert Fancam — Frontend Logic
 * ============================================================
 */

// ===== CONFIGURATION =====
// 🔧 把你的 Google Apps Script Web App URL 貼在這裡
const MEMBERS = ['初瓏', '普美', '恩地', '南珠', '夏榮', '團體'];
const API_URL = 'https://script.google.com/macros/s/AKfycbxYwPMpFHO5I-Sw0TPzfVmBVpwaLtDvG1MA_1vnvbldf73K1XXVKrJgXm4bQbLtvpgj/exec';


// ===== STATE =====
let globalData = [];
let currentFilter = '初瓏';

let isLoading = false;
let adminPassword = '';
let isAdminLoggedIn = false;

let currentPage = 1;
const ITEMS_PER_PAGE = 5;
let renderGeneration = 0; // incremented each render to cancel stale staggered appends

// ===== DOM REFS =====
const $grid = document.getElementById('card-grid');
const $loading = document.getElementById('loading');
const $totalCount = document.getElementById('total-count');

const $tabs = document.getElementById('tabs');
const $addModal = document.getElementById('add-modal');
const $addBtn = document.getElementById('add-btn');
const $addModalClose = document.getElementById('add-modal-close');
const $addSheet = document.getElementById('add-sheet');
const $addUrl = document.getElementById('add-url');
const $addTag = document.getElementById('add-tag');
const $addTagCustom = document.getElementById('add-tag-custom');
const $addSubmit = document.getElementById('add-submit');
const $adminTrigger = document.getElementById('admin-trigger');
const $adminLoginModal = document.getElementById('admin-login-modal');
const $adminLoginClose = document.getElementById('admin-login-close');
const $adminPasswordInput = document.getElementById('admin-password');
const $adminLoginBtn = document.getElementById('admin-login-btn');
const $adminPanel = document.getElementById('admin-panel');
const $adminClose = document.getElementById('admin-close');
const $pendingList = document.getElementById('pending-list');
const $toastContainer = document.getElementById('toast-container');
const $loadMoreBtn = document.getElementById('load-more-btn');
const $scrollSentinel = document.getElementById('scroll-sentinel');

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAddModal();
  initEmbedResizeListener();
  initAdmin();
  initInfiniteScroll();

  loadAllData();
});

function initInfiniteScroll() {
  if (!$scrollSentinel) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading) {
      const videos = currentFilter === '全部'
        ? globalData
        : globalData.filter(v => v.sheet === currentFilter);
      if (currentPage * ITEMS_PER_PAGE < videos.length) {
        currentPage++;
        renderCards(true);
      }
    }
  }, { rootMargin: '200px' });
  observer.observe($scrollSentinel);
}

function handleLoadMore() {
  currentPage++;
  renderCards(true);
}

// ===== TABS =====
function initTabs() {
  const tabBtns = $tabs.querySelectorAll('.tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sheet = btn.dataset.sheet;
      if (sheet === currentFilter) return;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = sheet;
      currentPage = 1;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderCards();
    });
  });
}

function updateTabCounts() {
  // Update total count
  const $countAll = document.getElementById('count-全部');
  if ($countAll) $countAll.textContent = globalData.length;
  $totalCount.textContent = globalData.length;

  // Update each member count
  MEMBERS.forEach(member => {
    const count = globalData.filter(v => v.sheet === member).length;
    const $count = document.getElementById(`count-${member}`);
    if ($count) $count.textContent = count;
  });
}

// ===== DATA LOADING =====
async function loadAllData() {
  if (isLoading) return;
  isLoading = true;
  showLoading(true);

  try {
    const url = `${API_URL}?action=readAll`;
    const response = await fetch(url, { redirect: 'follow' });
    const result = await response.json();

    if (result.error) {
      showToast(result.error, 'error');
      return;
    }

    // Process and merge data for all members
    globalData = [];
    MEMBERS.forEach(member => {
      if (result.data && result.data[member] && result.data[member].data) {
        // Tag with sheet name so we know where it came from
        result.data[member].data.forEach(v => v.sheet = member);
        globalData.push(...result.data[member].data);
      }
    });

    globalData = sortVideos(globalData);
    updateTabCounts();
    renderCards();
  } catch (err) {
    console.error('載入資料失敗:', err);
    showToast('載入資料失敗，請稍後再試', 'error');
  } finally {
    isLoading = false;
    showLoading(false);
  }
}

// ===== SORTING =====
function sortVideos(videos) {
  // 依提交時間排序（新→舊），最新的貼文排在最上方
  return [...videos].sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

// ===== RENDERING =====
function showLoading(show) {
  if (show) {
    $loading.style.display = 'flex';
  } else {
    $loading.style.display = 'none';
  }
}

function renderCards(append = false) {
  renderGeneration++;
  const thisGeneration = renderGeneration;

  let videos = currentFilter === '全部'
    ? globalData
    : globalData.filter(v => v.sheet === currentFilter);

  if (!append) {
    $grid.querySelectorAll('.video-card, .empty-state').forEach(el => el.remove());
  }

  if (videos.length === 0 && !append) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state__icon">📹</div>
      <div class="empty-state__text">還沒有影片</div>
      <div class="empty-state__sub">點擊上方的 ＋ 來新增第一個 Fancam 吧！</div>
    `;
    $grid.appendChild(empty);
    if ($loadMoreBtn) $loadMoreBtn.style.display = 'none';
    return;
  }

  const startIndex = append ? (currentPage - 1) * ITEMS_PER_PAGE : 0;
  const endIndex = currentPage * ITEMS_PER_PAGE;
  const toRender = videos.slice(startIndex, endIndex);

  toRender.forEach((video, index) => {
    if (renderGeneration !== thisGeneration) return;
    const card = createVideoCard(video, startIndex + index);
    $grid.appendChild(card);
  });

  // 更新哨兵可見性（還有更多則顯示 load-more-btn）
  if ($loadMoreBtn) {
    $loadMoreBtn.style.display = videos.length > endIndex ? 'block' : 'none';
  }

  // Schedule check to hide cards with failed embeds
  scheduleEmbedFailCheck();
}

function createVideoCard(video, index) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.style.animationDelay = `${index * 0.06}s`;
  card.dataset.id = video.id;

  const embedContent = generateEmbedHTML(video.url);
  const timeAgo = formatTimeAgo(video.created_at);
  const pendingBadge = video.status === 'pending' ? '<span class="video-card__pending-badge">待審核</span>' : '';

  // Build tag badge HTML
  const tagBadge = video.submitted_by && video.submitted_by !== '匿名'
    ? `<span class="video-card__tag">${escapeHtml(video.submitted_by)}</span>`
    : '';

  card.innerHTML = `
    <div class="video-card__embed">
      ${embedContent}
    </div>
    <div class="video-card__footer">
      <div class="video-card__info">
        <div class="video-card__author">
          <span style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${escapeHtml(video.sheet)}</span>
          ${pendingBadge}
          ${tagBadge}
        </div>
        <div class="video-card__time">${timeAgo}</div>
      </div>
      <div class="video-card__actions">
        <button class="report-btn" data-id="${video.id}" data-sheet="${video.sheet}" onclick="handleReport(this)" title="檢舉不當內容">🚩</button>
      </div>
    </div>
  `;

  return card;
}

function generateEmbedHTML(url) {
  if (!url) return '<div class="link-preview"><span class="link-preview__icon">❌</span><span class="link-preview__platform">無效連結</span></div>';

  let cleanUrl = url.trim();
  try {
    const urlObj = new URL(cleanUrl);
    urlObj.search = '';
    cleanUrl = urlObj.toString();
  } catch (e) { }

  // Threads — 直接載入 iframe
  if (cleanUrl.includes('threads.net') || cleanUrl.includes('threads.com')) {
    const proxyUrl = `embed_proxy.html?type=threads&url=${encodeURIComponent(cleanUrl)}`;
    const uid = 'th_' + Math.random().toString(36).substr(2, 8);
    return `
      <div class="embed-wrapper" id="${uid}">
        <iframe src="${proxyUrl}" class="embed-iframe threads-embed" data-post-url="${cleanUrl}"
          frameborder="0" scrolling="auto" allowtransparency="true" allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
          style="opacity: 0; transition: opacity 0.4s ease;">
        </iframe>
        <div class="embed-placeholder threads" style="pointer-events: none;">
          <div class="embed-placeholder__spinner"></div>
          <div class="embed-placeholder__label">Threads 貼文載入中...</div>
        </div>
      </div>
    `;
  }

  // Instagram — use same-origin embed proxy (auto height detection via postMessage)
  if (cleanUrl.includes('instagram.com')) {
    const proxyUrl = `embed_proxy.html?type=instagram&url=${encodeURIComponent(cleanUrl)}`;
    return `
      <iframe src="${proxyUrl}" class="embed-iframe ig-embed" data-post-url="${cleanUrl}"
        frameborder="0" scrolling="no" allowtransparency="true" allowfullscreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write">
      </iframe>
    `;
  }

  // Fallback: link preview
  const platform = cleanUrl.includes('threads') ? 'Threads' :
    cleanUrl.includes('instagram') ? 'Instagram' : '連結';
  const icon = cleanUrl.includes('threads') ? '🧵' :
    cleanUrl.includes('instagram') ? '📷' : '🔗';
  return `
    <div class="link-preview">
      <span class="link-preview__icon">${icon}</span>
      <span class="link-preview__platform">${platform} 貼文</span>
      <a class="link-preview__url" href="${cleanUrl}" target="_blank" rel="noopener">${cleanUrl}</a>
      <a class="link-preview__open" href="${cleanUrl}" target="_blank" rel="noopener">開啟連結 ↗</a>
    </div>
  `;
}

function processEmbeds() {
  // Both Threads and IG now use direct iframes — no embed script needed
}

function initEmbedResizeListener() {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;

    try {
      const data = event.data;
      if (data?.type !== 'embed-resize' || !data.height) return;

      const iframes = document.querySelectorAll('.embed-iframe');
      iframes.forEach(iframe => {
        try {
          if (iframe.contentWindow === event.source) {
            iframe.style.height = data.height + 'px';

            // Mark this embed as successfully loaded
            iframe.dataset.embedLoaded = 'true';

            // Show the iframe and hide the placeholder (content is now rendered)
            if (iframe.style.opacity === '0') {
              iframe.style.opacity = '1';
              const placeholder = iframe.parentElement?.querySelector('.embed-placeholder');
              if (placeholder) placeholder.style.display = 'none';
            }
          }
        } catch (e) { }
      });
    } catch (e) { }
  });
}

// Hide cards whose embeds failed to load after a timeout
function scheduleEmbedFailCheck() {
  setTimeout(() => {
    const iframes = document.querySelectorAll('.embed-iframe');
    iframes.forEach(iframe => {
      if (iframe.dataset.embedLoaded !== 'true') {
        // This embed never successfully rendered — hide the entire card
        const card = iframe.closest('.video-card');
        if (card) {
          card.style.display = 'none';
        }
      }
    });
  }, 15000); // 15 second timeout
}



// ===== ADD VIDEO MODAL =====
function initAddModal() {
  $addBtn.addEventListener('click', () => {
    // Pre-select current filter's member (if on 全部, default to 初瓏)
    $addSheet.value = (currentFilter !== '全部') ? currentFilter : '初瓏';
    $addUrl.value = '';
    $addTag.value = '';
    $addTagCustom.value = '';
    $addTagCustom.style.display = 'none';
    $addModal.classList.add('active');
    setTimeout(() => $addUrl.focus(), 300);
  });

  $addModalClose.addEventListener('click', () => {
    $addModal.classList.remove('active');
  });

  $addModal.addEventListener('click', (e) => {
    if (e.target === $addModal) $addModal.classList.remove('active');
  });

  $addSubmit.addEventListener('click', handleAddSubmit);

  // Toggle custom tag input visibility
  $addTag.addEventListener('change', () => {
    if ($addTag.value === '__custom__') {
      $addTagCustom.style.display = 'block';
      $addTagCustom.focus();
    } else {
      $addTagCustom.style.display = 'none';
      $addTagCustom.value = '';
    }
  });

  // Enter key to submit
  $addUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSubmit();
  });
}

async function handleAddSubmit() {
  const sheet = $addSheet.value;
  const url = $addUrl.value.trim();
  const tag = $addTag.value === '__custom__' ? $addTagCustom.value.trim() : $addTag.value;

  if (!url) {
    showToast('請貼上影片連結', 'error');
    return;
  }

  if (!isValidSocialUrl(url)) {
    showToast('只接受 Instagram 或 Threads 的連結', 'error');
    return;
  }

  // Check for duplicates locally
  let cleanInputUrl = url;
  try {
    const urlObj = new URL(cleanInputUrl);
    urlObj.search = '';
    cleanInputUrl = urlObj.toString();
  } catch (e) { }

  let duplicateFound = globalData.some(v => {
    let existingCleanUrl = v.url;
    try {
      let eUrl = new URL(existingCleanUrl);
      eUrl.search = '';
      existingCleanUrl = eUrl.toString();
    } catch (e) { }
    return existingCleanUrl === cleanInputUrl;
  });

  if (duplicateFound) {
    showToast('已經有人加入過這個影片了！', 'error');
    return;
  }

  $addSubmit.disabled = true;
  $addSubmit.textContent = '提交中...';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'add',
        sheet: sheet,
        url: url,
        submitted_by: tag || '匿名'
      })
    });

    // With no-cors, we can't read the response
    // Just show success and reload data
    showToast('影片已提交！', 'success');
    $addModal.classList.remove('active');

    // Add locally for instant feedback
    const newVideo = {
      id: Date.now().toString(),
      url: url,
      likes: 0,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      submitted_by: tag || '匿名',
      status: 'pending',
      sheet: sheet
    };

    globalData.unshift(newVideo);
    globalData = sortVideos(globalData);
    updateTabCounts();

    currentPage = 1;
    renderCards();

    // Reload from server in background
    setTimeout(() => loadAllData(), 3000);

  } catch (err) {
    console.error('提交失敗:', err);
    showToast('提交失敗，請稍後再試', 'error');
  } finally {
    $addSubmit.disabled = false;
    $addSubmit.textContent = '提交影片';
  }
}

function isValidSocialUrl(url) {
  return /^https?:\/\/(www\.)?instagram\.com\//i.test(url) ||
    /^https?:\/\/(www\.)?threads\.(net|com)\//i.test(url);
}

// ===== ADMIN =====
function initAdmin() {
  $adminTrigger.addEventListener('click', () => {
    if (isAdminLoggedIn) {
      openAdminPanel();
    } else {
      $adminLoginModal.classList.add('active');
      setTimeout(() => $adminPasswordInput.focus(), 300);
    }
  });

  $adminLoginClose.addEventListener('click', () => {
    $adminLoginModal.classList.remove('active');
    $adminPasswordInput.value = '';
  });

  $adminLoginModal.addEventListener('click', (e) => {
    if (e.target === $adminLoginModal) {
      $adminLoginModal.classList.remove('active');
      $adminPasswordInput.value = '';
    }
  });

  $adminLoginBtn.addEventListener('click', handleAdminLogin);
  $adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  $adminClose.addEventListener('click', () => {
    $adminPanel.classList.remove('active');
  });
}

async function handleAdminLogin() {
  const password = $adminPasswordInput.value.trim();
  if (!password) {
    showToast('請輸入密碼', 'error');
    return;
  }

  adminPassword = password;
  isAdminLoggedIn = true;
  $adminLoginModal.classList.remove('active');
  $adminPasswordInput.value = '';
  showToast('管理者登入成功', 'success');

  openAdminPanel();
}

async function openAdminPanel() {
  $adminPanel.classList.add('active');
  loadAdminItems();
}

async function loadAdminItems() {
  $pendingList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>載入管理項目...</span></div>';

  try {
    const res = await fetch(`${API_URL}?action=getAdminList&password=${encodeURIComponent(adminPassword)}`);
    const result = await res.json();

    if (result.error) {
      $pendingList.innerHTML = `<div class="empty-state"><span class="empty-state__text">${result.error}</span></div>`;
      isAdminLoggedIn = false;
      return;
    }

    const { pending, reported } = result.data;
    let html = '';
    let totalPending = 0;
    let totalReported = 0;

    // --- 待審核區 ---
    html += '<h3 style="color: var(--warning); font-size: 1.1rem; margin-bottom: 12px;">📋 待審核影片</h3>';
    MEMBERS.forEach(member => {
      const items = pending[member] || [];
      if (items.length === 0) return;
      totalPending += items.length;
      html += renderAdminSection(member, items, '待審核', 'pending');
    });
    if (totalPending === 0) {
      html += '<div class="empty-state" style="padding: 20px 0;"><span class="empty-state__icon">✅</span><span class="empty-state__text">沒有待審核的影片</span></div>';
    }

    // --- 被檢舉區 ---
    html += '<h3 style="color: var(--danger); font-size: 1.1rem; margin: 24px 0 12px;">🚩 被檢舉影片</h3>';
    MEMBERS.forEach(member => {
      const items = reported[member] || [];
      if (items.length === 0) return;
      totalReported += items.length;
      html += renderAdminSection(member, items, '被檢舉', 'reported');
    });
    if (totalReported === 0) {
      html += '<div class="empty-state" style="padding: 20px 0;"><span class="empty-state__icon">✅</span><span class="empty-state__text">沒有被檢舉的影片</span></div>';
    }

    $pendingList.innerHTML = html;
  } catch (err) {
    console.error('載入管理項目失敗:', err);
    $pendingList.innerHTML = '<div class="empty-state"><span class="empty-state__text">載入失敗</span></div>';
  }
}

function renderAdminSection(member, items, label, type) {
  const titleColor = type === 'reported' ? 'var(--danger)' : 'var(--warning)';
  return `
    <div class="pending-section">
      <div class="pending-section__title" style="color: ${titleColor}">${member}（${items.length} 筆${label}）</div>
      ${items.map(item => `
        <div class="pending-item" id="pending-${item.id}">
          <div class="pending-item__info">
            <a class="pending-item__url" href="${item.url}" target="_blank" rel="noopener">${item.url}</a>
            <div class="pending-item__meta">
              ${item.submitted_by || '匿名'} · ${item.created_at}
              ${item.reports > 0 ? ` · <span style="color: var(--danger);">🚩 ${item.reports} 次檢舉</span>` : ''}
            </div>
          </div>
          <div class="pending-item__actions">
            <button class="btn-approve" onclick="handleApprove('${member}', '${item.id}')">✓ 通過</button>
            <button class="btn-reject" onclick="handleReject('${member}', '${item.id}')">✕ 拒絕</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---- 檢舉 ----
async function handleReport(btn) {
  const id = btn.dataset.id;
  const sheet = btn.dataset.sheet;

  // localStorage 防重複
  const reportedKey = 'reported_ids';
  const reportedIds = JSON.parse(localStorage.getItem(reportedKey) || '[]');
  if (reportedIds.includes(id)) {
    showToast('你已經檢舉過這個影片了', 'info');
    return;
  }

  btn.disabled = true;
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'report', sheet, id })
    });

    reportedIds.push(id);
    localStorage.setItem(reportedKey, JSON.stringify(reportedIds));
    showToast('已檢舉，感謝回報', 'success');
    btn.style.opacity = '0.3';
  } catch (err) {
    console.error('檢舉失敗:', err);
    showToast('檢舉失敗', 'error');
    btn.disabled = false;
  }
}

async function handleApprove(sheet, id) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'approve',
        sheet: sheet,
        id: id,
        password: adminPassword
      })
    });

    const $item = document.getElementById(`pending-${id}`);
    if ($item) {
      $item.style.opacity = '0.3';
      $item.style.pointerEvents = 'none';
    }

    showToast('已通過', 'success');

    // Reload data after a short delay
    setTimeout(() => {
      loadAllData();
      loadAdminItems();
    }, 1500);
  } catch (err) {
    showToast('操作失敗', 'error');
  }
}

async function handleReject(sheet, id) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'reject',
        sheet: sheet,
        id: id,
        password: adminPassword
      })
    });

    const $item = document.getElementById(`pending-${id}`);
    if ($item) {
      $item.style.opacity = '0.3';
      $item.style.pointerEvents = 'none';
    }

    showToast('已拒絕', 'info');

    setTimeout(() => loadAdminItems(), 1500);
  } catch (err) {
    showToast('操作失敗', 'error');
  }
}



// ===== TOAST =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ===== UTILITIES =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr.replace(' ', 'T'));
  const now = new Date();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小時前`;
  if (minutes > 0) return `${minutes} 分鐘前`;
  return '剛剛';
}
