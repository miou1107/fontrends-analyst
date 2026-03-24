# Data Extraction Engine — 資料擷取引擎

> 本 spec 取代 `brand-analysis-workflow/spec.md` 中 §2 資料擷取的部分，成為獨立的數據擷取引擎。

## Input / Output Contract

### Input
- `interview.json`：品牌訪談結果（品牌名稱、競品、分析期間、指定資料來源）
- Dashboard URLs（Looker Studio、GA4、GSC、Google Trends）
- 既有 `data_partial.json`（斷點續接時使用）

### 上游依賴：interview.json

本模組讀取 `interview.json` 的以下欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `brand` | string | 品牌名稱 |
| `competitor` | string | 競品名稱 |
| `period` | string | 分析期間，例如 `"2024/04 - 2025/03"` |
| `sources` | array of strings | 指定的資料來源，例如 `["looker-studio", "ga4", "gsc", "google-trends"]` |
| `dashboard_urls` | object | 各來源的 Dashboard URL，以來源名稱為 key |

### Output
- `~/.fontrends/runs/{brand}-{date}/data.json` — 統一資料格式
- `~/.fontrends/runs/{brand}-{date}/extraction-log.jsonl` — 逐頁擷取紀錄
- `~/.fontrends/runs/{brand}-{date}/run-status.json` — 執行狀態紀錄

#### run-status.json schema
```json
{
  "status": "in_progress|completed|failed|interrupted",
  "reason": "string|null",
  "completed_pages": ["string"],
  "remaining_pages": ["string"],
  "next_page": "string|null",
  "timestamp": "ISO8601"
}
```

### data.json schema
```json
{
  "meta": {
    "brand": "string",
    "competitor": "string",
    "period": "string",
    "extracted_at": "ISO8601",
    "sources": ["looker-studio", "ga4", "gsc", "google-trends"],
    "urls": {
      "looker-studio": "https://lookerstudio.google.com/...",
      "ga4": "https://analytics.google.com/...",
      "gsc": "https://search.google.com/search-console/...",
      "google-trends": "https://trends.google.com/..."
    }
  },
  "pages": {
    "{page_key}": {
      "source": "looker-studio|ga4|gsc|google-trends",
      "status": "pending|in_progress|completed|failed",
      "extracted_at": "ISO8601|null",
      "confidence": "high|medium|low",
      "data": { }
    }
  },
  "notable_posts": [
    {
      "type": "high_engagement|sentiment_extreme|trend_spike|top_kol|significant_event",
      "title": "string",
      "platform": "string|null",
      "url": "string|null",
      "screenshot_path": "string|null",
      "metrics": {},
      "why_notable": "string",
      "source_page": "string",
      "extracted_at": "ISO8601"
    }
  ],
  "dashboard_screenshots": {
    "{page_key}": "screenshots/dashboard-{page_key}.png"
  }
}
```

> 下游 §4 Data Analysis 應對 low confidence 數據加註警語。

### 各 Adapter 代表性頁面 schema

#### Looker Studio — social_overview
```json
{
  "influence": 0,
  "posts": 0,
  "likes": 0,
  "comments": 0,
  "shares": 0,
  "site_avg_influence": 0
}
```

#### GA4 — traffic_overview
```json
{
  "sessions": 0,
  "users": 0,
  "pageviews": 0,
  "bounce_rate": 0.0,
  "avg_session_duration": 0.0
}
```

#### GSC — search_performance
```json
{
  "clicks": 0,
  "impressions": 0,
  "ctr": 0.0,
  "avg_position": 0.0
}
```

#### Google Trends — trend_comparison
```json
{
  "brand_interest": 0,
  "competitor_interest": 0,
  "trending_topics": []
}
```

### extraction-log.jsonl schema（每行一筆）
```json
{
  "timestamp": "ISO8601",
  "source": "string",
  "page": "string",
  "status": "completed|failed|skipped",
  "method": "dom_extraction|read_page|get_page_text|hover_tooltip|screenshot|csv_export",
  "duration_ms": 12500,
  "warnings": ["string"]
}
```

