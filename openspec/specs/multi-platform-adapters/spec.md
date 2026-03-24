# Multi-Platform Adapters — 多平台適配器

## Purpose

讓 FonTrends Analyst Skill 能在 Claude Code (Claude in Chrome)、Google Antigravity、OpenAI Codex App 三個 AI 平台上執行，每個平台有各自的瀏覽器操作方式和工具 API，但共用同一套 Core 知識庫。

---

## Requirements

### Requirement: 環境自動偵測

Skill 啟動時 MUST 自動偵測當前執行環境，決定可用的工具和操作模式。

#### Scenario: 偵測到 Claude in Chrome 環境
- **GIVEN** 當前環境存在 `mcp__Claude_in_Chrome__read_page` 等 MCP 工具
- **WHEN** Skill 執行環境偵測
- **THEN** 標記為「Claude in Chrome」模式
- **AND** 啟用完整瀏覽器操作（DOM 讀取、截圖、點擊、表單填寫）
- **AND** 使用 Claude in Chrome MCP 工具操作 Looker Studio

#### Scenario: 偵測到 Google Antigravity 環境
- **GIVEN** 當前環境存在 Antigravity 的 browser subagent 工具
- **WHEN** Skill 執行環境偵測
- **THEN** 標記為「Antigravity」模式
- **AND** 啟用完整瀏覽器操作（browser subagent 截圖、點擊、DOM 讀取）

#### Scenario: 偵測到 OpenAI Codex App 環境
- **GIVEN** 當前環境可使用 Playwright 或 Codex 內建瀏覽器功能
- **WHEN** Skill 執行環境偵測
- **THEN** 標記為「Codex」模式
- **AND** 啟用完整瀏覽器操作（透過 Playwright API）

#### Scenario: 偵測不到任何瀏覽器工具
- **GIVEN** 當前環境無瀏覽器操作能力（如 Claude Code CLI 無 Chrome）
- **WHEN** Skill 執行環境偵測
- **THEN** 標記為「上傳模式」
- **AND** 提示用戶：「當前環境無法自動操作瀏覽器，請手動提供 Looker Studio 截圖或匯出資料」

---

### Requirement: 瀏覽器操作抽象層

各平台的瀏覽器操作 MUST 透過統一的操作描述執行，Core 知識庫不包含平台特定指令。

#### Scenario: 開啟 Looker Studio URL
- **GIVEN** 用戶提供了一個 Looker Studio URL
- **WHEN** Skill 指示「開啟此 URL」
- **THEN** Claude in Chrome 使用 `mcp__Claude_in_Chrome__navigate`
- **AND** Antigravity 使用 browser subagent 的導航功能
- **AND** Codex 使用 Playwright 的 `page.goto()`

#### Scenario: 截取頁面畫面
- **GIVEN** 已開啟 Looker Studio 頁面
- **WHEN** Skill 指示「截取當前畫面」
- **THEN** Claude in Chrome 使用 `mcp__Claude_in_Chrome__computer` 截圖
- **AND** Antigravity 使用 browser subagent 截圖功能
- **AND** Codex 使用 Playwright 的 `page.screenshot()`

#### Scenario: 操作篩選器
- **GIVEN** 頁面上有品牌篩選器
- **WHEN** Skill 指示「選擇品牌：Louis Vuitton」
- **THEN** 各平台使用各自的點擊/輸入工具，依照 `looker-operations.md` 的步驟執行：
  1. 點擊篩選器
  2. 搜尋框輸入品牌名
  3. 勾選目標品牌
  4. 取消預設選項
  5. 關閉篩選器

#### Scenario: 讀取頁面文字
- **GIVEN** 已開啟 Looker Studio 頁面
- **WHEN** Skill 指示「讀取頁面文字內容」
- **THEN** Claude in Chrome 使用 `mcp__Claude_in_Chrome__get_page_text`
- **AND** Antigravity 使用 browser subagent 的 DOM 讀取
- **AND** Codex 使用 Playwright 的 `page.evaluate(() => document.body.innerText)`

---

### Requirement: 上傳模式降級

無瀏覽器操作能力時 MUST 提供手動上傳替代方案。

#### Scenario: 用戶提供截圖
- **GIVEN** Skill 處於上傳模式
- **WHEN** 用戶提供 Looker Studio 截圖（圖片檔）
- **THEN** 系統使用視覺分析讀取截圖中的數據
- **AND** 跳過 §1 Dashboard 導覽，直接進入 §2 數據提取

#### Scenario: 用戶提供匯出資料
- **GIVEN** Skill 處於上傳模式
- **WHEN** 用戶提供 CSV 或文字格式的資料
- **THEN** 系統解析資料並建立數據底稿
- **AND** 跳過 §1 和 §2，直接進入 §3 交叉驗證

#### Scenario: 用戶提供 Looker URL 但無瀏覽器
- **GIVEN** Skill 處於上傳模式
- **WHEN** 用戶只提供 URL，未提供截圖或資料
- **THEN** 系統提示：「請在瀏覽器中開啟此 URL，截圖每個頁面後提供給我」
- **AND** 列出需要截圖的頁面清單（社群總覽、趨勢、語系、平台、KOL、好感度、搜尋）

---

### Requirement: 終端執行能力

所有平台 MUST 支援終端指令執行，用於 Python/Node.js 工具和報告產出。

#### Scenario: 執行 Python 資料清洗工具
- **GIVEN** Core Repo 中有 `tools/data_cleaner.py`
- **WHEN** 分析流程需要資料清洗
- **THEN** 系統使用 Bash 工具執行 `python /tmp/fontrends-core/tools/data_cleaner.py`
- **AND** 所有平台（Claude Code、Antigravity、Codex）都能執行

#### Scenario: 執行 Node.js PPT 產出
- **GIVEN** 分析完成，需要產出 PPT
- **WHEN** Skill 進入報告產出階段
- **THEN** 系統使用 Bash 工具執行 `node ppt_script.js`
- **AND** 所有平台都能執行
