# System Overview — 提案生成系統總覽

## Purpose

FonTrends Proposal System 是一個 AI 驅動的提案生成系統，透過數據洞察幫助提案者（例：台北 101 行銷團隊）提高提案成功率。系統能自動擷取社群數據、進行深度分析、結合提案者自身產品/服務、用故事化方式包裝、並產出多種格式的專業報告。

此文件為系統總覽，定義模組間的依賴關係、資料流、執行順序、以及架構原則。

---

## Architecture Principles

### 原則 1：前後端分離

系統核心邏輯 MUST 與 UI 層完全解耦。

#### Scenario: CLI 模式（現階段）
- **GIVEN** 用戶透過 Claude Code + Chrome 操作
- **WHEN** 執行提案流程
- **THEN** 所有模組透過 skill 指令觸發
- **AND** 輸入輸出都是 JSON 檔案（~/.fontrends/runs/）

#### Scenario: Web UI 模式（未來）
- **GIVEN** 用戶透過瀏覽器 Web UI 操作
- **WHEN** 執行提案流程
- **THEN** Web UI 呼叫核心模組的 API endpoint
- **AND** 核心模組的邏輯完全不變，只有 I/O adapter 不同

#### Scenario: LINE Bot 模式（未來）
- **GIVEN** 用戶透過 LINE Bot 操作
- **WHEN** 執行提案流程
- **THEN** LINE Bot 呼叫同樣的核心 API
- **AND** 訪談流程透過對話介面逐題進行

#### Scenario: App 模式（未來）
- **GIVEN** 用戶透過行動 App 操作
- **WHEN** 執行提案流程
- **THEN** App 呼叫核心 API
- **AND** 支援推播通知（例：「報告已產出」）

---

### 原則 2：零日架構（Zero-Day Architecture）

所有會持續累積、擴充、或變更的知識和技能 MUST 存在雲端，動態加載。

#### Scenario: 知識庫更新
- **GIVEN** 管理者在 GitHub Private Repo 更新了分析框架
- **WHEN** 用戶下次啟動系統
- **THEN** 系統自動 `git pull` 取得最新版本
- **AND** 無需重新安裝或手動更新

#### Scenario: 新增品牌色彩
- **GIVEN** 需要支援新品牌（例：Prada）
- **WHEN** 管理者在 `brand-colors.json` 新增 Prada 色彩定義
- **THEN** 下次分析 Prada 時自動套用
- **AND** 不需要修改任何程式碼

#### Scenario: Skill 版本升級
- **GIVEN** 系統發現 Core Repo 有新版本
- **WHEN** 版本號 Major 變更（breaking change）
- **THEN** 系統警告用戶並提示升級步驟
- **AND** 允許用戶暫時使用舊版（降級模式）

---

### 原則 3：模組獨立、介面標準化

每個模組 MUST 透過 JSON 檔案溝通，不共享記憶體狀態。

#### Scenario: 模組間資料傳遞
- **GIVEN** 模組 A 完成工作
- **WHEN** 模組 B 需要模組 A 的輸出
- **THEN** 模組 B 讀取 `~/.fontrends/runs/{brand}-{date}/` 下的 JSON 檔案
- **AND** 不依賴 AI context（context 可能爆掉或被清除）

#### Scenario: 模組可獨立重跑
- **GIVEN** 用戶對分析結果不滿意
- **WHEN** 用戶要求重跑「敘事包裝」
- **THEN** 系統只重跑 narrative-packaging 模組
- **AND** 讀取已存在的 data.json 和 analysis.json
- **AND** 不需要重跑 Dashboard 擷取

---

### 原則 4：Dashboard 不可預設

系統 MUST NOT 寫死任何 Dashboard 的結構、頁面、篩選器。