#### 摘要紀錄（summary record）
擷取流程結束時，寫入一筆 summary 紀錄：
```json
{
  "type": "summary",
  "timestamp": "ISO8601",
  "total_pages": 12,
  "completed": 10,
  "failed": 1,
  "skipped": 1,
  "total_duration_ms": 180000,
  "success_rate": 0.83
}
```

### 下游消費者
- Script Planning：讀取 data.json 產生腳本企劃
- Data Analysis：讀取 data.json 進行數據分析與洞察

## Purpose

統一的資料擷取技能，從多個來源（Looker Studio、GA4、GSC、Google Trends）擷取品牌數據，寫入統一的 data.json。此模組負責瀏覽器操作、資料解析、斷點續接，不做任何分析或內容決策。每個來源由獨立的 adapter 負責，engine 僅負責調度與狀態管理。

---

## Requirements

### Requirement 1: Engine 主流程

Engine MUST 依序調度各 adapter，逐頁擷取並即時寫入，確保任何時刻中斷都不遺失已完成的資料。

#### Scenario: 初始化新 run
- **GIVEN** `interview.json` 存在於 `~/.fontrends/runs/{brand}-{date}/`
- **WHEN** Engine 啟動且該 run 目錄中不存在 `data_partial.json`
- **THEN** 讀取 `interview.json` 取得品牌名稱、競品、期間、來源清單
- **AND** 建立 `data_partial.json`，meta 區塊填入品牌資訊
- **AND** pages 區塊依據所有來源的頁面清單，每頁初始化為 `"status": "pending"`
- **AND** 建立空的 `extraction-log.jsonl`

#### Scenario: Subagent 擷取模式（2026-03-24 更新）
- **GIVEN** Orchestrator 派 subagent 執行 §3 數據擷取
- **WHEN** subagent 收到 brand_name、dashboard_url、run_dir
- **THEN** subagent 獨立操作 Chrome，主 session 不碰瀏覽器
- **AND** ⚠️ 必須用前景 agent（不加 run_in_background），背景 agent 無 Chrome MCP 權限（2026-03-24 驗證）
- **AND** 一個前景 agent 依序擷取主品牌+競品（不能並行）
- **AND** 每頁用精簡 SOP（5 calls）設篩選器
- **AND** get_page_text 結果在 subagent 內即時解析為結構化 JSON
- **AND** 截圖用 save_to_disk 存磁碟，不放進 context
- **AND** 每完成一頁更新 data_partial.json（page 級別斷點）
- **AND** 完成後寫入 `{run_dir}/data_{brand_slug}.json`
- **AND** 主 session 收到精簡 JSON（~8KB），context 消耗從 ~6000 tokens 降至 ~500 tokens

#### Scenario: 依序執行 adapter
- **GIVEN** `data_partial.json` 已初始化，interview.json 的 `sources` 為 `["looker-studio", "ga4", "gsc", "google-trends"]`
- **WHEN** Engine 開始擷取流程
- **THEN** 依序讀取 `adapters/{source}.md` 載入對應 adapter 的操作指引
- **AND** 將該 adapter 負責的頁面逐一設為 `"status": "in_progress"` 後開始擷取
- **AND** 完成一個來源的所有頁面後，再進入下一個來源

#### Scenario: 逐頁即時寫入
- **GIVEN** adapter 正在擷取某一頁（例如 `social_overview`）
- **WHEN** 該頁擷取成功
- **THEN** 立即更新 `data_partial.json` 中該頁的 `status` 為 `"completed"`
- **AND** 填入 `extracted_at`（ISO8601 timestamp）
- **AND** 填入 `data` 物件（該頁的實際擷取資料）
- **AND** 寫入一筆記錄到 `extraction-log.jsonl`

#### Scenario: 全部完成
- **GIVEN** `data_partial.json` 中所有頁面的 status 均為 `"completed"`
- **WHEN** Engine 檢查完成狀態
- **THEN** 將 `data_partial.json` rename 為 `data.json`
- **AND** 在 `extraction-log.jsonl` 寫入最終摘要（總頁數、總耗時、成功率）
- **AND** 回報 user 擷取完成

