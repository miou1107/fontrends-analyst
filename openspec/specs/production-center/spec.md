# 生產中心 — Production Center

## Input / Output Contract

### Input
- `script.json`：腳本企劃（頁面結構、每頁元素、內容）
- `theme.json`：視覺設計（配色、字型、間距、表格樣式）
- `brand.json`：品牌名稱與色系
- 指定輸出格式：`pptx` | `gslides` | `gdocs` | `gsheets`

### Output
- **pptx**：`~/Desktop/{Brand}_Report.pptx`，本地檔案
- **gslides**：Google Slides URL，線上文件
- **gdocs**：Google Docs URL，線上文件
- **gsheets**：Google Sheets URL，線上文件

### Engine 中間格式（engine.js → renderer）
每頁傳給 renderer 的統一格式：
```json
{
  "pageId": "string",
  "title": "string",
  "background": "dark|light",
  "elements": [
    {
      "type": "table|kpi_cards|insight|text|chart_placeholder",
      "position": { "x": 0, "y": 0, "w": 0, "h": 0 },
      "style": {},
      "data": {}
    }
  ]
}
```

### Renderer 統一介面
```javascript
async function render(pages, brand, theme, outputConfig) → outputPath | URL
```

### 下游消費者
- §10 品質稽核：讀取最終產出檔案進行檢查

## Purpose

根據 script.json（腳本企劃的輸出）和 theme.json（視覺設計的輸出），呼叫對應的 API 或工具產出最終文件。支援多種格式：pptx, gslides, gdocs, gsheets 等。此模組是純粹的「執行層」，不做任何內容決策。

---

## Requirements

### Requirement: Engine + Renderer 架構

engine.js MUST 讀取 script.json，組裝中間格式，再呼叫對應的 renderer 產出最終文件。

#### Scenario: Engine 讀取 script.json 並分派 renderer
- **GIVEN** `~/.fontrends/runs/{brand}-{date}/` 目錄中有 `script.json`、`theme.json`、`brand.json`
- **WHEN** 執行 `node engine.js --run {run_path} --format {format}`
- **THEN** engine.js 讀取 script.json 解析頁面結構與內容
- **AND** 讀取 theme.json 取得視覺設計參數（配色、字型、間距）
- **AND** 讀取 brand.json 取得品牌定義資訊
- **AND** **讀取 narrative.json 作為數據來源**（所有數字從 narrative 動態取值，禁止 hardcode）
- **AND** 組裝為中間格式（pages array），傳給對應的 renderer

#### Scenario: 數據驅動原則（2026-03-20 實戰教訓）
- **GIVEN** generate script 需要填入數據（KPI 數字、表格內容、洞察文字）
- **WHEN** 撰寫或產出 generate script
- **THEN** 所有數字 MUST 從 `narrative.json` 動態讀取（`chapters[].data_table`、`insight`、`so_what`）
- **AND** 禁止在 script 中 hardcode 任何數據值
- **AND** Script 只負責排版和 API 呼叫，不負責數據內容

#### Scenario: 研究方法頁（所有格式必做）
- **GIVEN** 報告封面已建立
- **WHEN** renderer 組裝第二頁內容
- **THEN** 必須插入「研究方法」頁面，包含以下資訊：
  1. 數據來源（Looker Studio / Journey101 Super Dashboard 等）
  2. 篩選條件（品牌名稱、選取主題）
  3. 時間範圍（如 2025/3/21 ~ 2026/3/21）
  4. 分析維度清單（社群總覽、語系、趨勢、好感度、平台、KOL、搜尋意圖）
  5. 資料最後更新時間
- **AND** 此頁位於封面之後、執行摘要之前
- **AND** 資訊從 `interview.json` 和 `data.json.meta` 動態讀取

#### Scenario: 附錄截圖嵌入（所有格式必做）
- **GIVEN** 報告主體內容已產出完成
- **WHEN** renderer 進入最終頁面組裝階段
- **THEN** 必須在報告最後新增「附錄：參考資訊」章節
- **AND** 讀取 `data.json` 的 `dashboard_screenshots` 欄位取得所有截圖路徑
- **AND** 依頁面順序逐張嵌入截圖，每張標注來源頁面名稱
- **AND** gslides：每張截圖一頁 slide，標題為頁面名稱
- **AND** gdocs：文末分頁後插入，每張截圖配標題
- **AND** pptx：同 gslides
- **AND** 截圖作為原始 Dashboard 畫面佐證，增強報告可信度

