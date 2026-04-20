# 指揮官 — Orchestrator

> **⚠️ 2026-04-20 升級：** Orchestrator MUST 串接 [knowledge-layer](../knowledge-layer/spec.md) 定義的 resolver 鏈與 pipeline runner：
> 1. 讀 `profiles/<type>.yaml` → stance resolver → module resolver → learned resolver → frozen snapshot
> 2. 依 `profile.pipeline` 順序呼叫 engines，注入 snapshot + run context
> 3. 每次執行建立 `runs/<id>/{inputs,context,temp,outputs,logs}/` 完整結構
> 4. 支援 `pipeline rerun <id>` 三種 mode（same / refresh-knowledge / refresh-data），永不覆蓋舊版
> 5. Run lifecycle: `mark-final` / `lineage` / `runs-cleanup` 指令
>
> 詳見 [knowledge-layer spec](../knowledge-layer/spec.md) 的 Resolver、Pipeline、Rerun、Lineage 章節。

## Input / Output Contract

### Input
- User 的初始需求（對話或指令）
- `~/.fontrends/runs/{brand}-{date}/` 下的所有 JSON（用於判斷進度）

### Output → `run-status.json`
```json
{
  "run_id": "louis-vuitton-2025-03-19",
  "status": "in_progress|completed|paused|failed",
  "current_stage": "§4",
  "stages": {
    "§1": { "status": "completed", "started_at": "ISO8601", "completed_at": "ISO8601", "output": "interview.json" },
    "§2": { "status": "completed", "output": "research.json" },
    "§3": { "status": "completed", "output": "data.json" },
    "§4": { "status": "in_progress", "started_at": "ISO8601" },
    "§5": { "status": "pending" }
  },
  "errors": [],
  "human_checkpoints": { "after_§4": false, "after_§7": false, "after_§10": true },
  "cost": {
    "total_tokens": 0,
    "api_calls": 0,
    "per_stage": {}
  }
}
```

### 下游消費者
- 所有 12 個 agent（§1–§12）皆由 Orchestrator 調度啟動
- User 透過 `run-status.json` 查看即時進度

## Purpose

Orchestrator 是整個 fontrends-analyst 系統的指揮官，負責協調 12 個 agent 的執行順序、管理並行派工、追蹤進度、處理斷點續接、控制 human-in-the-loop 中斷點，以及記錄成本。它本身不做任何分析或產出，純粹是「調度層」。

---

## Requirements

### Requirement 1: 流程控制

Orchestrator MUST 依照定義的順序調度 12 個 agent，支援並行派工與條件跳過。

#### Scenario: 正常順序執行
- **GIVEN** user 發出一個完整的品牌分析需求
- **WHEN** Orchestrator 啟動執行流程
- **THEN** 依序執行 §1→§2+§3（並行）→§4→§5→§6→§7→§8→§9→§10→§11→§12
- **AND** 每個 stage 開始前確認前置 stage 的 status 為 `completed`
- **AND** 將 `current_stage` 更新至 run-status.json

#### Scenario: 並行派工
- **GIVEN** §1（需求訪談）已完成，output 為 `interview.json`
- **WHEN** Orchestrator 進入 §2+§3 階段
- **THEN** 同時以 subagent 啟動 §2（研究蒐集）和 §3（數據分析）
- **AND** 兩者皆完成後才進入 §4
- **AND** 若其中一個失敗，另一個仍繼續執行，但不進入 §4

#### Scenario: 視覺設計提前準備
- **GIVEN** §1 已完成，`interview.json` 中包含品牌色資訊
- **WHEN** Orchestrator 判斷品牌色已知
- **THEN** 可在 §1 完成後提前啟動 §8（視覺設計）的品牌色準備工作
- **AND** §8 的完整執行仍等到 §7 完成後才進行
- **AND** 提前準備的結果存為 `theme_draft.json`

#### Scenario: 跳過不需要的階段
- **GIVEN** user 在 §1 訪談中明確表示不需要競品分析
- **WHEN** Orchestrator 解析 `interview.json` 中的需求範圍
- **THEN** §4 的競品分析部分標記為 `skipped`
- **AND** run-status.json 中該 stage 記錄 `{ "status": "skipped", "reason": "user_opted_out" }`
- **AND** 後續依賴該 output 的 stage 使用預設空值或跳過相關段落

---

### Requirement 2: 進度追蹤與斷點續接

