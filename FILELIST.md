# FonTrends Analyst — File List

> 品牌社群數據分析自動化系統。從數據擷取到報告產出的完整 pipeline。
> 更新日期：2026-04-20

## 目錄結構

```
fontrends-analyst/
├── core/                          # 核心引擎（Node.js）
│   ├── engines/                   # 各模組引擎
│   ├── schemas/                   # 報告頁面 schema + 驗證 schema
│   ├── templates/                 # 品牌色、簡報模板
│   ├── frameworks/                # 分析框架文件（14 維度、訪談、行動矩陣）
│   ├── operations/                # 操作 SOP（瀏覽器策略、資料擷取、Looker 操作）
│   ├── tools/                     # 輔助工具（PPT QA 等）
│   ├── docs/superpowers/          # 子模組 design plans + specs
│   ├── learned/formats/           # 輸出格式規則（gdocs/gslides）
│   ├── knowledge/                 # 🆕 L2 參數化知識層（yaml）
│   │   ├── _defaults.yaml
│   │   ├── stance-map.yaml
│   │   ├── stances/{audiences,purposes,focuses}/  # 對象/目的/著重面向
│   │   ├── modules/
│   │   │   ├── thresholds/         # standard + _statistical-constants(🔒) + 2 變體
│   │   │   ├── keywords/intent-base.yaml
│   │   │   ├── copy/               # tone-professional + tone-executive-brief
│   │   │   ├── time-windows/standard.yaml
│   │   │   ├── dimensions/         # canonical(📌) + metric-labels + script-pages + purpose-affinity + 2 變體
│   │   │   └── density/            # standard / sparse / deep
│   │   └── profiles/               # brand-social / brand-social-for-ceo
│   ├── knowledge-loader.js         # L2↔L3 唯一介面，產 frozen snapshot
│   ├── template-engine.js          # Mini template engine (${var} + {{#if}})
│   ├── tools/
│   │   ├── check-soc-boundary.js   # SoC 守門檢查
│   │   └── soc-boundary-baseline.json
│   └── version.json               # 核心版本資訊
├── openspec/                      # OpenSpec 規格文件
│   ├── specs/                     # 22 個模組規格（新增 knowledge-layer）
│   └── plans/                     # 實作計劃（新增 2026-04-20-knowledge-layer-extraction）
├── adapters/                      # 外部工具 adapter
├── runs -> ~/.fontrends/runs/     # Run 數據（symlink）
├── FILELIST.md                    # 本檔案
└── README.md
```

## 外部依賴路徑（不在本 repo 內）

| 路徑 | 說明 |
|------|------|
| `~/.claude/skills/` | Claude Code Skills（orchestrator, data-extraction-engine, narrative-packaging, presentation-generator, data-analysis-methodology） |
| `~/.claude/projects/.../memory/` | 專案記憶（SOP、方法論速查卡、踩坑記錄） |
| `~/.fontrends/runs/` | Run 數據（interview.json, data.json, narrative.json, screenshots/） |
| `~/.fontrends/google-token.json` | Google OAuth Token |
| `~/.fontrends/manager-record.json` | Manager 記過紀錄 |
| `~/SourceCode/Work/fontrends-analyst/core/` | 舊路徑（已搬到本 repo core/，但部分 script 仍引用此路徑） |

---

## core/engines/ — 核心引擎

### 主引擎
| 檔案 | 說明 |
|------|------|
| `engine.js` | Presentation Engine 主入口。讀取 JSON → 組裝頁面 → 分派 renderer |
| `helpers.js` | 共用工具（色碼轉換、OAuth、格式化、Drive 操作） |
| `validator.js` | JSON Schema 驗證（interview/narrative） |
| `correction-logger.js` | corrections.jsonl 寫入模組 |

### renderers/ — 報告產出器
| 檔案 | 說明 |
|------|------|
| `renderers/gdocs.js` | Google Docs 深度報告（6-pass 架構） |
| `renderers/gslides.js` | Google Slides 簡報（含附錄截圖） |
| `renderers/pptx.js` | PowerPoint 離線簡報 |

