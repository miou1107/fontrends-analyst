# Visual Design — 視覺設計

## Input / Output Contract

### Input
- `script.json`：腳本結構（頁面數、元素類型和位置）
- `brand.json`：品牌色系

### Output → `theme.json`
```json
{
  "meta": { "brand": "string", "generated_at": "ISO8601" },
  "colors": {
    "primary": "hex", "secondary": "hex", "dark_bg": "hex", "light_bg": "hex",
    "accent": "hex", "text_on_dark": "hex", "text_on_light": "hex",
    "positive": "hex", "negative": "hex", "neutral_sent": "hex"
  },
  "typography": {
    "title": { "font": "string", "size": 24, "bold": true },
    "subtitle": { "font": "string", "size": 14, "bold": false },
    "body": { "font": "string", "size": 11 },
    "table_header": { "font": "string", "size": 10, "bold": true },
    "table_body": { "font": "string", "size": 9 },
    "note": { "font": "string", "size": 9, "italic": true }
  },
  "table": { "header_fill": "primary", "header_text": "text_on_dark", "row_alt_fill": "light_bg", "border_width": 0.5, "border_color": "lightGray", "row_height": 0.35 },
  "shapes": { "corner_radius": 0, "shadow": { "enabled": true, "blur": 3, "offset": 2, "opacity": 0.15 }, "title_underline": { "enabled": true, "color": "primary", "width": 2 } },
  "spacing": { "page_margin": 0.5, "element_gap": 0.3, "header_to_content": 0.6 }
}
```

### 下游消費者
- §9 生產中心：renderer 讀取 theme.json 決定所有視覺屬性

## Purpose

設計具有美感、高品質的排版和元素設計，讓產出物達到專業簡報公司的水準。根據不同產出格式（pptx, gslides, gdocs, gsheets 等）進行針對性的視覺優化和微調，避免跑版。此模組管理 theme.json 和格式專屬的渲染規則。

---

## Requirements

### Requirement: Theme 系統

AI MUST 透過 theme.json 統一管理所有視覺參數。

#### Scenario: theme.json 存放位置與載入
- **GIVEN** engine.js 啟動報告產出
- **WHEN** 需要讀取視覺參數
- **THEN** 從 `~/SourceCode/Work/fontrip-agentic-process-automation/Projects/fontrends-analyst/core/templates/theme.json` 載入
- **AND** 如果檔案不存在，使用內建預設值並提示用戶

#### Scenario: theme.json 結構
- **GIVEN** theme.json 需要初始化或更新
- **WHEN** AI 寫入 theme.json
- **THEN** JSON 結構 MUST 包含以下區段：

```json
{
  "version": "1.0",
  "typography": {
    "title": { "fontFace": "Noto Sans TC", "fontSize": 28, "bold": true, "color": "333333" },
    "subtitle": { "fontFace": "Noto Sans TC", "fontSize": 18, "bold": false, "color": "666666" },
    "body": { "fontFace": "Noto Sans TC", "fontSize": 12, "bold": false, "color": "333333" },
    "caption": { "fontFace": "Noto Sans TC", "fontSize": 9, "bold": false, "color": "999999" },
    "kpi_number": { "fontFace": "Noto Sans TC", "fontSize": 36, "bold": true, "color": "brand_primary" }
  },
  "table_styles": {
    "header_bg": "brand_primary",
    "header_font_color": "FFFFFF",
    "row_alt_bg": "F5F5F5",
    "border_color": "E0E0E0",
    "border_width": 0.5
  },
  "shapes": {
    "kpi_card": { "w": 2.2, "h": 1.5, "rectRadius": 0.1 },
    "insight_box": { "w": 4.5, "h": 1.0, "rectRadius": 0.05 }
  },
  "spacing": {
    "margin_top": 1.2,
    "margin_bottom": 0.5,
    "margin_left": 0.5,
    "margin_right": 0.5,
    "element_gap": 0.2
  },
  "color_mapping": {
    "brand_primary": "BFA06A",
    "brand_secondary": "1A1A1A",
    "dark_bg": "0D0D0D",
    "light_bg": "FAFAF8",
    "accent": "C4975A",
    "positive": "2E7D32",
    "negative": "C62828",
    "neutral": "757575"
  }
}
```

#### Scenario: 品牌色覆寫 theme.json
- **GIVEN** interview.json 已指定品牌
- **WHEN** AI 載入 theme.json
- **THEN** 從 `brand-colors.json` 讀取該品牌色系
- **AND** 覆寫 theme.json 的 `color_mapping` 中的 brand_primary、brand_secondary、dark_bg、light_bg
- **AND** 其他色值（positive、negative、neutral）維持不變

