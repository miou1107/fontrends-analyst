# Knowledge Layer Extraction — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-04-20
**Author:** Vin
**IR 對齊:** IR-004 OpenSpec 流程 / IR-005 禁 blind edit / IR-006 學到東西全層同步 / IR-012 品管三步驟

---

## Goal

**Code = 純 pipeline / 工作框架**，**所有會因「報表類型 / 分析目的」而變動的知識點一律參數化、模組化**。

- 不同的報表類型（品牌社群分析、競品對比、活動復盤、危機監測、季報…）有不同的分析技巧、著重維度、門檻、建議語氣
- Pipeline 讀「報表類型 profile」→ 組合對應的 knowledge 模組 → 跑演算法 → 產報告
- 新增一種報表類型 = 新增一個 profile + 幾個 knowledge 模組，**不需動任何 engine `.js`**
- 工程師只維護「框架 + engine 演算法」，user 維護「做什麼分析、怎麼判斷、怎麼說」

**不做：** 重寫 engine 演算法、改變既有黃金輸入的輸出（先做到參數化、行為不變，之後 user 再迭代各 profile）。

---

## Background（為什麼要做）

2026-04-20 架構審查結論：80% 商業邏輯寫死在 code 裡。具體 leakage：

| 類別 | 範例檔案 | 寫死的東西 |
|---|---|---|
| 意圖分類關鍵字 | [intent-classifier.js:5-11](../../core/engines/comment-feedback/intent-classifier.js) | 刪除 / 結構 / 語氣…的中文觸發詞 |
| 洞察門檻 | [insight-generator.js:34,40,85](../../core/engines/analysis/analyzers/insight-generator.js) | ±10% 成長、r>0.7 相關性、MAX_INSIGHTS=5 |
| 異常偵測 | [anomaly-detector.js:7](../../core/engines/analysis/analyzers/anomaly-detector.js) | z-score 2.5、IQR fences |
| 訊號評分 | [signal-scorer.js:9-20](../../core/engines/script-planner/scorers/signal-scorer.js) | 固定回傳 1.0/0.8/0.5/0.2 |
| 時間窗 | [analysis-engine.js:41-50](../../core/engines/analysis/analysis-engine.js) | QoQ 83-97 天、YoY 358-372 天 |
| 文案 / 領域詞 | [analysis-engine.js:73-112](../../core/engines/analysis/analysis-engine.js) | "社群行銷團隊"、"品牌策略團隊"、建議句式 |
| 指標標籤 | [insight-generator.js:5-15](../../core/engines/analysis/analyzers/insight-generator.js) | METRIC_LABELS 中文對照 |

**現有 `learned-rules` 只處理渲染 / narrative / audit 三類，沒有涵蓋分析邏輯參數。** 本計畫把「參數 / 詞彙 / 文案」這一層補齊，learned-rules 仍負責「修正規則」這一層。

---

## Architecture（Separation of Concerns）

### SoC 四層架構

本計畫以 **Separation of Concerns** 為核心設計原則。每層只負責一件事，層與層之間透過明確介面溝通，**不能跨層直接存取**。

```
┌─────────────────────────────────────────────────────────────┐
│  L4  Presentation / Orchestrator                            │
│      簡報、報告、UI、pipeline 調度                            │
│      Concern: 「怎麼把結果呈現給 user」                       │
└──────────────────────▲──────────────────────────────────────┘
                       │ 只能叫 L3 engine API
┌──────────────────────┴──────────────────────────────────────┐
│  L3  Engines（工程師領域）                                    │
│      純演算法 / I/O / 資料轉換，無業務數值、無中文字串         │
│      Concern: 「怎麼算」                                      │
│      禁止：寫死門檻、關鍵字、文案、領域詞                      │
└──────────────────────▲──────────────────────────────────────┘
                       │ 只能透過 knowledge-loader 讀參數
┌──────────────────────┴──────────────────────────────────────┐
│  L2  Knowledge（User 領域 — 手動）                            │
│      core/knowledge/*.yaml — 門檻、權重、關鍵字、文案、時間窗 │
│      Concern: 「用什麼標準判斷」                              │
│      由 user 直接編輯，schema 驗證擋錯                        │
└──────────────────────▲──────────────────────────────────────┘
                       │ 被 L1 overlay 覆寫（baseline + overrides）
┌──────────────────────┴──────────────────────────────────────┐
│  L1  Learned（User 領域 — 自動）                              │
│      core/learned/learned-rules.json — 系統從修正回饋學到的規則│
│      Concern: 「過去踩過的坑 / 累積的經驗」                   │
│      由 self-learning engine 維護                             │
└─────────────────────────────────────────────────────────────┘
```

