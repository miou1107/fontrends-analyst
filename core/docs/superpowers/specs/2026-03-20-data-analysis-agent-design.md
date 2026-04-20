# §4 Data Analysis Agent — Design Spec

> **Date**: 2026-03-20
> **Status**: Approved
> **Author**: Vin + Claude

## 1. Overview

§4 數據分析 agent 是 FAPA 12-agent pipeline 的第四站。定位為**計算 + 洞察層**：從 §3 產出的 data.json 做數學推導、比較分析、異常檢測，並產出規則型洞察文字。輸出 analysis.json 供 §5（目的綑綁）和 §6（敘事包裝）使用。

### 設計原則

- §4 負責「數據說了什麼」，§6 負責「怎麼說給客戶聽」
- 規則型計算為主，ML 預留接口（待數據分析方法論 skill 完成後接入）
- 找不到歷史數據時降級處理（標記 insufficient_data），不硬算

## 2. Input / Output Contract

### Inputs

| 來源 | 檔案 | 必要性 |
|------|------|--------|
| §3 Data Extraction | `data.json`（含 current + previous_month） | 必要 |
| §1 Interview | `brand.json`（brand_name, primary_competitor, market_competitors, client_type） | 必要 |
| 歷史 runs | `~/.fontrends/runs/{brand}-{date}/data.json` | 選用（QoQ/YoY） |

### data.json 輸入結構

```json
{
  "meta": { "brand": "string", "competitor": "string", "period": "string" },
  "pages": {
    "social_overview": {
      "source": "string", "status": "string", "confidence": "string",
      "data": { "influence": "number", "posts": "number", "likes": "number",
                "comments": "number", "shares": "number", "site_avg_influence": "number" }
    },
    "language_distribution": {
      "data": { "english": "number(%)", "chinese": "number(%)", "japanese": "number(%)",
                "other": "number(%)", "total_articles": "number" }
    },
    "trend": {
      "data": { "monthly": [{ "month": "string", "influence": "number", "event": "string" }] }
    },
    "platform": {
      "data": { "items": [{ "name": "string", "influence": "number", "posts": "number", "share": "number(%)" }] }
    },
    "kol": {
      "data": { "items": [{ "rank": "number", "name": "string", "platform": "string",
                            "influence": "number", "type": "string" }] }
    },
    "sentiment": {
      "data": { "positive": "number(%)", "neutral": "number(%)", "negative": "number(%)" }
    },
    "search_intent": {
      "data": { "weighted_index": "number", "keyword_count": "number", "monthly_avg": "number" }
    },
    "competitor_data": {
      "data": { "influence": "number", "likes": "number", "sentiment_positive": "number(%)" }
    }
  }
}
```

> 當 §3 擴充支援多期擷取後，data.json 會增加 `previous_month` 頂層欄位，結構同 `pages`。目前首次實作以單期為主，MoM 從 trend.monthly 推算。

### Output

- `analysis.json` — 結構見 §4

## 3. 分析範圍

### 3.1 自比（Self-Comparison）

| 比較軸 | 來源 | 降級策略 |
|--------|------|----------|
| MoM（月對月） | data.json 的 current + previous_month | §3 擷取時已含，必有 |
| QoQ（季對季） | 歷史 run 資料夾 | 找不到 → `insufficient_data` |
| YoY（年對年） | 歷史 run 資料夾 | 找不到 → `insufficient_data` |

### 3.2 競比（Competitor Comparison）

| 層級 | 說明 |
|------|------|
| 主要競品（1 個） | 全維度深度對比：社群、語言、平台、KOL、情緒、搜尋 |
| 參考競品（3-4 個） | 核心指標：聲量、搜尋量，用於市場定位圖和排名 |

### 3.3 跨維度分析（Cross-Dimensional）

- 指標相關性（Pearson correlation）
- 異常事件跨維度驗證
- 市場象限定位（聲量 × 互動率矩陣）

## 4. analysis.json Schema

