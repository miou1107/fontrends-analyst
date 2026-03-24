# Requirements Interview — 需求訪談

## Purpose

深度了解本次提案的完整背景，包括提案對象、自身目標、客戶背景、競爭態勢、應用場景等，以確保後續所有環節都能精準對齊目標。此模組為整個提案系統的第一步，其輸出直接影響所有後續模組的品質。

---

## Input / Output Contract

### Input
- 使用者對話內容：提案需求描述、提案對象、背景資訊
- 歷史訪談記錄（如存在）：`~/.fontrends/runs/` 下同品牌的歷史 `interview.json`

### Output → `interview.json`
```json
{
  "client": { "name": "string", "industry": "string", "knowledge_level": "basic|intermediate|advanced", "needs": ["string"] },
  "presenter": { "name": "string", "products": ["string"], "services": ["string"], "resources": ["string"], "goal": "string" },
  "proposal": { "target_audience": "string", "purpose": "sell-venue|brand-health|pitch-deck|quarterly-review", "scenario": "in-person|document|hybrid", "competitors": ["string"] },
  "brand": { "name": "string", "display_name": "string", "competitor": "string" },
  "output_preference": { "format": "pptx|gslides|gdocs|gsheets", "schema": "full-13|compact-8|executive-5|mini-3", "language": "zh-TW|en" },
  "dashboard_url": "string",
  "confirmed_at": "ISO8601"
}
```

### 下游消費者
- §2 資料搜集：讀取 client.industry, brand, proposal.competitors
- §3 數據擷取：讀取 brand.name, brand.competitor, dashboard_url
- §5 目的綑綁：讀取 presenter.products/services/resources
- §6 敘事包裝：讀取 client.knowledge_level, proposal.scenario
- §7 腳本企劃：讀取 output_preference.schema
- §9 生產中心：讀取 output_preference.format

---

## Requirements

### Requirement: 提案背景訪談

每次分析任務 MUST 從訪談開始，完整收集以下 10 個面向。

#### Scenario: 完整訪談流程（逐題問答）
- **GIVEN** 用戶啟動品牌分析或提案任務
- **WHEN** Skill 進入訪談階段
- **THEN** 依序逐題詢問以下 10 個面向（不一次全丟）：
  1. **提案對象**（WHO-target）：提案要給誰？（例：LV 台灣品牌總監）
  2. **提案者**（WHO-presenter）：誰在提案？（例：台北101行銷部）
  3. **自身目標**（GOAL）：提案者希望達成什麼？（例：賣廣告版位給 LV）
  4. **要賣的產品/服務**（PRODUCT）：具體是什麼？（例：B1 中庭快閃空間、外牆 LED 廣告）
  5. **客戶背景**（CLIENT-BG）：對方的知識深度、產業 knowhow、決策層級
  6. **客戶需求**（CLIENT-NEED）：客戶自己想要什麼？（例：LV 要規劃下半年行銷活動）
  7. **競爭對手**（COMPETITOR）：分析時要比較的競品是誰
  8. **應用場景**（SCENARIO）：報告怎麼用？當面提案/傳給對方看/內部討論/印出來
  9. **風格偏好**（STYLE）：語言、配色、頁數、深度
  10. **特殊需求**（SPECIAL）：特別想強調或避開的東西
- **AND** 每題等待用戶回答後才問下一題
- **AND** 每題提供範例或選項輔助用戶回答

#### Scenario: 訪談後確認話術
- **GIVEN** 10 個面向已收集完答案
- **WHEN** 訪談結束
- **THEN** 回一段確認話術，涵蓋所有收集到的資訊：
  「這份報告是由 [WHO-presenter] 提案給 [WHO-target]，目標是 [GOAL]，主要推 [PRODUCT]。對方背景是 [CLIENT-BG]，需求為 [CLIENT-NEED]。競品比較 [COMPETITOR]，報告用途是 [SCENARIO]，風格偏好 [STYLE]。特殊需求：[SPECIAL]」
- **AND** 等待用戶確認後才進入後續模組

#### Scenario: 用戶要求跳過訪談
- **GIVEN** 用戶說「直接分析」、「不用問了」、「用預設值」
- **WHEN** Skill 收到跳過指令
- **THEN** 使用預設值：
  - WHO-target = 品牌方行銷主管
  - WHO-presenter = 台北101行銷部
  - GOAL = 品牌健康檢查與合作提案
  - PRODUCT = 場域廣告版位
  - CLIENT-BG = 行銷專業、熟悉數據
  - CLIENT-NEED = 行銷活動規劃參考
  - COMPETITOR = 同品類 Top 3
  - SCENARIO = 當面提案
  - STYLE = 繁中、品牌色、完整版 13 張
  - SPECIAL = 無
- **AND** 告知用戶正在使用預設值，隨時可調整

