# Changelog

本檔案記錄 fontrends-analyst 的重大變更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 格式。

## 2026-04-23 — 自動擷取 Dashboard 分頁截圖 + 附錄可配置

### Added
- **[core/tools/capture-looker-tabs.js](core/tools/capture-looker-tabs.js)** Playwright headless 工具
  - 自動從 `~/Library/.../Chrome/Default` 同步 Cookies / Login Data / Storage 到獨立 profile（`~/.fontrends/chrome-profile/`）
  - 不干擾使用者 Chrome，不需手動登入
  - 逐分頁 click + waitFor render + fullPage 截圖，檔名 `dashboard-<id>.png`
  - 用 `getByRole('treeitem', { name, exact })` 精確匹配分頁
- **[core/knowledge/modules/looker-tabs/journey101.yaml](core/knowledge/modules/looker-tabs/journey101.yaml)** Dashboard 分頁定義
- `narrative.appendix_screenshots` 欄位 — user 可指定附錄順序與標題
- Dependencies: `playwright` + chromium binary

### Changed
- **[engines/renderers/gslides.js](core/engines/renderers/gslides.js)** appendix 段
  - 優先用 `narrative.appendix_screenshots` 配置
  - Fallback 到掃 `screenshots/` 目錄（舊行為保留）
- **[engines/renderers/gslides.js](core/engines/renderers/gslides.js)** chapter layout
  - Insight 固定在 y=4.95，絕對不被 content 擠壓
  - Table / paragraph max height 依「可用空間」動態計算（CONTENT_MAX_BOTTOM = 4.85）
- **[engines/renderers/gslides.js](core/engines/renderers/gslides.js)** recommendations speaker notes
  - 改讀 `narrative.recommendations_speaker_notes`（user 可客製）
  - Fallback 自動組裝列出每項建議

### Verified
- 400/400 測試通過
- SoC baseline 407 → 409（fallback string 2 條中文，user 已追認）
- 第一次實跑：5 張 Dashboard 分頁完整截圖成功插入 Slides 附錄

## 2026-04-20 — Comment-feedback 全鏈路完整 + Service Account Bot 身份

### Added
- **Service Account（Journey101 AI Bot）身份機制**
  - GCP SA: `journey101-ai-bot@fontrip-fapa.iam.gserviceaccount.com`
  - Key: `~/.fontrends/journey101-ai-bot-key.json`（權限 600）
  - [engines/helpers.js](core/engines/helpers.js) `getServiceAccountAuth()` / `getServiceAccountEmail()`
  - [engines/comment-feedback/index.js](core/engines/comment-feedback/index.js) 回覆優先用 SA（`replyAuth = botAuth || userAuth`）
  - [engines/renderers/gslides.js](core/engines/renderers/gslides.js) 建新檔後自動 grant SA writer 權限
- **engine.js `--target-id` flag**（in-place update 既有 presentation）
  - 新增 code 避免每次 comment fix 產新版本（依鐵律 A）
  - [engines/renderers/gslides.js](core/engines/renderers/gslides.js) 支援「刪既有 slides + 以 rebuild 前綴重建」
- **[engines/template-engine.js](core/template-engine.js)** Mini template DSL（`${var}` / `{{#if}}` / fallback chain）
  - 取代 hook-generator 20+ 中文 template 函式
  - 取代 narrative-normalizer 9 章節模板
- **[openspec/plans/2026-04-20-backlog.md](openspec/plans/2026-04-20-backlog.md)** 待辦清單（P0–P3 優先級分類）
- **[core/tools/check-soc-boundary.js](core/tools/check-soc-boundary.js)** SoC 守門工具 + baseline 機制

### Changed
- **[engines/comment-feedback/comment-responder.js](core/engines/comment-feedback/comment-responder.js)** `resolveComment` / `replyAndResolve` 加 `userConsent` guard
  - 依鐵律 B：AI 不得自動標記留言「已解決」