### 層邊界規則（ESLint + Code Review 雙重把關）

| 層 | 可以 | 禁止 |
|---|---|---|
| L3 Engines | 讀 loader、跑演算法、呼叫 adapter | 裸數字門檻、中文字面量、inline 關鍵字陣列、inline 文案 |
| L2 Knowledge | YAML / JSON / Schema | 任何 `.js` 邏輯 |
| L1 Learned | JSONL / JSON append-only | 手改（只能透過 self-learning engine 寫入） |
| Loader (L2↔L3 介面) | 驗證 + cache + overlay 合併 | 內建預設值（fallback = 埋 magic number 的後門，一律禁） |

### 為什麼這樣切

- **Engineer 只動 L3/L4**：修 bug、加新 engine、改演算法。不碰業務詞彙。
- **User 只動 L2**：改門檻、加關鍵字、調文案。不碰 `.js`。
- **系統只動 L1**：自動學習，user 只審核 PR。
- **互不干擾**：User 調 L2 不會讓 engine 壞；engineer 改 L3 不會覆蓋 user 的業務設定。
- **可測試**：每層獨立 test。L3 engine test 用 fixture 注入 knowledge，不依賴真實 YAML。

### 目錄結構（Profile-based，模組化組合）

**兩段式解析：Stance（抽象意圖）→ Resolver（查表翻譯）→ Modules（具體配方）→ Engine（讀最終值）**

```
core/knowledge/
├── stances/                          # 抽象意圖描述（對象 × 目的 × 注意力）
│   ├── audiences/
│   │   ├── ceo.yaml                  # role, expertise, attention_budget, language_preference
│   │   ├── marketing-lead.yaml
│   │   ├── analyst.yaml
│   │   └── agency-client.yaml
│   ├── purposes/
│   │   ├── decision-support.yaml     # 結論先行、選項少、風險標註
│   │   ├── diagnosis.yaml            # 根因、對照、交叉驗證
│   │   ├── monitoring.yaml           # 異常、趨勢、告警
│   │   └── pitch.yaml                # 說服、亮點放大、情緒語言
│   └── focuses/
│       ├── competitive.yaml          # 強調 SOV、gap、對手動作
│       ├── brand-health.yaml         # 情感、好感度、危機訊號
│       └── performance.yaml          # 成長、效率、ROI
│
├── stance-map.yaml                   # 「描述符 → module 組合 / overrides」查表
│                                     # 例：audience=ceo + purpose=decision-support
│                                     #   → copy=tone-executive-brief, insight_depth=top-3
│
├── modules/                          # 可重用知識模組（原子單位）
│   ├── thresholds/
│   │   ├── growth-sensitive.yaml     # 成長敏感（門檻低，適合早期品牌）
│   │   ├── growth-conservative.yaml  # 保守（門檻高，適合成熟品牌）
│   │   └── anomaly-strict.yaml       # 嚴格異常偵測（z=2.0）
│   ├── keywords/
│   │   ├── intent-base.yaml          # 通用意圖關鍵字
│   │   ├── domain-luxury.yaml        # 精品業領域詞
│   │   └── domain-fmcg.yaml          # 快消領域詞
│   ├── copy/
│   │   ├── tone-professional.yaml    # 專業語氣建議文案
│   │   ├── tone-punchy.yaml          # 直接、短句
│   │   └── roles-standard.yaml       # 標準團隊角色（社群/品牌/數據…）
│   ├── time-windows/
│   │   ├── standard.yaml             # 標準 QoQ/YoY
│   │   └── campaign.yaml             # 活動復盤用（活動前/中/後）
│   ├── dimensions/                   # 分析維度（選哪些、權重）
│   │   ├── social-14d.yaml           # 社群 14 維度
│   │   ├── competitive-7d.yaml       # 競品對比 7 維度
│   │   └── crisis-5d.yaml            # 危機監測 5 維度
│   └── density/                      # 密度 / 深度設定
│       ├── sparse.yaml               # 字少圖多、top-3 洞察、slide 字上限
│       ├── standard.yaml
│       └── deep.yaml                 # 全量、附錄、方法論
│
├── profiles/                         # 「報表類型」= 模組組合
│   ├── brand-social.yaml             # 品牌社群分析（組合社群 14d + 保守門檻 + 專業語氣）
│   ├── competitive.yaml              # 競品對比
│   ├── campaign-review.yaml          # 活動復盤
│   ├── crisis-monitor.yaml           # 危機監測
│   └── quarterly.yaml                # 季報
│
├── schema/                           # 驗證
│   ├── module-thresholds.schema.json
│   ├── module-keywords.schema.json
│   ├── module-copy.schema.json
│   ├── module-time-windows.schema.json
│   ├── module-dimensions.schema.json
│   └── profile.schema.json
│
└── _defaults.yaml                    # 所有模組未指定時的最低保證預設
```