Orchestrator MUST 在每個 agent 執行前後更新 run-status.json，支援跨 session 續接。

#### Scenario: 正常進度更新
- **GIVEN** 某個 agent（如 §4）開始執行
- **WHEN** agent 啟動時
- **THEN** 將該 stage 的 status 設為 `in_progress`，記錄 `started_at` 為當前 ISO8601 時間戳
- **AND** 更新 `current_stage` 為該 stage 編號
- **AND** agent 完成時將 status 設為 `completed`，記錄 `completed_at` 和 `output` 檔名

#### Scenario: Context 爆掉續接
- **GIVEN** 前一個 session 因 context window 耗盡而中斷
- **WHEN** 新 session 啟動並讀取 `~/.fontrends/runs/{brand}-{date}/run-status.json`
- **THEN** 解析 `current_stage` 和各 stage 的 status
- **AND** 從最後一個 `in_progress` 或第一個 `pending` 的 stage 繼續執行
- **AND** 已 `completed` 的 stage 不重跑，直接使用其 output

#### Scenario: 手動指定重跑
- **GIVEN** user 說「重跑 §6」
- **WHEN** Orchestrator 收到重跑指令
- **THEN** 將 §6 及其下游 stage（§7、§8、§9）的 status 重設為 `pending`
- **AND** 將這些 stage 的 output 檔案重新命名加上 `_prev` 後綴作為備份
- **AND** 從 §6 開始重新執行

#### Scenario: 同品牌同日多次執行
- **GIVEN** `~/.fontrends/runs/louis-vuitton-2025-03-19/` 已存在
- **WHEN** user 對同品牌同日再次發出分析需求
- **THEN** 建立新資料夾 `louis-vuitton-2025-03-19-2`（依序遞增）
- **AND** 新的 run-status.json 的 `run_id` 加上序號
- **AND** 不影響先前的執行結果

---

### Requirement 3: Human-in-the-loop 中斷點

Orchestrator MUST 在關鍵節點暫停等待 user 確認，並支援自訂中斷點與全自動模式。

#### Scenario: 預設中斷點
- **GIVEN** Orchestrator 執行到 §4 分析完成 或 §10 稽核完成
- **WHEN** 該 stage 的 status 變為 `completed`
- **THEN** 將 run status 設為 `paused`
- **AND** 向 user 展示該階段的摘要結果
- **AND** 等待 user 回覆「繼續」或提出修改意見
- **AND** 收到確認後將 `human_checkpoints` 中對應欄位設為 `true`，繼續下一階段

#### Scenario: User 自訂中斷點
- **GIVEN** §1 訪談過程中
- **WHEN** Orchestrator 詢問「你想在哪些階段先看一眼？」
- **THEN** 將 user 指定的 stage 加入 `human_checkpoints`
- **AND** 預設中斷點仍保留，除非 user 明確移除
- **AND** 將自訂中斷點記錄到 `interview.json` 的 `preferences` 欄位

#### Scenario: 暫停與恢復
- **GIVEN** 執行過程中 user 說「先暫停」
- **WHEN** Orchestrator 收到暫停指令
- **THEN** 等待當前正在執行的 agent 完成（不中斷 agent 執行）
- **AND** 將 run status 設為 `paused`，記錄暫停時間
- **AND** user 隨時可說「繼續」恢復執行，從下一個 `pending` 的 stage 開始

#### Scenario: 角色評分與退回重做
- **GIVEN** 某個 pipeline 階段剛完成
- **WHEN** Manager 檢查該角色的產出品質
- **THEN** 依評分維度打分（A/B/C/D）
- **AND** C 或 D 級 → 退回該角色重做，重做後重新評分
- **AND** D 級額外記一支小過
- **AND** Pipeline 全部完成後，向 user 報告每個角色的最終評分表

#### Scenario: 全自動模式
- **GIVEN** user 說「全部跑完」或「不需要中間確認」
- **WHEN** Orchestrator 設定執行模式
- **THEN** 跳過所有 `human_checkpoints`（包括預設的 §4 和 §10）
- **AND** 唯一例外：§11（人工回饋）仍需 user 介入，因為該 stage 本質上需要人工輸入
- **AND** 在 run-status.json 記錄 `"mode": "auto"`

