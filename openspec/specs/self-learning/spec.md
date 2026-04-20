# 內容回饋與自我學習 — Self Learning

> **⚠️ 2026-04-20 升級：** Learned rules MUST 以 overlay 形式套用到 [knowledge-layer](../knowledge-layer/spec.md) 的 snapshot（優先級第 5 層，介於 profile.overrides 與 CLI flag 之間），可 scope 到特定 audience/purpose/profile。學到的修正不再單獨用、而是融入 resolver 鏈。

## Input / Output Contract

### Input
- 整個 `~/.fontrends/runs/{brand}-{date}/` 資料夾的所有 JSON 檔案
- `revisions.jsonl`：品質優化的修改記錄
- `audit-report.json`：品質稽核結果

### Output（三個檔案）

#### `corrections.jsonl` — 錯誤修正記錄
```json
{ "date": "ISO8601", "module": "string", "issue": "string", "correction": "string", "category": "quality|efficiency|cost" }
```

#### `insights.jsonl` — 歸納洞察
```json
{ "date": "ISO8601", "pattern": "string（觀察到的規律）", "recommendation": "string（建議做法）", "frequency": 1, "impact": "high|medium|low" }
```

#### `skill-suggestions.jsonl` — Skill 優化建議
```json
{ "date": "ISO8601", "target_skill": "string（要修改的 skill 路徑）", "section": "string（要修改的段落）", "current": "string（現狀）", "suggested": "string（建議修改）", "reason": "string" }
```

### 下游消費者
- 所有 skill：下次執行時讀取最新的 corrections 和 insights
- 管理者：review skill-suggestions，決定是否合併到 skill

## Purpose

每次完成工作後，AI 自動將學到的知識點彙整下來，包括加強品質、提高效率、降低成本的技巧或方法。針對現有技能或知識不足處進行補充，持續改善調整自己的 skill 或知識庫，不斷迭代讓自己變更強。此模組升級原有的 learning-feedback spec，加入自動歸納和 skill 自我優化能力。

---

## Requirements

### Requirement: 自動學習觸發

AI MUST 在每次任務完成後自動執行學習流程，不需用戶明確說「學起來」。

#### Scenario: 任務完成後自動觸發
- **GIVEN** 一次完整的分析任務已完成（報告已交付或品質優化已結束）
- **WHEN** 任務流程結束
- **THEN** AI 自動進入學習模式
- **AND** 不需用戶觸發指令（如「學起來」、「learn」）
- **AND** 學習流程在背景執行，不中斷用戶體驗

#### Scenario: 學習流程不阻擋交付
- **GIVEN** AI 進入自動學習模式
- **WHEN** 學習流程執行中
- **THEN** 不阻擋報告交付或其他用戶操作
- **AND** 學習完成後靜默輸出摘要：「本次學到 X 項知識，記錄完成」
- **AND** 不主動要求用戶確認學習內容

#### Scenario: 用戶手動觸發學習（向下相容）
- **GIVEN** 用戶主動說「學起來」、「learn」、「optimize」
- **WHEN** 即使尚未完成完整任務
- **THEN** AI 立即進入學習模式，讀取當前階段的修改與回饋
- **AND** 與自動觸發走相同的學習流程

---

### Requirement: 學習維度

AI MUST 從五個維度進行學習，全面涵蓋品質、效率、成本、偏好。

#### Scenario: 內容品質學習
- **GIVEN** 品質優化階段中，用戶對某些洞察提出修改或刪除
- **WHEN** AI 進行學習
- **THEN** 記錄哪些洞察被採納、哪些被刪除、哪些被修改
- **AND** 分析刪除原因：是方向錯誤、深度不足、還是與受眾不相關
- **AND** 歸納規律：例如「精品品牌分析中，好感度分析的準確度經常被質疑」

#### Scenario: 排版品質學習
- **GIVEN** 品質優化階段中，用戶對排版提出調整
- **WHEN** AI 進行學習
- **THEN** 記錄哪些排版格式踩坑（如 gslides 表格超過 6 行會跑版）
- **AND** 記錄用戶的排版偏好（如標題字體大小、間距偏好）
- **AND** 歸納規律：例如「表格超過 6 行在 gslides 需拆分為兩張 slide」

