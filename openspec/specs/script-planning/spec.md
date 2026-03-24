# Script Planning — 腳本企劃

## Input / Output Contract

### Input
- `narrative.json`：敘事內容（narrative_blocks、executive_summary、story_arc）
- `analysis.json`：原始分析數據（表格數據、KPI 數字）
- Schema preset（full-13 / compact-8 / executive-5 / mini-3）

### Output → `script.json`
```json
{
  "meta": { "schema": "full-13|compact-8|executive-5|mini-3", "total_pages": 13, "estimated_minutes": 25, "generated_at": "ISO8601" },
  "pages": [
    {
      "page_id": "string",
      "page_number": 1,
      "title": "string",
      "background": "dark|light",
      "core_message": "string（≤30字）",
      "elements": [
        {
          "type": "table|kpi_cards|insight|text|chart_placeholder",
          "position": { "x": 0.5, "y": 1.8, "w": 9, "h": 3.2 },
          "data": {}
        }
      ],
      "speaker_note": "string（口語版講稿，可選）",
      "estimated_seconds": 120
    }
  ]
}
```

### 下游消費者
- §8 視覺設計：讀取 pages 結構，決定 theme 細節
- §9 生產中心：engine.js 直接讀取 script.json 作為輸入

## Purpose

根據訪談、分析、目的綑綁、敘事包裝的結果，整理並制定出最佳提案策略的腳本。決定報告的章節結構、每章的重點、故事線的起承轉合、深度和長度。這是從「散裝洞察」到「完整提案故事」的關鍵轉換步驟。

---

## Requirements

### Requirement: 腳本結構規劃

AI MUST 根據 schema 預設或訪談結果選定腳本結構。

#### Scenario: 完整版結構 full-13
- **GIVEN** interview.json 的 `style.page_count` 為 13 或 `style.depth` 為「完整版」
- **WHEN** AI 選定 schema
- **THEN** 使用 full-13 結構，包含 13 頁：
  1. 封面
  2. 執行摘要
  3. 社群影響力總覽
  4. 聲量高峰事件對應
  5. 語系分析
  6. 平台分布
  7. KOL 分析
  8. 好感度分析
  9. 搜尋意圖分析
  10. 月份分布與季節策略
  11. 品牌 × 客戶場域合作機會
  12. 數據品質聲明
  13. 可執行行動建議矩陣

#### Scenario: 精簡版結構 compact-8
- **GIVEN** interview.json 的 `style.page_count` 為 8 或 `style.depth` 為「精簡版」
- **WHEN** AI 選定 schema
- **THEN** 使用 compact-8 結構，保留頁面：1、2、3、4、9、10、11、13
- **AND** 被省略的洞察合併到相鄰頁面的 speaker_notes

#### Scenario: 高層摘要版 executive-5
- **GIVEN** interview.json 的 `client_bg` 標示為高階主管，或 `style.depth` 為「摘要版」
- **WHEN** AI 選定 schema
- **THEN** 使用 executive-5 結構：
  1. 封面
  2. 執行摘要（合併 KPI + 核心洞察 + 市場定位）
  3. 關鍵機會（合併高峰事件 + 合作機會）
  4. 行動建議矩陣
  5. 附錄（數據品質聲明 + 數據來源）

#### Scenario: 極簡版結構 mini-3
- **GIVEN** interview.json 的 `scenario` 為快速分享或訊息傳遞
- **WHEN** AI 選定 schema
- **THEN** 使用 mini-3 結構：
  1. 封面 + 一句話結論
  2. 三大發現（數據 + So What + 行動建議）
  3. 下一步
- **AND** 每頁資訊密度最高，適合轉成圖片在通訊軟體分享

#### Scenario: AI 自動推薦 schema
- **GIVEN** interview.json 未指定 `style.page_count` 或 `style.depth`
- **WHEN** AI 需要決定 schema
- **THEN** 根據以下規則自動推薦：
  - `scenario` = 當面提案 → full-13（有時間展開）
  - `scenario` = 傳給對方看 → compact-8（對方不會看太多頁）
  - `scenario` = 內部討論 → full-13（需要完整數據）
  - `client_bg` 含「老闆」「總經理」「CEO」→ executive-5
