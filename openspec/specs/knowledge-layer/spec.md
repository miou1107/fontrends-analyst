# Knowledge Layer — 知識層與 Run 生命週期規格

**Date:** 2026-04-20
**Author:** Vin
**對應 plan:** [2026-04-20-knowledge-layer-extraction](../../plans/2026-04-20-knowledge-layer-extraction.md)
**IR 對齊:** IR-004 OpenSpec / IR-005 禁 blind edit / IR-006 全層同步 / IR-008 commit 三同步 / IR-012 品管三步驟

---

## Purpose

確立 **Separation of Concerns (SoC)** 架構：code 只是 pipeline 與工作框架，所有「會因報表類型 / 分析目的 / 對象 / 素材而變動的東西」一律參數化、模組化。

**核心原則：**
- **工程師** 只維護 engines（讀參數、跑演算法、處理 I/O），不寫業務數值、關鍵字、文案
- **User** 透過編輯 YAML 迭代商業邏輯與分析技巧，不動 `.js`
- **系統** 自動學習修正規則，做為最上層 overlay
- **每次 run** 都是獨立、完整、可追溯的版本

---

## Architecture Layers

### L4 Presentation / Orchestrator
**Concern:** 把結果呈現給 user（pptx、gslides、gdocs、UI）
**可以：** 呼叫 L3 engine API
**禁止：** 寫業務邏輯

### L3 Engines（工程師領域）
**Concern:** 怎麼算（演算法、I/O、資料轉換）
**可以：** 透過 loader 讀 knowledge snapshot
**禁止：** 裸數字門檻、中文字面量、inline 關鍵字陣列、inline 文案、直接讀 YAML 檔

### L2.5 Run Context（User 領域 — 本次素材）
**Concern:** 這次 run 特有的外部參考資料
**位置：** `runs/<id>/context/`

### L2 Knowledge（User 領域 — 通用知識）
**Concern:** 用什麼標準判斷（門檻、關鍵字、文案、時間窗、維度、密度）
**位置：** `core/knowledge/`
**誰寫：** User 直接編輯 YAML

### L1 Learned（系統領域 — 自動學習）
**Concern:** 過去踩過的坑 / 累積的經驗
**位置：** `core/learned/learned-rules.json`
**誰寫：** self-learning engine 自動維護

### L0 Run Inputs
**Concern:** 被分析的主體數據
**位置：** `runs/<id>/inputs/`

---

## Requirements

### Requirement: 目錄結構

系統 MUST 遵循以下目錄結構。

#### Scenario: 專案層級目錄
- **GIVEN** 專案初始化
- **WHEN** 檢視專案根目錄
- **THEN** 存在以下目錄：
  - `core/knowledge/` — L2 通用知識層
  - `core/learned/` — L1 自動學習層
  - `core/engines/` — L3 純演算法層
  - `core/resolvers/` — L2→L3 翻譯層
  - `runs/` — 每次 run 的獨立目錄
  - `logs/` — 跨 run index（版本管理）

#### Scenario: Knowledge 目錄結構
- **GIVEN** `core/knowledge/` 存在
- **WHEN** 檢視結構
- **THEN** 包含：
  - `_defaults.yaml` — 所有 key 的保底預設
  - `stances/{audiences,purposes,focuses}/*.yaml` — 抽象意圖描述
  - `stance-map.yaml` — 描述符 → module 的查表
  - `modules/{thresholds,keywords,copy,time-windows,dimensions,density}/*.yaml` — 知識原子
  - `profiles/*.yaml` — 報表類型配方
  - `schema/*.schema.json` — JSON Schema 驗證

#### Scenario: Run 目錄結構
- **GIVEN** Pipeline 啟動一次 run
- **WHEN** 建立 run 目錄
- **THEN** 目錄名稱格式為 `<ISO timestamp>_<profile>_<target>_<short-hash>`
- **AND** 包含以下子目錄：
  - `inputs/` — L0 主體數據
  - `context/` — L2.5 本次外部素材
  - `temp/` — 暫存與 cache（`.gitignore`）
  - `outputs/` — 結構化產出
  - `logs/` — 本次執行紀錄

---

### Requirement: L3 Engines 不得寫死業務邏輯

Engines MUST 只透過 loader 存取 knowledge，禁止任何業務數值或領域詞彙寫死。