**Profile 範例 A — 用 Stance（推薦）**：

```yaml
# profiles/brand-social-for-ceo.yaml
name: brand-social-for-ceo
description: 給 CEO 看的品牌社群季報
stance:
  audience: ceo
  purpose: decision-support
  focus: [competitive, brand-health]
# 其餘由 stance-map.yaml 解析 → 產出 modules + overrides
# 可選：直接再 override
overrides:
  thresholds.insights.growth_pct: 10   # 比 stance 預設更保守
pipeline:
  - data-extraction
  - anomaly-detector
  - insight-generator
  - script-planner
  - narrative-packaging
  - presentation
```

**Profile 範例 B — 直接指定 modules（進階）**：

```yaml
# profiles/brand-social.yaml
name: brand-social
description: 品牌社群分析（通用）
extends:
  dimensions: social-14d
  thresholds: growth-conservative
  keywords: [intent-base, domain-luxury]
  copy: [tone-professional, roles-standard]
  time_windows: standard
  density: standard
overrides:
  thresholds.insights.growth_pct: 8
pipeline: [...]
```

**stance-map 範例**：

```yaml
# core/knowledge/stance-map.yaml
# 查表規則，resolver 不做 AI 判斷，只做 lookup + merge
audience:
  ceo:
    copy: tone-executive-brief
    density: sparse
    overrides:
      insights.max_count: 3
      script.prefer_conclusion_first: true
  analyst:
    copy: tone-professional
    density: deep
    overrides:
      insights.max_count: 10

purpose:
  decision-support:
    must_include_sections: [recommendations, risks]
    overrides:
      insights.require_action: true
  diagnosis:
    must_include_sections: [root_cause, cross_validation]

focus:
  competitive:
    dimensions: competitive-7d
    keywords_append: [domain-competitive-terms]
  brand-health:
    dimensions_append: [sentiment, crisis-signals]

# 衝突解析（多 focus 時）：後者 append，不取代
merge_strategy:
  dimensions: union
  keywords: union
  copy: last-wins
  overrides: deep-merge
```

### 執行流程

```
User 指定 profile=brand-social-for-ceo
   ↓
Pipeline 讀 profiles/brand-social-for-ceo.yaml
   ↓
Stance Resolver: 讀 stance-map.yaml
   audience=ceo + purpose=decision-support + focus=[competitive, brand-health]
   → 產生 modules 組合 + 基礎 overrides
   ↓
Module Resolver: _defaults → resolved modules → profile.extends → profile.overrides
   ↓
Learned Resolver: 套 learned-rules overlay（可針對特定 audience/purpose）
   ↓
得到 resolved knowledge snapshot（冷凍，整個 run 共用）
   ↓
Pipeline Runner 依 profile.pipeline 順序跑 engines，注入 snapshot
   ↓
產出報告 + 附上 resolution trace（每個值來自哪一層，便於 debug）
```

**關鍵：resolver 全部是 lookup / merge，不做 AI 判斷。** 所有「專業度高時該怎樣」的規則都寫在 `stance-map.yaml`（查表），而不是 `.js`（程式判斷）。

**關鍵：resolved snapshot 是不可變的**。同一 run 裡 engine 讀的門檻 / 文案一定一致，不會中途被改。

新增 `core/knowledge-loader.js`：

- 啟動時載入所有 yaml + 跑 schema 驗證（fail-fast）
- 提供 `get('thresholds.insights.growth_pct')` 這類路徑存取
- cache in memory，engines 不重複讀檔
- 找不到 key → throw（禁止靜默 fallback，避免 magic number 死灰復燃）

**Loader 是 L2↔L3 唯一合法介面（SoC 關鍵）：**

- Engines **只** 透過 loader 讀 knowledge，**不准** `require('./knowledge/foo.yaml')`
- Loader **只** 做「載入 + 驗證 + 合併 overlay + 路徑存取」，**不做** 演算法
- Loader 不做 fallback（找不到 key 就 throw），避免「忘了加 key 但系統靜默跑舊值」

**engine 改造原則：**