```json
{
  "meta": {
    "brand": "string",
    "period": "string (YYYY-MM)",
    "generated_at": "ISO8601",
    "comparison_periods": {
      "mom": { "status": "available | insufficient_data | not_attempted", "period": "string | null" },
      "qoq": { "status": "available | insufficient_data | not_attempted", "period": "string | null" },
      "yoy": { "status": "available | insufficient_data | not_attempted", "period": "string | null" }
    },
    "schema_version": "1.0",
    "primary_competitor": "string",
    "market_competitors": ["string"],
    "methodology_version": "string"
  },
  "dimensions": {
    "<dimension_id>": {
      "derived_metrics": {
        "<metric_name>": "number"
      },
      "self_comparison": {
        "mom": {
          "<metric_name>": {
            "current": "number",
            "previous": "number",
            "change_abs": "number",
            "change_pct": "number",
            "direction": "up | down | flat"
          }
        },
        "qoq": "same structure | null",
        "yoy": "same structure | null"
      },
      "competitor_comparison": {
        "primary": {
          "brand": "string",
          "metrics": {
            "<metric_name>": {
              "self": "number",
              "competitor": "number",
              "multiplier": "number",
              "advantage": "self | competitor | tie"
            }
          }
        },
        "market": {
          "brands": ["string"],
          "ranking": {
            "<metric_name>": {
              "rank": "number",
              "total": "number",
              "percentile": "number"
            }
          },
          "market_share_estimate": "number | null"
        }
      },
      "anomalies": [
        {
          "metric": "string",
          "value": "number",
          "expected": "number",
          "z_score": "number",
          "likely_cause": "string | null"
        }
      ],
      "insights": [
        {
          "type": "growth | decline | anomaly | leader | laggard | correlation",
          "severity": "positive | negative | neutral | warning",
          "text": "string (中文)",
          "evidence": {
            "metric": "string",
            "comparison": "mom | qoq | yoy | competitor | market"
          }
        }
      ]
    }
  },
  "cross_dimensional": {
    "correlations": [
      {
        "dim_a": "string",
        "dim_b": "string",
        "metric_a": "string",
        "metric_b": "string",
        "correlation": "number (-1 to 1)",
        "strength": "strong | moderate | weak",
        "insight": "string"
      }
    ],
    "anomalies": [
      {
        "description": "string",
        "affected_dimensions": ["string"],
        "severity": "high | medium | low"
      }
    ],
    "market_position": {
      "overall_score": "number (0-100)",
      "quadrant": "leader | challenger | niche | follower",
      "strengths": ["string"],
      "weaknesses": ["string"]
    }
  },
  "recommendations": [
    {
      "id": "string",
      "priority": "immediate | medium_term | opportunistic | verify",
      "who": "string",
      "what": "string",
      "when": "string",
      "kpi": "string",
      "rationale": "string (pointer to insight)",
      "linked_dimensions": ["string"]
    }
  ],
  "quality": {
    "data_completeness": "number (0-1)",
    "confidence_scores": {
      "<dimension_id>": "number (0-1)"
    },
    "data_sources": {
      "current": "string (run path)",
      "mom_source": "string | null",
      "qoq_source": "string | null",
      "yoy_source": "string | null"
    },
    "caveats": [
      "語言偵測準確率約 85-90%",
      "情緒分析無法偵測反諷與語碼轉換",
      "market_share_estimate 為社群聲量佔比（SOV），非實際營收市佔"
    ]
  },
  "ml_insights": "null (reserved for future ML plugin)"
}
```

### Dimension IDs

8 個分析維度，對應 data.json pages：

| ID | 名稱 | 核心衍生指標 |
|----|------|-------------|
| `social_overview` | 社群總覽 | engagement_rate, avg_interaction_per_post, influence_density |
| `trend` | 趨勢分析 | growth_rate, trend_direction, momentum_score |
| `language` | 語言分佈 | dominant_language_pct, language_diversity_index |
| `platform` | 平台分佈 | platform_efficiency, concentration_index |
| `kol` | KOL 分析 | kol_coverage, avg_kol_influence, top_kol_contribution_pct |
| `sentiment` | 情緒分析 | positive_ratio, negative_ratio, net_sentiment_score |
| `search` | 搜尋意圖 | search_volume_index, brand_vs_generic_ratio |
| `competitor` | 競品綜合 | competitive_gap_score, market_share_estimate |

