# 跨模組錯誤處理 — Cross-Cutting Error Handling

## Input / Output Contract

### Input
- 任何 agent 執行過程中的異常事件

### Output → 寫入 `run-status.json` 的 `errors` 陣列 + `error-log.jsonl`
每行一筆錯誤記錄：
```json
{
  "timestamp": "ISO8601",
  "stage": "§3",
  "agent": "data-extraction",
  "error_type": "network|auth|api_limit|parse|timeout|unknown",
  "message": "string",
  "context": { "page": "社群總覽", "retry_count": 2 },
  "resolution": "retry|skip|pause|abort",
  "resolved_at": "ISO8601|null"
}
```

### 下游消費者
- 所有 agent：讀取 `run-status.json` 判斷是否可續接
- §12 自我學習：讀取 `error-log.jsonl`，歸納常見錯誤模式與修正策略
- Orchestrator：根據 `resolution` 欄位決定流程走向

## Purpose

定義所有 agent 共同遵循的錯誤處理模式，包含 JSON 寫入安全、網路與外部服務錯誤、AI context 管理、資料完整性驗證、以及錯誤恢復策略。此為跨模組（cross-cutting）規格，所有 stage 的 agent MUST 遵守本文件定義的行為。

---

## Requirements

### Requirement: JSON 寫入安全

所有 agent 寫入 JSON 檔案時 MUST 確保原子性與完整性，避免部分寫入導致資料損毀。

#### Scenario: 原子寫入
- **GIVEN** agent 需要寫入 `{filename}.json`
- **WHEN** 開始寫入流程
- **THEN** 先將完整內容寫入 `{filename}.tmp`
- **AND** 寫入完成且驗證 JSON 格式正確後，rename `{filename}.tmp` 為 `{filename}.json`
- **AND** 若 rename 前發生錯誤，`{filename}.tmp` 保留供除錯，原 `{filename}.json` 不受影響

#### Scenario: 部分資料保留
- **GIVEN** §3 data-extraction agent 正在逐頁擷取 Dashboard 資料
- **WHEN** 擷取到第 5 頁時發生錯誤（例如 timeout）
- **THEN** 前 4 頁已擷取的資料保留在 `data_partial.json`
- **AND** `run-status.json` 記錄 `last_completed_page: 4`
- **AND** 重跑時讀取 `data_partial.json`，從第 5 頁續接，不重複擷取前 4 頁

#### Scenario: Schema 驗證
- **GIVEN** agent 準備寫入一筆 JSON 資料
- **WHEN** 寫入前進行 schema 驗證
- **THEN** 檢查所有必要欄位（required fields）是否存在且型別正確
- **AND** 驗證通過才執行寫入
- **AND** 驗證失敗則記錄錯誤至 `error-log.jsonl`（error_type: `parse`），不寫入不合法資料

---

### Requirement: 網路與外部服務錯誤

Agent 存取外部服務時 MUST 實作重試機制與錯誤隔離，避免單一失敗中斷整個流程。

#### Scenario: Dashboard 載入超時
- **GIVEN** agent 正在載入 Looker Studio Dashboard 頁面
- **WHEN** 頁面載入超過 30 秒未完成
- **THEN** 記錄 timeout 錯誤至 `error-log.jsonl`（error_type: `timeout`）
- **AND** 等待 5 秒後重試 1 次
- **AND** 重試仍失敗，則將 resolution 設為 `pause`
- **AND** 通知 user：「Dashboard 頁面 [{page_name}] 載入超時，已重試 1 次仍失敗，請確認網路狀態後指示是否重試」

#### Scenario: Google Slides API 400
- **GIVEN** agent 發送 batchUpdate request 至 Google Slides API
- **WHEN** API 回傳 HTTP 400 錯誤
- **THEN** 記錄完整錯誤訊息至 `error-log.jsonl`（error_type: `api_limit`），包含出錯的 request index
- **AND** 從 batchUpdate 中移除出錯的 request
- **AND** 重新發送剩餘的 requests
- **AND** 在 `run-status.json` 標記被跳過的 request，供後續人工檢查

#### Scenario: Google Slides API 429 (rate limit)
- **GIVEN** agent 發送 request 至 Google Slides API
- **WHEN** API 回傳 HTTP 429（Too Many Requests）
- **THEN** 實作 exponential backoff：等待 1s → 2s → 4s → 8s
- **AND** 最多重試 4 次
- **AND** 4 次後仍為 429，則記錄錯誤（error_type: `api_limit`，resolution: `pause`）
- **AND** 通知 user：「Google Slides API rate limit 持續觸發，請稍候再重試」

#### Scenario: Web search 無結果
- **GIVEN** §4 research-collection agent 執行 web search 查詢
- **WHEN** 搜尋結果為空（0 筆）
- **THEN** 記錄至 `error-log.jsonl`（error_type: `parse`，resolution: `skip`，message 含搜尋關鍵字）
- **AND** 該查詢標記為 `no_result`，不中斷流程
- **AND** 後續 §5 分析階段，引用該查詢時標注「無外部驗證」

---

### Requirement: AI Context 管理

Agent MUST 主動管理 AI context window 使用量，確保長流程不因 context 溢出而中斷。

#### Scenario: Context 接近上限
- **GIVEN** agent 正在執行任務
- **WHEN** 預估剩餘可用 token < 20%
- **THEN** 主動將目前進度寫入 `run-status.json`，包含：
  - `current_stage`：當前階段
  - `completed_items`：已完成項目清單
  - `pending_items`：尚未完成項目清單
  - `partial_outputs`：已產出的中間檔案路徑