#### Scenario: 禁止中文字面量
- **GIVEN** 任何 `core/engines/**/*.js`
- **WHEN** 執行 `grep -r '[\u4e00-\u9fa5]' core/engines/`
- **THEN** 零命中

#### Scenario: 禁止裸數字門檻
- **GIVEN** 任何 engine 檔案
- **WHEN** ESLint 掃描
- **THEN** 除 0 / 1 / -1 外，禁止使用數字字面量當門檻或權重
- **AND** 所有門檻透過 `snapshot.get('thresholds.xxx')` 讀取

#### Scenario: 禁止直接讀 YAML
- **GIVEN** 任何 engine
- **WHEN** `grep -r "knowledge/" core/engines/`
- **THEN** 零命中（engines 只知道 loader API，不知道檔案路徑）

#### Scenario: 禁止寫暫存到 /tmp
- **GIVEN** 任何 engine 需要暫存
- **WHEN** `grep -r "os.tmpdir\|/tmp/" core/engines/`
- **THEN** 零命中
- **AND** 暫存透過 `tempManager.getPath(scope)` 取得

---

### Requirement: L2 Knowledge 模組化

Knowledge MUST 拆成可重用的原子模組，不得單檔膨脹。

#### Scenario: Module 類型
- **GIVEN** `core/knowledge/modules/`
- **WHEN** 檢視
- **THEN** 分為六類：thresholds / keywords / copy / time-windows / dimensions / density
- **AND** 每類下有多個可替換的變體（如 `growth-sensitive` / `growth-conservative`）

#### Scenario: 模組可替換
- **GIVEN** Profile 引用 `thresholds: growth-conservative`
- **WHEN** User 將其改為 `growth-sensitive`
- **THEN** re-run 後洞察數量與門檻行為立刻改變
- **AND** 不需改動任何 `.js`

#### Scenario: 模組不被 profile 污染
- **GIVEN** 兩個不同 profile 都引用同一個 module
- **WHEN** 其中一個 profile 透過 `overrides` 調整值
- **THEN** module 本身的 YAML 內容不變
- **AND** 另一個 profile 的 resolution 不受影響

---

### Requirement: Stance — 抽象意圖描述

系統 MUST 支援透過「對象 × 目的 × 著重面向」描述分析需求，由 resolver 翻譯成具體 modules。

#### Scenario: Stance 三類
- **GIVEN** `core/knowledge/stances/`
- **WHEN** 檢視
- **THEN** 包含三類：
  - `audiences/*.yaml` — 對象（ceo / marketing-lead / analyst / agency-client）含 role / expertise / attention_budget
  - `purposes/*.yaml` — 目的（decision-support / diagnosis / monitoring / pitch）
  - `focuses/*.yaml` — 著重面向（competitive / brand-health / performance）

#### Scenario: Stance 查表翻譯
- **GIVEN** Profile 指定 `stance: { audience: ceo, purpose: decision-support, focus: [competitive] }`
- **WHEN** stance resolver 執行
- **THEN** 依 `stance-map.yaml` 查表產出 module 組合與 overrides
- **AND** 翻譯規則純為 lookup / merge，零 AI 判斷
- **AND** audience=ceo 自動套用 `copy=tone-executive-brief` / `density=sparse` / `insights.max_count=3`

#### Scenario: 多 focus 合併策略
- **GIVEN** Profile 指定多個 focus（如 `[competitive, brand-health]`）
- **WHEN** resolver 合併
- **THEN** 依 `stance-map.yaml` 的 `merge_strategy` 處理（dimensions=union / keywords=union / copy=last-wins / overrides=deep-merge）

---

### Requirement: Profile — 報表類型配方

Profile MUST 描述一種報表類型，支援兩種宣告方式：stance 模式與 modules 模式。

#### Scenario: Stance 模式 Profile
- **GIVEN** Profile 使用 `stance:` 段
- **WHEN** Pipeline 讀取
- **THEN** stance resolver 先翻譯，之後才套 profile.overrides

#### Scenario: Modules 模式 Profile
- **GIVEN** Profile 使用 `extends:` 段直接指定 modules
- **WHEN** Pipeline 讀取
- **THEN** 略過 stance 翻譯，直接合併 modules → overrides

