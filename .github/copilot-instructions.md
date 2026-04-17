# Copilot Instructions - Apink 8th Concert Fancam Collection

## 專案概覽

Apink 演唱會 Fancam 影片收集網站，純前端 + Google Apps Script 無伺服器架構，部署於 GitHub Pages。

## 架構

```
Frontend (GitHub Pages)          Backend (Google Apps Script)
├── index.html                   └── apps_script.js → Google Sheets
├── script.js                        ├── doGet() - 讀取資料
├── style.css                        └── doPost() - 新增/按讚/審核
└── embed_proxy.html (iframe 代理)
```

## 檔案職責

| 檔案 | 用途 |
|------|------|
| `script.js` | 前端主邏輯：資料載入、卡片渲染、推坑互動、管理員面板 |
| `apps_script.js` | Google Apps Script 後端（需手動複製至 Google Sheets） |
| `embed_proxy.html` | Threads/IG 嵌入代理，處理跨域 iframe 高度調整 |
| `style.css` | 暗色 + 粉紅漸層 Glassmorphism 設計系統 |

## 開發慣例

### 成員常數
```javascript
const MEMBERS = ['初瓏', '普美', '恩地', '南珠', '夏榮', '團體'];
```

### CSS 變數
優先使用 `:root` 定義的變數：`--pink-start`, `--bg-card`, `--radius-md`, `--transition-base`

### API 模式
- **GET**: `?action=read|readAll|getSettings|getPending`
- **POST**: JSON body `{ action: 'add'|'like'|'approve'|'reject', ... }`

## iOS Threads 嵌入限制

Meta 政策限制 Threads 影片在 iOS 無法直接嵌入。

| 平台 | 行為 |
|------|------|
| iOS（含 LINE/FB in-app browser） | 有縮圖：顯示縮圖 + ▶，點擊載入；**無縮圖：跳過不顯示** |
| Android / Desktop | 直接嵌入 + loading spinner |

**實作位置：**
- 全域 iOS 偵測：`script.js` 頂部 `isIOS` 常數
- 跳過邏輯：`script.js` 的 `renderCards()` 過濾 `isIOS && !thumbnail` 的 Threads 影片
- 縮圖抓取：`apps_script.js` 的 `fetchThumbnail()` 從 `og:image` 取得
- 點擊載入：`script.js` 的 `loadEmbed()` 設定 iframe src

```javascript
// iOS 偵測（含 LINE, FB in-app browser）
const isIOS = /iPad|iPhone|iPod|iOS/i.test(navigator.userAgent) 
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Threads URL 判斷
function isThreadsUrl(url) {
  return url && (url.includes('threads.net') || url.includes('threads.com'));
}
```

## 資料結構

### Google Sheets 欄位
`id | url | likes | created_at | submitted_by | status | thumbnail`

### 影片物件
```javascript
{ id, url, likes, created_at, submitted_by, sheet, thumbnail, status }
```

## 部署

1. 推送至 `main` 觸發 GitHub Actions
2. `deploy.yml` 注入 `API_URL` secret
3. 自動部署至 GitHub Pages

**注意**：`apps_script.js` 修改後需手動重新部署 Google Apps Script