#### Scenario: 部分完成（非核心來源失敗，成功率 ≥ 80%）
- **GIVEN** `data_partial.json` 中存在一或多個非核心頁面 status 為 `"failed"`，且成功率 ≥ 80%
- **WHEN** 所有 adapter 執行結束
- **THEN** 仍然 copy `data_partial.json` → `data.json`（不卡住 pipeline）
- **AND** 在 `run-status.json` 記錄 status=completed，但附上失敗頁面明細
- **AND** 失敗頁面在 data.json 中保留 `status: "failed"` + `error` 欄位
- **AND** 通知 user 但不中斷：「X/Y 頁完成（{source} 因 {reason} 跳過），繼續 pipeline」

> 2026-03-20 實戰教訓：LV 案例中 GSC 因帳號權限失敗（10/11 = 91%），pipeline 仍順利完成 narrative + presentation。非核心來源失敗不應卡住整個流程。

#### Scenario: 部分完成（核心來源失敗，或成功率 < 80%）
- **GIVEN** `data_partial.json` 中核心頁面（social_overview、trend 等）status 為 `"failed"`，或整體成功率 < 80%
- **WHEN** 所有 adapter 執行結束
- **THEN** 保留 `data_partial.json`（不 rename）
- **AND** 通知 user 哪些頁面失敗，附上失敗原因摘要
- **AND** 提示 user 可使用斷點續接重新擷取失敗頁面

#### Scenario: 平行擷取模式
- **GIVEN** orchestrator 指定平行擷取模式
- **WHEN** 多個 adapter 可同時執行
- **THEN** engine 以 subagent 方式並行執行各 adapter（V1 為循序，V2 支援並行）

---

### Requirement 2: 斷點續接

Engine MUST 支援 context window 耗盡或手動中斷後，從上次進度繼續擷取，避免重複工作。

#### Scenario: Context window 耗盡後新 session 續接
- **GIVEN** 新 session 啟動，`~/.fontrends/runs/{brand}-{date}/data_partial.json` 已存在
- **WHEN** Engine 偵測到 `data_partial.json`
- **THEN** 讀取該檔案，掃描每頁的 status
- **AND** 跳過所有 `"status": "completed"` 的頁面
- **AND** 從第一個非 `"completed"` 的頁面開始繼續擷取

#### Scenario: in_progress 頁面處理
- **GIVEN** `data_partial.json` 中某頁 status 為 `"in_progress"`
- **WHEN** Engine 進行斷點續接
- **THEN** 視該頁為未完成，將 status 重設為 `"pending"`
- **AND** 重新擷取該頁（上次可能在擷取中途中斷，資料不完整）

#### Scenario: failed 頁面處理
- **GIVEN** `data_partial.json` 中某頁 status 為 `"failed"`
- **WHEN** Engine 進行斷點續接
- **THEN** 報告 user 該頁上次擷取失敗及失敗原因
- **AND** 等待 user 指示：重試（retry）或跳過（skip）
- **AND** 若 user 選擇 skip，status 維持 `"failed"` 不影響其他頁面

#### Scenario: 手動指定重跑特定頁面
- **GIVEN** user 指示「重跑 social_overview」
- **WHEN** Engine 收到指令
- **THEN** 在 `data_partial.json` 中將 `social_overview` 的 status 設為 `"pending"`
- **AND** 清除該頁的 `data` 和 `extracted_at`
- **AND** 重新擷取該頁
- **AND** 完成後檢查是否所有頁面均 completed，是則 rename 為 data.json

---

### Requirement 3: Adapter 調用介面

Engine MUST 透過標準化介面調用各來源的 adapter，adapter 以 Markdown skill 檔案形式存在。

#### Scenario: 載入 adapter
- **GIVEN** interview.json 指定來源為 `"looker-studio"`
- **WHEN** Engine 需要執行該來源的擷取
- **THEN** 讀取 `adapters/looker-studio.md` 載入操作指引
- **AND** 依據 adapter 中定義的頁面清單與擷取步驟執行

#### Scenario: API 優先策略
- **GIVEN** interview.json 指定來源為 `"ga4"`
- **WHEN** Engine 嘗試載入 adapter
- **THEN** 先檢查 `adapters/ga4-api.md` 是否存在
- **AND** 若存在，優先載入 API 版本（效率更高、更穩定）
- **AND** 若不存在，fallback 載入 `adapters/ga4.md`（瀏覽器操作版本）