> 原因：LV 案例中 13 頁 script 有超過 50 處 hardcode 數字，narrative 微幅更新時需逐行 diff 改正。
> 正確架構：`data.json → narrative.json → generate-{brand}-gslides.js`（script 讀 narrative，不碰 data）

#### Scenario: Engine 中間格式結構
- **GIVEN** engine.js 已讀取 script.json 和 theme.json
- **WHEN** 組裝中間格式
- **THEN** 產出 pages array，每個 page 包含：type、title、elements[]、layout、notes
- **AND** 每個 element 包含：kind（text / chart / table / image）、content、position、style
- **AND** style 來自 theme.json 的對應定義，engine 不自行決定樣式

#### Scenario: Engine 位置與引擎載入
- **GIVEN** 引擎檔案位於 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/engines/`
- **WHEN** Skill 啟動並載入引擎
- **THEN** 從 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/engines/engine.js` 載入主引擎
- **AND** 從 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/engines/renderers/` 載入可用的 renderer 清單

---

### Requirement: Renderer 介面定義

所有 renderer MUST 實作統一的介面：`async function render(pages, brand, theme, outputConfig)`。

#### Scenario: Renderer 介面規範
- **GIVEN** 開發新的 renderer
- **WHEN** 實作 render 函數
- **THEN** 函數簽名為 `async function render(pages, brand, theme, outputConfig)`
- **AND** `pages` 為 engine 組裝的中間格式 array
- **AND** `brand` 為 brand.json 的內容
- **AND** `theme` 為 theme.json 的內容
- **AND** `outputConfig` 包含 outputPath、filename、format-specific options
- **AND** 回傳值為 `{ success: boolean, output: string, errors: [] }`，output 為檔案路徑或雲端 URL

#### Scenario: Renderer 回傳失敗
- **GIVEN** renderer 執行過程發生錯誤
- **WHEN** render 函數完成
- **THEN** 回傳 `{ success: false, output: null, errors: ["錯誤訊息"] }`
- **AND** engine.js 根據錯誤類型決定是否重試

---

### Requirement: 支援格式清單

Production Center MUST 支援以下 renderer，並依照開發優先順序實作。

#### Scenario: pptx.js — 本地 PowerPoint 檔案
- **GIVEN** 用戶指定 `--format pptx`
- **WHEN** engine 呼叫 pptx renderer
- **THEN** 使用 pptxgenjs 函式庫產出 .pptx 檔案
- **AND** 輸出至 `~/.fontrends/runs/{brand}-{date}/output/{filename}.pptx`
- **AND** 產出前讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/skills/formats/pptx-pitfalls.md` 避免已知問題

#### Scenario: gslides.js — Google Slides 雲端簡報
- **GIVEN** 用戶指定 `--format gslides`
- **WHEN** engine 呼叫 gslides renderer
- **THEN** 使用 Google Slides API 建立簡報
- **AND** 回傳 Google Slides URL
- **AND** 產出前讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/skills/formats/gslides-pitfalls.md` 避免已知問題

#### Scenario: gdocs.js — Google Docs 文件（未來）
- **GIVEN** 用戶指定 `--format gdocs`
- **WHEN** engine 嘗試呼叫 gdocs renderer
- **THEN** 使用 Google Docs API 建立文件
- **AND** 回傳 Google Docs URL
- **AND** 產出前讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/skills/formats/gdocs-pitfalls.md` 避免已知問題

> 注意：此 renderer 為未來規劃，MVP 不實作。

#### Scenario: gsheets.js — Google Sheets 數據附件（未來）
- **GIVEN** 用戶指定 `--format gsheets`
- **WHEN** engine 嘗試呼叫 gsheets renderer
- **THEN** 使用 Google Sheets API 建立試算表
- **AND** 回傳 Google Sheets URL
- **AND** 用於匯出原始數據底稿或補充表格

> 注意：此 renderer 為未來規劃，MVP 不實作。

#### Scenario: 不支援的格式
- **GIVEN** 用戶指定了不在清單中的格式（如 `--format pdf`）
- **WHEN** engine 嘗試載入 renderer
- **THEN** 回傳錯誤訊息：「不支援的格式：{format}，目前支援：pptx, gslides」
- **AND** 列出所有可用格式供用戶選擇

---

### Requirement: OAuth 管理

Google API 相關的 renderer MUST 透過 OAuth 2.0 進行授權，token 快取在本地。