- 所有門檻 / 權重 / 關鍵字 / 文案 → 從 loader 讀
- 保留現有函數簽名，只改內部常數來源
- 中文字串 / 裸數字門檻一律搬走
- Engines 不認識 YAML；只認識 loader API

**learned-rules 的關係（不衝突）：**

- `core/knowledge/modules/*` = user 手動建的「知識原子」（可重用）
- `core/knowledge/profiles/*` = user 組的「報表類型配方」
- `core/learned/learned-rules.json` = 系統自動學的「修正規則」
- 執行時優先級（後蓋前）：
  1. `_defaults.yaml`
  2. **Stance resolver 產出**（audience + purpose + focus → modules + overrides）
  3. profile.extends 明列的 modules（覆寫 stance 產出）
  4. profile.overrides（最細微調）
  5. learned-rules（可針對 profile / audience / purpose 範圍）
  6. run-time CLI flag（debug 用，留後門）

---

## Scope

### In scope
1. 建 `core/knowledge/{modules,profiles,schema}/` 目錄結構 + `_defaults.yaml`
2. 建至少 1 個可跑的 profile（`brand-social.yaml`，對齊目前系統行為）+ 對應 modules
3. 寫 `core/knowledge-loader.js`：載入 defaults → modules → profile.overrides → learned → 驗證 → 冷凍 snapshot
4. 寫 `core/pipeline-runner.js`：讀 profile.pipeline 順序跑 engines（engines 不再自己互相 hard-require，由 profile 決定 pipeline）
5. 改造這 6 個 engine 改用 loader：
   - `comment-feedback/intent-classifier.js`
   - `analysis/analyzers/insight-generator.js`
   - `analysis/analyzers/anomaly-detector.js`
   - `analysis/analysis-engine.js`
   - `script-planner/script-planner.js` + `scorers/signal-scorer.js`
   - `purpose-binder/signal-scorer.js`
4. 加 ESLint rule：`core/engines/**/*.js` 禁中文字串字面量、禁裸數字門檻（允許 0 / 1 / -1）
5. 寫 `openspec/specs/knowledge-layer/spec.md`
6. 更新 README / FILELIST / CHANGELOG

### Out of scope
- 改 engine 演算法本身
- 改 schemas/、learned-rules.json 機制
- UI 讓 user 編輯 yaml（先用檔案編輯器，v2 再做）
- 一次建齊所有報表類型 profile（本計畫只交付 `brand-social` 當樣板，其他類型 user 之後自己建）
- 跨 profile 的 learned-rules 智能推薦（v2）

---

## Tasks

### Phase 1 — Knowledge 檔案骨架
- [ ] 盤點所有 engine，列出「每個裸數字 / 中文字串 / 關鍵字陣列」→ `openspec/plans/2026-04-20-audit-inventory.md`
- [ ] 設計 module schema（thresholds / keywords / copy / time-windows / dimensions / density 六類）
- [ ] 設計 stance schema（audience / purpose / focus 三類）
- [ ] 設計 stance-map schema（lookup + merge_strategy）
- [ ] 設計 profile schema（stance? / extends? / overrides / pipeline）
- [ ] 寫 `_defaults.yaml`（所有 key 的保底預設，對齊現有 code 值）
- [ ] 建第一批 modules（thresholds/growth-conservative, keywords/intent-base, keywords/domain-luxury, copy/tone-professional, copy/tone-executive-brief, copy/roles-standard, time-windows/standard, dimensions/social-14d, dimensions/competitive-7d, density/sparse, density/standard）
- [ ] 建第一批 stances（audiences/ceo, audiences/analyst, purposes/decision-support, purposes/diagnosis, focuses/competitive, focuses/brand-health）
- [ ] 寫 `stance-map.yaml`（audience/purpose/focus → modules + overrides 的查表）
- [ ] 建兩個樣板 profile：
  - `brand-social.yaml`（直接指定 modules，對齊現有行為）
  - `brand-social-for-ceo.yaml`（用 stance，示範兩段式解析）
- [ ] 初始值 = 目前 code 裡的值（`brand-social` 行為不變，可 regression）