### analysis/ — 數據分析引擎
| 檔案 | 說明 |
|------|------|
| `analysis/analysis-engine.js` | 分析主引擎（6 維度 + 競品 fallback） |
| `analysis/analyzers/base-analyzer.js` | 基礎分析器 |
| `analysis/analyzers/self-comparator.js` | 自比分析（MoM/QoQ/YoY） |
| `analysis/analyzers/competitor-comparator.js` | 競品比較 |
| `analysis/analyzers/cross-analyzer.js` | 跨維度交叉分析 |
| `analysis/analyzers/anomaly-detector.js` | 異常值偵測 |
| `analysis/analyzers/insight-generator.js` | 洞察生成 |
| `analysis/utils/stats.js` | 統計工具 |

### purpose-binder/ — 目的綁定引擎
| 檔案 | 說明 |
|------|------|
| `purpose-binder/purpose-binder.js` | 主引擎（將分析結果綁定到提案目的） |
| `purpose-binder/affinity-table.js` | 親和度矩陣 |
| `purpose-binder/signal-scorer.js` | 訊號評分 |
| `purpose-binder/hook-generator.js` | Hook 生成 |

### script-planner/ — 腳本規劃引擎
| 檔案 | 說明 |
|------|------|
| `script-planner/script-planner.js` | 主引擎（決定報告章節排序+排除） |
| `script-planner/scorers/intent-scorer.js` | 意圖評分 |
| `script-planner/scorers/signal-scorer.js` | 訊號評分 |
| `script-planner/block-assigner.js` | 區塊分配 |
| `script-planner/headline-generator.js` | 標題生成 |

### comment-feedback/ — 回饋處理引擎
| 檔案 | 說明 |
|------|------|
| `comment-feedback/index.js` | 主入口 |
| `comment-feedback/url-parser.js` | URL 解析 |
| `comment-feedback/comment-reader.js` | 留言讀取 |
| `comment-feedback/intent-classifier.js` | 意圖分類 |
| `comment-feedback/comment-responder.js` | 回覆生成 |
| `comment-feedback/learning-capture.js` | 學習擷取 |
| `comment-feedback/safety.js` | 安全檢查 |
| `comment-feedback/modifiers/docs-modifier.js` | Docs 修改器 |
| `comment-feedback/modifiers/slides-modifier.js` | Slides 修改器 |

### 其他引擎
| 檔案 | 說明 |
|------|------|
| `report-audit/audit-engine.js` | 品質審核引擎 |
| `research/research-collector.js` | 研究蒐集（skeleton） |
| `self-learning/learning-engine.js` | 自我學習引擎 |

---

## core/schemas/ — Schema 定義

| 檔案 | 說明 |
|------|------|
| `full-13.json` | 完整 13 頁報告結構 |
| `compact-8.json` | 精簡 8 頁 |
| `executive-5.json` | 高階 5 頁 |
| `mini-3.json` | 極簡 3 頁 |
| `validation/interview.schema.json` | interview.json 驗證規則 |
| `validation/narrative.schema.json` | narrative.json 驗證規則 |

---

## core/templates/ — 模板

| 檔案 | 說明 |
|------|------|
| `brand-colors.json` | 品牌色碼對照（LV, Gucci, Chanel, Dior...） |
| `theme-default.json` | 預設主題（字型、間距、表格樣式） |
| `ppt-template.md` | PPT 模板說明 |
| `slides-template.md` | Slides 模板說明 |

---

## core/frameworks/ — 分析框架文件

| 檔案 | 說明 |
|------|------|
| `action-matrix.md` | 行動矩陣（洞察 → 行動對照） |
| `analysis-framework.md` | 14 維度品牌分析框架 |
| `interview-guide.md` | 需求訪談引導手冊 |

## core/operations/ — 操作 SOP

| 檔案 | 說明 |
|------|------|
| `browser-strategies.md` | 瀏覽器自動化策略（Claude in Chrome、Antigravity 等） |
| `data-extraction.md` | 資料擷取 SOP |
| `looker-operations.md` | Looker Studio 操作手冊 |

## core/tools/ — 輔助工具

| 檔案 | 說明 |
|------|------|
| `ppt-qa.sh` | PPT 產出品質檢查腳本 |

## core/docs/superpowers/ — 子模組 design docs