#### Scenario: 效率學習
- **GIVEN** 任務完成後
- **WHEN** AI 回顧整體流程
- **THEN** 記錄哪些步驟花了不合理的時間（如資料擷取重試過多次）
- **AND** 分析瓶頸原因：是 API 限制、資料品質差、還是流程設計問題
- **AND** 歸納改善方向：例如「Looker Studio 資料擷取在月中執行較穩定」

#### Scenario: 成本學習
- **GIVEN** 任務完成後
- **WHEN** AI 回顧 token 使用量
- **THEN** 記錄各步驟的 token 消耗量
- **AND** 辨識高消耗步驟：是否有更省 token 的替代做法
- **AND** 歸納改善方向：例如「重複呼叫 web search 驗證同一事件可合併為一次」

#### Scenario: 客戶偏好學習
- **GIVEN** 任務完成後，尤其是品質優化階段的修改
- **WHEN** AI 分析修改模式
- **THEN** 辨識該客戶/品牌/產業的特殊偏好
- **AND** 記錄偏好類型：語氣（正式 vs 口語）、用詞（中文 vs 英文術語）、報告長度、圖表偏好
- **AND** 歸納為客戶 profile：例如「精品品牌客戶偏好正式語氣、英文品牌名不翻譯」

---

### Requirement: 學習輸出

學習結果 MUST 以三種 JSONL 格式輸出，分別記錄不同層次的知識。

#### Scenario: corrections.jsonl — 具體修正記錄（保留原有格式）
- **GIVEN** 品質優化階段有具體的修正發生
- **WHEN** AI 寫入學習紀錄
- **THEN** 以 JSONL 格式 append 到 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/learned/corrections.jsonl`
- **AND** 格式與 learning-feedback spec 一致（保持向下相容）：

```json
{
  "date": "2026-03-19",
  "brand": "Louis Vuitton",
  "user": "vin",
  "type": "analysis",
  "slide": 4,
  "original": "聲量高峰主因為代言人宣布",
  "corrected": "聲量高峰主因為 Pharrell 系列發布",
  "reason": "用戶指出事件對應有誤",
  "impact": "frameworks/analysis-framework.md — 交叉驗證需更仔細比對品牌官網時間線"
}
```

#### Scenario: insights.jsonl — 歸納性洞察（新增）
- **GIVEN** AI 完成五個維度的學習
- **WHEN** 歸納出跨任務的規律或通則
- **THEN** 以 JSONL 格式 append 到 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/learned/insights.jsonl`
- **AND** 每筆紀錄格式：

```json
{
  "date": "2026-03-19",
  "dimension": "layout",
  "insight": "表格超過 6 行在 gslides 會跑版，需拆分為兩張 slide 或改用截圖",
  "source_tasks": ["LouisVuitton-2026-03-17", "Chanel-2026-03-10"],
  "confidence": "high",
  "applicable_to": "all_brands",
  "tags": ["gslides", "table", "layout"]
}
```

- **AND** `dimension` 為五個學習維度之一：`content`、`layout`、`efficiency`、`cost`、`preference`
- **AND** `confidence` 為 `high`（多次驗證）、`medium`（兩次出現）、`low`（首次觀察）