### Phase 2 — Resolvers + Loader + Pipeline Runner
- [ ] `core/resolvers/stance-resolver.js`：讀 profile.stance + stance-map.yaml → 產 modules 組合 + overrides（純 lookup / merge，零判斷）
- [ ] `core/resolvers/module-resolver.js`：合併 `_defaults` → stance 產出 → profile.extends → profile.overrides
- [ ] `core/resolvers/learned-resolver.js`：套 learned-rules overlay（可 scope 到 audience/purpose）
- [ ] `core/knowledge-loader.js`：串接三個 resolver → frozen snapshot + resolution trace（每個 key 來自哪層）
- [ ] Schema 驗證（stance / module / profile / stance-map 各自驗；違反 throw）
- [ ] 禁 fallback：`snapshot.get('x.y.z')` 找不到直接 throw
- [ ] `core/pipeline-runner.js`：依 profile.pipeline 順序跑 engines，注入 snapshot
- [ ] Unit test：缺 key throw、schema 違反 throw、overlay 順序正確、snapshot 不可變、stance 查表命中、merge strategy 正確（union / last-wins / deep-merge）

### Phase 3 — Engine 改造（每個 engine 一個 commit，跑 regression）
- [ ] intent-classifier
- [ ] insight-generator
- [ ] anomaly-detector
- [ ] analysis-engine（時間窗 + 文案）
- [ ] script-planner + signal-scorer
- [ ] purpose-binder signal-scorer
- [ ] 每個 engine 改完跑現有 runs/ 的黃金輸入，diff 產出確認一致

### Phase 4 — 防回歸
- [ ] ESLint custom rule：禁中文字面量 / 禁裸數字（engines/ 範圍）
- [ ] CI hook：yaml schema 驗證必過才能 merge
- [ ] 寫 `openspec/specs/knowledge-layer/spec.md`（purpose / requirements / scenarios）

### Phase 4.5 — Run Context（外部素材 / 參考資料）
Pipeline 執行時 user 可能丟進額外素材：競品報告 PDF、訪談逐字稿、Google 文件、網站網址、手寫筆記、歷史報告、第三方數據 csv…
這些**不是 knowledge（不通用、不跨 run）**，也**不是 data（不是被分析的主體數據）**，需要獨立第三類存放。

```
runs/<run-id>/
├── inputs/              # 被分析的主體數據（已經有）
├── context/             # 新增：本次 run 的外部素材 / 參考資料
│   ├── manifest.yaml    # 登記每份素材：類型、來源、用途、可信度、引用方式
│   ├── documents/       # PDF / docx / md / txt
│   ├── data/            # csv / json / xlsx（輔助數據，非主體）
│   ├── urls/            # 網址清單 + 抓取快照（避免連線變動）
│   └── notes/           # user 手寫補充
├── temp/                # 本次 run 的暫存 / cache（pipeline 結束可清）
│   ├── cache/           # 可重用的快取（url 抓取、LLM 回應、渲染結果）
│   ├── scratch/         # 一次性中繼檔（解壓、轉檔、分段處理）
│   └── .gitignore       # 整個 temp/ 不進 git
├── outputs/             # 結構化產出
│   ├── manifest.yaml    # 登記每份產出：類型、位置、狀態、連結、版本
│   ├── files/           # 本地產出檔（pptx / pdf / docx / png / html）
│   ├── links/           # 線上產出連結（gslides / gdocs / notion / figma / canva…）
│   │   └── *.json       # 每條連結一份 metadata（url / owner / perms / exported_at）
│   └── intermediate/    # 中間產物（data.json / narrative.json / script.json 等）
└── logs/                # 本次 run 的執行紀錄（版控、debug、審計）
    ├── run-meta.json    # 誰跑的、何時、profile、stance、git sha、versions、duration、status、rerun_of、is_final
    ├── resolution-trace.json  # knowledge 解析每個 key 來自哪層
    ├── context-trace.json     # 哪些洞察引用了哪些 context_id
    ├── engine-log.ndjson      # 每個 engine 的 step log（start/end/status/metrics）
    ├── errors.ndjson          # 錯誤與警告（含 stack）
    └── events.ndjson          # 關鍵事件（cache hit/miss、retry、fallback、LLM call）
```

**專案根也放一份跨 run index（便於版本管理）：**

```
logs/                         # 專案級跨 run index（進 git，除了 events 明細）
├── index.ndjson              # 每行一筆 run：run_id / timestamp / profile / status / key_metrics
├── versions.ndjson            # knowledge/learned/engines 的版本變動紀錄
└── README.md                 # 如何查 log、如何 diff 兩次 run
```

**manifest.yaml 範例**：