#### Scenario: 不同類型的 Dashboard
- **GIVEN** 用戶可能提供不同類型的 Looker Studio Dashboard
- **WHEN** 系統收到 Dashboard URL
- **THEN** 系統先執行「Dashboard 偵察」（§0.5），掃描：
  - 所有可用頁面名稱和數量
  - 篩選器類型和選項（品牌篩選、日期篩選、區域篩選等）
  - 可用的品牌/項目清單
  - 數據類型（社群指標、銷售數據、用戶行為等）
- **AND** 根據偵察結果動態調整擷取策略

#### Scenario: 社群分析型 Dashboard
- **GIVEN** Dashboard 包含影響力、發文、好感度等社群指標
- **WHEN** 偵察結果判斷為社群分析型
- **THEN** 使用社群分析擷取策略（KPI卡片、平台分佈、KOL排行等）

#### Scenario: 銷售報告型 Dashboard
- **GIVEN** Dashboard 包含營收、轉換率、客單價等銷售指標
- **WHEN** 偵察結果判斷為銷售報告型
- **THEN** 使用銷售分析擷取策略（趨勢圖、商品排行、通路分佈等）
- **AND** 分析框架自動切換（SWOT 聚焦營收面、行動建議聚焦銷售優化）

#### Scenario: 操作介面不同
- **GIVEN** 不同 Dashboard 的篩選器位置、操作方式可能不同
- **WHEN** 系統嘗試操作篩選器
- **THEN** 先用 `find` 工具定位篩選器元素
- **AND** 不依賴固定座標或 DOM 路徑
- **AND** 操作失敗時切換策略（座標 → ref → JS click）

#### Scenario: 未知 Dashboard 類型
- **GIVEN** Dashboard 不屬於已知類型
- **WHEN** 偵察無法分類
- **THEN** 進入「通用模式」：截圖每頁 → AI 視覺分析內容 → 動態決定擷取策略
- **AND** 告知用戶：「這是一個新類型的 Dashboard，我會盡力分析，但可能需要你的引導」

---

## Module Pipeline

### 執行順序

```
§1 需求訪談 ──→ interview.json
      │
§2 資料搜集 ──→ research.json     ← 可與 §3 並行
      │
§3 數據擷取 ──→ data.json         ← Looker Studio Dashboard
      │
§4 數據分析 ──→ analysis.json     ← 讀取 data + research
      │
§5 目的綑綁 ──→ analysis.json (enriched)  ← 讀取 analysis + interview
      │
§6 敘事包裝 ──→ narrative.json    ← 讀取 analysis + interview
      │
§7 腳本企劃 ──→ script.json       ← 讀取 narrative + analysis + schema
      │
§8 視覺設計 ──→ theme.json        ← 品牌色 + 預設風格
      │
§9 生產中心 ──→ 最終文件           ← 讀取 script + theme + brand
      │
§10 品質稽核 ──→ audit-report.json
      │
§11 品質優化 ──→ revisions.jsonl   ← 人工回饋 + AI 修正
      │
§12 自我學習 ──→ corrections.jsonl + insights.jsonl + skill-suggestions.jsonl
```

### 並行策略

#### Scenario: 資料搜集與數據擷取並行
- **GIVEN** 訪談完成
- **WHEN** 進入 §2 和 §3
- **THEN** 可以用 subagent 並行執行：
  - Agent A：上網搜集產業資訊 → research.json
  - Agent B：操作 Looker Studio 擷取數據 → data.json
- **AND** 兩者都完成後才進入 §4

#### Scenario: 視覺設計可提前
- **GIVEN** 訪談確認品牌和風格
- **WHEN** 品牌色和 schema 已確定
- **THEN** §8 視覺設計可以在 §4-§7 進行的同時提前準備 theme.json
- **AND** 不需要等內容完成

### Agent I/O Contract

每個 agent 的輸入與輸出必須明確定義，agent 之間透過 JSON 檔案銜接，不依賴 AI context。