- **[engines/comment-feedback/comment-reader.js](core/engines/comment-feedback/comment-reader.js)** `filterUnresolved` 改為 `c.resolved !== true`（避免 API 未回 resolved 欄位時誤過濾）
- **[engines/comment-feedback/index.js](core/engines/comment-feedback/index.js)** 所有 `replyAndResolve` → `replyToComment`（不自動 resolve）
- **[engines/renderers/gslides.js](core/engines/renderers/gslides.js)** layout 修正
  - `addHeader`: title h 0.6→0.95、fontSize 24→22、underline y 0.95→1.3
  - `buildChapterSlide`: contentY 起始 1.2→1.5、insightY 下限 4.6→4.85、table max h 3.0→2.6、insight color primary→text_on_light（對比更好）
  - `chapterSpeakerNotes`: 優先讀 `narrative.speaker_notes`（若有）
  - 「執行摘要」→「快速摘要」
- **[brand-colors.json](core/templates/brand-colors.json)** `taipei-101` 色系校正（紅 C8102E + 金 D4A853）+ 淺色系封面
- **[theme-default.json](core/templates/theme-default.json)** 全面放大字體（body 11→14、title 24→28、table 9→11）
- **[tone-professional.yaml](core/knowledge/modules/copy/tone-professional.yaml)** roles 統一為「Journey101 數據團隊」
- 新增 **`taipei-101` / `taipei-funpass` 品牌**

### 鐵律入庫
- [memory/feedback_comment_handling.md](.claude/projects/.../memory/feedback_comment_handling.md) — 鐵律 A/B/C：不產新版、不自動 resolve、Bot 身份
- [memory/feedback_role_separation.md](.claude/projects/.../memory/feedback_role_separation.md) — 鐵律：Claude Code 工程師 vs Slides 留言 end-user 分離

### 首個完整 Run
- `~/.fontrends/runs/taipei-101-2026-04-20/` — 台北 101 觀景台內部簡報
- 產出 URL: https://docs.google.com/presentation/d/1olMKIQgeIcqBacGzcTbYEy4_OD8CcHIRtH2CMX5ED4c/edit
- 共處理 3 輪 18 則留言（2 舊 + 7 視覺/文案 + 9 layout）

### Verified
- 全部測試通過（400/400）
- SoC baseline 由 399 → 407 條（新增 8 條來自本輪 gslides layout 改造，已 approved）

---

## 2026-04-20 — Template DSL + Density 接線 + SoC 守門

### Added
- [core/template-engine.js](core/template-engine.js) — Mini template engine
  - `${var}` / `${var|default}` / `${var.nested.path}` 變數插值
  - `{{#if var}}...{{else}}...{{/if}}` 條件區塊
  - `{{#unless var}}...{{/unless}}` 反向條件
  - Object spec: `{ when: 'path', then: '...', else: '...' }`
  - Array spec: 依序嘗試，第一個非空勝出（fallback chain）
- [core/knowledge/modules/copy/hook-templates.yaml](core/knowledge/modules/copy/hook-templates.yaml) — Purpose × Dimension hook 模板全 YAML 化
- [core/knowledge/modules/copy/narrative-chapters.yaml](core/knowledge/modules/copy/narrative-chapters.yaml) — 9 chapter so_what / action_link 模板全 YAML 化
- [core/tools/check-soc-boundary.js](core/tools/check-soc-boundary.js) — SoC 守門工具
  - 檢查 `engines/**/*.js` 無中文字面量 / knowledge 路徑 / os.tmpdir
  - Baseline 機制：`node tools/check-soc-boundary.js baseline` 建立基準，check 模式只擋新增違規
- [core/tools/soc-boundary-baseline.json](core/tools/soc-boundary-baseline.json) — 當前基準（399 條，主要在 engine.js / comment-feedback UI 層）
- Brand-colors 新增：`taipei-101` / `taipei-funpass`
- CLI `--density <sparse|standard|deep>` / `--profile <name>` flag