- **AND** 告知用戶推薦理由，用戶可覆寫

---

### Requirement: 章節排序策略

AI MUST 根據敘事包裝的故事弧線排列章節順序。

#### Scenario: 預設排序策略
- **GIVEN** schema 已選定
- **WHEN** AI 排列章節順序
- **THEN** 依循以下敘事節奏：
  1. **開場震撼**：用最驚人的數據或洞察抓住注意力
  2. **建立信任**：展示分析範圍和數據品質，建立專業感
  3. **展示機會**：從數據中導出客戶可抓住的機會
  4. **提出方案**：將機會與提案者資源連結
  5. **收尾行動**：具體告訴客戶下一步
- **AND** 每個階段可對應一或多頁 Slide

#### Scenario: 自訂排序
- **GIVEN** interview.json 的 `special` 欄位包含排序偏好（如「先講 KOL」）
- **WHEN** AI 排列章節順序
- **THEN** 根據用戶偏好調整順序，但 MUST 保留開場和收尾的固定位置
- **AND** 在 script.json 中記錄排序調整原因

#### Scenario: 數據品質聲明的位置
- **GIVEN** schema 包含數據品質聲明頁
- **WHEN** AI 決定數據品質聲明的位置
- **THEN** 放在行動建議之前（倒數第二頁）
- **AND** 目的：在客戶做決策前，先建立數據可信度

---

### Requirement: 每頁內容決策

AI MUST 為每頁明確指定核心訊息、數據元素、洞察搭配。

#### Scenario: 每頁核心訊息（Core Message）
- **GIVEN** 章節順序已確定
- **WHEN** AI 決定每頁內容
- **THEN** 每頁 MUST 有且僅有一個核心訊息（core_message）
- **AND** core_message 用一句話表達，最多 30 個中文字
- **AND** 核心訊息 MUST 直接回答「這頁要讓客戶記住什麼」

#### Scenario: 數據與洞察搭配
- **GIVEN** narrative.json 的 narrative_arc 已完成
- **WHEN** AI 指派每頁的元素
- **THEN** 每頁的 elements 陣列 MUST 包含：
  - 至少一個數據元素（table、chart_placeholder、kpi_card）
  - 至少一個洞察元素（insight_text）
  - 可選的 purpose_binding 連結
- **AND** 數據和洞察 MUST 相互佐證，不出現數據與結論矛盾的情況

#### Scenario: 避免資訊超載
- **GIVEN** 某頁被指派了超過 4 個元素
- **WHEN** AI 檢查每頁資訊密度
- **THEN** 自動拆分為兩頁，或將次要元素移到 speaker_notes
- **AND** 每頁最多 3-4 個視覺元素（封面和行動建議頁除外）

---

### Requirement: 深度控制

AI MUST 根據應用場景調整每頁的資訊深度。

#### Scenario: 當面提案深度
- **GIVEN** interview.json 的 `scenario` 為「當面提案」
- **WHEN** AI 撰寫每頁內容
- **THEN** Slide 文字精簡（每頁正文不超過 50 字）
- **AND** 詳細數據和分析邏輯放在 speaker_notes
- **AND** speaker_notes 包含口述建議（「這裡可以停頓，讓對方消化」）

#### Scenario: 傳閱文件深度
- **GIVEN** interview.json 的 `scenario` 為「傳給對方看」
- **WHEN** AI 撰寫每頁內容
- **THEN** Slide 文字完整（每頁正文 80-120 字）
- **AND** 包含足夠上下文讓讀者不需口頭說明就能理解
- **AND** speaker_notes 留空或僅放延伸閱讀連結

#### Scenario: 內部討論深度
- **GIVEN** interview.json 的 `scenario` 為「內部討論」
- **WHEN** AI 撰寫每頁內容
- **THEN** Slide 文字包含完整數據和方法論
- **AND** speaker_notes 包含「討論問題」引導團隊思考
- **AND** 可包含原始數據表格和計算過程

---