#### Scenario: Adapter 不存在
- **GIVEN** interview.json 指定來源為 `"semrush"`
- **WHEN** Engine 嘗試載入 `adapters/semrush.md`
- **THEN** 該檔案不存在
- **AND** 報告 user「semrush adapter 尚未建立，跳過該來源」
- **AND** 在 `extraction-log.jsonl` 記錄 status 為 `"skipped"`
- **AND** 繼續執行下一個來源

#### Scenario: Adapter 執行失敗
- **GIVEN** `adapters/gsc.md` 已載入並開始執行
- **WHEN** adapter 在擷取過程中發生非預期錯誤
- **THEN** 將該 adapter 負責的當前頁面標記為 `"failed"`
- **AND** 在 `extraction-log.jsonl` 記錄錯誤詳情
- **AND** 不中斷整體流程，繼續執行下一個來源的 adapter

---

### Requirement 4: Looker Studio Adapter 優化

Looker Studio adapter MUST 使用穩定的 DOM reference 操作，取代脆弱的座標點擊，並具備多層 fallback 機制。

#### Scenario: Filter SOP v2 — ref 點擊
- **GIVEN** Looker Studio dashboard 已載入完成
- **WHEN** 需要切換品牌篩選器
- **THEN** 使用 `find` 工具定位篩選器元素，取得 element ref
- **AND** 使用 ref 點擊 checkbox（取代硬編碼座標點擊）
- **AND** 等待 dashboard 資料重新載入完成

#### Scenario: 搜尋頁特殊處理 — 全選狀態偵測（推薦用「僅」按鈕）
- **GIVEN** 篩選器開啟後，所有品牌 checkbox 處於全選狀態（搜尋意圖頁）
- **WHEN** 需要篩選特定品牌
- **THEN** ⚠️ **「僅」按鈕全面禁止**（2026-03-23 最終驗證：所有帳號、所有頁面都會跳離 Dashboard）
- **AND** ⚠️ **取消全選後勾選 = 排除模式**（絕對禁止）
- **AND** 全選預設頁目前無可靠方式篩選單一品牌，使用全選狀態下的彙總數據
- **AND** 替代方案：文字雲點擊品牌名觸發交叉篩選（但表格不受影響）

> 2026-03-23 最終結論：之前（2026-03-20）驗證「僅」按鈕安全的結果已全部失效。

#### Scenario: Escape fallback
- **GIVEN** 篩選器操作完成，需要關閉篩選器 dropdown
- **WHEN** 按下 Escape 鍵
- **THEN** 檢查篩選器是否已關閉
- **AND** 若 Escape 無效（dropdown 仍開啟），fallback 點擊頁面空白區域 (400, 600)
- **AND** 再次確認篩選器已關閉後才進行資料擷取

#### Scenario: 地圖評價跳過
- **GIVEN** 目前執行的是品牌分析任務
- **WHEN** Engine 遍歷 Looker Studio 頁面清單
- **THEN** 自動跳過「地圖評價」頁面（該頁不適用於品牌維度分析）
- **AND** 在 `extraction-log.jsonl` 記錄 status 為 `"skipped"`，reason 為 `"not_applicable_for_brand_analysis"`

#### Scenario: Dashboard 偵察（強制，不可跳過）
- **GIVEN** Looker Studio dashboard URL 已開啟
- **WHEN** adapter 開始擷取前
- **THEN** 先執行偵察步驟：掃描頁面清單（tab 名稱與數量）
- **AND** 快速瀏覽每一頁，記錄各頁圖表類型（KPI 卡片/折線圖/表格/圓餅圖）
- **AND** 測試篩選器跨頁行為（是否換頁重設）
- **AND** 掃描篩選器選項（可用品牌清單）
- **AND** 確認目標品牌存在於篩選器選項中
- **AND** 制定擷取策略：每頁用 get_page_text 還是截圖/hover
- **AND** 將偵察結果寫入 `extraction-log.jsonl` 供後續步驟參考
- **AND** 禁止未完成偵察就開始擷取數據

