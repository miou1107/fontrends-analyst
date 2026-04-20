# Core Knowledge Base — 核心知識庫

> **⚠️ 2026-04-20 分工更新：** 本 spec 管理「**文字型知識資產**」（framework / SOP / 模板 / 色彩），參數化的「**分析技巧 / 門檻 / 關鍵字 / 文案 / profile**」已獨立為 [knowledge-layer](../knowledge-layer/spec.md)。兩者互補：
> - **core-knowledge-base**（本 spec）: `frameworks/`、`operations/`、`templates/`、`tools/`
> - **knowledge-layer**（新）: `core/knowledge/{stances,modules,profiles,schema}/`、resolvers、pipeline runner、run context、outputs、logs、rerun / lineage

## Purpose

管理品牌分析所需的分析框架、操作 SOP、報告模板、品牌色彩定義等知識資產。存放在 GitHub Private Repo，由管理者維護更新，用戶端自動同步。

---

## Requirements

### Requirement: 知識庫目錄結構

Core Repo MUST 維持以下目錄結構，Skill Loader 依此路徑讀取。

#### Scenario: 標準目錄結構
- **GIVEN** Core Repo 初始化完成
- **WHEN** 檢視目錄結構
- **THEN** 包含以下目錄和檔案：
  - `version.json` — 版本號和更新日誌
  - `frameworks/` — 分析框架（interview-guide、analysis-framework、action-matrix）
  - `operations/` — 操作 SOP（looker-operations、data-extraction、browser-strategies）
  - `templates/` — 報告模板（ppt-template、slides-template、brand-colors.json）
  - `tools/` — Python/JS 工具腳本
  - `learned/` — 用戶學習回饋累積區

---

### Requirement: 版本管理

Core Repo MUST 使用語意化版本號管理更新。

#### Scenario: 版本號格式
- **GIVEN** `version.json` 存在
- **WHEN** 讀取版本資訊
- **THEN** 包含 `version`（語意化版本 X.Y.Z）、`updated`（ISO 日期）、`changelog`（更新說明）

#### Scenario: 重大更新（Major）
- **GIVEN** 管理者變更了分析框架結構（如維度從 14 個改為 16 個）
- **WHEN** 推送到 Core Repo
- **THEN** Major 版本號遞增（1.0.0 → 2.0.0）
- **AND** Skill Loader 檢測到版本不相容時警告用戶

#### Scenario: 功能更新（Minor）
- **GIVEN** 管理者新增品牌色彩定義或操作步驟優化
- **WHEN** 推送到 Core Repo
- **THEN** Minor 版本號遞增（1.0.0 → 1.1.0）

#### Scenario: 修正更新（Patch）
- **GIVEN** 管理者修正錯字、調整措辭
- **WHEN** 推送到 Core Repo
- **THEN** Patch 版本號遞增（1.0.0 → 1.0.1）

---

### Requirement: 分析框架內容

`frameworks/` 目錄 MUST 包含完整的品牌分析方法論。

#### Scenario: interview-guide.md — 分析前訪談
- **GIVEN** 分析流程啟動
- **WHEN** 系統讀取 `frameworks/interview-guide.md`
- **THEN** 內容包含 7 個標準訪談問題（Q1-Q7）
- **AND** 包含訪談後確認模板
- **AND** 每個問題附有「為何要問」的說明和「影響什麼」的對照

#### Scenario: analysis-framework.md — 14 維度分析框架
- **GIVEN** 數據提取完成
- **WHEN** 系統讀取 `frameworks/analysis-framework.md`
- **THEN** 內容包含 7 個核心維度（必做）和 7 個進階維度（選做）
- **AND** 每個維度有明確的資料來源和產出格式
- **AND** 包含數據品質四大警示機制（語系、異常、情緒、好感度）