### Changed
- `hook-generator.js` — 完全移除 20+ 中文 template 函式，改讀 YAML + template engine
- `narrative-normalizer.js` — 9 chapter templates 全改讀 YAML；enrichKeyAngles / enrichDataReferences 文案也外化
- `knowledge-loader.js` — 新增模組 `_overrides:` 跨 namespace 覆蓋機制、`--density` flag 支援
- Density 模組 (`sparse/standard/deep`) 實際接上 thresholds 並生效
- 修復 `report-audit` 既有測試（6 → 7 dimensions，對應新增的學習規則）

### Verified
- **400/400 測試通過**（從 399/400 進步）
- SoC check：零 regression（baseline 399 條，皆在非業務邏輯層）

## 2026-04-20 — Knowledge Layer 全面 engine 改造完成

將 25 個 engine 中的 6 大子系統全部改用 knowledge snapshot，參數 / 關鍵字 / 文案 / 維度 / 時間窗 / 密度 全部外化至 `core/knowledge/`。**399/400 既有測試通過**（唯一失敗為既有 report-audit 6→7 問題，與本次改造無關）。

### Engines 改造
- `comment-feedback/intent-classifier.js` — 關鍵字 / 信心度 / 處理順序外化
- `analysis/analyzers/anomaly-detector.js` — z-score / IQR / min data points 外化
- `analysis/analyzers/insight-generator.js` — 門檻 / METRIC_LABELS / 文案模板外化
- `analysis/analysis-engine.js` — 時間窗 / 建議文案 / dim mapping / confidence / caveats 外化
- `analysis/analyzers/cross-analyzer.js` — 相關性門檻 / 評分公式 / 象限邊界外化
- `analysis/analyzers/competitor-comparator.js` — 1.05 advantage multiplier 外化
- `script-planner/script-planner.js` + `block-assigner.js` + `headline-generator.js` + 2 scorers — BASE_WEIGHTS / PAGE_TITLES / 所有權重與門檻外化
- `purpose-binder/*` (purpose-binder + affinity-table + signal-scorer + hook-generator) — 5×8 affinity 矩陣 / signal level / sentiment threshold 外化
- `narrative-normalizer.js` — site_average 598000 / 萬 threshold 10000 / 小數位 外化（chapter templates 仍保留，需 template DSL）
- `self-learning/learning-engine.js` — learning thresholds 改 snapshot（backward-compat，舊值保留為 fallback）

### Knowledge 新增模組
- `modules/dimensions/metric-labels.yaml` — 30+ 指標欄位中文對照 + `page_key_map`
- `modules/dimensions/script-pages.yaml` — 8 頁面定義 + 4 schema 權重 + severity order
- `modules/dimensions/purpose-affinity.yaml` — 5×8 親和度矩陣

### Thresholds / Copy / Time-windows 擴充
- `thresholds/standard.yaml` 新增：anomaly.per_dimension_method / confidence_scores / purpose_signal_levels
- `copy/tone-professional.yaml` 新增：insight_templates / headline_templates / recommendations.by_insight_type / hook_labels / quality_caveats
- `time-windows/standard.yaml` 新增：period labels / quarter_mapping

### 已知未完成
- `narrative-normalizer` 9 chapter templates 仍在 code（需 template DSL）
- `hook-generator` 20+ template 函式仍在 code（同上）
- 相關 spec 的 scenario 需更新對應新路徑（之後做）

## 2026-04-20 — Knowledge Loader + 第一個 engine 改造完成（PoC）

### Added
- [core/knowledge-loader.js](core/knowledge-loader.js) — Knowledge loader + stance/module/profile resolver
  - Deep-merge + dotted-path overrides
  - Module 繼承鏈（`_meta.extends`）循環偵測
  - Stance resolver：audience + purpose + focus → modules + overrides
  - Frozen snapshot（不可變，嘗試 mutate 會 throw）
  - 找不到 key 直接 throw（禁止內建 fallback）
  - Resolution trace：每個 key 標記來自哪層（default / stance / module / profile-override / learned / cli）

