# §7 腳本企劃 Agent — Design Spec

## 定位

編輯決策層。讀 analysis.json + schema + brand.json，產出 script.json。
下游 engine.js 按 script 決定放哪些章、什麼順序、每章放哪些段落塊。

## 輸入

| 檔案 | 來源 | 必要 |
|---|---|---|
| `analysis.json` | §4 Data Analysis Agent | 是 |
| `brand.json` | §1 Interview Agent | 是 |
| schema preset (full-13, compact-8, executive-5, mini-3) | CLI 參數 | 是 |

### brand.json 關注維度 (intent)

brand.json 可包含 `focus_dimensions` 陣列，指定客戶特別在意的維度：

```json
{
  "name": "Louis Vuitton",
  "focus_dimensions": ["kol", "trend"],
  "colors": { ... }
}
```

若無 `focus_dimensions`，所有維度 intent_boost = 1.0。

## 輸出：script.json

```json
{
  "meta": {
    "brand": "Louis Vuitton",
    "schema": "full-13",
    "generated_at": "2026-03-20T10:30:00Z",
    "total_chapters": 9,
    "excluded_count": 2
  },
  "chapters": [
    {
      "pageId": "trend",
      "rank": 1,
      "score": 0.92,
      "headline": "Q4 聲量異常飆升 +340%",
      "focus": "anomaly",
      "blocks": ["data_table", "anomaly_callout", "insight_block", "so_what"],
      "excluded_blocks": ["self_comparison_note"],
      "data_refs": {
        "primary_metric": "influence",
        "insight_indices": [0, 2],
        "anomaly_indices": [0]
      }
    }
  ],
  "excluded": [
    { "pageId": "sentiment", "score": 0.12, "reason": "insufficient_data" }
  ],
  "fixed_pages": ["cover", "summary", "actions", "closing"]
}
```

## 評分公式

每個維度：

```
score = base_weight × signal_score × intent_boost
```

### base_weight

schema 每個 pageId 的預設權重：

| pageId | full-13 | compact-8 | executive-5 | mini-3 |
|---|---|---|---|---|
| cover | fixed | fixed | fixed | fixed |
| summary | fixed | fixed | fixed | - |
| kpi | 0.9 | 0.9 | 0.9 | - |
| trend | 0.8 | 0.8 | - | - |
| language | 0.5 | - | - | - |
| platform | 0.7 | 0.7 | - | - |
| kol | 0.8 | - | - | - |
| sentiment | 0.6 | 0.6 | - | - |
| venue | 0.4 | - | - | - |
| validation | 0.3 | - | - | - |
| competitor | 0.7 | - | - | - |
| actions | fixed | fixed | fixed | - |
| closing | fixed | fixed | fixed | - |
| overview | - | - | - | fixed |
| actions_closing | - | - | - | fixed |

"fixed" = 必放，不參與排序。"-" = 該 schema 不含此頁。

**mini-3 備註**：mini-3 只有 3 個 fixed 頁面（cover, overview, actions_closing），
無可排序的維度頁。script-planner 對 mini-3 直接 passthrough，不做排序或排除。

### signal_score

從 analysis.json 對應維度計算（0–1.0）：

```
insight_signal  = min(insight_count / 3, 1.0)     × 0.35
anomaly_signal  = min(anomaly_count / 2, 1.0)     × 0.25
change_signal   = min(max_change_pct / 50, 1.0)   × 0.25
compete_signal  = has_competitor_data ? 1.0 : 0    × 0.15
─────────────────────────────────────────────────────────
signal_score    = sum
```

- `insight_count`：該維度 insights[] 長度
- `anomaly_count`：該維度 anomalies[] 長度
- `max_change_pct`：遍歷 `Object.values(self_comparison.mom)`，取最大 `|change_pct|`。若 `self_comparison.mom` 為 null → change_signal = 0
- `has_competitor_data`：`competitor_comparison?.primary != null`（primary 存在才算有競品資料）

### intent_boost

- 維度在 `brand.json.focus_dimensions` 中 → 1.5
- 否則 → 1.0

### 排除門檻

- score < 0.2 → 進 excluded（除非 fixed_pages）
- 排除原因判定：`signal_score < 0.01` → `insufficient_data`，否則 → `low_relevance`（用 epsilon 避免浮點比較問題）

## 段落塊 Vocabulary

§7 為每章指派要放的段落塊（blocks[]）：

| 塊 ID | 說明 | 指派條件 |
|---|---|---|
| `data_table` | 核心數據表 | 預設都放 |
| `insight_block` | Key Insight 文字 | insights.length > 0 |
| `so_what` | So What 解讀 | insights.length > 0 |
| `action_link` | 行動建議連結 | 有對應 recommendation |
| `anomaly_callout` | 異常值高亮框 | anomalies.length > 0 |
| `self_comparison_note` | 自比趨勢摘要 | self_comparison 有顯著變化（any |change_pct| > 10） |
| `competitor_note` | 競品摘要 | competitor_comparison 非 null |
| `kpi_cards` | KPI 數字卡片 | fixed 頁（summary/overview）專用，不經 block-assigner |

