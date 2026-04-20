# Changelog

本檔案記錄 fontrends-analyst 的重大變更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式。

## 2026-04-20 — 整併舊 repo 殘留內容

### Added
- `core/docs/superpowers/`：搬回 4 份 plans + 4 份 design specs（comment-feedback-mechanism、data-analysis-agent、purpose-binder、script-planner）
- `core/frameworks/`：action-matrix.md、analysis-framework.md、interview-guide.md
- `core/operations/`：browser-strategies.md、data-extraction.md、looker-operations.md
- `core/tools/ppt-qa.sh`
- `core/learned/formats/`：gdocs.md、gslides.md（Google Docs/Slides 格式規則）
- `core/version.json`：版本資訊
- `.mcp.json`：專案 MCP 配置（chrome-devtools）

### Changed
- `.gitignore`：新增 `.claude/worktrees/`（Claude Code 本機 worktree metadata）

### Rationale
昨天 commit b2a61f7 從舊 repo（fontrip-agentic-process-automation/Projects/fontrends-analyst）搬回 comment-feedback 模組時，遺漏了 docs/frameworks/operations/tools/learned/formats 等核心文件。比對新舊 repo 後確認這些內容僅存在於舊 repo，本次補搬完整。舊 repo 子目錄已刪除（262MB），monorepo 其他專案保留。

## 2026-04-08 — Self-Learning Gap Fixes

**Plan:** `openspec/plans/2026-04-08-self-learning-gap-fixes.md`

### Added
- `self-learning` spec v3：新增「紀錄時效性」Requirement，corrections/insights 必含 `ttl_days`（預設 90）/ `scope` / `superseded_by` / `created` 欄位
- `self-learning` spec v3：新增「規則索引表」Requirement，定義 `core/learned/mapping.json` schema 作為規則→技能路由的全域索引
- `orchestrator` spec v2：新增「Pre-Run Checklist」Requirement，pipeline 啟動時讀 mapping.json 產 `runs/{brand}-{date}/checklist.json`，並要求下游 skill 讀取對應段落
- `orchestrator` spec v2：新增 Hard Gate — checklist.json 存在但 rule-hits.jsonl 缺漏任一規則判定時拒絕交付（對齊 IR-027）
- `report-audit` spec v2：新增「規則命中追蹤」Requirement，稽核時比對 checklist 並寫入 `core/learned/rule-hits.jsonl`
- `report-audit` spec v2：新增 Regression 偵測 — 歷史曾 avoided 但本次 violated 自動升級為 high priority insight 並立即產出 urgent PR
- `FILELIST.md`：新增 `core/learned/` 目錄說明（含 rule-hits.jsonl、mapping.json、archived/）
- `README.md`：新增 Self-Learning 段落說明三個升級機制

### Changed
- `self-learning` spec v3：`skill-suggestions` 升級門檻寫死為 `confidence == "high"` 且 `applicable_to != "brand:<single>"`（原本定義含糊，單一品牌經驗會誤升級為跨專案 skill 規則）
- `self-learning` spec v3：`skill-suggestions` 提交流程從「一條一 PR」改為「每週一 09:00 自動 digest PR」，單 PR ≤5 條，body 強制含 rule-hits 證據；高優先修正型保留即時 urgent PR 通道

### Rationale
經過與 Codex 四輪討論後盤點發現，現有 `self-learning` / `report-audit` / `quality-optimization` / `learning-feedback` 四份 spec 已涵蓋自主學習機制的 80%，前幾輪討論的 Evaluator / openspec change gate / autoresearch loop 在週產 2-3 份報告的分母下會因統計量不足而鎖死。本次只補齊 6 個真正的 gap：TTL / 規則命中 telemetry / mapping.json 索引 / pre-run hook / 升級門檻 / digest PR 節奏。

### IR 對齊
- IR-004 OpenSpec 流程：先寫 plan → 再改 spec delta
- IR-005 禁 blind edit：先讀現有 4 份 spec 做 gap 分析才動筆
- IR-006 學到東西全層同步：spec + README + FILELIST + CHANGELOG 一次同步
- IR-008 commit 必須同步三份文件：本 CHANGELOG 為新建
- IR-011 時區：所有 scheduled 時間明確標 Asia/Taipei
- IR-012 / IR-025 品管三步驟：verification → requesting-review → receiving-review（本 change 執行中）
- IR-027 提醒無效邏輯才有效：orchestrator Pre-Run Checklist 與 report-audit rule-hits 互為 hard gate，不靠 skill 自己記得讀
