# 數據分析 — Data Analysis

## Input / Output Contract

### Input
- `data.json`：Dashboard 擷取的原始數據（各頁面 KPI、趨勢、平台、KOL 等）
- `research.json`：外部搜集的事件清單（節慶、行銷活動、社會事件）

### Output → `analysis.json`
```json
{
  "meta": { "brand": "string", "analyzed_at": "ISO8601" },
  "insights": [
    {
      "dimension": "string（e.g. trend, platform, sentiment, kol, search）",
      "level": "critical|important|supplementary",
      "finding": "string（洞察描述）",
      "evidence": { "metric": "string", "value": "number", "comparison": "string" },
      "so_what": "string（這代表什麼意義）",
      "confidence_score": 0.85
    }
  ],
  "swot": { "strengths": [], "weaknesses": [], "opportunities": [], "threats": [] },
  "cross_validation": [
    { "data_peak": "YYYY-MM", "matched_event": "string", "source": "string", "confirmed": true }
  ],
  "competitor_gap": { "metrics": [ { "name": "string", "brand_value": "number", "competitor_value": "number", "ratio": "number" } ] }
}
```

### 下游消費者
- §5 目的綑綁：讀取 insights + swot，嵌入提案者資源
- §6 敘事包裝：讀取 insights（依 level 排序），轉化為故事
- §7 腳本企劃：讀取所有欄位，決定每頁放什麼

## Purpose

對 Dashboard 擷取的數據進行深度洞察，使用統計學和 data scientist 技能，從數據中找出產業趨勢、市場機會威脅、品牌成效、對手動態。產出具有深度的洞察和具體策略建議。此模組取代原有的簡單 14 維度分析，升級為專業級數據分析。

---

## Requirements

### Requirement: 統計分析能力

AI MUST 使用統計方法分析數據，不能只做簡單描述。

#### Scenario: 趨勢分析
- **GIVEN** 已從 Dashboard 擷取多期數據（月度或季度）
- **WHEN** 進行趨勢分析
- **THEN** 計算 MoM / QoQ / YoY 成長率
- **AND** 識別趨勢方向：上升、下降、持平、週期性
- **AND** 對週期性趨勢標注週期長度和預測下一個轉折點

#### Scenario: 異常值偵測
- **GIVEN** 一組時間序列數據（如月度影響力指數）
- **WHEN** 進行異常值分析
- **THEN** 使用 Z-score 或 IQR 方法識別超出正常範圍的數據點
- **AND** 對每個異常值標記：疑似真實事件驅動 / 疑似數據品質問題
- **AND** 數據品質問題須與交叉驗證結果交叉比對

#### Scenario: 相關性分析
- **GIVEN** 多個指標的同期數據（如發文數、影響力指數、互動數）
- **WHEN** 分析指標間關係
- **THEN** 計算指標兩兩之間的相關性方向和強度
- **AND** 判斷是否存在邊際遞減效應（如發文數超過某閾值後影響力不再等比增加）
- **AND** 標注相關性 ≠ 因果性，僅作為假設基礎

#### Scenario: 市場佔比計算
- **GIVEN** 品牌數據和全站或競品群數據
- **WHEN** 計算佔比指標
- **THEN** 產出以下佔比：
  - 品牌在全站的影響力佔比（Share of Voice）
  - 各平台影響力佔比（哪個平台貢獻最多）
  - KOL 類型佔比（官方 vs 媒體 vs 素人）
- **AND** 與前期比較佔比變化趨勢

#### Scenario: 效率指標計算
- **GIVEN** 品牌的發文數、影響力、互動數等原始指標
- **WHEN** 計算效率比值
- **THEN** 產出以下效率指標：
  - 篇均影響力（影響力 / 發文數）
  - 互動率（互動數 / 曝光數 或 互動數 / 發文數）
  - 影響力效率（影響力 / 發文數比值）
- **AND** 跨平台比較效率差異
- **AND** 與競品比較效率差異（如有競品數據）

#### Scenario: 分佈分析
- **GIVEN** KOL 級別的影響力數據
- **WHEN** 分析影響力分佈集中度
- **THEN** 計算影響力是否集中在少數 KOL（80/20 分析）
- **AND** 計算 Gini 係數或等效集中度指標
- **AND** 判斷集中度風險：過度依賴少數 KOL 是否構成風險

---

### Requirement: 市場洞察

AI MUST 結合 `research.json` 和 `data.json` 產出市場洞察。

#### Scenario: SWOT 分析
- **GIVEN** 品牌的統計分析結果和 `research.json` 中的市場研究資料
- **WHEN** 進行 SWOT 分析
- **THEN** 產出品牌在社群的：
  - **S** 優勢：數據表現優於競品或市場均值的維度
  - **W** 劣勢：數據表現低於競品或市場均值的維度
  - **O** 機會：未充分利用的平台、KOL 類型、內容形式
  - **T** 威脅：競品成長趨勢、平台演算法變化、市場結構風險