### Changed
- [core/engines/comment-feedback/intent-classifier.js](core/engines/comment-feedback/intent-classifier.js) — 改用 snapshot 讀規則
  - 移除 inline `INTENT_ORDER` / `KEYWORD_RULES`
  - `classifyIntent(text, ctx, snapshot)` 簽名新增 snapshot 參數
  - `sortByProcessingOrder(comments, snapshot)` 同上
  - 啟動時若未傳 snapshot 直接 throw（L3 SoC guard）
- [core/engines/comment-feedback/index.js](core/engines/comment-feedback/index.js) — 在入口 `resolveProfile('brand-social')` 取得 snapshot 注入下游
- 測試新增 SoC guard 案例（missing snapshot 必 throw）

### Verified
- 59 個既有 comment-feedback 測試全數通過（行為 regression-free）
- `stats_thresholds.iqr.fence_multiplier` / `thresholds.correlation.pearson_min_data_points` 從 `_statistical-constants.yaml` 載入並鎖定
- CEO profile（stance 模式）resolver 正確套用：
  - `thresholds.scoring.max_insights = 3`（來自 stance）
  - `thresholds.scoring.growth_decline_detection = 15`（來自 profile override）
  - `copy.comment_reply.success` 無 `✅` 前綴（tone-executive-brief）

### Next
- Phase 2 下半段：改造剩下 5 個 engine（anomaly-detector / insight-generator / script-planner / narrative-normalizer / purpose-binder）
- Phase 3：Pipeline runner + ESLint rule（禁裸數字 + 禁中文字面量）

---

## 2026-04-20 — Knowledge Layer Phase 1-2 骨架完成

### Added
- `core/knowledge/` 完整骨架（27 個 YAML 檔）：
  - `_defaults.yaml` / `stance-map.yaml` / `README.md`
  - `stances/` — 3 audiences / 3 purposes / 2 focuses
  - `modules/thresholds/` — `_statistical-constants.yaml`（🔒 鎖定）+ standard / growth-sensitive / growth-conservative
  - `modules/dimensions/` — `canonical.yaml`（📌 單一真實來源）+ social-14d / competitive-7d
  - `modules/keywords/intent-base.yaml`
  - `modules/copy/` — tone-professional / tone-executive-brief
  - `modules/time-windows/standard.yaml`
  - `modules/density/` — standard / sparse / deep
  - `profiles/` — brand-social（regression baseline）/ brand-social-for-ceo（stance 模式示範）
- [openspec/plans/2026-04-20-audit-inventory.md](openspec/plans/2026-04-20-audit-inventory.md) — 99 條洩漏點完整清單

### Notes
- 所有初始值對齊現有 `.js` code（維持行為）
- Engines 尚未改動，loader / resolver 尚未實作（Phase 2 下半段 + Phase 3）
- `_statistical-constants.yaml` 標記 locked（IQR 1.5、Pearson min 5），除非統計研究否則不要改

## 2026-04-20 — Knowledge Layer 架構 spec（規劃階段，尚未實作）

依 SoC 原則規劃知識層與 run 生命週期，**尚未動 code**。

### Added
- [openspec/specs/knowledge-layer/spec.md](openspec/specs/knowledge-layer/spec.md) — L0/L1/L2/L2.5/L3/L4 六層分工、stance/profile/module、run context、outputs、temp、logs、rerun/lineage 完整規格
- [openspec/plans/2026-04-20-knowledge-layer-extraction.md](openspec/plans/2026-04-20-knowledge-layer-extraction.md) — 5 phase 實作計畫 + 41 條驗收標準

### Changed
- `openspec/specs/core-knowledge-base/spec.md`：加分工註記（文字型知識 vs 參數化層）
- `openspec/specs/orchestrator/spec.md`：加 resolver 鏈與 pipeline runner 串接要求
- `openspec/specs/self-learning/spec.md`：learned-rules 改為 snapshot overlay 第 5 層

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