#### Scenario: skill-suggestions.jsonl — Skill 修改建議（新增）
- **GIVEN** AI 歸納出的洞察指向現有 skill 的不足
- **WHEN** AI 判斷某個 skill 檔案需要修改
- **THEN** 以 JSONL 格式 append 到 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/learned/skill-suggestions.jsonl`
- **AND** 每筆紀錄格式：

```json
{
  "date": "2026-03-19",
  "target_file": "skills/narrative-rules.md",
  "suggestion_type": "add_rule",
  "suggestion": "新增精品產業用語規範：品牌名保留英文、產品線名稱不翻譯、語氣使用正式書面語",
  "source_insights": ["insight_2026-03-19_001", "insight_2026-03-15_003"],
  "priority": "medium",
  "status": "pending_review"
}
```

- **AND** `suggestion_type` 為 `add_rule`、`modify_rule`、`add_example`、`fix_pitfall`
- **AND** `priority` 為 `high`（影響正確性）、`medium`（影響品質）、`low`（優化建議）

#### Scenario: 只記錄有價值的學習
- **GIVEN** 一次任務完成後，AI 進行學習
- **WHEN** 沒有明顯的修正、洞察、或 skill 建議
- **THEN** 不強制產出空的學習紀錄
- **AND** 靜默完成，輸出：「本次任務無新增學習項目」

---

### Requirement: Skill 自我優化

AI MUST 能基於 skill-suggestions.jsonl 提出具體的 skill 修改建議，但不自動修改。

#### Scenario: 讀取 skill-suggestions 並生成修改草稿
- **GIVEN** `skill-suggestions.jsonl` 中有 `status: "pending_review"` 的建議
- **WHEN** 管理者觸發 skill 優化流程（或定期自動檢查）
- **THEN** AI 讀取所有 pending 建議
- **AND** 針對每個建議，生成具體的 skill 修改 diff
- **AND** 修改 diff 以 markdown 格式呈現，包含修改前後對比

#### Scenario: 建議需管理者審核
- **GIVEN** AI 已生成 skill 修改草稿
- **WHEN** 準備提交修改
- **THEN** 不自動修改任何 skill 檔案
- **AND** 透過 Git PR 提交修改建議
- **AND** PR title 格式：`skill-improve: [target_file] [suggestion_type]`
- **AND** PR body 包含：修改建議來源（哪些 insights）、修改前後對比、預期效果

#### Scenario: 防止 skill 失控
- **GIVEN** AI 提出的 skill 修改建議
- **WHEN** 建議內容可能影響核心分析邏輯
- **THEN** 標記為 `priority: "high"`，需管理者特別審核
- **AND** PR 中加入警告標記：「此修改影響核心分析邏輯，請仔細審核」
- **AND** 永遠不自動 merge 任何 skill 修改

#### Scenario: 合併建議紀錄
- **GIVEN** 多筆 skill-suggestions 指向同一個檔案
- **WHEN** AI 生成修改草稿
- **THEN** 合併為一個 PR，包含所有針對該檔案的建議
- **AND** 避免對同一檔案產出多個零碎 PR

---

### Requirement: PR 機制

學習產出 MUST 透過 Git PR 提交到 Core Repo，保留原有 learning-feedback 的 PR 流程。

#### Scenario: 自動發 PR（corrections + insights）
- **GIVEN** 學習紀錄已寫入 corrections.jsonl 和/或 insights.jsonl
- **WHEN** AI 完成學習整理
- **THEN** 執行以下步驟：
  1. 在 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/` 建立新 branch：`learned/[date]-[brand]-[user]`
  2. `git add learned/corrections.jsonl learned/insights.jsonl`
  3. `git commit -m "learn: [品牌] [學習摘要] by [user]"`
  4. `git push origin [branch]`
  5. 透過 `gh pr create` 發起 PR

#### Scenario: Skill 優化獨立 PR
- **GIVEN** AI 生成了 skill 修改草稿
- **WHEN** 提交 skill 優化建議
- **THEN** 建立獨立 branch：`skill-improve/[date]-[target_file]`
- **AND** 與學習紀錄 PR 分開提交（因為審核標準不同）

#### Scenario: 用戶無 GitHub write 權限
- **GIVEN** 用戶的 token 只有 read 權限
- **WHEN** AI 嘗試發 PR
- **THEN** 改為將所有學習紀錄存成本地檔案
- **AND** 提示用戶：「學習紀錄已存到 [路徑]，請傳給管理者」

---

### Requirement: 品質趨勢追蹤

系統 MUST 累積 audit-history.jsonl 進行品質趨勢分析，識別系統性改善或退化。

#### Scenario: 趨勢分析觸發
- **GIVEN** `learned/audit-history.jsonl` 累積了 5 筆以上紀錄
- **WHEN** AI 進行學習時順便分析趨勢
- **THEN** 計算以下指標：
  - 平均分數趨勢（近 5 次 vs 前 5 次）
  - 最常見的錯誤類型排名
  - 修正輪次的變化趨勢（是否在減少）
  - 各品牌/產業的品質分布

