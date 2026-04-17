/**
 * ============================================================
 * Apink 8th Concert Fancam — Frontend Logic
 * ============================================================
 */

// ===== CONFIGURATION =====
// 🔧 把你的 Google Apps Script Web App URL 貼在這裡
const MEMBERS = ['初瓏', '普美', '恩地', '南珠', '夏榮', '團體'];
const API_URL = 'https://script.google.com/macros/s/AKfycbwcrmegWZSIiI0NdJg6WE7yvjcp-x3Ki0cVCOeQtmskNtTkN3_iIrMg2LyBIuewDknv/exec';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 分鐘
const LIKE_DEBOUNCE_MS = 800; // 推坑 debounce

// ===== STATE =====
let globalData = [];
let currentFilter = '全部';
let isLoading = false;
let adminPassword = '';
let isAdminLoggedIn = false;
let refreshTimer = null;
let countdownSeconds = 600; // 10 min
let likeQueues = {}; // { `${sheet}_${id}`: { count, timeout } }
let currentPage = 1;
const ITEMS_PER_PAGE = 5;
let renderGeneration = 0; // incremented each render to cancel stale staggered appends
let embedUidCounter = 0;

// ===== DOM REFS =====
const $grid = document.getElementById('card-grid');
const $loading = document.getElementById('loading');
const $totalCount = document.getElementById('total-count');
const $refreshCountdown = document.getElementById('refresh-countdown');
const $tabs = document.getElementById('tabs');
const $addModal = document.getElementById('add-modal');
const $addBtn = document.getElementById('add-btn');
const $addModalClose = document.getElementById('add-modal-close');
const $addSheet = document.getElementById('add-sheet');
const $addUrl = document.getElementById('add-url');
const $addNickname = document.getElementById('add-nickname');
const $addSubmit = document.getElementById('add-submit');
const $adminTrigger = document.getElementById('admin-trigger');
const $adminLoginModal = document.getElementById('admin-login-modal');
const $adminLoginClose = document.getElementById('admin-login-close');
const $adminPasswordInput = document.getElementById('admin-password');
const $adminLoginBtn = document.getElementById('admin-login-btn');
const $adminPanel = document.getElementById('admin-panel');
const $adminClose = document.getElementById('admin-close');
const $reviewToggle = document.getElementById('review-toggle');
const $reviewStatusText = document.getElementById('review-status-text');
const $pendingList = document.getElementById('pending-list');
const $toastContainer = document.getElementById('toast-container');
const $loadMoreBtn = document.getElementById('load-more-btn');

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAddModal();
  initEmbedResizeListener();
  initAdmin();

  if ($loadMoreBtn) {
    $loadMoreBtn.addEventListener('click', handleLoadMore);
  }

  loadAllData();
  startRefreshTimer();
});

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
  // 先依推坑指數排序（高→低），再依提交時間排序（新→舊）
  return [...videos].sort((a, b) => {
    const likesDiff = (b.likes || 0) - (a.likes || 0);
    if (likesDiff !== 0) return likesDiff;
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

  const videos = currentFilter === '全部'
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
    const actualIndex = startIndex + index;
    const isLast = index === toRender.length - 1;

    setTimeout(() => {
      // If user switched tabs/loaded more since this was queued, abort
      if (renderGeneration !== thisGeneration) return;

      const card = createVideoCard(video, actualIndex);
      $grid.appendChild(card);

      if (isLast) {
        if ($loadMoreBtn) {
          $loadMoreBtn.style.display = videos.length > endIndex ? 'block' : 'none';
        }
      }
    }, index * 300);
  });
}