---

### Requirement: 品牌色優先原則

AI MUST 以品牌色為主視覺基調，排版固定為專業風。

#### Scenario: 品牌色決定主視覺
- **GIVEN** theme.json 的 color_mapping 已載入品牌色
- **WHEN** AI 渲染報告
- **THEN** 品牌色應用於：封面背景、表格 header、KPI 數字、重點文字底色、分隔線
- **AND** 排版結構（字體選擇、字級層次、間距規則）MUST 不受品牌色影響，保持固定的專業風格

#### Scenario: 深色品牌 vs 淺色品牌的自動適配
- **GIVEN** brand_primary 的亮度值 < 128（深色）
- **WHEN** AI 套用品牌色到背景
- **THEN** 文字自動切換為白色（FFFFFF）
- **AND** 反之，淺色品牌背景的文字用深色（333333）

#### Scenario: 品牌色對比度不足
- **GIVEN** brand_primary 與背景色的對比度 < 4.5:1（WCAG AA）
- **WHEN** AI 套用品牌色
- **THEN** 自動調整明暗度（加深或加亮 10-20%）直到對比度達標
- **AND** 在 theme.json 的 `adjustments` 欄位記錄調整內容

---

### Requirement: 元素類型定義

AI MUST 為每種元素類型定義完整的樣式規則和安全值。

#### Scenario: table 元素
- **GIVEN** script.json 中某頁的 elements 包含 type: table
- **WHEN** AI 渲染 table
- **THEN** 套用 theme.json 的 table_styles
- **AND** 安全值：最大欄數 6、最大行數 12、最小字體 8pt、最小列寬 1.0 inch
- **AND** 超過安全值時觸發降級策略

#### Scenario: kpi_card 元素
- **GIVEN** script.json 中某頁的 elements 包含 type: kpi_card
- **WHEN** AI 渲染 kpi_card
- **THEN** 結構：大數字（kpi_number style）+ 標籤（caption style）+ 趨勢箭頭
- **AND** 安全值：數字最多 7 個字元、標籤最多 10 個中文字、每行最多 4 張卡片

#### Scenario: insight_text 元素
- **GIVEN** script.json 中某頁的 elements 包含 type: insight_text
- **WHEN** AI 渲染 insight_text
- **THEN** 結構：左側色條（brand_primary、寬 4px）+ 右側文字段落
- **AND** 安全值：最多 3 行、每行最多 25 個中文字、字體不小於 11pt

#### Scenario: chart_placeholder 元素
- **GIVEN** script.json 中某頁的 elements 包含 type: chart_placeholder
- **WHEN** AI 渲染 chart_placeholder
- **THEN** 產出一個帶有虛線框和「[圖表名稱]」標籤的預留區塊
- **AND** 安全值：最小尺寸 3.0 x 2.5 inch、最大尺寸不超過頁面寬度的 80%

#### Scenario: header / footer / watermark 元素
- **GIVEN** 每頁都需要 header 和 footer
- **WHEN** AI 渲染頁面框架
- **THEN** header 包含品牌 logo 位置 + 頁面標題（靠左）+ 頁碼（靠右）
- **AND** footer 包含 disclaimer 文字（caption style）+ 製作單位
- **AND** watermark 為半透明品牌色對角文字，opacity 0.05

---

### Requirement: 格式適配

AI MUST 根據產出格式調整渲染參數，避免已知跑版問題。

#### Scenario: pptx（pptxgenjs）格式規則
- **GIVEN** 產出格式為 pptx
- **WHEN** AI 設定渲染參數
- **THEN** 遵守以下已知限制：
  | 項目 | 規則 |
  |------|------|
  | outline | MUST > 0（設為 0 會導致 PowerPoint 渲染異常） |
  | shadow 物件 | 每次用 `makeShadow()` 產生新物件，禁止共用 |
  | 換行 | 使用陣列格式 + `breakLine: true`，禁止 `\n` |
  | hex 色碼 | 不加 `#` 前綴（如 `"BFA06A"`） |
  | shadow opacity | 使用 `opacity` 屬性，不放進 hex 字串 |
  | row height | 手動指定，避免 auto 造成高度溢出 |