```yaml
context_items:
  - id: ctx-001
    type: document
    path: documents/competitor-q1-report.pdf
    source: user_upload
    purpose: competitive-benchmark   # 給哪類分析用
    trust: high                      # high / medium / low
    cite_as: "對手 Q1 財報"
    scope: [competitive-focus]       # 哪些 focus/stance 會用到
  - id: ctx-002
    type: url
    url: https://example.com/trend-report
    snapshot: urls/ctx-002.html      # 抓取當下快照
    fetched_at: 2026-04-20T10:30:00+08:00
    purpose: market-context
    trust: medium
  - id: ctx-003
    type: note
    path: notes/client-briefing.md
    purpose: requirements-alignment
    trust: high
    sensitive: true                  # 不得寫入報告引用，只供內部推理
```

- [ ] 設計 `runs/<id>/context/` 結構與 `manifest.yaml` schema
- [ ] 設計 `runs/<id>/outputs/` 結構與 `manifest.yaml` schema（files / links / intermediate / logs 四類）
- [ ] 寫 `core/output-registry.js`：engine 產出時登記到 manifest（檔案路徑 or URL + metadata）
- [ ] 線上連結 metadata 必含：`platform`（gslides/gdocs/notion…）、`url`、`title`、`created_at`、`owner`、`permissions`、`exported_from_local_file?`（若有本地版本對照）
- [ ] 支援產出類型：
  - [ ] 本地檔（pptx / pdf / docx / md / html / png）
  - [ ] 線上連結（gslides / gdocs / gsheets / notion / figma / canva）
  - [ ] 中間產物（data.json / narrative.json / script.json / audit.json）
- [ ] `ls runs/<id>/outputs/manifest.yaml` 一眼看到本次所有產出清單與位置（不管本地或雲端）
- [ ] 設計 `runs/<id>/logs/` 結構 + `run-meta.json` schema（含 git sha / profile / stance / knowledge versions / engine versions / duration / status / exit_code）
- [ ] 設計專案根 `logs/index.ndjson` + `versions.ndjson` schema
- [ ] 寫 `core/run-logger.js`：統一 logger，engines 不直接 `console.log` 到檔，全走 logger（分級 debug/info/warn/error + 結構化欄位）
- [ ] Pipeline 結束時：
  - 寫完整 `run-meta.json`（包含所有關鍵 metric 與狀態）
  - Append 一行到專案 `logs/index.ndjson`（供日後 `grep` / diff）
  - 若 knowledge/learned 有異動，寫 `logs/versions.ndjson`
- [ ] `core/run-diff.js`（CLI 工具）：`node run-diff <run-a> <run-b>` → 對比兩次 run 的 knowledge snapshot、context、outputs、key metrics
- [ ] 敏感資訊遮罩：logger 內建 email / token / api-key 遮罩規則（寫在 `_defaults.yaml`）

### Rerun / Lineage / Lifecycle
- [ ] 設計 `run-meta.json` 新增欄位：
  - `rerun_of: <parent_run_id | null>` — 血緣鏈
  - `rerun_mode: same | refresh-knowledge | refresh-data | null` — 重跑語意
  - `is_final: boolean` — user 採用的版本標記（預設 false，user 手動標 true）
  - `parent_chain: [...]` — 自動計算完整血緣（a3f2 → b7e1 → c9d4）
- [ ] CLI：`pipeline rerun <run-id> [--same|--refresh-knowledge|--refresh-data]`
  - 預設 `--refresh-knowledge`（最常見情境）
  - `--same`：鎖同一 git sha + 同一 inputs/context，完全重現用
  - `--refresh-knowledge`：最新 knowledge + 舊 inputs/context
  - `--refresh-data`：最新 knowledge + 重抓 inputs，context 保留
- [ ] 新 run 的 `inputs/` `context/` 預設用 symlink 指向 parent（省空間），`--refresh-data` 才實體重抓
- [ ] CLI：`pipeline mark-final <run-id>` → 把 `is_final: true` 寫入 run-meta
- [ ] CLI：`pipeline lineage <run-id>` → 顯示完整血緣鏈與每版差異
- [ ] 生命週期清理 `pipeline runs-cleanup`：
  - `--keep-final` 永遠保留 `is_final: true` 的 run
  - `--archive-old <days>`：N 天前的非 final run → 保留 `logs/` + `outputs/manifest.yaml`（連結不斷），刪 `temp/` 和 `outputs/files/` 大檔
  - `--dry-run` 先預覽
- [ ] 設計 `runs/<id>/temp/` 結構（cache / scratch）+ `.gitignore`
- [ ] 寫 `core/temp-manager.js`：統一配發暫存路徑給 engines（engines 不自己 `mkdtemp`，避免散落 /tmp）
- [ ] Pipeline 結束時自動清理策略：
  - 預設：成功 → 清 scratch、保留 cache（跨 run 可重用）
  - `--keep-temp` flag：失敗或 debug 時保留全部 temp 供檢查
  - `--clean-all` flag：連 cache 也清