- **AND** 每項 SWOT 必須附帶具體數據佐證

#### Scenario: 競品差距分析
- **GIVEN** 品牌與競品在各維度的數據
- **WHEN** 分析競品差距
- **THEN** 列出各維度的差距值和差距方向
- **AND** 將差距分類：可縮小（短期行動可改善）vs 結構性（需長期策略調整）
- **AND** 對可縮小的差距提出具體追趕策略

#### Scenario: 平台機會分析
- **GIVEN** 品牌在各平台的效率指標和投入數據
- **WHEN** 評估平台投資報酬率
- **THEN** 計算各平台的效率排名
- **AND** 識別被低估的平台（低投入但高效率）
- **AND** 識別過度投入的平台（高投入但低效率）
- **AND** 建議資源重新配置方向

#### Scenario: 時機分析
- **GIVEN** 歷史數據的月度分佈和 `research.json` 中的節慶檔期資訊
- **WHEN** 分析最佳行銷時機
- **THEN** 結合歷史聲量高峰和節慶檔期，找出最佳行銷時機窗口
- **AND** 標注窗口的提前準備期（如時裝週前 2 週開始佈局）
- **AND** 區分品牌自主可控時機 vs 外部事件驅動時機

#### Scenario: KOL 生態分析
- **GIVEN** KOL 排行和分類數據
- **WHEN** 分析 KOL 生態結構
- **THEN** 將 KOL 分為：官方帳號、媒體帳號、素人 / 網紅
- **AND** 計算各類型的影響力佔比和效率差異
- **AND** 判斷品牌的 KOL 生態是否健康（過度依賴官方？缺乏素人口碑？）
- **AND** 提出 KOL 合作策略建議

#### Scenario: 受眾洞察
- **GIVEN** 語系分佈、平台偏好、互動行為等數據
- **WHEN** 推論受眾特徵
- **THEN** 從可用數據推論受眾輪廓（如語系→市場、平台→年齡層偏好）
- **AND** 標注推論的確定程度（直接數據支持 vs 間接推論）
- **AND** 建議後續可驗證受眾假設的方式

---

### Requirement: 分析輸出

所有分析結果 MUST 結構化存入 `~/.fontrends/runs/{brand}-{date}/analysis.json`。

#### Scenario: analysis.json 完整結構
- **GIVEN** 所有統計分析和市場洞察完成
- **WHEN** 寫入 `analysis.json`
- **THEN** 檔案包含以下頂層結構：

```json
{
  "metadata": {
    "brand": "Louis Vuitton",
    "date": "2026-03-19",
    "data_period": "2026-02",
    "analyst_version": "2.0"
  },
  "statistical_analysis": {
    "trends": {},
    "anomalies": [],
    "correlations": [],
    "market_share": {},
    "efficiency_metrics": {},
    "distribution_analysis": {}
  },
  "market_insights": {
    "swot": {},
    "competitor_gaps": [],
    "platform_opportunities": [],
    "timing_windows": [],
    "kol_ecosystem": {},
    "audience_insights": {}
  },
  "key_findings": [],
  "action_recommendations": []
}
```

#### Scenario: 洞察必須有數據佐證
- **GIVEN** 產出任何一條洞察或建議
- **WHEN** 寫入 `analysis.json`
- **THEN** 每條洞察必須包含 `evidence` 欄位，引用具體數據
- **AND** 沒有數據支撐的判斷不得寫入 key_findings
- **AND** 範例：
  - `"finding": "IG 為最高效率平台"` 必須附帶 `"evidence": "篇均影響力 IG=1250 vs FB=430 vs YT=890"`

#### Scenario: 洞察分級
- **GIVEN** 所有洞察已產出
- **WHEN** 進行洞察分級
- **THEN** 每條洞察標注優先級：
  - `"priority": "critical"` — 關鍵發現，必須放進報告
  - `"priority": "important"` — 重要參考，建議放進報告
  - `"priority": "supplementary"` — 補充資訊，視報告篇幅決定
- **AND** critical 洞察數量建議 3-5 條，不超過 7 條

#### Scenario: 洞察信心分數
- **GIVEN** 每條洞察
- **WHEN** 評估確定程度
- **THEN** 附帶 `confidence_score`（0-1）：
  - 0.8-1.0：有直接數據支持且交叉驗證一致
  - 0.5-0.79：有數據支持但未交叉驗證，或樣本偏小
  - 0.3-0.49：間接推論，需更多數據驗證
  - < 0.3：不應寫入 key_findings，僅可放入 supplementary
- **AND** confidence_score < 0.5 的洞察必須標注 `"caveat"` 說明不確定原因