| 目錄 | 說明 |
|------|------|
| `plans/` | 4 份實作計畫（comment-feedback, data-analysis-agent, purpose-binder, script-planner） |
| `specs/` | 對應 4 份 design specs |

## core/learned/formats/ — 輸出格式規則

| 檔案 | 說明 |
|------|------|
| `gdocs.md` | Google Docs 輸出格式規則 |
| `gslides.md` | Google Slides 輸出格式規則 |

---

## __tests__/ — 測試（375 tests, 32 suites）

| 目錄 | 測試數 | 覆蓋 |
|------|--------|------|
| `engines/__tests__/` | 4 suites | helpers, validator, engine-builders, correction-logger |
| `analysis/__tests__/` | 8 suites | 分析引擎全模組 |
| `purpose-binder/__tests__/` | 4 suites | 目的綁定全模組 |
| `script-planner/__tests__/` | 5 suites | 腳本規劃全模組 |
| `comment-feedback/__tests__/` | 8 suites | 回饋處理全模組 |
| `report-audit/__tests__/` | 1 suite | 品質審核 |
| `research/__tests__/` | 1 suite | 研究蒐集 |
| `self-learning/__tests__/` | 1 suite | 自我學習 |

---

## openspec/specs/ — 規格文件（21 模組）

| 模組 | 說明 |
|------|------|
| `system-overview/` | 系統總覽 |
| `orchestrator/` | Pipeline 調度（Manager） |
| `requirements-interview/` | 需求訪談 |
| `research-collection/` | 研究蒐集 |
| `data-extraction-engine/` | 數據擷取引擎 |
| `data-analysis/` | 數據分析 |
| `purpose-binding/` | 目的綁定 |
| `script-planning/` | 腳本規劃 |
| `narrative-packaging/` | 敘事包裝 |
| `visual-design/` | 視覺設計 |
| `production-center/` | 報告產出 |
| `report-audit/` | 品質審核 |
| `report-generation/` | 報告生成 |
| `learning-feedback/` | 學習回饋 |
| `self-learning/` | 自我學習 |
| `quality-optimization/` | 品質優化 |
| `error-handling/` | 錯誤處理 |
| `brand-analysis-workflow/` | 品牌分析工作流 |
| `core-knowledge-base/` | 核心知識庫 |
| `multi-platform-adapters/` | 多平台 Adapter |
| `skill-loader/` | Skill 載入器 |

---

## core/learned/ — 學習紀錄（2026-04-08 升級，self-learning v3）

| 檔案 | 說明 |
|------|------|
| `corrections.jsonl` | 具體修正紀錄（含 ttl_days / scope / superseded_by） |
| `insights.jsonl` | 歸納性洞察（含 ttl_days / scope / superseded_by / confidence） |
| `skill-suggestions.jsonl` | Skill 修改建議（升級門檻：confidence=high 且跨品牌） |
| `audit-history.jsonl` | 稽核歷史（含 avoided_rate / regression_count / na_rate 趨勢指標） |
| `rule-hits.jsonl` | **[新增]** 規則命中追蹤（avoided / violated / na / regression） |
| `mapping.json` | **[新增]** 規則索引表（orchestrator pre-run O(1) 查詢） |
| `archived/` | **[新增]** TTL 過期紀錄封存，可人工召回 |

## Run 數據結構（~/.fontrends/runs/{brand}-{date}/）

```
{brand}-{date}/
├── interview.json          # 訪談需求
├── brand.json              # 品牌資訊+色碼
├── data.json               # 擷取數據（主品牌+競品）
├── data_partial.json       # 擷取中間檔（斷點續接用）
├── analysis.json           # 分析結果
├── purpose.json            # 目的綁定
├── script.json             # 腳本規劃
├── narrative.json          # 敘事內容
├── run-status.json         # Pipeline 執行狀態
├── checklist.json          # [新增] Pre-run checklist（orchestrator v2）
├── output-meta.json        # 產出 metadata
├── extraction-log.jsonl    # 擷取日誌
├── screenshots/            # Dashboard 截圖
│   ├── dashboard-social_overview.png
│   ├── dashboard-sentiment.png
│   └── ...
└── output/                 # 產出檔案
```