#### Scenario: Pipeline 自動串接（2026-03-20 實戰驗證）
- **GIVEN** extraction（§3）完成後
- **WHEN** 進入 narrative（§6）→ presentation（§9）階段
- **THEN** 自動串接 extraction → narrative → presentation，中間不暫停不問 user
- **AND** 每個階段完成時通知 user（但不等待回覆）
- **AND** 僅在失敗時才中斷並詢問

> User feedback：「你應該要把整個流程自動化，串成自動完成工作流」

#### Scenario: 部分失敗不卡 pipeline（2026-03-20 實戰教訓）
- **GIVEN** extraction 完成但有非核心來源失敗（如 GSC），成功率 ≥ 80%
- **WHEN** Orchestrator 判斷是否繼續
- **THEN** 視為成功，繼續進入 narrative 階段
- **AND** 在 run-status.json 記錄失敗明細
- **AND** 下游遇到 failed page 的數據 → 跳過或標註「數據缺失」

---

### Requirement 4: Error Handling

Orchestrator MUST 在 agent 失敗時記錄錯誤、通知 user，並支援從失敗點恢復。

#### Scenario: Agent 執行失敗
- **GIVEN** 某個 agent（如 §3 數據分析）執行過程中拋出錯誤
- **WHEN** Orchestrator 偵測到錯誤
- **THEN** 將該 stage 的 status 設為 `failed`
- **AND** 將錯誤訊息記錄到 run-status.json 的 `errors` 陣列：`{ "stage": "§3", "error": "錯誤訊息", "timestamp": "ISO8601" }`
- **AND** 通知 user 錯誤內容與建議的修復方式
- **AND** 不自動重試，等待 user 指示

#### Scenario: 部分寫入的 JSON
- **GIVEN** agent 在寫入 output JSON 的過程中失敗
- **WHEN** Orchestrator 偵測到 agent 異常終止
- **THEN** 將未完成的 JSON 檔案重新命名為 `{name}_partial.json`（例：`data_partial.json`）
- **AND** 該 stage 的 status 設為 `failed`，output 記錄為 partial 檔名
- **AND** 下次重跑該 stage 時，覆蓋 partial 檔案並產出完整的 output

#### Scenario: Dashboard 無法連線
- **GIVEN** §3 數據分析需要連線 Looker Studio Dashboard
- **WHEN** 連線失敗（timeout 或 auth error）
- **THEN** 記錄錯誤：`{ "stage": "§3", "error": "dashboard_connection_failed", "detail": "具體錯誤" }`
- **AND** 提示 user 檢查網路連線或重新登入 Dashboard
- **AND** 將 run status 設為 `paused`，等待 user 確認後重試該 stage

#### Scenario: API quota 用完
- **GIVEN** 執行過程中 Google API 或其他外部 API 回傳 quota exceeded
- **WHEN** Orchestrator 收到 429 或 quota error
- **THEN** 記錄已完成的部分到 `{name}_partial.json`
- **AND** 在 run-status.json 的 errors 中記錄：`{ "stage": "§N", "error": "api_quota_exceeded", "completed_items": 15, "total_items": 30 }`
- **AND** 提示 user 剩餘數量與預估恢復時間
- **AND** user 確認後從已完成的部分續接

#### Scenario: OAuth token 過期
- **GIVEN** 執行過程中 Google API 回傳 401 Unauthorized
- **WHEN** Orchestrator 偵測到 auth error
- **THEN** 自動嘗試使用 refresh_token 換取新的 access_token
- **AND** refresh 成功則無感知地繼續執行
- **AND** refresh 失敗則提示 user 重新進行 OAuth 授權，將 run status 設為 `paused`

---

### Requirement 5: 成本追蹤

Orchestrator MUST 記錄每個 agent 的 token 用量與 API 呼叫次數，提供成本可見性。

#### Scenario: Token 用量記錄
- **GIVEN** 某個 agent（如 §4）執行完成
- **WHEN** Orchestrator 更新 run-status.json
- **THEN** 在該 stage 記錄 `"tokens": { "input": N, "output": M, "total": N+M }`
- **AND** 記錄 `"api_calls": K`（外部 API 呼叫次數，不含 LLM 本身）
- **AND** token 數量為估算值，基於 input/output 的字元數換算