#### Scenario: 每頁截圖存檔（強制，不可跳過）
- **GIVEN** 某頁的數據擷取已完成（filter 已生效、資料已渲染）
- **WHEN** 準備切換到下一頁之前
- **THEN** 必須截取當前頁面完整畫面並存至磁碟
- **AND** 存檔路徑為 `{run_dir}/screenshots/dashboard-{page_key}.png`
- **AND** 將路徑寫入 `data_partial.json.dashboard_screenshots[page_key]`
- **AND** 截圖是報告素材（可嵌入簡報或文件），不是 debug 用途
- **AND** 截圖失敗時記錄 warning 但不中斷主流程（best effort）

#### Scenario: SVG 資料擷取 fallback chain
- **GIVEN** 頁面中有圖表（chart）需要擷取數值
- **WHEN** adapter 嘗試擷取圖表資料
- **THEN** 依序嘗試以下方法（前一個失敗才嘗試下一個）：
  1. DOM extraction — 直接從 DOM 節點讀取數值
  2. Hover tooltip — 將滑鼠移至圖表元素上方，讀取 tooltip 數值
  3. Screenshot — 截圖後以視覺方式辨識數值
- **AND** 若所有方法均無法取得精確數值，標記該欄位為 `"low_confidence": true`
- **AND** 在 `extraction-log.jsonl` 記錄最終使用的 method

---

### Requirement 4b: 跨境雙重因子擷取

旅遊品牌（如飯店、景點、航空）MUST 同時擷取「客源地」與「目的地」兩個維度，確保分析不遺漏跨境流量的雙向結構。

#### Scenario: 跨境雙重因子（客源地 / 目的地）
- **GIVEN** interview.json 的品牌屬於旅遊、飯店、景點、交通類別
- **WHEN** Engine 擷取 Looker Studio 或 GA4 地區資料
- **THEN** MUST 分別擷取兩個因子：
  1. **客源地**（Source Market）：造訪者/聲量發文者來自哪個國家/地區
  2. **目的地**（Destination）：造訪的是哪個地點/品牌
- **AND** 資料結構需區分兩個維度，不可合併為單一「地區」欄位：
  ```json
  {
    "source_market": [
      { "country": "Taiwan", "sessions": 12000, "share": 45.0 },
      { "country": "Japan", "sessions": 8000, "share": 30.0 }
    ],
    "destination": [
      { "location": "Taipei", "sessions": 15000, "share": 56.0 },
      { "location": "Tainan", "sessions": 7000, "share": 26.0 }
    ]
  }
  ```
- **AND** 若 Dashboard 只提供合併地區數據（無法區分客源地/目的地），在 extraction-log 記錄 `"warning": "geo_dimension_not_separated"` 並標記 confidence=low
- **AND** 在 data.json 中為這類品牌額外新增 `cross_border_factors` 欄位記錄此結構

---

### Requirement 5: GA4 / GSC / Google Trends Adapters

各 adapter MUST 使用 interview.json 指定的日期範圍，擷取該來源的核心指標。

#### Scenario: GA4 擷取
- **GIVEN** interview.json 指定來源包含 `"ga4"`，期間為 `"2025-01-01 ~ 2025-03-31"`
- **WHEN** GA4 adapter 啟動
- **THEN** 開啟 GA4 報表介面
- **AND** 設定日期範圍為 interview.json 指定的 period
- **AND** 擷取預設擷取頁面（可依 Dashboard 偵察結果動態調整）：流量概覽（traffic_overview）、流量來源（traffic_source）、到達頁面（landing_pages）、地區分佈（geo_distribution）
- **AND** 每頁擷取完成後即時寫入 `data_partial.json`

#### Scenario: GSC 擷取
- **GIVEN** interview.json 指定來源包含 `"gsc"`，品牌為 `"BrandX"`
- **WHEN** GSC adapter 啟動
- **THEN** 開啟 Google Search Console
- **AND** 設定日期範圍為 interview.json 指定的 period
- **AND** 篩選品牌相關查詢（brand query filter）
- **AND** 擷取預設擷取頁面（可依 Dashboard 偵察結果動態調整）：搜尋成效摘要（search_performance）、熱門查詢（top_queries）、熱門頁面（top_pages）、裝置分佈（device_breakdown）

