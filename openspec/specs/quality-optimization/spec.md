# 品質優化 — Quality Optimization

## Input / Output Contract

### Input
- 最終產出檔案（pptx / gslides / gdocs）
- 人工回饋：評論、建議、修改項目（來源：Google Slides comment、口述、Web UI 留言）
- `audit-report.json`：§10 品質稽核的檢查結果

### Output → `revisions.jsonl`
每行一筆修改記錄：
```json
{
  "revision": 1,
  "page_id": "string",
  "feedback_type": "content|layout|data|style|structure",
  "original": "string（原始內容）",
  "feedback": "string（人工回饋）",
  "action": "string（AI 修改做法）",
  "reason": "string（為什麼這樣改）",
  "cascaded_to": ["string（連鎖影響的頁面）"],
  "timestamp": "ISO8601"
}
```

### 下游消費者
- §12 自我學習：讀取 revisions.jsonl，歸納常見問題與改善方法

## Purpose

在品質稽核之後，由人工逐頁仔細審查產出物，針對每個頁面的元素進行提問、留言、評論、或建議修改項目。AI 根據這些建議進行調整和優化，完成後在評論中回覆說明調整做法或解答。此模組實現「人機協作」的精修流程。

---

## Requirements

### Requirement: 人工審查流程

系統 MUST 支援多種管道讓用戶提出修改意見，AI 能讀取並理解這些意見。

#### Scenario: Google Slides 留言審查
- **GIVEN** 報告已產出為 Google Slides
- **WHEN** 用戶在特定 slide 上留言（comment），例如「這張圖的數字跟上一頁矛盾」
- **THEN** AI 透過 Google Slides Comments API 讀取所有未解決的留言
- **AND** 解析每條留言的位置（哪一頁、哪個元素）、內容、留言者
- **AND** 建立修改任務清單

#### Scenario: Google Slides 留言含 anchor
- **GIVEN** 用戶在 Google Slides 選取特定文字或元素後留言
- **WHEN** AI 讀取留言
- **THEN** 辨識留言的 anchor 位置（指向哪個 objectId 或文字範圍）
- **AND** 精確定位到需要修改的元素

#### Scenario: PPT 口述修改
- **GIVEN** 報告為本地 .pptx 檔案，用戶無法直接留言
- **WHEN** 用戶口述或文字描述修改需求，例如「第 4 頁的事件時間軸，3月那個高峰的事件標注不對」
- **THEN** AI 整理用戶描述為結構化修改任務
- **AND** 確認理解：「你要修改 Slide 4 的時間軸，將 3 月高峰的事件從 [X] 改為 [Y]，對嗎？」
- **AND** 用戶確認後才執行修改

#### Scenario: 未來 Web UI 審查（規劃中）
- **GIVEN** 未來版本提供 Web UI 審查介面
- **WHEN** 用戶在 Web UI 上拖拉標記修改區域
- **THEN** 系統記錄標記的座標範圍和修改指示
- **AND** 傳給 AI 作為修改依據

> 注意：Web UI 為未來規劃，MVP 先支援 Google Slides 留言和 PPT 口述。

---

### Requirement: AI 回應機制

AI MUST 讀取所有人工評論，分類後逐條回應，說明修改做法與原因。

#### Scenario: 評論分類
- **GIVEN** AI 已讀取所有未解決的人工評論
- **WHEN** 進行分類
- **THEN** 將每條評論歸類為以下類型之一或多個：
  - `content_fix` — 內容修正（數據錯誤、事件對應有誤、文字錯漏）
  - `layout_adjust` — 排版調整（元素位置、大小、間距、對齊）
  - `wording_refine` — 措辭優化（語氣、用詞、專業術語）
  - `add_request` — 新增需求（加一段分析、補一張圖表）
  - `delete_request` — 刪除需求（移除某段內容、某個元素）

#### Scenario: 逐條回應評論
- **GIVEN** AI 已分類完所有評論
- **WHEN** 逐條處理
- **THEN** 對每條評論產出回應，包含：
  - 修改做法：「已將 Slide 4 的事件標注從 [X] 改為 [Y]」
  - 修改原因：「根據您的指示，原始標注的事件時間點有誤」
  - 連帶影響：「此修改同時更新了 Slide 2 執行摘要中的相關描述」
- **AND** 每條回應以清楚的結構呈現，避免模糊的「已修改」

#### Scenario: Google Slides 評論回覆
- **GIVEN** 修改來源為 Google Slides 留言
- **WHEN** AI 完成單條修改
- **THEN** 透過 Google Slides Comments API 在原留言下回覆
- **AND** 回覆內容為具體的修改說明（非僅「已調整」）
- **AND** 回覆後將留言標記為 resolved