#### Scenario: 累計成本
- **GIVEN** 多個 stage 已完成並記錄了 token 用量
- **WHEN** 任何 stage 完成時
- **THEN** 更新 run-status.json 的 `cost` 欄位：加總所有已完成 stage 的 `total_tokens` 和 `api_calls`
- **AND** `cost.per_stage` 記錄各 stage 的個別用量，便於分析哪個 stage 最耗資源
- **AND** 在每次暫停或完成時向 user 報告累計用量

#### Scenario: 成本預警
- **GIVEN** Orchestrator 維護一份歷史平均 token 用量（來自過去的 run-status.json）
- **WHEN** 某個 agent 的 token 用量超過歷史均值的 2 倍
- **THEN** 向 user 發出警告：「§N 的 token 用量（X）超過歷史均值（Y）的 2 倍」
- **AND** 不自動中斷，僅提供資訊讓 user 決定是否繼續
- **AND** 將警告記錄到 run-status.json 的 `errors` 陣列（type 為 `warning`）

---

> **v2 增補（2026-04-08）：** 新增 Pre-Run Checklist 機制，對齊 `self-learning` v3 的規則索引表。詳見 `openspec/plans/2026-04-08-self-learning-gap-fixes.md`。對齊 IR-027（提醒無效，邏輯才有效 — 用 hard gate 卡控）。

### Requirement 6: Pre-Run Checklist（讀歷史學習紀錄產檢核清單）

Orchestrator MUST 在 pipeline 啟動階段讀取 `core/learned/mapping.json` 與對應 jsonl，為本次 run 產生檢核清單，避免重複犯歷史已知錯。

#### Scenario: 啟動時讀取 mapping.json
- **GIVEN** orchestrator 開始一次新的 pipeline run
- **WHEN** 進入初始化階段（讀 run-status.json 之後、啟動第一個 sub-skill 之前）
- **THEN** 讀取 `core/learned/mapping.json`
- **AND** 篩選符合本次 run 的 rules：
  - `scope == "global"` 全數納入
  - `scope == "brand:<本次品牌>"` 納入
  - `scope == "industry:<本次產業>"` 納入
  - `ttl_until > now` 且 `superseded_by == null` 才納入
- **AND** 依 target_skills 分組，產出 `runs/{brand}-{date}/checklist.json`

#### Scenario: checklist.json schema
- **GIVEN** checklist 產出
- **THEN** 結構為：

```json
{
  "run_id": "LV-2026-04-08",
  "generated_at": "ISO8601",
  "source_mapping_version": "ISO8601 (mapping.json last_rebuilt)",
  "by_skill": {
    "narrative-packaging": [
      {
        "rule_id": "insights-20260325-003",
        "description": "精品品牌分析中，好感度推論需引用原始正負面詞彙比例",
        "scope": "industry:luxury",
        "confidence": "high"
      }
    ],
    "data-extraction-engine": [ ]
  },
  "total_rules": 12
}
```

#### Scenario: 下游 skill 讀取 checklist
- **GIVEN** checklist.json 已產出
- **WHEN** 任一 sub-skill 啟動
- **THEN** MUST 讀取 `checklist.json` 中對應 `by_skill[<skill_name>]` 段落
- **AND** 在該 skill 的流程中主動檢查對應規則
- **AND** skill 完成時把「本次命中/避開/違反」的結果交給 report-audit 寫入 rule-hits.jsonl

#### Scenario: Pre-Run Checklist 生成失敗（Fallback）
- **GIVEN** mapping.json 讀取失敗或 schema error
- **WHEN** orchestrator 偵測到
- **THEN** 不直接 hard block 出報（避免鎖死 pipeline）
- **AND** 以 warning-only 模式繼續，將 incident 寫入 run-status.json 的 errors
- **AND** 產一份空的 checklist.json（`total_rules: 0`, `fallback_reason: <error>`）
- **AND** 報告 metadata 中註記「本次 run 未使用 learned-rules checklist」

#### Scenario: Hard Gate — checklist 未讀不出報
- **GIVEN** checklist.json 存在且 `total_rules > 0`
- **WHEN** pipeline 進入 report-audit 階段
- **THEN** report-audit MUST 能在 run 目錄找到 `rule-hits.jsonl` 且至少包含 checklist 中每條規則的一筆命中結果（hit_type: avoided/violated/na）
- **AND** 缺漏時 report-audit 拒絕交付（verdict: ❌ 需重做），這是 hard gate
- **AND** 此 gate 對齊 IR-027：用程式邏輯卡控，不靠提醒