- [ ] Cache 有 TTL（url snapshot 7 天、LLM 回應 30 天，寫在 `_defaults.yaml`）
- [ ] 所有 engine 禁止寫 `/tmp` 或專案根目錄，只能透過 `tempManager.getPath(scope)` 拿路徑
- [ ] 寫 `core/context-loader.js`：載入 manifest、依 purpose/scope/trust 過濾、提供 engines 查詢 API
- [ ] Context 注入 pipeline：snapshot 旁掛 `runContext`，engines 可選擇性讀取（不強制）
- [ ] 支援的素材類型與讀取方式：
  - [ ] document（PDF / docx / md / txt → 純文字 + 重要段落 quote）
  - [ ] data（csv / json / xlsx → 結構化輔助數據）
  - [ ] url（抓取 + 快照存檔，避免後續連線變動）
  - [ ] note（md / txt）
- [ ] Context 使用 trace：報告產出時標註哪些洞察引用了哪些 context_id（可追溯、可審計）
- [ ] 敏感素材（`sensitive: true`）不得出現在最終報告引文，只供推理

**SoC 定位：**
- L2 Knowledge = 通用、跨 run 的知識（門檻 / 關鍵字 / 文案）
- **L2.5 Run Context = 本次 run 特有的外部素材（本 Phase 新增）**
- L1 Learned = 系統學到的修正規則
- L0 Run Inputs = 被分析的主體數據

Engines 讀法：`ctx.getByPurpose('competitive-benchmark', { minTrust: 'medium' })` → 查 manifest → 拿檔案或抓取結果。Engines 不直接讀檔案路徑。