#### Scenario: 品質退化警示
- **GIVEN** 最近 3 次稽核的平均分數低於歷史平均 3 分以上
- **WHEN** 趨勢分析完成
- **THEN** 產出警示：「品質趨勢下降，最近 3 次平均 {score}，歷史平均 {avg_score}」
- **AND** 分析可能原因：是某品牌特別低、某個維度退化、還是整體下滑
- **AND** 寫入 insights.jsonl 作為高優先級洞察

#### Scenario: 品質改善確認
- **GIVEN** 連續 5 次稽核分數穩定在 24/30 以上且修正輪次 ≤ 1
- **WHEN** 趨勢分析完成
- **THEN** 產出正面紀錄：「品質穩定達標，連續 {N} 次免修正交付」
- **AND** 標記學習機制運作良好，目前策略有效

---

> **v3 增補（2026-04-08）：** 以下 Requirement 修補 self-learning 的六個 gap（TTL、升級門檻、週一 digest、衝突淘汰、規則索引表）。詳見 `openspec/plans/2026-04-08-self-learning-gap-fixes.md`。

### Requirement: 紀錄時效性

所有 corrections / insights 紀錄 MUST 帶有 TTL、scope、superseded_by 欄位，避免 learned/ 目錄無限膨脹與結論互相衝突。

#### Scenario: 新紀錄強制含時效欄位
- **GIVEN** AI 寫入一筆新的 correction 或 insight
- **WHEN** append 到 jsonl
- **THEN** 紀錄 MUST 含以下欄位：
  - `ttl_days`：預設 90
  - `scope`：`global` | `brand:<name>` | `industry:<name>`
  - `superseded_by`：null 或指向取代此筆的 rule_id
  - `created`：ISO8601
- **AND** 缺欄位的寫入視為 schema error，不准 append

#### Scenario: 紀錄過期封存
- **GIVEN** 一筆 correction/insight 的 `created + ttl_days` 已經超過今日
- **WHEN** 下次 self-learning 流程啟動或 orchestrator pre-run 讀取
- **THEN** 該筆紀錄 MUST 搬到 `core/learned/archived/`
- **AND** 原檔 jsonl 移除該筆
- **AND** 不再參與 pre-run checklist
- **AND** 可由人工從 archived/ 召回（移回原檔並重設 created）

#### Scenario: 結論衝突時自動淘汰舊紀錄
- **GIVEN** 新 insight 與現有某筆 insight 同 dimension 且同 scope 但結論相反
- **WHEN** AI 寫入新 insight
- **THEN** 將舊 insight 的 `superseded_by` 設為新 insight 的 rule_id
- **AND** 舊 insight 仍保留在 jsonl 但不參與 pre-run checklist
- **AND** 若新 insight 的 confidence 低於 old，則反過來：拒絕寫入新 insight 並記一筆 `conflict_rejected` 事件

---

### Requirement: Skill Suggestion 升級門檻（v3 修訂）

AI MUST 僅在明確門檻下才把 insight 升級成 `skill-suggestions.jsonl`，避免把單次或單一品牌的經驗寫進跨專案 skill。

#### Scenario: 升級門檻
- **GIVEN** 一筆 insight
- **WHEN** AI 判斷是否產生對應 skill-suggestion
- **THEN** 只有當**以下條件同時成立**才產生：
  - `confidence == "high"`（依現行定義：≥3 source_tasks 驗證）
  - `applicable_to != "brand:<single_brand>"`（即 scope 為 global 或 industry）
- **AND** 不符合條件的 insight 留在 insights.jsonl，不升級為 skill-suggestion

#### Scenario: 單一品牌經驗處理
- **GIVEN** 一筆 insight 的 scope 僅為單一品牌
- **WHEN** 該品牌下次被分析
- **THEN** orchestrator pre-run checklist 仍會讀取這筆 insight（僅對該品牌生效）
- **AND** 但不會升級成 skill-suggestion 改動 skill 檔案

