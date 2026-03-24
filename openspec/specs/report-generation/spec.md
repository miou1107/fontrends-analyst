# Report Generation — 報告產出

## Purpose

將品牌分析結果轉化為可交付的報告，支援 PowerPoint（pptxgenjs）和 Google Slides（未來）兩種格式。報告結構、配色、內容依訪談結果和品牌定義自動調整。

---

## Requirements

### Requirement: PPT 報告產出（pptxgenjs）

Skill MUST 能使用 pptxgenjs 產出 PowerPoint 報告。

#### Scenario: 完整版報告（13 張）
- **GIVEN** 14 維度分析完成，訪談確認為完整版
- **WHEN** 進入報告產出階段
- **THEN** 依序產出 13 張 Slide：
  1. 封面（品牌名、標題、資料範圍、製作單位）
  2. 執行摘要（4 大 KPI + 核心洞察 3 條）
  3. 社群影響力總覽（5 指標 + 月份趨勢圖）
  4. 聲量高峰事件對應（時間軸 + 事件說明）
  5. 語系分析（圓餅圖 + 警示）
  6. 平台分布（影響力 vs 發文數雙軸圖）
  7. KOL 分析（Top 10 表格 + KOL 生態分類）
  8. 好感度分析（Doughnut chart + 免責說明）
  9. 搜尋意圖分析（3 大數字 + 關鍵字清單）
  10. 月份分布 × 季節策略（月份圖 + 4 季策略卡）
  11. 品牌 × 客戶場域合作機會（2×2 卡片）
  12. 數據品質聲明（4 項警示）
  13. 可執行行動建議矩陣（WHO × WHEN × KPI）

#### Scenario: 精簡版報告（8 張）
- **GIVEN** 訪談確認為精簡版
- **WHEN** 進入報告產出
- **THEN** 產出 Slide 1、2、3、4、9、10、11、13

#### Scenario: 品牌配色自動套用
- **GIVEN** 訪談確認品牌（如 Louis Vuitton）
- **WHEN** 讀取 `brand-colors.json`
- **THEN** 從中取得對應品牌的色彩定義（primary/secondary/dark_bg/light_bg）
- **AND** 套用到 PPT 所有頁面

#### Scenario: 品牌未在色彩定義中
- **GIVEN** 用戶分析的品牌不在 `brand-colors.json` 裡
- **WHEN** 系統查找品牌色彩
- **THEN** 使用「中性專業」色系（深藍 + 金）
- **AND** 提示用戶：「此品牌尚未定義專屬色系，使用預設配色」

---

### Requirement: pptxgenjs 技術規範

PPT 產出 MUST 遵守已知的 pptxgenjs 技術限制。

#### Scenario: Shadow 物件不共用
- **GIVEN** 需要在多個元素上加陰影
- **WHEN** 撰寫 pptxgenjs 程式碼
- **THEN** 每次使用 `makeShadow()` 函數產生新物件
- **AND** 禁止共用同一個 shadow 物件（pptxgenjs mutate bug）

#### Scenario: 換行使用 breakLine
- **GIVEN** 文字需要換行
- **WHEN** 使用 `addText`
- **THEN** 使用陣列格式 + `breakLine: true`
- **AND** 禁止在字串中使用 `\n`

#### Scenario: 色碼格式
- **GIVEN** 設定顏色
- **WHEN** 填入 hex 色碼
- **THEN** 不加 `#` 前綴（如 `"BFA06A"`，不是 `"#BFA06A"`）
- **AND** shadow opacity 使用 `opacity` 屬性，不放進 hex 字串

---

### Requirement: 行動建議矩陣

最終報告 MUST 包含可執行行動建議，每條建議缺一不可。

#### Scenario: 行動建議格式
- **GIVEN** 分析洞察已產出
- **WHEN** 撰寫行動建議
- **THEN** 每條建議包含 6 個欄位：
  - 優先級（🥇 立即 / 📈 中期 / 💡 補位 / ⚠️ 需驗證）
  - 行動項目（動詞開頭）
  - 執行單位（WHO）
  - 時機/時程（WHEN + 對應事件）
  - 預期 KPI（量化指標）
  - 對應洞察（回扣哪個數據發現）

#### Scenario: 依客戶類型調整
- **GIVEN** 訪談確認受眾為媒體版位業主
- **WHEN** 撰寫行動建議
- **THEN** WHO 填「業務部門、品牌方 PR」
- **AND** KPI 填「版位曝光次數、IG UGC 篇數、MoM%」

#### Scenario: 至少包含 2 條「立即」優先級
- **GIVEN** 行動建議矩陣完成
- **WHEN** 檢查建議清單
- **THEN** 至少有 2 條標記為 🥇 立即
- **AND** 總共至少 6 條建議

---

### Requirement: 報告品質驗證

PPT 產出後 MUST 執行品質檢查。

#### Scenario: QA 流程
- **GIVEN** PPT 檔案已生成
- **WHEN** 進入 QA 階段
- **THEN** 依序執行：
  1. 轉 PDF（LibreOffice）
  2. 轉圖片（pdftoppm）
  3. 視覺檢查每張 Slide
- **AND** 重點檢查：文字截斷、元素重疊、表格最後一行完整性

#### Scenario: 已知 LibreOffice 差異不修正
- **GIVEN** QA 發現圓餅圖標籤重疊
- **WHEN** 判斷是否需要修正
- **THEN** 確認是 LibreOffice 渲染差異（PowerPoint 開啟正常）
- **AND** 不修正，標記為已知差異

---

### Requirement: Google Slides 產出（未來）

系統 SHOULD 支援 Google Slides API 產出，作為 PPT 的替代方案。

#### Scenario: Google Slides 產出（規劃中）
- **GIVEN** 用戶偏好 Google Slides 而非 PPT
- **WHEN** 選擇產出格式為 Google Slides
- **THEN** 使用 Google Slides API 建立簡報
- **AND** 直接產出在用戶的 Google Drive 中
- **AND** 用戶可直接線上編輯（有利於學習回饋流程）

> 注意：此功能為 Phase 2，MVP 先做 PPT。