#### Scenario: action-matrix.md — 行動建議框架
- **GIVEN** 分析洞察已產出
- **WHEN** 系統讀取 `frameworks/action-matrix.md`
- **THEN** 內容包含優先級定義（立即/中期/補位/需驗證）
- **AND** 包含必填格式（WHO / WHAT / WHEN / KPI / 對應洞察）
- **AND** 包含依客戶類型的 WHO 和 KPI 調整指引

---

### Requirement: 操作 SOP 內容

`operations/` 目錄 MUST 包含 Looker Studio 操作方法和資料提取策略。

#### Scenario: looker-operations.md — Looker Studio 操作 SOP
- **GIVEN** 需要從 Looker Studio 提取資料
- **WHEN** 系統讀取 `operations/looker-operations.md`
- **THEN** 內容包含：
  - Dashboard URL 結構說明
  - 標準分頁清單和對應數據
  - 篩選器操作正確步驟（搜尋+勾選+取消台北101，禁止使用「僅」按鈕）
  - 品牌名稱對照表（LV → louis、CHANEL → chanel）
  - 擴充功能斷線處理流程

#### Scenario: data-extraction.md — 資料提取策略
- **GIVEN** 已開啟 Looker Studio 頁面
- **WHEN** 系統讀取 `operations/data-extraction.md`
- **THEN** 內容包含：
  - KPI 卡片提取方式（截圖視覺讀取）
  - 圖表資料提取方式（截圖估算、hover tooltip）
  - 表格/排行提取方式（read_page、get_page_text）
  - 已知限制（SVG 渲染，querySelectorAll('table') 永遠失敗）
  - 資料記錄格式模板

---

### Requirement: 報告模板內容

`templates/` 目錄 MUST 包含報告產出的結構和樣式定義。

#### Scenario: ppt-template.md — PPT 結構與程式碼
- **GIVEN** 分析完成，進入報告產出
- **WHEN** 系統讀取 `templates/ppt-template.md`
- **THEN** 內容包含：
  - 標準 13 張 Slide 結構定義
  - pptxgenjs 色系定義程式碼
  - Header 樣式函數
  - 各 Slide 的 JavaScript 產出程式碼
  - 已知的 pptxgenjs 陷阱（shadow mutation、breakLine、hex 色碼、opacity）
  - QA 流程（生成 → 轉 PDF → 轉圖 → 視覺檢查）

#### Scenario: brand-colors.json — 品牌色彩定義
- **GIVEN** 需要產出特定品牌的報告
- **WHEN** 系統讀取 `templates/brand-colors.json`
- **THEN** 內容包含已定義品牌的色彩（primary、secondary、dark_bg、light_bg）
- **AND** 至少包含：Louis Vuitton、Chanel、Hermes、Coach、Pandora、中性專業
- **AND** 管理者可隨時新增品牌色彩定義

---

### Requirement: 工具腳本

`tools/` 目錄 MAY 包含輔助工具，用於資料處理和自動化。

#### Scenario: Python 工具可執行
- **GIVEN** Core Repo 中有 Python 工具腳本
- **WHEN** Skill 需要使用工具
- **THEN** 系統透過 Bash 執行 Python 腳本
- **AND** 工具的 dependencies 在腳本開頭有 `pip install` 指令或列在 `requirements.txt`

---

### Requirement: 學習回饋儲存

`learned/` 目錄用於累積用戶的修正回饋。

#### Scenario: 新增學習紀錄
- **GIVEN** 用戶完成報告修改並要求 AI「學起來」
- **WHEN** AI 整理出結構化的修正內容
- **THEN** 將修正內容以 JSONL 格式 append 到 `learned/corrections.jsonl`
- **AND** 每筆紀錄包含：日期、品牌、修正類型、原始內容、修正後內容、修正原因

#### Scenario: 讀取歷史學習紀錄
- **GIVEN** `learned/corrections.jsonl` 存在且有內容
- **WHEN** Skill 載入知識庫
- **THEN** 系統讀取歷史修正紀錄
- **AND** 將修正紀錄作為分析和產出的參考（避免重複相同錯誤）
