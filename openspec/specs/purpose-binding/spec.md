# Purpose Binding — 目的綑綁

## Input / Output Contract

### Input
- `analysis.json`：數據分析結果（insights、swot、competitor_gap）
- `interview.json`：讀取 `presenter.products`、`presenter.services`、`presenter.resources`、`presenter.goal`

### Output → `analysis.json` (enriched)
在原有 analysis.json 中新增 `purpose_bindings` 欄位：
```json
{
  "...原有 analysis.json 所有欄位...",
  "purpose_bindings": [
    {
      "insight_ref": "string（對應 insights 陣列的 finding）",
      "resource": "string（提案者的產品/服務）",
      "binding_type": "platform-to-venue|timing-to-event|kol-to-experience|data-only",
      "action_text": "string（行動建議文字，含 WHO/WHAT/WHEN/KPI）"
    }
  ],
  "presenter_resources": [
    { "name": "string", "category": "advertising|media|venue|event|digital", "detail": "string" }
  ]
}
```

### 下游消費者
- §6 敘事包裝：讀取 purpose_bindings，確保每頁洞察自然連結提案者資源
- §7 腳本企劃：讀取 purpose_bindings，安排「合作方案頁」內容

## Purpose

站在提案者（例：台北101）的角度，將提案者自身擁有的產品、服務、資源（例：廣告版位、快閃空間、跨年活動、媒體議題合作）與數據分析洞察深度結合，在報告中自然地引導客戶看到「購買提案者產品/服務」的價值。這是區別於一般數據報告的核心差異化。

---

## Requirements

### Requirement: 資源清單建立

AI MUST 在訪談後建立提案者的產品/服務/資源清單。

#### Scenario: 從訪談取得基本資源清單
- **GIVEN** 訪談已完成，interview.json 中存在 PRODUCT 欄位
- **WHEN** AI 解析訪談結果
- **THEN** 從 PRODUCT 欄位擷取提案者的基本資源清單

#### Scenario: AI 追問資源細節
- **GIVEN** 已取得基本資源清單
- **WHEN** AI 進入資源盤點階段
- **THEN** 針對每個資源追問：價格帶、目標客群、過去成功案例、獨特賣點
- **AND** 將補充資訊合併至資源清單

#### Scenario: 結構化存入 interview.json
- **GIVEN** 資源清單與細節已蒐集完畢
- **WHEN** AI 寫入訪談資料
- **THEN** 結構化存入 interview.json 的 `presenter_resources` 欄位
- **AND** 每筆資源包含 name、category、price_range、target_audience、past_cases、unique_selling_point

#### Scenario: 資源分類
- **GIVEN** 資源清單已建立
- **WHEN** AI 進行資源分類
- **THEN** 將每筆資源歸入以下類別之一：
  - 硬體資源（場地、看板、廣告版位）
  - 軟體資源（數據、媒體、議題合作）
  - 活動資源（跨年、節慶活動、快閃）

---

### Requirement: 洞察-資源配對

AI MUST 自動將每個分析洞察與提案者的資源配對。

#### Scenario: 平台洞察配對場域資源
- **GIVEN** 分析洞察為「IG 佔品牌影響力 75%」
- **WHEN** AI 執行洞察-資源配對
- **THEN** 配對結果為「101 IG 打卡點可直接觸及核心受眾」
- **AND** 配對類型標記為 platform_to_venue

#### Scenario: 時間洞察配對活動資源
- **GIVEN** 分析洞察為「Q4 是聲量高峰」
- **WHEN** AI 執行洞察-資源配對
- **THEN** 配對結果為「101 跨年活動可搭配品牌曝光」
- **AND** 配對類型標記為 timing_to_event

#### Scenario: KOL 洞察配對體驗資源
- **GIVEN** 分析洞察為「KOL 為第二大影響力來源」
- **WHEN** AI 執行洞察-資源配對
- **THEN** 配對結果為「101 可安排 KOL 體驗活動」
- **AND** 配對類型標記為 kol_to_experience

#### Scenario: 無合適資源配對
- **GIVEN** 某洞察找不到合適的提案者資源
- **WHEN** AI 執行洞察-資源配對
- **THEN** 該洞察標記為「純數據洞察」（type: data_only）
- **AND** 不強行綑綁任何資源

#### Scenario: 配對結果持久化
- **GIVEN** 所有洞察-資源配對完成
- **WHEN** AI 寫入分析資料
- **THEN** 配對結果存入 analysis.json 的 `purpose_bindings` 欄位
- **AND** 每筆 binding 包含 insight_id、resource_id、binding_type、binding_narrative

---

### Requirement: 植入策略

AI MUST 自然地將資源配對植入報告，不能太生硬。

#### Scenario: 洞察段落自然植入
- **GIVEN** 某洞察已配對一個資源
- **WHEN** AI 撰寫該洞察的報告段落
- **THEN** 在洞察結尾自然延伸，例如：「此時機窗口與 101 跨年活動高度吻合，可策劃聯合行銷活動」
- **AND** 語氣為建議式，非推銷式

#### Scenario: 行動建議直接綁定
- **GIVEN** 報告進入可執行行動建議矩陣
- **WHEN** AI 填寫 WHO / WHAT 欄位
- **THEN** WHO 填入提案者對應部門（例：「101 行銷部」）
- **AND** WHAT 填入具體產品或服務名稱

#### Scenario: 合作機會專頁呈現
- **GIVEN** 報告包含「品牌 x 場域合作機會」專頁
- **WHEN** AI 產出該頁面
- **THEN** 使用 2x2 矩陣展示所有洞察-資源配對
- **AND** 每個象限包含洞察摘要、資源名稱、預期效益

#### Scenario: 避免過度銷售
- **GIVEN** 某洞察已配對一個資源
- **WHEN** AI 撰寫報告內容
- **THEN** 每個洞察最多綁定一個資源
- **AND** 不在每個段落都置入資源推薦

#### Scenario: 過度銷售品質檢查
- **GIVEN** 報告初稿已完成
- **WHEN** 稽核模組執行品質檢查
- **THEN** 若綑綁密度超過閾值（例：超過 60% 洞察被綁定），標記為「過度銷售」
- **AND** 提示 AI 減少綑綁數量或調整語氣