#### Scenario: Profile 指定 pipeline 順序
- **GIVEN** Profile 有 `pipeline: [engine-a, engine-b, ...]`
- **WHEN** Pipeline runner 執行
- **THEN** 依此順序呼叫 engines
- **AND** 未列出的 engine 當次 run 不執行，不報錯

#### Scenario: 新增報表類型純 YAML 工作
- **GIVEN** User 想新增 `competitive` 報表類型
- **WHEN** User 建立 `profiles/competitive.yaml`（引用既有 modules）
- **THEN** Pipeline 能直接跑
- **AND** 不需改動任何 `.js`

---

### Requirement: Resolver 串連

系統 MUST 依固定順序 resolve knowledge，產生不可變 snapshot。

#### Scenario: Overlay 優先級
- **GIVEN** Pipeline 啟動
- **WHEN** Resolver 執行
- **THEN** 依以下順序合併（後蓋前）：
  1. `_defaults.yaml`
  2. Stance resolver 產出
  3. profile.extends 指定的 modules
  4. profile.overrides
  5. learned-rules overlay（可 scope 到 audience/purpose）
  6. CLI flag（debug 後門）

#### Scenario: Snapshot 不可變
- **GIVEN** Snapshot 建立完成
- **WHEN** Engine 嘗試修改
- **THEN** 拋出錯誤（`Object.freeze` 或等效機制）

#### Scenario: 找不到 key 直接 throw
- **GIVEN** Engine 呼叫 `snapshot.get('unknown.path')`
- **WHEN** 該 path 不存在於任一層
- **THEN** loader 拋出錯誤
- **AND** 禁止內建 fallback 預設值（避免 magic number 走後門）

#### Scenario: Resolution trace
- **GIVEN** Snapshot 建立完成
- **WHEN** 讀取 `snapshot.trace('thresholds.insights.growth_pct')`
- **THEN** 回傳該 key 最終值來自哪一層（default / stance / module / override / learned）

---

### Requirement: L2.5 Run Context — 外部素材

每次 run MAY 包含 user 提供的外部參考資料，獨立於 knowledge 與 inputs。

#### Scenario: Context 目錄結構
- **GIVEN** `runs/<id>/context/`
- **WHEN** User 提供素材
- **THEN** 包含：
  - `manifest.yaml` — 登記每份素材
  - `documents/` — PDF / docx / md / txt
  - `data/` — csv / json / xlsx（輔助數據）
  - `urls/` — 網址清單 + 抓取快照
  - `notes/` — user 手寫補充

#### Scenario: Manifest 欄位
- **GIVEN** `context/manifest.yaml`
- **WHEN** 檢視一筆項目
- **THEN** 含：`id` / `type` / `path or url` / `source` / `purpose` / `trust` / `cite_as` / `scope` / `sensitive`

#### Scenario: URL 快照
- **GIVEN** Context 項目 `type: url`
- **WHEN** Pipeline 首次載入
- **THEN** 抓取當下存 HTML 快照至 `urls/<id>.html`
- **AND** manifest 記錄 `fetched_at`
- **AND** 後續 re-run 優先讀快照，不受連線變動影響

#### Scenario: Purpose / Trust 過濾
- **GIVEN** Engine 呼叫 `ctx.getByPurpose('competitive-benchmark', { minTrust: 'medium' })`
- **WHEN** Context loader 執行
- **THEN** 只回傳 purpose 相符且 trust ≥ medium 的素材

#### Scenario: 敏感素材隔離
- **GIVEN** Context 項目標記 `sensitive: true`
- **WHEN** 報告產出
- **THEN** 該素材內容不得出現在報告引文
- **AND** 可作為推理輸入

#### Scenario: Context trace
- **GIVEN** 報告中某洞察引用了外部素材
- **WHEN** 檢視 `logs/context-trace.json`
- **THEN** 標註該洞察引用的 `context_id` 清單

---

### Requirement: Outputs 結構化產出

每次 run MUST 將產出（本地檔 + 線上連結）統一登記。

#### Scenario: Outputs 目錄結構
- **GIVEN** `runs/<id>/outputs/`
- **WHEN** 檢視
- **THEN** 包含：
  - `manifest.yaml` — 統一登記所有產出
  - `files/` — 本地產出檔（pptx / pdf / docx / png / html）
  - `links/` — 線上連結 metadata（每條一份 `.json`）
  - `intermediate/` — 中間產物（data / narrative / script / audit .json）