#### Scenario: 首次 OAuth 授權
- **GIVEN** `~/.fontrends/google-token.json` 不存在
- **WHEN** 使用 gslides / gdocs / gsheets renderer
- **THEN** 啟動 OAuth 2.0 授權流程（開啟瀏覽器）
- **AND** 用戶完成授權後，將 access_token 和 refresh_token 存到 `~/.fontrends/google-token.json`

#### Scenario: Token 有效，直接使用
- **GIVEN** `~/.fontrends/google-token.json` 存在且 access_token 未過期
- **WHEN** renderer 需要呼叫 Google API
- **THEN** 直接使用該 access_token
- **AND** 不中斷用戶流程

#### Scenario: Token 過期，自動 refresh
- **GIVEN** `~/.fontrends/google-token.json` 存在但 access_token 已過期
- **WHEN** renderer 需要呼叫 Google API
- **THEN** 使用 refresh_token 自動換取新的 access_token
- **AND** 更新 `~/.fontrends/google-token.json`
- **AND** 用戶無感知地繼續執行

#### Scenario: Refresh token 失效
- **GIVEN** refresh_token 也已失效（被撤銷或過期）
- **WHEN** 自動 refresh 失敗
- **THEN** 提示用戶重新進行 OAuth 授權
- **AND** 不中斷整體流程，等待重新授權後繼續

---

### Requirement: 輸入與輸出規範

Engine MUST 從標準路徑讀取輸入，產出到標準路徑。

#### Scenario: 標準輸入路徑
- **GIVEN** 一次完整的報告生產任務
- **WHEN** engine 啟動
- **THEN** 從 `~/.fontrends/runs/{brand}-{date}/script.json` 讀取腳本
- **AND** 從 `~/.fontrends/runs/{brand}-{date}/theme.json` 讀取視覺主題
- **AND** 從 `~/.fontrends/runs/{brand}-{date}/brand.json` 讀取品牌定義
- **AND** 任一檔案不存在時，回傳明確的錯誤訊息指出缺少哪個檔案

#### Scenario: 標準輸出路徑（本地檔案）
- **GIVEN** 使用 pptx renderer 產出本地檔案
- **WHEN** 產出完成
- **THEN** 檔案存放於 `~/.fontrends/runs/{brand}-{date}/output/`
- **AND** 檔名格式為 `{brand}-{date}-report.pptx`

#### Scenario: 標準輸出（雲端 URL）
- **GIVEN** 使用 gslides renderer 產出雲端簡報
- **WHEN** 產出完成
- **THEN** 回傳 Google Slides URL
- **AND** 同時將 URL 寫入 `~/.fontrends/runs/{brand}-{date}/output/output-meta.json`

#### Scenario: Google Drive 存檔與流水號命名（2026-03-20 實戰）
- **GIVEN** 使用 gslides 或 gdocs renderer
- **WHEN** 產出完成
- **THEN** 自動存入 Google Drive `FonTrends_AutoReport/` 資料夾（不存在則建立）
- **AND** 檔名格式：`{品牌名} {報告類型} {YYYY-MM-DD}-{NNN}`
- **AND** NNN 為當日流水號，從 001 起，查詢同日同品牌同類型現有檔案取最大值 + 1
- **AND** 報告類型：gslides=`品牌社群分析報告`，gdocs=`品牌社群深度分析報告`

---

### Requirement: 執行指令格式

Engine MUST 透過 CLI 指令啟動，參數格式明確。

#### Scenario: 標準執行指令
- **GIVEN** 用戶或上游模組需要啟動生產
- **WHEN** 執行 CLI 指令
- **THEN** 指令格式為 `node engine.js --run {run_path} --format {format}`
- **AND** `--run` 為 `~/.fontrends/runs/{brand}-{date}/` 的完整路徑
- **AND** `--format` 為 `pptx` | `gslides` | `gdocs` | `gsheets`

#### Scenario: 缺少必要參數
- **GIVEN** 執行指令時遺漏 `--run` 或 `--format`
- **WHEN** engine.js 啟動
- **THEN** 顯示用法說明（usage help）並以 exit code 1 結束
- **AND** 不執行任何產出動作

---

### Requirement: 錯誤處理

Engine 和 Renderer MUST 具備完善的錯誤處理機制。