---

### Requirement: 週一 Digest PR 機制（v3 修訂）

skill-suggestions MUST 以每週批次 digest PR 的形式提交，避免 PR 碎片化淹沒 reviewer。

#### Scenario: 每週一自動彙整
- **GIVEN** `skill-suggestions.jsonl` 中有 status=`pending_review` 的建議
- **WHEN** 每週一 09:00（Asia/Taipei, IR-011）
- **THEN** AI 自動彙整上週累積的所有 pending 建議
- **AND** 產生一個 digest branch：`skill-digest/[YYYY-WW]`
- **AND** 開 PR：title 格式 `skill-digest: W{WW} ({N} suggestions)`

#### Scenario: Digest PR 容量上限
- **GIVEN** 上週累積的 pending suggestions 超過 5 條
- **WHEN** 產生 digest PR
- **THEN** 自動拆成多個 PR，每個最多 5 條
- **AND** title 加 `(1/N)`、`(2/N)` 編號
- **AND** 依 priority 排序（high 優先入第一個 PR）

#### Scenario: Digest PR Body 強制含證據
- **GIVEN** digest PR 已建立
- **WHEN** reviewer 查看 PR body
- **THEN** body MUST 包含每條 suggestion 的：
  - `source_insights` 與對應 rule_id
  - 相關的 `rule-hits.jsonl` 命中/違反紀錄（證明此規則真的在實際 run 中觸發）
  - 預期影響的 skill 檔案路徑
  - 修改前後 markdown diff

#### Scenario: 向下相容 — 高優先即時 PR
- **GIVEN** 一筆 suggestion 的 priority 為 `high` 且屬於修正型（影響正確性）
- **WHEN** 該 suggestion 產生時
- **THEN** 不等週一，立即開獨立 PR
- **AND** title 標 `[urgent]` 前綴
- **AND** 下次週一 digest 時跳過此筆

---

### Requirement: 規則索引表（mapping.json）

為支援 orchestrator pre-run hook 的 O(1) 查詢，self-learning MUST 維護 `core/learned/mapping.json` 作為所有 corrections / insights / audit-pattern 的全域索引。

#### Scenario: mapping.json schema
- **GIVEN** `core/learned/mapping.json` 存在
- **THEN** 結構為：

```json
{
  "rules": {
    "<rule_id>": {
      "source": "corrections | insights | audit-pattern",
      "source_file": "core/learned/insights.jsonl",
      "target_skills": ["narrative-packaging", "data-analysis"],
      "scope": "global | brand:LV | industry:luxury",
      "confidence": "high | medium | low",
      "ttl_until": "2026-07-07T00:00:00+08:00",
      "created": "2026-04-08T09:00:00+08:00",
      "superseded_by": null
    }
  },
  "last_rebuilt": "2026-04-08T09:00:00+08:00"
}
```

- **AND** `rule_id` 為 `<source>-<YYYYMMDD>-<seq>` 格式（例：`insights-20260408-001`）

#### Scenario: 即時同步
- **GIVEN** AI 寫入新的 correction/insight 或更新既有紀錄的 superseded_by
- **WHEN** jsonl 寫入成功
- **THEN** 即時更新 mapping.json 對應條目
- **AND** 更新 `last_rebuilt` timestamp
- **AND** 寫入失敗時 mapping.json 不得進入半更新狀態（atomic write：寫 tmp → rename）

#### Scenario: 過期自動清理
- **GIVEN** mapping.json 中某筆 rule 的 `ttl_until` 已過
- **WHEN** 下次 self-learning 或 orchestrator pre-run 讀取
- **THEN** 該筆從 mapping.json 中移除
- **AND** 同步把對應 jsonl 紀錄搬到 archived/（對齊「紀錄過期封存」scenario）

#### Scenario: 完整性校驗
- **GIVEN** 每次 self-learning 流程結束
- **WHEN** 執行校驗
- **THEN** 確認 mapping.json 的 rule 數量與 jsonl 檔案（扣除 superseded 與 archived）一致
- **AND** 不一致時自動重建 mapping.json 並寫入 incident log