### Phase 5 — 文件 & 收尾
- [ ] README 新增「如何調參數」章節（給 user 看，不提 .js）
- [ ] FILELIST 補 core/knowledge/*
- [ ] CHANGELOG
- [ ] 跑品管三步驟：verification-before-completion → requesting-code-review → （收到回饋）receiving-code-review

---

## 驗收標準

### SoC 邊界驗收
0. **L3 不依賴 L2 檔案路徑**：engines/ 內 `grep -r "knowledge/"` 零命中（只能透過 loader API）
0. **L3 無裸數字門檻**：ESLint rule 通過
0. **L2 無 `.js`**：`core/knowledge/` 內只有 yaml / json
0. **L1 只由 self-learning engine 寫入**：PR diff 若手改 learned-rules.json 會被 CI 擋

### 行為驗收
1. `grep -r '[\u4e00-\u9fa5]' core/engines/` 零命中（中文全搬走）
2. 改 `modules/thresholds/growth-conservative.yaml` 的 `growth_pct: 10` → `5`，不動 .js，re-run 洞察數量增加
3. 改 `modules/keywords/intent-base.yaml` 新增 intent `reorder`，不動 .js，intent-classifier 能命中
4. 任何 yaml 故意寫壞，loader 啟動就 throw（不靜默跑）
5. 現有 runs/ 黃金輸入 regression 通過（brand-social profile 維持舊行為）

### 模組化驗收（關鍵）
6. **新增一種報表類型 = 純 yaml 工作**：建 `profiles/competitive.yaml`（引用 `dimensions/competitive-7d` + 既有 modules），pipeline 能跑，不改任何 .js
7. **模組可替換**：把 profile 的 `thresholds: growth-conservative` 換成 `growth-sensitive`，re-run 行為立刻變敏感
8. **Profile 覆寫不污染模組**：同一份 `growth-conservative` 被兩個 profile 引用，各自 overrides 不互相影響
9. **Pipeline 可配置**：某 profile 省略 `anomaly-detector`，該 engine 當次 run 不執行，不報錯
10. **Stance 解析正確**：audience=ceo + purpose=decision-support 自動套用 `copy=tone-executive-brief` + `density=sparse` + `insights.max_count=3`，不需手動指定
11. **Resolution trace 可追溯**：snapshot 附帶 trace，能看到每個 key 來自哪一層（default / stance / module / override / learned）

### Run Context 驗收
12. **Context 隔離**：`runs/<id>/context/` 的素材不會被寫入 `core/knowledge/`，不跨 run 污染
13. **Purpose 過濾**：`ctx.getByPurpose('competitive-benchmark')` 只回傳符合 purpose 的素材
14. **Trust 過濾**：engines 可指定 minTrust，低可信度素材不進入洞察引用
15. **敏感素材隔離**：`sensitive: true` 的素材內容不出現在最終報告，但可影響推理
16. **URL 快照**：`type: url` 的素材抓取當下存快照，後續連線變動不影響 re-run 結果
17. **Context trace**：報告中引用外部素材的洞察標註 context_id，可審計來源

### Outputs 驗收
18. **本地與雲端統一登記**：pptx 檔和 gslides 連結都出現在 `outputs/manifest.yaml`，格式一致（只差 `type: file` vs `type: link`）
19. **連結永續存放**：pipeline 跑完後，gslides / gdocs URL 存在 `outputs/links/*.json`，包含 url / owner / permissions / created_at
20. **可重新開啟**：從 `outputs/manifest.yaml` 讀出連結即可重新打開線上產出，不需回查 pipeline log
21. **對照本地與雲端**：若 pptx 被上傳成 gslides，link metadata 有 `exported_from_local_file` 指回本地檔
22. **Trace 完整**：`outputs/logs/` 含 resolution trace（knowledge 解析）+ context trace（引用了哪些素材）+ engine log，單一 run 可完整重現與審計

### Temp 驗收
23. **暫存集中**：engines 不寫 `/tmp` 或專案根目錄，全部進 `runs/<id>/temp/`（grep 檢查：engines/ 無 `os.tmpdir` / `/tmp/` 字面量）
24. **自動清理**：pipeline 成功結束，`temp/scratch/` 被清空，`temp/cache/` 保留
25. **Cache 可重用**：同一 URL 在 7 天內第二次 run 直接從 `temp/cache/` 讀，不重新抓
26. **Cache TTL**：過期的 cache 自動略過（不讀舊資料），重新抓後更新
27. **Debug 保留**：`--keep-temp` 時，失敗 run 的 temp 完整保留，可檢查中繼產物
28. **Git 隔離**：`temp/` 進 `.gitignore`，不會意外 commit

### Logs 驗收
29. **每次 run 有獨立 logs**：`runs/<id>/logs/run-meta.json` 含 git sha / profile / stance / knowledge version / engine version / duration / status
30. **engines 不直接寫檔**：grep 檢查 engines/ 無 `fs.appendFileSync` 到非 logger 路徑
31. **跨 run 可查**：`logs/index.ndjson` 一行一 run，`grep profile=brand-social-for-ceo` 即可列出所有同 profile 的 run
32. **版本追溯**：knowledge / learned 變動寫入 `logs/versions.ndjson`，可配合 git 追「某報告用的是哪版 knowledge」
33. **可 diff**：`run-diff <a> <b>` 輸出 knowledge / context / key metrics 的差異
34. **敏感遮罩**：logger 輸出中的 email / token / api-key 自動變 `***`

### Rerun / Lineage 驗收
35. **每次 run 一個版本**：同一客戶同一 profile 跑 10 次 → 10 個 run 目錄，全部可獨立開啟
36. **Rerun 不覆蓋**：`pipeline rerun <id>` 產生新 run 目錄，舊版完整保留
37. **血緣正確**：`pipeline lineage <id>` 顯示完整鏈 a3f2 → b7e1 → c9d4，每版能看 knowledge / inputs / outputs 差異
38. **Rerun mode 正確**：`--same` 鎖住同 git sha + 同 inputs；`--refresh-knowledge` 換最新 knowledge 但 inputs 不動；`--refresh-data` 重抓 inputs
39. **Symlink 省空間**：新 rerun 預設 inputs/context 是 symlink 指向 parent，`du` 驗證空間沒翻倍
40. **is_final 標記**：`pipeline mark-final <id>` 後，`runs-cleanup --keep-final` 永不刪該 run
41. **Archive 不斷連結**：30 天前非 final run 被 archive 後，`outputs/manifest.yaml` 和 gslides 連結仍可開啟（只是本地大檔清掉）

---

## Risks

- **Regression：** 搬動常數時打錯字 → 靠 Phase 3 每 engine 獨立 diff runs/ 產出擋
- **Schema 過嚴：** user 改 yaml 動不動就 throw → schema 只驗型別與必填，不驗「合理範圍」
- **learned-rules 衝突：** baseline vs overrides 合併順序 → 明確定義 loader API，寫測試

---

## 後續（不在本 plan）

- v2：UI 讓 user 編輯 yaml（web form + schema 自動生成表單）
- v2：多品牌 profile（`core/knowledge/profiles/{lv,chanel,...}/`）
- v2：把 learned-rules 的學習範圍擴大到「參數自動調整」（學到最近 10 份報告 growth 門檻該調 8% 就自動提案）