#### Scenario: API 呼叫失敗時重試
- **GIVEN** Google API 呼叫回傳 5xx 或 429（rate limit）
- **WHEN** renderer 偵測到錯誤
- **THEN** 使用 exponential backoff 重試，最多 3 次
- **AND** 重試間隔為 1s → 2s → 4s
- **AND** 3 次都失敗時，回傳錯誤並記錄到 log

#### Scenario: Batch request 超過限制時分批
- **GIVEN** Google Slides API 的 batchUpdate 有 request 數量限制（實測上限約 600）
- **WHEN** 單次 batch 超過 500 個 request
- **THEN** 自動拆分為多個 batch，每批不超過 500
- **AND** 依序執行，確保每批成功後再送下一批
- **AND** 任一批次失敗時，記錄已完成的批次數量，便於從斷點續做

> 2026-03-20 實戰：13 頁含 KPI 卡片 + bar chart + 表格 + speaker notes，實際產出 549 requests，分兩批送（500 + 49）。

#### Scenario: pptxgenjs 產出錯誤
- **GIVEN** pptxgenjs 產出過程發生例外（如記憶體不足、檔案寫入失敗）
- **WHEN** renderer 捕獲錯誤
- **THEN** 回傳完整的 error stack trace
- **AND** 清理已部分寫入的檔案（避免殘留損壞檔案）

#### Scenario: 輸入檔案格式錯誤
- **GIVEN** script.json 或 theme.json 格式不正確（JSON parse 失敗）
- **WHEN** engine 嘗試讀取
- **THEN** 回傳明確錯誤訊息：「{filename} 格式錯誤：{parse error detail}」
- **AND** 不進入 renderer 階段

---

### Requirement: 格式專屬踩坑知識

每個 Renderer MUST 在執行前讀取對應的 pitfalls 文件，避免已知問題。

#### Scenario: pptx renderer 讀取踩坑知識
- **GIVEN** 使用 pptx renderer
- **WHEN** render 函數啟動
- **THEN** 讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/skills/formats/pptx-pitfalls.md`
- **AND** 依據踩坑知識調整產出邏輯（如 shadow 物件不共用、hex 色碼不加 # 等）

#### Scenario: gslides renderer 讀取踩坑知識
- **GIVEN** 使用 gslides renderer
- **WHEN** render 函數啟動
- **THEN** 讀取 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/skills/formats/gslides-pitfalls.md`
- **AND** 依據踩坑知識調整 API request 建構方式（如表格行數限制、文字溢出處理等）

#### Scenario: Pitfalls 檔案不存在
- **GIVEN** 對應格式的 pitfalls 檔案尚未建立
- **WHEN** renderer 嘗試讀取
- **THEN** 記錄警告：「{format}-pitfalls.md 不存在，跳過踩坑知識載入」
- **AND** 繼續執行，不因缺少 pitfalls 檔案而中斷

---

## Implementation Design（2026-03-20 確認）

### 檔案結構
```
~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/
├── engines/
│   ├── engine.js         ← 主引擎：CLI + 讀 JSON + 組裝中間格式 + 呼叫 renderer
│   ├── helpers.js        ← 共用：色碼轉換、EMU/inches、ID 生成、OAuth
│   └── renderers/
│       ├── gslides.js    ← Google Slides API renderer
│       ├── pptx.js       ← pptxgenjs renderer
│       └── gdocs.js      ← Google Docs API renderer
├── schemas/
│   ├── full-13.json
│   ├── compact-8.json
│   ├── executive-5.json
│   └── mini-3.json
└── templates/
    ├── brand-colors.json  ← 已存在
    └── theme-default.json ← 新建
```

### 中間格式 schema（engine 輸出給 renderer）
```json
{
  "pageId": "string",
  "pageIndex": 0,
  "title": "string",
  "background": "light|dark",
  "speakerNotes": "string",
  "elements": [
    { "type": "table|kpi_card|bar_chart|text|rect|header", "..." : "..." }
  ]
}
```

### Element types
- `header`: title + underline
- `table`: headers[], rows[][], headerBg, maxRows(6 for gslides, 12 for pptx)
- `kpi_card`: value, label, accentColor
- `bar_chart`: bars[{label, pct, color}]
- `text`: content, fontSize, bold, italic, color, align
- `rect`: fillColor (for dividers, backgrounds)

### CLI interface
```bash
node engine.js --run {path} --format {format} --schema {schema}
```

### Renderer interface (all renderers implement this)
```javascript
module.exports = { render: async function(pages, brand, theme, outputConfig) { ... } }
```