#### Scenario: 本地檔登記
- **GIVEN** Engine 產出 pptx
- **WHEN** 登記至 manifest
- **THEN** 該筆為 `type: file`，含 `path` / `kind` / `size` / `created_at`

#### Scenario: 線上連結登記
- **GIVEN** Engine 產出 gslides
- **WHEN** 登記至 manifest
- **THEN** 該筆為 `type: link`，含 `platform` / `url` / `title` / `owner` / `permissions` / `created_at`
- **AND** 對應 metadata 存於 `links/<id>.json`

#### Scenario: 本地與雲端對照
- **GIVEN** pptx 被上傳為 gslides
- **WHEN** 登記連結
- **THEN** link metadata 含 `exported_from_local_file` 指回本地檔路徑

#### Scenario: 一眼看完所有產出
- **GIVEN** 一次 run 完成
- **WHEN** `cat runs/<id>/outputs/manifest.yaml`
- **THEN** 看到本次所有產出（本地檔 + 線上連結）的統一清單

---

### Requirement: Temp 暫存管理

每次 run 的暫存 MUST 集中於 `runs/<id>/temp/`，禁止散落。

#### Scenario: Temp 結構
- **GIVEN** `runs/<id>/temp/`
- **WHEN** 檢視
- **THEN** 包含：
  - `cache/` — 可重用快取（url snapshot / LLM 回應 / 渲染結果）
  - `scratch/` — 一次性中繼（解壓、轉檔）
  - `.gitignore` — 整個 temp/ 不進 git

#### Scenario: 統一配發暫存路徑
- **GIVEN** Engine 需要暫存
- **WHEN** 呼叫 `tempManager.getPath(scope)`
- **THEN** 回傳 `runs/<id>/temp/scratch/<scope>/` 下的路徑
- **AND** Engine 禁止呼叫 `os.tmpdir` 或寫專案根目錄

#### Scenario: 成功後自動清理
- **GIVEN** Pipeline 成功結束
- **WHEN** 清理策略執行
- **THEN** `scratch/` 被清空
- **AND** `cache/` 保留（跨 run 可重用）

#### Scenario: Cache TTL
- **GIVEN** Cache 項目超過 `_defaults.yaml` 定義的 TTL（如 url 7 天、LLM 30 天）
- **WHEN** 下次 run 嘗試讀取
- **THEN** 視為過期，重新抓取並更新

#### Scenario: Debug 保留
- **GIVEN** Pipeline 失敗或使用 `--keep-temp`
- **WHEN** 清理策略執行
- **THEN** 整個 `temp/` 完整保留供檢查

---

### Requirement: Logs 執行紀錄

每次 run MUST 產生結構化執行紀錄，供版本管理與 debug。

#### Scenario: Run-level logs
- **GIVEN** `runs/<id>/logs/`
- **WHEN** Pipeline 結束
- **THEN** 包含：
  - `run-meta.json` — 誰跑的、何時、profile、stance、git sha、versions、duration、status、rerun_of、is_final
  - `resolution-trace.json` — knowledge 每個 key 來自哪層
  - `context-trace.json` — 哪些洞察引用了哪些 context_id
  - `engine-log.ndjson` — 每個 engine 的 step log
  - `errors.ndjson` — 錯誤與警告
  - `events.ndjson` — 關鍵事件（cache hit/miss、retry、LLM call）

#### Scenario: 專案層級跨 run index
- **GIVEN** 專案根 `logs/`
- **WHEN** 檢視
- **THEN** 包含：
  - `index.ndjson` — 每行一筆 run（run_id / timestamp / profile / status / key_metrics）
  - `versions.ndjson` — knowledge / learned / engines 的版本變動紀錄
  - `README.md` — 如何查 log、如何 diff

#### Scenario: Engines 不直接寫檔
- **GIVEN** Engine 需要輸出 log
- **WHEN** 執行
- **THEN** 只能透過 `runLogger` API，不得直接 `fs.appendFileSync`
- **AND** Logger 自動套用敏感遮罩（email / token / api-key → `***`）

#### Scenario: 版本追溯
- **GIVEN** 某份報告已產出 3 個月
- **WHEN** 需查「用的是哪版 knowledge」
- **THEN** 讀 `runs/<id>/logs/run-meta.json` 的 `knowledge_git_sha`
- **AND** 配合 git checkout 可還原當時的 knowledge 內容

---

