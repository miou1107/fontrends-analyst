# 瀏覽器操作策略

> 根據可用環境自動選擇最佳操作方式。

---

## 環境偵測順序

依優先級由高到低嘗試：

| 優先序 | 環境 | 偵測方式 | 能力 |
|--------|------|---------|------|
| 1 | Claude in Chrome | MCP tools 可用 | 完整瀏覽器操作 |
| 2 | Antigravity Browser | MCP tools 可用 | 完整瀏覽器操作 |
| 3 | Codex (sandbox) | 無瀏覽器 | 僅處理已提供數據 |
| 4 | Upload Mode | 使用者上傳截圖 | 截圖判讀 + 手動指引 |

---

## Claude in Chrome MCP 工具對照表

| 工具名稱 | 用途 | 使用時機 |
|---------|------|---------|
| `navigate` | 前往指定 URL | 開啟 Dashboard 頁面 |
| `read_page` | 讀取頁面內容 | 提取 DOM 結構 |
| `get_page_text` | 取得純文字 | 快速掃描頁面內容 |
| `computer` | 模擬滑鼠/鍵盤 | 操作篩選器 |
| `find` | 頁面搜尋 | 定位特定元素 |
| `form_input` | 表單輸入 | 篩選器搜尋框輸入 |
| `javascript_tool` | 執行 JS | DOM 數據提取 |
| `upload_image` | 上傳截圖 | 供視覺分析 |
| `read_console_messages` | 讀取 console | 檢查 JS 執行結果 |
| `read_network_requests` | 讀取網路請求 | 偵錯載入問題 |
| `tabs_create_mcp` | 新增分頁 | 開啟驗證用頁面 |
| `tabs_close_mcp` | 關閉分頁 | 清理 |
| `tabs_context_mcp` | 取得分頁資訊 | 確認當前頁面 |

### 篩選器操作流程（Claude in Chrome）

1. `navigate` → Dashboard URL
2. 等待頁面載入完成
3. `computer` → 點擊篩選器
4. `form_input` → 輸入品牌名
5. `computer` → 勾選 checkbox
6. `form_input` → 清空並輸入「台北101」
7. `computer` → 取消勾選
8. `computer` → 按 Escape
9. `javascript_tool` → 執行數據提取 JS

---

## Upload Mode 回退指引

當無法使用瀏覽器工具時，引導使用者：

### 請使用者操作的步驟

1. **開啟 Dashboard** 並完成篩選器設定（參考 `looker-operations.md`）
2. **逐頁截圖**（每頁一張，確保數字清晰可見）
3. **上傳截圖**給 AI 分析
4. **補充資訊：**
   - 分析期間（起迄日期）
   - 品牌名稱
   - 是否需要競品比較

### 截圖要求
- 解析度足以看清數字（建議全螢幕截圖）
- 確保篩選器狀態可見（頁面頂部）
- 圖表完整、未被裁切
- 如有表格，確保所有列都可見（可能需要捲動截多張）

### 回應模板

當偵測到無瀏覽器環境時，使用以下回應：

> 「我目前無法直接操作瀏覽器。請幫我：
> 1. 開啟 Dashboard 並設定好篩選器
> 2. 逐頁截圖上傳（社群總覽、趨勢、語系、平台、KOL、好感度、搜尋）
> 3. 告訴我分析期間和品牌名稱
>
> 我收到截圖後會立即開始分析。」