#### Scenario: Google Trends 擷取
- **GIVEN** interview.json 指定來源包含 `"google-trends"`，品牌為 `"BrandX"`，競品為 `"CompetitorY"`
- **WHEN** Google Trends adapter 啟動
- **THEN** 開啟 Google Trends
- **AND** 輸入品牌名稱與競品名稱進行比較
- **AND** 設定時間範圍對應 interview.json 指定的 period
- **AND** 擷取預設擷取頁面（可依 Dashboard 偵察結果動態調整）：趨勢對比（trend_comparison）、相關主題（related_topics）、地區熱度（regional_interest）

#### Scenario: 日期範圍同步
- **GIVEN** interview.json 中 `period` 欄位為 `"2025-01-01 ~ 2025-03-31"`
- **WHEN** 任一 adapter 啟動
- **THEN** 該 adapter MUST 使用相同的日期範圍
- **AND** 若該來源的日期選擇器不支援精確到日（如 Google Trends 只支援月份），選擇最接近的範圍
- **AND** 在 `extraction-log.jsonl` 記錄實際使用的日期範圍

---

### Requirement 6: 錯誤處理

Engine MUST 具備完善的錯誤處理與自我保護機制，確保資料不遺失。

#### Scenario: 頁面載入超時
- **GIVEN** adapter 開啟某個 dashboard 頁面或報表
- **WHEN** 頁面在 30 秒內未完成載入
- **THEN** 重試 1 次（再等 30 秒）
- **AND** 若仍未載入完成，將該頁 status 標記為 `"failed"`
- **AND** 在 `extraction-log.jsonl` 記錄 `"warnings": ["page_load_timeout_after_retry"]`
- **AND** 繼續執行下一頁

#### Scenario: 資料格式異常
- **GIVEN** 擷取到的數值為非標準格式（如 `"N/A"`、`"—"`、`"–"`、空字串）
- **WHEN** adapter 解析該數值
- **THEN** 將該欄位值存為 `null`
- **AND** 在該頁的 data 中附加 `"warnings"` 陣列，記錄 `"field_{name}_non_numeric_value: {raw_value}"`
- **AND** 在 `extraction-log.jsonl` 記錄 warning

#### Scenario: 品牌不存在於篩選器
- **GIVEN** Looker Studio 篩選器已開啟
- **WHEN** 搜尋目標品牌但篩選器選項中無匹配結果
- **THEN** 在 `extraction-log.jsonl` 記錄 `"status": "failed"`，reason 為 `"brand_not_found_in_filter"`
- **AND** 通知 user 該品牌不存在於此 dashboard
- **AND** 列出篩選器中可用的品牌清單，建議 user 確認品牌名稱或選擇替代品牌
- **AND** 等待 user 指示後再繼續

#### Scenario: 認證失敗
- **GIVEN** adapter 開啟資料來源 URL
- **WHEN** 頁面導向登入畫面或顯示權限不足
- **THEN** 標記該來源為 `"failed"`，reason 為 `"authentication_required"`
- **AND** 通知 user 重新登入

#### Scenario: Google 帳號順序錯誤（2026-03-20 實戰）
- **GIVEN** GSC URL 中包含 `/u/1/` 或 `/u/N/`
- **WHEN** Chrome 登入的第 N 個帳號不是目標帳號
- **THEN** 頁面顯示存取被拒或導向錯誤帳號的 GSC
- **AND** 告知 user 需確認 URL 中的 `/u/N/` 對應正確 Google 帳號
- **AND** 標記該來源為 `"failed"`，reason 為 `"account_mismatch"`

#### Scenario: 全選預設頁篩選器排除模式陷阱（2026-03-23 實戰）
- **GIVEN** Looker Studio 某頁面的篩選器預設為「全選」狀態
- **WHEN** AI 嘗試用「取消全選 → 勾選目標品牌」流程
- **THEN** ⚠️ **絕對禁止：「全選後取消全選再勾選特定項目」= 排除模式**，結果是顯示「除了目標品牌之外的所有品牌」
- **AND** 正確方式：使用「僅」按鈕（hover 品牌 → 點擊「僅」→ 只保留該品牌）
- **AND** 若誤操作觸發排除模式，立即重新開啟篩選器 → 點「全選」重設 → 再用「僅」按鈕