#### Scenario: 評論無法理解
- **GIVEN** AI 讀取到含糊不清的評論，例如「這邊怪怪的」
- **WHEN** AI 嘗試解讀
- **THEN** 不擅自猜測修改方向
- **AND** 回覆留言詢問：「可以具體說明是哪個元素需要調整嗎？例如文字內容、圖表數據、或是排版位置？」

---

### Requirement: 修改範圍控制

AI MUST 精確控制修改範圍，區分單頁修改、連鎖修改、重新生成三種模式。

#### Scenario: 單頁修改
- **GIVEN** 用戶評論僅針對某一頁的獨立元素（如「Slide 7 的表格標題打錯字」）
- **WHEN** AI 執行修改
- **THEN** 只修改該頁的指定元素
- **AND** 不影響其他頁面
- **AND** 使用 Google Slides API 的 batchUpdate 局部更新（或 pptxgenjs 重新產出單頁）

#### Scenario: 連鎖修改
- **GIVEN** 用戶修改涉及數據變動（如「影響力指數應該是 82.5 不是 85.2」）
- **WHEN** AI 辨識該數據被多頁引用
- **THEN** 自動掃描所有頁面，找出引用該數據的位置
- **AND** 列出所有受影響的頁面和元素
- **AND** 一次性更新所有引用，確保全份報告數據一致
- **AND** 在回應中說明：「此修改影響了 Slide 2（執行摘要）、Slide 3（總覽）、Slide 13（行動建議），已全部更新」

#### Scenario: 小改用局部更新
- **GIVEN** 修改範圍為文字修正、數據微調、排版微調
- **WHEN** AI 判斷修改規模
- **THEN** 使用 API 局部更新（Google Slides batchUpdate 或直接修改 pptx element）
- **AND** 不重新生成整份報告

#### Scenario: 大改用重新生成
- **GIVEN** 修改涉及整頁重做、新增/刪除多頁、大幅度結構調整
- **WHEN** AI 判斷修改規模超過局部更新的合理範圍
- **THEN** 回到 Production Center 重新生成整份報告
- **AND** 保留未修改頁面的手動調整（如果可能）
- **AND** 告知用戶：「此修改規模較大，將重新生成報告，預計需要 X 分鐘」

---

### Requirement: 修改歷史追蹤

每次修改 MUST 記錄到 revisions.jsonl，完整追蹤修改歷程。

#### Scenario: 寫入修改紀錄
- **GIVEN** AI 完成一輪修改
- **WHEN** 寫入修改歷史
- **THEN** 以 JSONL 格式 append 到 `~/.fontrends/runs/{brand}-{date}/revisions.jsonl`
- **AND** 每筆紀錄格式：

```json
{
  "revision": 1,
  "timestamp": "2026-03-19T14:30:00+08:00",
  "reviewer": "vin",
  "source": "gslides_comment",
  "changes": [
    {
      "slide": 4,
      "type": "content_fix",
      "element": "timeline_event_march",
      "original": "代言人宣布",
      "modified": "Pharrell 系列發布",
      "reason": "用戶指出事件對應有誤",
      "cascaded_to": [2, 13]
    }
  ],
  "mode": "partial_update"
}
```

#### Scenario: 多輪修改累積
- **GIVEN** 用戶進行了多輪修改
- **WHEN** 查看 revisions.jsonl
- **THEN** 每輪修改各自一筆 JSONL 紀錄
- **AND** revision 欄位遞增（1, 2, 3...）
- **AND** 可追溯每個元素的完整修改歷程

---

### Requirement: 迭代輪次限制

品質優化流程 MUST 設定最大迭代輪次，避免無止盡的修改迴圈。

#### Scenario: 正常迭代（3 輪以內）
- **GIVEN** 用戶提出修改意見
- **WHEN** 當前為第 1、2 或 3 輪修改
- **THEN** AI 正常執行修改並回應
- **AND** 每輪修改完成後提示：「第 {N}/3 輪修改已完成，請確認是否還有需要調整的地方」

#### Scenario: 達到 3 輪上限
- **GIVEN** 已完成 3 輪修改
- **WHEN** 用戶仍有大量修改意見
- **THEN** AI 提示：「已進行 3 輪迭代修改。若仍有大量需調整項目，建議重新進行需求訪談或重新分析，以確保報告方向正確」
- **AND** 不強制中斷，但明確建議用戶考慮回到上游流程
- **AND** 如果用戶堅持繼續小幅修改，可例外執行第 4 輪，但不超過第 5 輪

#### Scenario: 修改範圍擴大為重做
- **GIVEN** 用戶的修改意見顯示報告方向根本偏差（如分析品牌搞錯、受眾定位錯誤）
- **WHEN** AI 評估修改範圍
- **THEN** 建議用戶回到 requirements-interview 重新訪談
- **AND** 不在品質優化階段嘗試大幅度重做（這不是本模組的職責）