### Framework 14 維度對照

analysis-framework.md 定義 14 維度（7 核心 + 7 進階）。以下說明各維度由哪個 agent 負責：

| # | Framework 維度 | §4 處理方式 |
|---|---------------|-------------|
| 1 | 全頁數據報告 | ✅ 8 dimensions 完整覆蓋 |
| 2 | 原創貼文驗證 | ❌ §3 擷取階段處理（top 5 posts 驗證），§4 讀取結果放入 quality.caveats |
| 3 | 外部交叉驗證 | ❌ §3 擷取階段處理（Google Trends、新聞），§4 讀取結果放入 anomalies.likely_cause |
| 4 | 季節性 + 外部因素 | ✅ trend 維度處理：從 monthly data 偵測季節模式，event 欄位標記外部因素 |
| 5 | 品牌健康度 | ✅ cross_dimensional.market_position 綜合 sentiment + trend 計算 |
| 6 | 品牌-場域關聯 | ❌ §5 目的綑綁 agent 處理（需 interview.json 的場域資訊） |
| 7 | 洞察→行動建議 | ✅ recommendations 區塊（action-matrix 格式） |
| 8 | YoY/MoM 比較 | ✅ self_comparison（每個維度） |
| 9 | 競品分析 | ✅ competitor_comparison（primary + market） |
| 10 | 受眾輪廓 | ⏳ 待 ML plugin（聚類分析） |
| 11 | 內容類型分析 | ⏳ 待 §3 擴充擷取內容類型數據 |
| 12 | 時段熱力圖 | ⏳ 待 §3 擴充擷取時段數據 |
| 13 | 地理區域 | ⏳ 待 §3 擴充擷取地理數據 |
| 14 | 品牌官網數據 | ⏳ 待 GA4/GSC adapter 完成 |

> ✅ = 本次實作 | ❌ = 其他 agent 負責 | ⏳ = 待後續擴充

### 市佔估算方法

`market_share_estimate` 基於 **Share of Voice (SOV)** 計算：

```
SOV = brand_influence / sum(all_brands_influence) × 100
```

- 分子：品牌在監測期間的總影響力分數
- 分母：品牌 + 主要競品 + 參考競品的影響力總和
- 限制：僅反映社群聲量佔比，非實際營收市佔
- quality.caveats 會標注此限制

### 異常檢測策略

| 數據特性 | 使用方法 | 閾值 |
|----------|----------|------|
| 近似常態分佈（月度聲量、互動數） | Z-score | \|z\| > 2.5 標記 |
| 偏態分佈（KOL 影響力、單篇互動） | IQR | > Q3 + 1.5×IQR 標記 |
| `anomalies.expected` 欄位 | Z-score 用 mean，IQR 用 median | — |

### 相關性分析數據來源

Pearson correlation 使用 `trend.data.monthly` 的時間序列（月度數據），非單一時點值。

| 相關性對 | 數據源 | 最低樣本數 |
|----------|--------|-----------|
| 聲量 × 搜尋量 | monthly influence vs monthly search | n >= 5 個月 |
| 聲量 × 情緒 | monthly influence vs monthly sentiment | n >= 5 個月 |
| 平台互動 × KOL 活動 | monthly platform engagement vs kol posts | n >= 5 個月 |

> 當 n < 5 時，相關性設為 null，不生成相關 insight。

### Priority Label 對照

| Schema enum | action-matrix 中文 | 說明 |
|-------------|-------------------|------|
| `immediate` | 立即執行 | 1-2 週，低成本高影響 |
| `medium_term` | 中期規劃 | 1-3 月，需預算/協調 |
| `opportunistic` | 補位建議 | 下季度，填補缺口 |
| `verify` | 需驗證 | 數據不明確，需持續監控 |