#### Scenario: 關鍵字分析頁無法透過 UI 篩選取得品牌關鍵字列表（2026-03-23 實戰）
- **GIVEN** Looker Studio 關鍵字分析頁需要篩選特定品牌的關鍵字
- **WHEN** AI 嘗試點擊「僅」按鈕篩選品牌
- **THEN** 即使是只讀帳號（/u/0/），「僅」按鈕仍會導致頁面跳離 Dashboard
- **AND** 此頁無法透過 UI 篩選取得品牌關鍵字列表
- **AND** 替代方案：使用搜尋欄輸入品牌名後，讀取文字雲或表格中已顯示的關鍵字

#### Scenario: 帳號權限影響篩選器行為（2026-03-23 實戰）
- **GIVEN** 多個 Google 帳號登入 Chrome，URL 中 `/u/N/` 決定使用哪個帳號
- **WHEN** AI 需要操作 Looker Studio 篩選器
- **THEN** 優先使用 `/u/0/` 只讀帳號（最穩定，篩選器行為可預測）
- **AND** 編輯帳號（/u/1/ 以上）的「僅」按鈕行為不同：在某些頁面可能直接導航，在另一些頁面才正常
- **AND** 帳號權限差異對照：

  | 情境 | 只讀帳號 /u/0/ | 編輯帳號 /u/N/ |
  |------|--------------|--------------|
  | 標準頁面「僅」按鈕 | ❌ 導航離開 | ❌ 導航離開 |
  | 全選預設頁「僅」按鈕 | ❌ 導航離開（2026-03-23 驗證） | ❌ 導航離開 |
  | 關鍵字分析頁「僅」按鈕 | ❌ 導航離開 | ❌ 導航離開 |
  | 篩選器跨子頁保持 | 不保持（各子頁獨立）| 不保持（各子頁獨立）|
  | form_input 觸發搜尋 | ✅ 成功率高 | ⚠️ 不穩定 |
  | **結論** | **優先使用** | **盡量避免** |

#### Scenario: 篩選器不跨子頁保持（搜尋意圖相關頁）
- **GIVEN** Looker Studio 搜尋意圖相關的多個子頁面（如搜尋意圖分析、關鍵字意圖分布）
- **WHEN** AI 在子頁 A 設定了篩選器後切換到子頁 B
- **THEN** 子頁 B 的篩選器會重設為預設狀態（全選）
- **AND** 每個子頁都必須獨立設定篩選器，不能依賴跨頁保持
- **AND** 此行為與標準頁面相同，但需特別注意：全選預設頁重設後仍是全選，需重新執行「僅」按鈕流程

#### Scenario: 文字雲點擊觸發交叉篩選（但表格不受影響）
- **GIVEN** Looker Studio 頁面包含文字雲（word cloud）元件
- **WHEN** AI 點擊文字雲中的某個關鍵字
- **THEN** 文字雲點擊可觸發頁面內交叉篩選，影響同頁其他圖表
- **AND** 但表格元件（非 Looker 標準表格）通常不受文字雲交叉篩選影響
- **AND** 若需利用文字雲篩選觀察圖表變化，點擊後需等待 2-3 秒讓圖表重新渲染
- **AND** 完成後 MUST 點擊文字雲同一關鍵字取消選取（恢復原始狀態）

#### Scenario: Context window 接近上限
- **GIVEN** Engine 預估目前 context 使用量已超過 80%（剩餘 < 20%）
- **WHEN** 即將開始擷取下一頁之前
- **THEN** 主動將當前進度寫入 `data_partial.json`
- **AND** 寫入 `~/.fontrends/runs/{brand}-{date}/run-status.json`，內容包含：
  ```json
  {
    "status": "interrupted",
    "reason": "context_window_limit",
    "completed_pages": ["page_a", "page_b"],
    "remaining_pages": ["page_c", "page_d"],
    "next_page": "page_c",
    "timestamp": "ISO8601"
  }
  ```
- **AND** 通知 user「context window 即將耗盡，已儲存進度，請開新 session 續接」