| # | Agent | Input | Output | 存放檔案 |
|---|-------|-------|--------|---------|
| §1 | 需求訪談 | 使用者對話內容（提案需求、對象、背景） | 結構化需求摘要：客戶背景、需求、提案目標、使用場景、競爭對手、提案者資源 | `interview.json` |
| §2 | 資料搜集 | interview.json 的關鍵資訊（產業、品牌、時間範圍、關鍵議題） | 外部資料與事件清單：節慶檔期、社會事件、行銷活動、影響數據的因素 | `research.json` |
| §3 | 數據擷取 | interview.json（品牌名、競品、Dashboard URL） | Dashboard 各頁面原始數據 | `data.json` |
| §4 | 數據分析 | data.json + research.json | 洞察分析結果：趨勢變化、機會威脅、品牌表現、競品動態，附數據佐證 | `analysis.json` |
| §5 | 目的綑綁 | analysis.json + interview.json（提案者產品/服務/資源） | 策略整合內容：將提案者資源自然嵌入分析，形成導購導向策略敘述 | `analysis.json` (enriched) |
| §6 | 敘事包裝 | analysis.json (enriched) + interview.json（客戶背景/理解能力） | 故事化內容：客戶可理解的脈絡、問題與解法，閱讀中逐步被引導 | `narrative.json` |
| §7 | 腳本企劃 | narrative.json + analysis.json + schema preset | 提案腳本結構：章節安排、內容邏輯、敘事節奏、重點分布 | `script.json` |
| §8 | 視覺設計 | script.json + brand.json | 版面與視覺設計：針對指定格式優化的排版、配色、字型 | `theme.json` |
| §9 | 生產中心 | script.json + theme.json + brand.json + 指定輸出格式 | 實際產出檔案（pptx / gslides / gdocs / gsheets） | 最終文件 |
| §10 | 品質稽核 | 最終產出檔案 + data.json + interview.json | 檢查報告：內容正確性、深度、目標符合度、整體品質評估 | `audit-report.json` |
| §11 | 品質優化 | 人工回饋（評論/建議/修改項目） | 修正後內容 + 每項修改的回應說明 | `revisions.jsonl` |
| §12 | 自我學習 | 整個任務過程與所有 JSON 檔案 | 學習內容：品質提升、效率優化、知識補強，更新至知識庫 | `corrections.jsonl` + `insights.jsonl` + `skill-suggestions.jsonl` |

#### Scenario: Agent 間銜接驗證
- **GIVEN** Agent A 完成並輸出 JSON 檔案
- **WHEN** Agent B 啟動時讀取該 JSON
- **THEN** Agent B MUST 驗證 JSON schema 完整性
- **AND** 缺少必要欄位時 MUST 報錯並中止，不猜測資料

#### Scenario: Agent 可獨立重跑
- **GIVEN** 某 Agent 的輸出不滿意
- **WHEN** 用戶要求重跑該 Agent
- **THEN** 只需重跑該 Agent 和其下游 Agent
- **AND** 上游的 JSON 檔案保持不變

---

## Data Schema

### 所有 JSON 檔案位置

```
~/.fontrends/runs/{brand}-{date}/
├── interview.json      ← §1 訪談結果
├── research.json       ← §2 搜集結果
├── data.json           ← §3 Dashboard 擷取數據
├── analysis.json       ← §4+§5 分析結果（含目的綑綁）
├── narrative.json      ← §6 敘事包裝
├── script.json         ← §7 腳本企劃（engine 的直接輸入）
├── brand.json          ← 品牌色系+名稱+競品
├── audit-report.json   ← §10 稽核報告
└── revisions.jsonl     ← §11 修改歷史
```

### data.json Schema

```json
{
  "meta": {
    "brand": "string",
    "competitor": "string",
    "period": "string",
    "dashboard_url": "string",
    "extracted_at": "ISO8601"
  },
  "pages": {
    "social_overview": {},
    "language_distribution": {},
    "trend": { "monthly": [] },
    "platform": { "items": [] },
    "kol": { "items": [] },
    "sentiment": {},
    "search_intent": {},
    "competitor_data": {}
  }
}
```

