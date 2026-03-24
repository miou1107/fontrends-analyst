# Research Collection — 資料搜集

## Purpose

主動上網搜集提案所需的外部資訊，包括節慶檔期、社會事件、業者重大行銷活動、產業趨勢報告等。這些資訊用於結合 Dashboard 數據進行交叉驗證，找出數據變化的根本原因，並提出具體證明。

---

## Input / Output Contract

### Input
- `interview.json`：讀取以下欄位
  - `client.industry` — 產業別
  - `brand.name` — 品牌名稱
  - `brand.competitor` — 競品名稱
  - `proposal.competitors` — 競爭對手清單

### Output → `research.json`
```json
{
  "meta": { "brand": "string", "search_date": "ISO8601", "depth": "quick|standard|deep" },
  "events": [
    { "date": "YYYY-MM", "category": "festival|marketing|social|industry|competitor|venue", "title": "string", "source_url": "string", "relevance": "high|medium|low" }
  ],
  "festivals": [ { "date": "YYYY-MM-DD", "name": "string", "marketing_relevance": "string" } ],
  "competitor_activities": [ { "date": "YYYY-MM", "competitor": "string", "activity": "string", "source_url": "string" } ],
  "summary": { "total_events": 0, "top_5_events": [], "key_periods": [] }
}
```

### 下游消費者
- §4 數據分析：讀取 events + festivals，交叉驗證 data.json 中的聲量峰值

---

## Requirements

### Requirement: 自動搜集清單

根據訪談結果，AI MUST 自動產出需要搜集的資訊清單。

#### Scenario: 品牌行銷大事記
- **GIVEN** 訪談已完成，確認分析品牌為 `{brand}`、年份為 `{year}`
- **WHEN** 系統開始資料搜集
- **THEN** 搜尋「{brand} {year} campaign event marketing」
- **AND** 搜集近 12 個月的品牌行銷事件（代言人、新品發布、時裝週、聯名等）

#### Scenario: 節慶檔期表
- **GIVEN** 訪談已完成，確認分析時間範圍
- **WHEN** 系統建立搜集清單
- **THEN** 搜尋台灣與全球重要節慶和購物檔期
- **AND** 涵蓋：雙11、聖誕節、農曆新年、母親節、情人節、618、七夕、中秋節、周年慶等
- **AND** 標注各檔期的起迄日期與預熱期

#### Scenario: 產業趨勢
- **GIVEN** 訪談已確認品牌所屬產業 `{industry}`
- **WHEN** 系統建立搜集清單
- **THEN** 搜尋「{industry} trend {year}」（例：luxury brand trend 2025）
- **AND** 搜集產業報告、市場規模、消費者行為變化等

#### Scenario: 競品動態
- **GIVEN** 訪談中確認需要競品比較，且已知競品清單
- **WHEN** 系統建立搜集清單
- **THEN** 搜尋各競品近期重大行銷活動
- **AND** 涵蓋：新品發布、代言人更換、通路策略變動

#### Scenario: 社會事件
- **GIVEN** 分析時間範圍已確認
- **WHEN** 系統建立搜集清單
- **THEN** 搜尋可能影響消費行為的社會事件
- **AND** 涵蓋：疫情政策、經濟指標變化、政策法規、重大天災等

#### Scenario: 場域相關
- **GIVEN** 訪談中確認提案者場域（例：台北101）
- **WHEN** 系統建立搜集清單
- **THEN** 搜尋該場域近期活動和合作案例
- **AND** 涵蓋：跨年活動、快閃店、品牌進駐/撤櫃、場域改裝等

---

### Requirement: 搜集結果結構化

所有搜集結果 MUST 以結構化格式存入 `~/.fontrends/runs/{brand}-{date}/research.json`。

#### Scenario: 單筆資料格式
- **GIVEN** 搜集到一筆外部資訊
- **WHEN** 系統寫入 research.json
- **THEN** 每筆資料 MUST 包含以下欄位：
  - `event_name`：事件名稱
  - `date`：事件日期（ISO 8601）
  - `source_url`：來源 URL
  - `related_brands`：相關品牌（array）
  - `impact_area`：影響面向（如 awareness、sales、sentiment）
  - `confidence_score`：可信度評分（0.0–1.0）

#### Scenario: 資料自動分類
- **GIVEN** 多筆搜集結果已寫入
- **WHEN** 系統整理 research.json
- **THEN** 資料 MUST 分類至以下 category：
  - `brand_events`：品牌行銷大事記
  - `industry_trends`：產業趨勢
  - `seasonal_calendar`：節慶檔期
  - `competitor_moves`：競品動態
  - `social_events`：社會事件
  - `venue_history`：場域相關

#### Scenario: 搜集完成摘要
- **GIVEN** 所有搜集任務完成
- **WHEN** 系統產出摘要
- **THEN** 列出「最可能影響數據的前 5 大事件」
- **AND** 每個事件附上影響面向和可信度
- **AND** 標注哪些事件已有 Dashboard 數據可驗證、哪些需人工確認

---

### Requirement: 搜集深度可調

搜集深度 MUST 可依場景調整，避免不必要的時間浪費。

#### Scenario: 快速模式
- **GIVEN** 搜集深度設定為 `quick`
- **WHEN** 系統執行搜集
- **THEN** 只搜集品牌大事記 + 節慶檔期
- **AND** 預計完成時間約 5 分鐘

#### Scenario: 標準模式
- **GIVEN** 搜集深度設定為 `standard`
- **WHEN** 系統執行搜集
- **THEN** 搜集品牌大事記 + 節慶檔期 + 產業趨勢 + 競品動態
- **AND** 預計完成時間約 15 分鐘

#### Scenario: 深度模式
- **GIVEN** 搜集深度設定為 `deep`
- **WHEN** 系統執行搜集
- **THEN** 搜集全部六類資訊
- **AND** 對關鍵事件進行多來源交叉驗證
- **AND** 預計完成時間約 30 分鐘

#### Scenario: 依應用場景自動決定深度
- **GIVEN** 訪談中已確認應用場景
- **WHEN** 系統決定搜集深度
- **THEN** 若場景為「當面提案」→ 預設 `deep`
- **AND** 若場景為「傳給對方看」→ 預設 `standard`
- **AND** 若場景為「內部參考」→ 預設 `quick`
- **AND** 用戶可手動覆蓋預設深度