### Insight / Recommendation 上限

- 每個維度最多 5 條 insights（按 severity 排序取前 5）
- 跨維度最多 5 條 correlations
- 總 recommendations 上限 12 條（按 priority 排序）
- 去重規則：同一指標若觸發 decline + laggard，合併為一條（取 severity 較高者）

## 5. 引擎架構

```
/tmp/fontrends-core/engines/analysis/
├── analysis-engine.js        — 主控：讀取輸入、調度分析器、組裝輸出
├── analyzers/
│   ├── base-analyzer.js      — 衍生指標計算（率、均值、佔比、密度）
│   ├── self-comparator.js    — 自比：MoM/QoQ/YoY 差異
│   ├── competitor-comparator.js — 競比：倍率、排名、市佔
│   ├── anomaly-detector.js   — Z-score / IQR 異常檢測
│   ├── insight-generator.js  — 規則型洞察文字生成
│   └── cross-analyzer.js     — 跨維度相關性、市場定位
├── schemas/
│   └── analysis-schema.json  — JSON Schema（輸出驗證）
└── utils/
    └── stats.js              — mean, stddev, z_score, percentile, pearson, iqr
```

### 5.1 模組職責

| 模組 | 輸入 | 輸出 |
|------|------|------|
| `base-analyzer` | 單維度 raw data | `derived_metrics` |
| `self-comparator` | current + previous periods | `self_comparison` |
| `competitor-comparator` | self + primary + market brands | `competitor_comparison` |
| `anomaly-detector` | 指標序列 | `anomalies[]` |
| `insight-generator` | derived + comparisons + anomalies | `insights[]` |
| `cross-analyzer` | 所有維度結果 | `cross_dimensional` |

### 5.2 執行流程

```
1. 讀取 data.json, brand.json
2. 掃描歷史 runs（QoQ/YoY 數據）
3. FOR EACH dimension:
   a. base-analyzer → derived_metrics
   b. self-comparator → self_comparison (mom/qoq/yoy)
   c. competitor-comparator → competitor_comparison
   d. anomaly-detector → anomalies
   e. insight-generator → insights
4. cross-analyzer → cross_dimensional
5. 生成 recommendations（規則匹配 action-matrix）
6. 計算 quality scores
7. 驗證 output schema → 寫入 analysis.json
```

### 5.3 歷史數據讀取

```
1. data.json.current + data.json.previous_month → MoM（必有）
2. 掃描 ~/.fontrends/runs/{brand}-*/data.json，按日期降序
3. 找最近 3 個月前 → QoQ
4. 找最近 12 個月前 → YoY
5. 允許 ±7 天誤差，超過 7 天的匹配在 quality 中記錄實際間距天數
6. 找不到 → 該 comparison 設為 null，insights 跳過相關規則
```

## 6. 洞察生成規則

### 6.1 規則模板

```javascript
// 成長型
{ condition: "change_pct > 10 && direction == 'up'",
  template: "{metric_label} MoM 成長 {change_pct}%{competitor_context}" }

// 衰退型
{ condition: "change_pct < -10 && direction == 'down'",
  template: "{metric_label} MoM 下降 {change_pct}%，需關注{suggestion}" }

// 異常型
{ condition: "z_score > 2.5",
  template: "{metric_label} 出現異常值（{value}），為預期值的 {multiplier} 倍，建議確認是否有特殊事件" }

// 領先型
{ condition: "rank == 1 && total >= 3",
  template: "在 {total} 個競品中 {metric_label} 排名第一，領先第二名 {gap_pct}%" }

// 落後型
{ condition: "rank > total / 2",
  template: "{metric_label} 在 {total} 個競品中排名第 {rank}，落後領先者 {gap_pct}%" }

// 相關性
{ condition: "abs(correlation) > 0.7",
  template: "{metric_a_label} 與 {metric_b_label} 呈{strength}正/負相關（r={correlation}）" }
```

### 6.2 建議生成規則

從 insights 匹配 action-matrix 模板：