#### Scenario: 訪談輸出格式
- **GIVEN** 訪談完成（無論完整訪談或使用預設值）
- **WHEN** 系統儲存訪談結果
- **THEN** 以結構化 JSON 存到 `~/.fontrends/runs/{brand}-{date}/interview.json`
- **AND** JSON 結構如下：

```json
{
  "version": "2.0",
  "timestamp": "2026-03-19T10:30:00+08:00",
  "brand": "Louis Vuitton",
  "interview": {
    "who_target": "LV 台灣品牌總監",
    "who_presenter": "台北101行銷部",
    "goal": "賣廣告版位給 LV",
    "product": "B1 中庭快閃空間、外牆 LED 廣告",
    "client_bg": "行銷專業、熟悉數據、VP 層級",
    "client_need": "規劃下半年行銷活動",
    "competitor": ["Chanel", "Hermès", "Gucci"],
    "scenario": "當面提案",
    "style": {
      "language": "繁中",
      "color_scheme": "品牌色",
      "page_count": 13,
      "depth": "完整版"
    },
    "special": "避開價格敏感話題"
  },
  "follow_ups": [],
  "source": "full_interview"
}
```

#### Scenario: 訪談結果傳遞給後續模組
- **GIVEN** `interview.json` 已成功寫入
- **WHEN** 後續模組（資料擷取、分析、報告產出、稽核）啟動
- **THEN** 各模組 MUST 讀取 `interview.json` 作為執行依據
- **AND** 具體影響：
  - 資料擷取：根據 COMPETITOR 決定要抓幾個品牌
  - 分析：根據 GOAL 和 CLIENT-NEED 調整洞察角度
  - 報告產出：根據 STYLE 決定語言/配色/頁數
  - 稽核：根據 WHO-target 和 SCENARIO 評估受眾適配度

---

### Requirement: 智慧追問

AI SHOULD 根據用戶回答智慧追問，而非死板照表操作。

#### Scenario: 產品/服務相關追問
- **GIVEN** 用戶在 GOAL 回答「賣廣告」
- **WHEN** AI 判斷回答不夠具體
- **THEN** 追問：「什麼類型的廣告？有哪些資源可以賣？預算範圍大概是？」
- **AND** 將追問獲得的細節補充到對應欄位

#### Scenario: 客戶身份相關追問
- **GIVEN** 用戶在 WHO-target 回答「LV」
- **WHEN** AI 判斷需要更多客戶背景
- **THEN** 追問：「是 LV 台灣還是大中華區？對方的決策鏈是什麼？直接窗口是誰？」
- **AND** 將追問結果記錄到 WHO-target 和 CLIENT-BG

#### Scenario: 用戶回答模糊
- **GIVEN** 用戶對某題回答「不太確定」或「都可以」
- **WHEN** AI 偵測到模糊回答
- **THEN** 提供具體選項幫助釐清，例如：
  - 「報告用途大概是以下哪種？(A) 你親自當面提案 (B) 傳 PDF 給對方自己看 (C) 內部討論用 (D) 印出來放在會議桌上」
- **AND** 用戶選擇後記錄並繼續

#### Scenario: 用戶回答超出預期
- **GIVEN** 用戶提供了 10 個面向之外的重要資訊（如時程壓力、政治考量、預算限制）
- **WHEN** AI 偵測到額外有價值的資訊
- **THEN** 將該資訊記錄到 SPECIAL 欄位，不忽略
- **AND** 確認：「這個資訊很重要，我會記在特殊需求裡，後續會特別注意」

---

### Requirement: 歷史訪談記錄參考

如果 `~/.fontrends/runs/` 中有同品牌的歷史訪談記錄，AI SHOULD 參考並提供建議。

#### Scenario: 找到有效歷史記錄
- **GIVEN** `~/.fontrends/runs/` 中存在同品牌的 `interview.json`，且記錄日期在 90 天以內
- **WHEN** AI 進入訪談階段
- **THEN** 在每題提問時參考歷史答案：
  「上次分析 LV 時，你的目標是賣場域廣告，這次也是嗎？」
- **AND** 用戶可選擇沿用、修改、或重新回答

#### Scenario: 歷史記錄過期
- **GIVEN** `~/.fontrends/runs/` 中存在同品牌的 `interview.json`，但記錄日期超過 90 天
- **WHEN** AI 讀取到過期記錄
- **THEN** 提醒用戶：「上次分析 LV 是 [X] 天前，市場狀況可能已有變化，建議重新回答」
- **AND** 仍顯示歷史答案作為參考，但不預設沿用

#### Scenario: 無歷史記錄
- **GIVEN** `~/.fontrends/runs/` 中不存在同品牌的 `interview.json`
- **WHEN** AI 進入訪談階段
- **THEN** 正常執行完整訪談流程，不顯示歷史參考