#### Scenario: gslides（Google Slides API）格式規則
- **GIVEN** 產出格式為 gslides
- **WHEN** AI 設定渲染參數
- **THEN** 遵守以下已知限制：
  | 項目 | 規則 |
  |------|------|
  | hex 色碼 | 使用 0-1 的 RGB float 值（如 `{ "red": 0.749, "green": 0.627, "blue": 0.416 }`） |
  | emoji | 不支援 emoji 字元，使用文字替代（如「趨勢上升」替代 📈） |
  | 表格 merge | Slides API 的 merge cell 行為與 pptxgenjs 不同，需單獨處理 |
  | 字體 | MUST 使用 Google Fonts 支援的字體 |

#### Scenario: gdocs（Google Docs API）格式規則
- **GIVEN** 產出格式為 gdocs
- **WHEN** AI 設定渲染參數
- **THEN** 遵守以下差異：
  | 項目 | 規則 |
  |------|------|
  | 排版 | 線性文件流，無絕對定位 |
  | 表格 | 支援但無 header 背景色自動設定 |
  | 圖表 | 以圖片插入，非動態元素 |
  | 分頁 | 使用 page break，非 Slide 切換 |

---

### Requirement: 響應式邏輯

AI MUST 在資料量超過安全值時自動降級，確保版面不爆。

#### Scenario: 表格行數超出安全值
- **GIVEN** table 資料行數 > 12
- **WHEN** AI 渲染 table
- **THEN** 降級策略依序：
  1. 嘗試縮小字體到 8pt
  2. 如仍超出，拆為兩頁（前 10 行 + 後續行）
  3. 在拆頁處加入「續上頁」標示

#### Scenario: KPI 卡片超出一行
- **GIVEN** kpi_card 數量 > 4
- **WHEN** AI 渲染 kpi_card 行
- **THEN** 降級策略依序：
  1. 縮小卡片尺寸（w: 2.2 → 1.8）
  2. 如仍超出，換行排列（4 + N 的雙行佈局）
  3. 如超過 8 張，拆頁

#### Scenario: 文字超出元素邊界
- **GIVEN** insight_text 或 speaker_notes 字數超過安全值
- **WHEN** AI 渲染文字元素
- **THEN** 降級策略依序：
  1. 縮小字體（不低於安全最小值）
  2. 截斷文字並加「…」，完整版移到 speaker_notes
  3. 如為 speaker_notes 本身超出，拆為分點條列

#### Scenario: 整頁元素過多
- **GIVEN** 某頁的 elements 數量 > 4（非封面和行動建議頁）
- **WHEN** AI 渲染整頁
- **THEN** 自動拆為兩頁
- **AND** 更新 script.json 的 pages 陣列和 total_pages
- **AND** 調整 pageId（如 `kol_analysis` → `kol_analysis_1` + `kol_analysis_2`）

---

### Requirement: 視覺品質檢查清單

AI MUST 在報告產出後執行視覺品質檢查。

#### Scenario: 文字不裁切檢查
- **GIVEN** 報告已渲染完成
- **WHEN** AI 執行視覺 QA
- **THEN** 檢查每個文字元素的內容是否被容器裁切
- **AND** 驗證方式：計算文字所需高度 vs 容器高度，如超出則標記為 issue

#### Scenario: 元素不重疊檢查
- **GIVEN** 報告已渲染完成
- **WHEN** AI 執行視覺 QA
- **THEN** 檢查每對相鄰元素的 bounding box 是否重疊
- **AND** 允許的重疊：header 與 watermark（watermark 為底層）
- **AND** 不允許的重疊：table 與 insight_text、kpi_card 之間、任何元素與 footer

#### Scenario: 色彩一致性檢查
- **GIVEN** 報告已渲染完成
- **WHEN** AI 執行視覺 QA
- **THEN** 檢查所有使用 brand_primary 的元素是否一致（未出現不同 hex 值）
- **AND** 檢查 positive/negative 色值是否正確對應到成長/衰退數據
- **AND** 檢查深色背景上的文字是否為白色、淺色背景上的文字是否為深色

#### Scenario: 品牌色正確套用檢查
- **GIVEN** 報告已渲染完成
- **WHEN** AI 執行視覺 QA
- **THEN** 確認以下位置都使用了品牌色：
  1. 封面背景或主色塊
  2. 表格 header 背景
  3. KPI 數字顏色
  4. 分隔線顏色
  5. insight_text 左側色條
- **AND** 確認未出現預設色系（深藍 + 金）與品牌色混用的情況

#### Scenario: QA 結果輸出
- **GIVEN** 視覺品質檢查完成
- **WHEN** AI 彙整結果
- **THEN** 將 QA 結果寫入 `~/.fontrends/runs/{brand}-{date}/visual_qa.json`
- **AND** 包含 pass/fail 狀態、issue 清單（issue_type、page、element、description）、auto_fix 動作記錄