function createVideoCard(video, index) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.style.animationDelay = `${index * 0.06}s`;
  card.dataset.id = video.id;

  const embedContent = generateEmbedHTML(video.url, video.thumbnail);
  const timeAgo = formatTimeAgo(video.created_at);

  card.innerHTML = `
    <div class="video-card__embed">
      ${embedContent}
    </div>
    <div class="video-card__footer">
      <div class="video-card__info">
        <div class="video-card__author">
          <span style="font-weight: 800; color: var(--pink-start); margin-right: 6px; font-size: 1.1rem; font-style: italic;" class="rank-num">#${index + 1}</span>
          <span style="font-size: 0.8rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${escapeHtml(video.sheet)}</span>
          📎 ${escapeHtml(video.submitted_by || '匿名')}
        </div>
        <div class="video-card__time">${timeAgo}</div>
      </div>
      <button class="like-btn" data-id="${video.id}" data-sheet="${video.sheet}" onclick="handleLike(this)">
        <span class="like-btn__icon">❤️</span>
        <span class="like-btn__count">${video.likes || 0}</span>
      </button>
    </div>
  `;

  return card;
}

function generateEmbedHTML(url, thumbnail) {
  if (!url) return '<div class="link-preview"><span class="link-preview__icon">❌</span><span class="link-preview__platform">無效連結</span></div>';

  let cleanUrl = url.trim();
  try {
    const urlObj = new URL(cleanUrl);
    urlObj.search = '';
    cleanUrl = urlObj.toString();
  } catch (e) { }

  const isIOS = /iPad|iPhone|iPod|iOS/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Threads — use embed_proxy for auto-height, with thumbnail placeholder
  if (cleanUrl.includes('threads.net') || cleanUrl.includes('threads.com')) {
    const proxyUrl = `embed_proxy.html?type=threads&url=${encodeURIComponent(cleanUrl)}`;
    const uid = createEmbedUid('th');

    // iOS 無論有沒有縮圖，一律先擋下要求點擊 (lazyLoad)
    const lazyLoad = isIOS;

    const thumbStyle = thumbnail
      ? `background-image: url('${thumbnail}'); background-size: cover; background-position: center;`
      : `background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);`;

    const iframeSrc = lazyLoad ? '' : proxyUrl;
    const placeholderClick = lazyLoad
      ? `onclick="loadEmbed(this, '${proxyUrl}')"`
      : '';
    const placeholderInteraction = lazyLoad ? 'cursor: pointer; pointer-events: auto;' : 'pointer-events: none;';

    return `
      <div class="embed-wrapper" id="${uid}">
        <div class="embed-placeholder threads" style="${thumbStyle} ${placeholderInteraction}" ${placeholderClick}>
          ${lazyLoad ? '<div class="embed-placeholder__play">▶</div>' : '<div class="embed-placeholder__icon">🧵</div><div class="embed-placeholder__spinner"></div>'}
          <div class="embed-placeholder__label">${lazyLoad && !thumbnail ? '點擊載入 Threads' : (lazyLoad ? '' : 'Threads 貼文載入中...')}</div>
        </div>
        <iframe ${iframeSrc ? `src="${iframeSrc}"` : `data-src="${proxyUrl}"`} class="embed-iframe threads-embed" data-post-url="${cleanUrl}"
          frameborder="0" scrolling="auto" allowtransparency="true" allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
          style="opacity: 0; transition: opacity 0.4s ease;">
        </iframe>
      </div>
    `;
  }

  // Instagram — use same-origin embed proxy (auto height detection via postMessage)
  if (cleanUrl.includes('instagram.com')) {
    const proxyUrl = `embed_proxy.html?type=instagram&url=${encodeURIComponent(cleanUrl)}`;
    const uid = createEmbedUid('ig');
    const lazyLoad = isIOS;
    const thumbStyle = thumbnail
      ? `background-image: url('${thumbnail}'); background-size: cover; background-position: center;`
      : `background: linear-gradient(145deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%);`;
    const iframeSrc = lazyLoad ? '' : proxyUrl;
    const placeholderClick = lazyLoad
      ? `onclick="loadEmbed(this, '${proxyUrl}')"`
      : '';
    const placeholderInteraction = lazyLoad ? 'cursor: pointer; pointer-events: auto;' : 'pointer-events: none;';

    return `
      <div class="embed-wrapper" id="${uid}">
        <div class="embed-placeholder instagram" style="${thumbStyle} ${placeholderInteraction}" ${placeholderClick}>
          ${lazyLoad ? '<div class="embed-placeholder__play">▶</div>' : '<div class="embed-placeholder__icon">📷</div><div class="embed-placeholder__spinner"></div>'}
          <div class="embed-placeholder__label">${lazyLoad && !thumbnail ? '點擊載入 Instagram' : (lazyLoad ? '' : 'Instagram 貼文載入中...')}</div>
        </div>
        <iframe ${iframeSrc ? `src="${iframeSrc}"` : `data-src="${proxyUrl}"`} class="embed-iframe ig-embed" data-post-url="${cleanUrl}"
          frameborder="0" scrolling="auto" allowtransparency="true" allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
          style="opacity: 0; transition: opacity 0.4s ease;">
        </iframe>
      </div>
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

function createEmbedUid(prefix) {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(4);
    window.crypto.getRandomValues(bytes);
    const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${token}`;
  }

  embedUidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${embedUidCounter.toString(36)}`;
}

// iOS tap-to-load: set iframe src and switch from thumbnail to loading state
function loadEmbed(placeholder, proxyUrl) {
  const wrapper = placeholder.closest('.embed-wrapper');
  const iframe = wrapper.querySelector('.embed-iframe');
  if (!iframe || iframe.src) return; // already loading

  // Switch placeholder to loading state
  placeholder.innerHTML = '<div class="embed-placeholder__spinner"></div><div class="embed-placeholder__label">載入中...</div>';
  placeholder.style.cursor = 'default';
  placeholder.style.pointerEvents = 'none';

  // Start loading the iframe
  iframe.src = proxyUrl;
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

            // Show the iframe and hide the placeholder (content is now rendered)
            if (iframe.style.opacity === '0') {
              iframe.style.opacity = '1';
              const placeholder = iframe.parentElement?.querySelector('.embed-placeholder');
              if (placeholder) placeholder.style.display = 'none';
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
  });
}

// ===== LIKE / 推坑 =====
function handleLike(btn) {
  const id = btn.dataset.id;
  const sheet = btn.dataset.sheet;
  const key = `${sheet}_${id}`;

  // Trigger heartbeat animation
  btn.classList.add('pulse');
  setTimeout(() => btn.classList.remove('pulse'), 350);

  // Float heart particle
  spawnFloatHeart(btn);

  // Update local count immediately
  const $count = btn.querySelector('.like-btn__count');
  const currentCount = parseInt($count.textContent) || 0;
  $count.textContent = currentCount + 1;

  // Also update globalData
  const video = globalData.find(v => String(v.id) === String(id));
  if (video) {
    video.likes = currentCount + 1;
  }

  // Debounced batch send
  if (!likeQueues[key]) {
    likeQueues[key] = { count: 0, timeout: null };
  }

  likeQueues[key].count += 1;

  if (likeQueues[key].timeout) {
    clearTimeout(likeQueues[key].timeout);
  }

  likeQueues[key].timeout = setTimeout(() => {
    sendLike(sheet, id, likeQueues[key].count);
    likeQueues[key].count = 0;
  }, LIKE_DEBOUNCE_MS);
}

function spawnFloatHeart(btn) {
  const rect = btn.getBoundingClientRect();
  const heart = document.createElement('div');
  heart.className = 'float-heart';
  heart.textContent = '❤️';
  heart.style.left = `${rect.left + rect.width / 2 - 10 + (Math.random() * 20 - 10)}px`;
  heart.style.top = `${rect.top - 10}px`;
  document.body.appendChild(heart);

  setTimeout(() => heart.remove(), 1000);
}

async function sendLike(sheet, id, count) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'like',
        sheet: sheet,
        id: id,
        count: count
      })
    });
  } catch (err) {
    console.error('推坑失敗:', err);
  }
}

// ===== ADD VIDEO MODAL =====
function initAddModal() {
  $addBtn.addEventListener('click', () => {
    // Pre-select current filter's member (if on 全部, default to 初瓏)
    $addSheet.value = (currentFilter !== '全部') ? currentFilter : '初瓏';
    $addUrl.value = '';
    $addNickname.value = '';
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

  // Enter key to submit
  $addUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSubmit();
  });
}

async function handleAddSubmit() {
  const sheet = $addSheet.value;
  const url = $addUrl.value.trim();
  const nickname = $addNickname.value.trim();

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
        submitted_by: nickname || '匿名'
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
      submitted_by: nickname || '匿名',
      status: 'approved',
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

  $reviewToggle.addEventListener('click', handleReviewToggle);
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

  // Load settings
  try {
    const res = await fetch(`${API_URL}?action=getSettings`);
    const settings = await res.json();

    const isOn = settings.review_mode === true;
    $reviewToggle.classList.toggle('on', isOn);
    $reviewToggle.setAttribute('aria-checked', isOn);
    $reviewStatusText.textContent = isOn
      ? '開啟中 — 用戶提交的影片需審核後才上架'
      : '關閉中 — 用戶提交的影片會直接上架';
  } catch (err) {
    console.error('載入設定失敗:', err);
  }

  // Load pending items
  loadPendingItems();
}

async function handleReviewToggle() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'toggleReview',
        password: adminPassword
      })
    });

    // Toggle UI optimistically
    const isCurrentlyOn = $reviewToggle.classList.contains('on');
    const newIsOn = !isCurrentlyOn;
    $reviewToggle.classList.toggle('on', newIsOn);
    $reviewToggle.setAttribute('aria-checked', newIsOn);
    $reviewStatusText.textContent = newIsOn
      ? '開啟中 — 用戶提交的影片需審核後才上架'
      : '關閉中 — 用戶提交的影片會直接上架';

    showToast(`審核模式已${newIsOn ? '開啟' : '關閉'}`, 'info');
  } catch (err) {
    console.error('切換審核模式失敗:', err);
    showToast('操作失敗', 'error');
  }
}

async function loadPendingItems() {
  $pendingList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>載入待審核項目...</span></div>';

  try {
    const res = await fetch(`${API_URL}?action=getPending&password=${encodeURIComponent(adminPassword)}`);
    const result = await res.json();

    if (result.error) {
      $pendingList.innerHTML = `<div class="empty-state"><span class="empty-state__text">${result.error}</span></div>`;
      isAdminLoggedIn = false;
      return;
    }

    let html = '';
    let totalPending = 0;

    MEMBERS.forEach(member => {
      const items = result.data[member] || [];
      if (items.length === 0) return;

      totalPending += items.length;

      html += `
        <div class="pending-section">
          <div class="pending-section__title">${member}（${items.length} 筆待審核）</div>
          ${items.map(item => `
            <div class="pending-item" id="pending-${item.id}">
              <div class="pending-item__info">
                <a class="pending-item__url" href="${item.url}" target="_blank" rel="noopener">${item.url}</a>
                <div class="pending-item__meta">${item.submitted_by || '匿名'} · ${item.created_at}</div>
              </div>
              <div class="pending-item__actions">
                <button class="btn-approve" onclick="handleApprove('${member}', '${item.id}')">✓ 通過</button>
                <button class="btn-reject" onclick="handleReject('${member}', '${item.id}')">✕ 拒絕</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    });

    if (totalPending === 0) {
      html = '<div class="empty-state"><span class="empty-state__icon">✅</span><span class="empty-state__text">沒有待審核的影片</span></div>';
    }

    $pendingList.innerHTML = html;
  } catch (err) {
    console.error('載入待審核項目失敗:', err);
    $pendingList.innerHTML = '<div class="empty-state"><span class="empty-state__text">載入失敗</span></div>';
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
      loadPendingItems();
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

    setTimeout(() => loadPendingItems(), 1500);
  } catch (err) {
    showToast('操作失敗', 'error');
  }
}

// ===== REFRESH TIMER =====
function startRefreshTimer() {
  countdownSeconds = 600;
  updateCountdownDisplay();

  if (refreshTimer) clearInterval(refreshTimer);

  refreshTimer = setInterval(() => {
    countdownSeconds--;

    if (countdownSeconds <= 0) {
      countdownSeconds = 600;
      loadAllData();
    }

    updateCountdownDisplay();
  }, 1000);
}

function updateCountdownDisplay() {
  const min = Math.floor(countdownSeconds / 60);
  const sec = countdownSeconds % 60;
  $refreshCountdown.textContent = `${min}:${sec.toString().padStart(2, '0')} 後更新排序`;
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