## focus 判定

每章的 `focus` 從該維度最強信號決定：

1. anomalies.length > 0 → `"anomaly"`
2. insights 中有 type=growth 且 severity=positive → `"growth"`
3. insights 中有 type=decline → `"decline"`
4. insights 中有 type=leader → `"leader"`
5. 否則 → `"overview"`

## headline 生成

取該維度 insights[0].text 作為 headline。若無 insights，用預設：
`"{維度名稱}分析概況"`

## 排序邏輯

1. fixed_pages 位置固定：cover=第一、summary=第二、actions=倒數第二、closing=最後
2. 其餘章節按 score 降序排列
3. rank 從 1 開始編號（不含 fixed_pages）

## data_refs

每章的 data_refs 告訴 pageBuilder 要從 analysis.json 取哪些資料：

```json
{
  "primary_metric": "influence",
  "insight_indices": [0, 2],
  "anomaly_indices": [0]
}
```

- `primary_metric`：per-dimension 預設映射（見下表），不用動態比大小
- `insight_indices`：要顯示的 insights[] 索引（按 severity 排序：negative > warning > positive > neutral，取前 3）
- `anomaly_indices`：要顯示的 anomalies[] 索引
- `recommendation_indices`：對應的 recommendations[] 索引（用於 `action_link` 塊）

### primary_metric 預設映射

| analysis dimension | primary_metric |
|---|---|
| social_overview | influence |
| trend | influence |
| language | language_diversity_index |
| platform | platform_efficiency |
| kol | kol_coverage |
| sentiment | net_sentiment_score |
| search | search_volume_index |
| competitor | market_share_estimate |

## engine.js 整合

現行流程（engine.js line ~81）：
```
schema.pages → forEach → pageBuilders[pageId](page, data, brand, narrative, theme)
```

新增 script.json 支援：
```javascript
const scriptPath = path.join(runDir, 'script.json');
if (fs.existsSync(scriptPath)) {
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  // 組裝順序：fixed_pages 在固定位置 + chapters 按 rank 排序
  // engine.js 讀 script.chapters 而非 schema.pages
  for (const chapter of assembledPages) {
    pageBuilders[chapter.pageId](page, data, brand, narrative, theme, chapter);
  }
} else {
  // 向下相容，現有邏輯不變
}
```

pageBuilder 新增第 6 個參數 `chapter`：
```javascript
function trendBuilder(page, data, brand, narrative, theme, chapter = null) {
  const blocks = chapter?.blocks || ['data_table', 'insight_block', 'so_what', 'self_comparison_note', 'competitor_note'];
  // 只組裝 blocks 裡列出的段落塊
  if (blocks.includes('data_table')) { ... }
  if (blocks.includes('anomaly_callout')) { ... }
  ...
}
```

**注意**：`chapter` 參數為 optional，不傳時維持現有行為（全部塊都放）。

## 維度對照

analysis.json 維度 → schema pageId 映射：

| analysis dimension | pageId | 備註 |
|---|---|---|
| social_overview | kpi | |
| trend | trend | |
| language | language | |
| platform | platform | |
| kol | kol | |
| sentiment | sentiment | |
| search | venue | venue 頁使用 `dimensions.search` 的資料 |
| competitor | competitor | |

**注意**：analysis.json 沒有 `venue` 維度，pageId `venue` 的 signal_score 從 `dimensions.search` 計算。

## CLI

```bash
node script-planner.js --run-dir <path> --schema full-13
```

讀取 `<run-dir>/analysis.json` + `<run-dir>/brand.json`，產出 `<run-dir>/script.json`。

## 檔案結構

```
engines/
  script-planner/
    script-planner.js        # 主入口 + CLI
    scorers/
      signal-scorer.js       # signal_score 計算
      intent-scorer.js       # intent_boost 計算
    block-assigner.js        # 決定每章的 blocks[]
    headline-generator.js    # focus + headline 生成
    __tests__/
      script-planner.test.js
      signal-scorer.test.js
      block-assigner.test.js
      headline-generator.test.js
```

## 測試策略

- signal-scorer：各種 analysis 維度組合 → 預期 signal_score 範圍
- block-assigner：有/無 insights、anomalies、competitor → 預期 blocks 組合
- headline-generator：各種 focus 類型 → 預期 headline
- script-planner（整合）：完整 analysis.json → 驗證 script.json 結構、排序、排除
- edge case：空 analysis、全部維度 insufficient_data、schema 只有 3 頁