數字存原始數值（`4248000`），顯示格式（`424.8萬`）由 engine 轉換。每頁獨立 key，擷取一頁寫一頁，中斷可續。

---

## Subagent Architecture

### Requirement: 模組可用 Subagent 派工

複雜模組 SHOULD 用 subagent 獨立執行，避免 context 過載。

#### Scenario: 並行派工
- **GIVEN** §2 和 §3 可以並行
- **WHEN** 主 agent 進入擷取階段
- **THEN** 派出兩個 subagent：
  - `research-agent`：執行 §2 資料搜集
  - `extraction-agent`：執行 §3 Dashboard 擷取
- **AND** 兩者透過 JSON 檔案溝通，不共享 context

#### Scenario: 品質稽核獨立 agent
- **GIVEN** 報告產出完成
- **WHEN** 進入 §10 品質稽核
- **THEN** 啟動獨立的稽核 subagent
- **AND** 稽核 agent 只收到：報告檔案、data.json、interview.json
- **AND** 不收到分析過程的推論鏈（避免確認偏誤）

#### Scenario: 自我學習獨立 agent
- **GIVEN** 任務完成（含品質優化）
- **WHEN** 進入 §12 自我學習
- **THEN** 啟動獨立的 learning agent
- **AND** 讀取整個 runs 資料夾的所有 JSON
- **AND** 歸納學習點，輸出 corrections + insights + skill-suggestions

---

## Technology Stack

| 層級 | 技術 | 說明 |
|------|------|------|
| AI Runtime | Claude Code / Antigravity / Codex | 多平台支援 |
| 瀏覽器操作 | Claude in Chrome MCP | Dashboard 擷取 |
| 報告產出 | pptxgenjs / googleapis | pptx + gslides + gdocs |
| 知識庫 | GitHub Private Repo | 零日架構，git pull 動態加載 |
| 數據存放 | ~/.fontrends/runs/ | 本地持久化，可回溯歷史 |
| OAuth | Google OAuth 2.0 | gslides/gdocs 授權 |
| 版本管理 | Semantic Versioning | Core Repo + Skill 版本同步 |

---

## Module Spec Index

| # | 模組 | Spec 位置 | I/O | 狀態 |
|---|------|----------|-----|------|
| — | **指揮官** | `orchestrator/spec.md` | run-status.json | ✅ |
| — | **錯誤處理** | `error-handling/spec.md` | error-log.jsonl | ✅ |
| §1 | 需求訪談 | `requirements-interview/spec.md` | → interview.json | ✅ |
| §2 | 資料搜集 | `research-collection/spec.md` | → research.json | ✅ |
| §3 | 數據擷取 | `brand-analysis-workflow/spec.md` | → data.json | ✅ |
| §4 | 數據分析 | `data-analysis/spec.md` | → analysis.json | ✅ |
| §5 | 目的綑綁 | `purpose-binding/spec.md` | → analysis.json (enriched) | ✅ |
| §6 | 敘事包裝 | `narrative-packaging/spec.md` | → narrative.json | ✅ |
| §7 | 腳本企劃 | `script-planning/spec.md` | → script.json | ✅ |
| §8 | 視覺設計 | `visual-design/spec.md` | → theme.json | ✅ |
| §9 | 生產中心 | `production-center/spec.md` | → 最終文件 | ✅ |
| §10 | 品質稽核 | `report-audit/spec.md` | → audit-report.json | ✅ |
| §11 | 品質優化 | `quality-optimization/spec.md` | → revisions.jsonl | ✅ |
| §12 | 自我學習 | `self-learning/spec.md` | → corrections/insights/skill-suggestions.jsonl | ✅ |
| — | 知識庫 | `core-knowledge-base/spec.md` | — | ✅ |
| — | Skill 載入 | `skill-loader/spec.md` | — | ✅ |
| — | 多平台 | `multi-platform-adapters/spec.md` | — | ✅ |