- **AND** 記錄至 `error-log.jsonl`（error_type: `unknown`，resolution: `pause`，message: `context approaching limit`）

#### Scenario: Context 爆掉後續接
- **GIVEN** 前一個 session 因 context 不足而中斷
- **WHEN** 新 session 啟動，準備續接
- **THEN** 讀取 `run-status.json` 取得中斷點資訊
- **AND** 讀取所有已產出的 JSON 檔案（`data_partial.json`、已完成的分析結果等）
- **AND** 從 `pending_items` 的第一項開始繼續執行
- **AND** 不重複處理 `completed_items` 中的項目

#### Scenario: Subagent 內 context 不足
- **GIVEN** orchestrator 啟動 subagent 執行特定任務
- **WHEN** 分配 context 給 subagent
- **THEN** subagent 只讀取與其任務直接相關的 JSON 檔案（不讀取整個 run 資料夾）
- **AND** 例如：slide generation subagent 只讀取該頁需要的 `analysis.json` 區段，不讀取完整分析
- **AND** 若 subagent 仍 context 不足，回報 orchestrator 進一步拆分任務

---

### Requirement: 資料完整性

Agent MUST 驗證上游資料完整性，遇到異常資料時明確報錯，不自行猜測或補值。

#### Scenario: 上游 JSON 缺欄位
- **GIVEN** agent 讀取上游產出的 JSON 檔案
- **WHEN** 發現必要欄位缺失（例如 `brand_metrics.json` 缺少 `engagement_rate`）
- **THEN** 記錄錯誤至 `error-log.jsonl`（error_type: `parse`，resolution: `pause`）
- **AND** 錯誤訊息明確列出缺少的欄位名稱與所在檔案
- **AND** 不自行猜測或填入預設值
- **AND** 通知 user：「[{filename}] 缺少欄位 [{field_names}]，是否重跑上游 [{stage}]？」

#### Scenario: 數字格式異常
- **GIVEN** §3 data-extraction agent 從 Dashboard 擷取數值欄位
- **WHEN** 擷取到非數字內容（如「N/A」「-」「--」「無資料」）
- **THEN** 該欄位值存為 `null`
- **AND** 在該筆資料加上 `"_warning": "non_numeric_value"` 標記
- **AND** 記錄至 `error-log.jsonl`（error_type: `parse`，resolution: `skip`）
- **AND** 後續分析階段遇到 `null` 值時，排除該欄位的計算，並在報告中標注「該期間資料不可用」

#### Scenario: 重複執行保護
- **GIVEN** user 觸發同品牌、同日期、同序號的 run
- **WHEN** 發現該 run 資料夾已存在且包含已完成的 JSON 檔案
- **THEN** 不自動覆蓋
- **AND** 通知 user：「[{brand}]-[{date}]-[{seq}] 已有完成的產出，是否覆蓋？」
- **AND** user 確認覆蓋後，先備份舊檔至 `{run_folder}/backup/{timestamp}/`，再重新執行

---

### Requirement: 錯誤恢復策略

Agent MUST 根據錯誤類型選擇對應的恢復策略，分為自動、半自動、手動三級。

#### Scenario: 自動恢復
- **GIVEN** agent 遇到暫時性錯誤（網路超時、token refresh 失敗、DNS 解析暫時失敗）
- **WHEN** 判斷錯誤屬於可自動恢復類型
- **THEN** 自動重試，最多 3 次，每次間隔遞增（2s → 4s → 8s）
- **AND** 每次重試記錄至 `error-log.jsonl`（resolution: `retry`）
- **AND** 第 3 次仍失敗，升級為手動恢復（resolution 改為 `pause`）

#### Scenario: 半自動恢復
- **GIVEN** agent 遇到已知可修正的 API 錯誤（例如 Google Slides API 回傳 outline weight=0 不合法）
- **WHEN** 錯誤模式匹配 `corrections.jsonl` 中的歷史修正紀錄
- **THEN** 記錄原始錯誤至 `error-log.jsonl`
- **AND** 自動套用已知修正（例如將 outline weight 從 0 改為 0.01）
- **AND** 重新發送修正後的 request
- **AND** 在 `error-log.jsonl` 記錄修正動作（resolution: `retry`，context 包含 `auto_corrected: true` 和修正內容）

#### Scenario: 手動恢復
- **GIVEN** agent 遇到未知錯誤（error_type: `unknown`）或自動恢復失敗
- **WHEN** 無法自動處理
- **THEN** 暫停當前流程（resolution: `pause`）
- **AND** 將完整錯誤資訊寫入 `error-log.jsonl` 和 `run-status.json`
- **AND** 通知 user 包含：錯誤摘要、發生階段、已完成進度、建議的處理方式
- **AND** 等待 user 指示後再繼續（resume / retry / abort）

#### Scenario: 已知問題自動修正
- **GIVEN** `corrections.jsonl` 記錄了歷史錯誤模式與對應修正
- **WHEN** agent 遇到錯誤，且錯誤訊息或 context 匹配 `corrections.jsonl` 中某筆紀錄的 `error_pattern`
- **THEN** 直接套用該筆紀錄的 `correction` 修正
- **AND** 不需等待 user 確認（因為是已驗證的修正）
- **AND** 記錄至 `error-log.jsonl`，標注 `auto_corrected: true` 及引用的 correction ID
- **AND** 若修正後仍失敗，升級為手動恢復