### Requirement: Run = 版本

每次執行 MUST 產生獨立、完整、可追溯的版本。

#### Scenario: 每次 run 一個獨立版本
- **GIVEN** 同一 profile、同一客戶
- **WHEN** 跑 10 次
- **THEN** 產生 10 個獨立 run 目錄
- **AND** 每個目錄自成完整版本（inputs / context / outputs / logs / temp 各一份）

#### Scenario: Run ID 格式
- **GIVEN** 新 run 啟動
- **WHEN** 生成 run ID
- **THEN** 格式為 `<ISO timestamp>_<profile>_<target>_<short-hash>`
- **AND** 同一毫秒內並發跑也因 short-hash 不衝突

---

### Requirement: Rerun 語意

系統 MUST 支援「重跑」但**永不覆蓋**舊版本。

#### Scenario: Rerun 產生新目錄
- **GIVEN** 舊 run ID `a3f2` 存在
- **WHEN** 執行 `pipeline rerun a3f2`
- **THEN** 產生新 run 目錄
- **AND** 新 run 的 `run-meta.json` 含 `rerun_of: a3f2`
- **AND** 舊 run 完整保留

#### Scenario: Rerun mode — same
- **GIVEN** `pipeline rerun a3f2 --same`
- **WHEN** 執行
- **THEN** 鎖同一 git sha + 同一 inputs + 同一 context
- **AND** 用於完全重現 / debug

#### Scenario: Rerun mode — refresh-knowledge（預設）
- **GIVEN** `pipeline rerun a3f2`（或 `--refresh-knowledge`）
- **WHEN** 執行
- **THEN** 使用最新 main 的 knowledge
- **AND** Inputs 與 context 透過 symlink 指向 parent（節省空間）

#### Scenario: Rerun mode — refresh-data
- **GIVEN** `pipeline rerun a3f2 --refresh-data`
- **WHEN** 執行
- **THEN** 使用最新 knowledge + 重新抓取 inputs
- **AND** Context 保留不變

#### Scenario: Symlink 節省空間
- **GIVEN** Rerun 建立新目錄
- **WHEN** 檢查 `du`
- **THEN** inputs/context 為 symlink，空間不翻倍（除非 `--refresh-data`）

---

### Requirement: Lineage 血緣鏈

系統 MUST 追蹤 run 之間的血緣關係。

#### Scenario: 血緣鏈儲存
- **GIVEN** Run `c9d4` 由 `b7e1` rerun 而來，`b7e1` 由 `a3f2` rerun 而來
- **WHEN** 檢視 `c9d4/logs/run-meta.json`
- **THEN** 含 `rerun_of: b7e1` 與 `parent_chain: [b7e1, a3f2]`

#### Scenario: Lineage CLI
- **GIVEN** `pipeline lineage c9d4`
- **WHEN** 執行
- **THEN** 顯示完整血緣鏈與每版 key 差異

#### Scenario: Run diff
- **GIVEN** `pipeline run-diff <a> <b>`
- **WHEN** 執行
- **THEN** 輸出兩版在 knowledge snapshot / context / outputs / key metrics 的差異

---

### Requirement: is_final 與生命週期

User MAY 標記某個 run 為最終版本，影響清理策略。

#### Scenario: 標記最終版
- **GIVEN** User 確認採用 run `b7e1`
- **WHEN** 執行 `pipeline mark-final b7e1`
- **THEN** `b7e1/logs/run-meta.json` 寫入 `is_final: true`

#### Scenario: Cleanup 保留 final
- **GIVEN** `pipeline runs-cleanup --keep-final --archive-old 30d`
- **WHEN** 執行
- **THEN** `is_final: true` 的 run 完全不動
- **AND** 30 天前的非 final run 被 archive：保留 `logs/` + `outputs/manifest.yaml`（連結可繼續開），刪 `temp/` 與 `outputs/files/` 大檔

#### Scenario: Dry-run 預覽
- **GIVEN** `pipeline runs-cleanup --dry-run ...`
- **WHEN** 執行
- **THEN** 只印出將被清理的 run ID 與大小，不實際刪除

---

## Acceptance Checklist

完成時需全數通過（對應 plan 41 條驗收標準）：