### Requirement: 長度控制

AI MUST 根據 schema 和時間限制控制每頁長度。

#### Scenario: 口述時間估算
- **GIVEN** script 全部頁面已規劃
- **WHEN** AI 估算口述時間
- **THEN** 每頁建議口述時間 2-3 分鐘
- **AND** 在 script.json 每頁寫入 `estimated_minutes` 欄位
- **AND** 全報告總時間：full-13 約 30 分鐘、compact-8 約 20 分鐘、executive-5 約 12 分鐘、mini-3 約 5 分鐘

#### Scenario: 時間超出限制
- **GIVEN** 用戶在 interview.json 的 `special` 指定簡報時間（如「只有 15 分鐘」）
- **WHEN** AI 計算總時間超出限制
- **THEN** 自動降級 schema（如 full-13 → compact-8）或刪減次要頁面
- **AND** 告知用戶：「根據 15 分鐘限制，建議使用 compact-8，省略 [X] 頁」

---

### Requirement: script.json 輸出格式

AI MUST 將腳本規劃結果以 script.json 存到 runs 資料夾。

#### Scenario: script.json 結構
- **GIVEN** 腳本企劃完成
- **WHEN** AI 寫入檔案
- **THEN** 存到 `~/.fontrends/runs/{brand}-{date}/script.json`
- **AND** JSON 結構如下：

```json
{
  "version": "1.0",
  "timestamp": "2026-03-19T15:00:00+08:00",
  "brand": "Louis Vuitton",
  "schema": "full-13",
  "schema_reason": "當面提案，有時間完整展開",
  "total_pages": 13,
  "estimated_total_minutes": 30,
  "pages": [
    {
      "pageId": "cover",
      "page_number": 1,
      "title": "Louis Vuitton 社群影響力分析",
      "narrative_stage": "attention",
      "core_message": "LV 台灣社群正處於 3 年來最佳時機",
      "elements": [
        { "type": "header", "content": "品牌名 + 標題" },
        { "type": "insight_text", "content": "資料範圍、製作單位" }
      ],
      "speaker_notes": "開場建議：先感謝對方時間，再用一句話帶出核心發現",
      "estimated_minutes": 2,
      "data_sources": ["interview.json"],
      "purpose_bindings": []
    }
  ]
}
```

#### Scenario: script.json 供 engine.js 讀取
- **GIVEN** script.json 已寫入
- **WHEN** engine.js 啟動報告產出
- **THEN** engine.js MUST 逐頁讀取 script.json 的 `pages` 陣列
- **AND** 根據每頁的 `elements` 陣列呼叫對應的渲染函數
- **AND** 不需要 engine.js 自行判斷內容和排版，全部由 script.json 指定

#### Scenario: script.json 讀取來源
- **GIVEN** AI 準備撰寫 script.json
- **WHEN** AI 組裝資料
- **THEN** MUST 讀取以下來源：
  - `interview.json`（schema 偏好、受眾、場景）
  - `analysis.json`（數據洞察和 purpose_bindings）
  - `narrative.json`（敘事弧線和故事化包裝結果）

---

### Requirement: 腳本品質驗證

AI MUST 在 script.json 完成後執行品質驗證。

#### Scenario: 結構完整性檢查
- **GIVEN** script.json 已產出
- **WHEN** AI 執行品質驗證
- **THEN** 逐一確認：
  1. 每頁都有 core_message 且不重複
  2. 每頁都有至少一個 element
  3. narrative_stage 覆蓋了完整的敘事弧線（不漏階段）
  4. 所有 narrative.json 中的 insight 都被分配到至少一頁
  5. purpose_bindings 被合理分散（不集中在某一頁）

#### Scenario: 敘事流暢度檢查
- **GIVEN** 品質驗證進行中
- **WHEN** AI 檢查頁面之間的銜接
- **THEN** 確認相鄰頁面的 narrative_stage 轉換合理
- **AND** 不出現「突然跳題」的情況（如從 KOL 分析直接跳到數據品質聲明）
- **AND** 如有跳躍，在 speaker_notes 補充過渡句