```javascript
// 每份報告至少 6 條建議
// >= 2 條 immediate, >= 1 條 verify
// 每條必須有 who/what/when/kpi/rationale

{ trigger: "insight.type == 'decline' && insight.severity == 'negative'",
  template: { priority: "immediate", who: "...", what: "針對{dimension}下降趨勢..." } }

{ trigger: "insight.type == 'anomaly'",
  template: { priority: "verify", who: "數據團隊", what: "驗證{metric}異常值..." } }

{ trigger: "insight.type == 'leader'",
  template: { priority: "opportunistic", who: "...", what: "維持{metric}領先優勢..." } }
```

## 7. 統計工具（stats.js）

本次實作的純計算函數，不依賴外部 ML 套件：

| 函數 | 用途 |
|------|------|
| `mean(arr)` | 算術平均 |
| `stddev(arr)` | 標準差 |
| `zScore(value, arr)` | Z 分數（異常檢測用） |
| `percentile(arr, p)` | 百分位數 |
| `pearson(arrA, arrB)` | Pearson 相關係數 |
| `iqr(arr)` | 四分位距（離群值檢測） |
| `changePct(current, previous)` | 變化百分比 |
| `direction(change, threshold?)` | up / down / flat（預設 ±1% 為 flat，可依指標調整：搜尋量用 ±5%） |
| `multiplier(a, b)` | a/b 倍率 |

## 8. ML 預留接口

```javascript
// analysis-engine.js 末段
async function tryLoadMLPlugin(dimensions) {
  try {
    const mlPlugin = require('./plugins/ml-analyzer');
    return await mlPlugin.analyze(dimensions);
  } catch (e) {
    return null; // ML plugin 未安裝，回傳 null
  }
}
```

未來 ML plugin 可提供：
- 時間序列預測（Prophet-like）
- 季節性分解
- 聚類分析（受眾分群）
- 迴歸模型（影響因子權重）

## 9. 錯誤處理

| 情境 | 處理方式 |
|------|----------|
| data.json 不存在或格式錯誤 | 拋出錯誤，終止分析 |
| 某維度數據缺失 | 跳過該維度，quality.data_completeness 扣分 |
| 歷史 run 找不到 | QoQ/YoY 設 null，洞察跳過相關規則 |
| 競品數據不足 | competitor_comparison.market 降級為僅 primary |
| 統計計算除以零 | 回傳 null，insight 跳過 |

## 10. 驗證標準

### GIVEN/WHEN/THEN

```
GIVEN data.json 有完整 8 維度 + previous_month 數據
WHEN 執行 analysis-engine
THEN analysis.json 包含：
  - 8 個 dimensions 各有 derived_metrics, self_comparison.mom, insights
  - cross_dimensional 有 correlations 和 market_position
  - recommendations >= 6 條（>= 2 immediate, >= 1 verify）
  - quality.data_completeness > 0.8

GIVEN data.json 只有 current（無 previous）
WHEN 執行 analysis-engine
THEN self_comparison.mom 全部為 null
  AND insights 不包含 MoM 相關洞察
  AND quality.data_completeness 扣分

GIVEN 有 3 個月前的歷史 run
WHEN 執行 analysis-engine
THEN self_comparison.qoq 有值
  AND 相關 QoQ 洞察被生成

GIVEN 競品只有 1 個（primary）
WHEN 執行 analysis-engine
THEN competitor_comparison.market.brands 只有 1 個
  AND ranking 不生成（total < 3）
  AND market_share_estimate 為 null
```

## 11. Dependencies

- Node.js（無外部 npm 依賴，stats.js 自行實作）
- helpers.js（readJSON, writeJSON）
- analysis-framework.md（14 維度規範）
- action-matrix.md（建議格式規範）

## 12. 待後續擴充

- [ ] ML plugin 接入（待數據分析方法論 skill）
- [ ] Google Trends API 即時驗證
- [ ] 自動化競品列表（從 interview.json 讀取）
- [ ] 視覺化輸出（analysis.json → charts data）