### SoC 邊界
- [ ] L3 engines 無 `knowledge/` 路徑引用
- [ ] L3 engines 無中文字面量
- [ ] L3 engines 無裸數字門檻（ESLint）
- [ ] L3 engines 無 `/tmp` / `os.tmpdir`
- [ ] L2 knowledge 只有 yaml / json / schema
- [ ] L1 learned 只由 self-learning engine 寫入

### 模組化
- [ ] 新增 profile 純 YAML 工作（不改 .js）
- [ ] Module 可替換（換一行立刻改行為）
- [ ] Profile 覆寫不污染模組
- [ ] Pipeline 順序可在 profile 配置

### Stance
- [ ] Stance 解析正確（ceo + decision-support 套用正確 modules）
- [ ] Multi-focus 合併策略正確
- [ ] Resolution trace 可追溯每 key 來源

### Run Context
- [ ] Context 隔離（不跨 run 污染）
- [ ] Purpose / Trust 過濾生效
- [ ] 敏感素材隔離
- [ ] URL 快照機制
- [ ] Context trace 可審計

### Outputs
- [ ] 本地檔與雲端連結統一登記
- [ ] 連結永續可開啟
- [ ] 本地與雲端對照（exported_from_local_file）

### Temp
- [ ] Engines 不寫 /tmp
- [ ] 成功後自動清理 scratch
- [ ] Cache TTL 生效
- [ ] Debug 保留機制

### Logs
- [ ] 每 run 獨立 logs
- [ ] 敏感遮罩
- [ ] 跨 run index 可 grep
- [ ] 版本可追溯

### Rerun / Lineage
- [ ] Rerun 永不覆蓋
- [ ] 三種 rerun mode 行為正確
- [ ] Symlink 節省空間
- [ ] Lineage 鏈追蹤正確
- [ ] is_final 保護生效
- [ ] Archive 不斷連結

---

## 實作狀態（2026-04-20）

### 已完成

- [x] `core/knowledge/` 完整骨架（30+ YAML）
- [x] `core/knowledge-loader.js`（stance/module/profile/density resolver + frozen snapshot + trace）
- [x] `core/template-engine.js`（支援 `${var}` / `{{#if}}` / 條件模板 / 多候選 fallback）
- [x] 6 大 engine 系統全面改造使用 snapshot：intent-classifier / anomaly-detector / insight-generator / analysis-engine / script-planner / purpose-binder / hook-generator / narrative-normalizer / cross-analyzer 等 14+ 檔
- [x] Density 模組接線（`_overrides:` 跨 namespace 覆蓋機制）
- [x] CLI `--density` / `--profile` flag
- [x] Brand-colors 新增 Taipei 101 / Taipei FunPass
- [x] SoC boundary 檢查工具（`tools/check-soc-boundary.js` + baseline 機制）
- [x] 400/400 測試通過

### 未完成（後續迭代）

- [ ] Rerun / lineage / is_final CLI（設計已完成，實作留給引擎化階段）
- [ ] Pipeline runner 讀 profile.pipeline 動態跑 engines（目前仍沿用 orchestrator）
- [ ] Run Context（`runs/<id>/context/` manifest）實作
- [ ] Outputs manifest（統一登記本地檔 + 雲端連結）
- [ ] Logs 跨 run index 與 run-meta.json
- [ ] Engine.js / comment-feedback 等 UI / 錯誤訊息層的中文字面量（baseline: 399 條，規劃用 i18n 而非 knowledge 處理）

## 文件連動（IR-006 全層同步）

本 spec 定稿後，以下文件 MUST 同步：

1. [plans/2026-04-20-knowledge-layer-extraction.md](../../plans/2026-04-20-knowledge-layer-extraction.md) — 已寫
2. `openspec/specs/core-knowledge-base/spec.md` — 註記分工（frameworks/SOP 仍在 core-knowledge-base；knowledge-layer 管參數化）
3. `openspec/specs/orchestrator/spec.md` — 新增 pipeline runner 與 resolver 調用流程
4. `openspec/specs/self-learning/spec.md` — 註記 learned-rules 如何 overlay 到 knowledge snapshot
5. `openspec/specs/report-audit/spec.md` — 註記 audit 也從 snapshot 讀門檻
6. README.md — 新增「如何調參數 / 如何新增報表類型」章節
7. FILELIST.md — 補 `core/knowledge/*`、`core/resolvers/*`、`core/run-logger.js` 等
8. CHANGELOG.md — 記錄本次架構升級
