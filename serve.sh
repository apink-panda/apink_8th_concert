#!/usr/bin/env bash
# ============================================================
# 本地端測試伺服器啟動腳本
# 用途：啟動本地 HTTP 伺服器以測試網頁，避免跨域 iframe 問題
# 使用：./serve.sh [port]（預設 port: 8080）
# ============================================================

PORT=${1:-8080}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🩷 Apink 8th Concert — 本地端測試伺服器"
echo "============================================"
echo "📂 目錄：$SCRIPT_DIR"
echo "🌐 網址：http://localhost:$PORT"
echo "📱 iOS 縮圖邏輯測試：請使用 Safari DevTools 切換 UA 為 iPhone"
echo "   或開啟 http://localhost:$PORT?debug_ios=1 強制啟用 iOS 模式"
echo "--------------------------------------------"
echo "按 Ctrl+C 停止伺服器"
echo ""

cd "$SCRIPT_DIR"
python3 -m http.server "$PORT"
