# §5 Purpose Binder Agent — Design Spec

## Goal

在 §4（Data Analysis Engine）和 §7（Script Planner）之間插入一個獨立模組，將報告的商業目的（purpose）綁定到每個分析維度，產出 `purpose.json`。讓下游的簡報/文件不再是冷冰冰的數據堆疊，而是圍繞商業目的展開的故事線。

## Pipeline Position

```
§4 analysis.json + interview.json + brand.json
              ↓
        §5 Purpose Binder
              ↓
         purpose.json
              ↓
§7 Script Planner (intent-scorer 疊加 purpose_factor + headline-generator 用 hook)
```

§5 是 **opt-in** 的。不跑 §5 → 不產 purpose.json → §7 行為完全不變。

## Inputs

| Source | Field | Usage |
|--------|-------|-------|
| `interview.json` | `purpose` (string) | 報告的商業目的，如 `sell-venue`, `brand-review` |
| `interview.json` | `venue` (object) | 場地名稱、特性、季節性資訊 |
| `brand.json` | `name`, `industry` | 品牌基本資訊 |
| `analysis.json` | `dimensions[*]` | 8 dimensions 的 insights, derived_metrics, anomalies |
| CLI `--purpose` | (optional) | Override interview.json 的 purpose 欄位 |

## Output: purpose.json

```json
{
  "meta": {
    "purpose": "sell-venue",
    "purpose_label": "推廣台北101作為品牌進駐據點",
    "venue": "台北101",
    "brand": "Louis Vuitton",
    "generated_at": "2026-03-20T14:00:00+08:00"
  },
  "bindings": [
    {
      "dimension": "trend",
      "relevance_score": 0.9,
      "hook": "Q4-Q1 聲量高峰與 101 人流旺季完美重疊",
      "rationale": "trend.mom_growth aligns with venue peak season"
    },
    {
      "dimension": "platform",
      "relevance_score": 0.7,
      "hook": "IG 打卡文化契合 101 地標視覺特性",
      "rationale": "instagram efficiency maps to venue photography behavior"
    },
    {
      "dimension": "sentiment",
      "relevance_score": 0.4,
      "hook": null,
      "rationale": "no strong venue connection"
    }
  ]
}
```

Each binding contains:
- `dimension`: one of the 8 analysis dimensions
- `relevance_score`: 0-1, how relevant this dimension is to the purpose
- `hook`: a Chinese narrative sentence linking data to purpose (or null)
- `rationale`: English explanation for debugging

## Purpose Types

| Purpose | Label | High-Affinity Dimensions |
|---------|-------|--------------------------|
| `sell-venue` | 推銷場地給品牌 | trend, platform, search, kol |
| `brand-review` | 品牌年度/季度回顧 | trend, sentiment, competitor, social_overview |
| `market-entry` | 新市場評估 | search, competitor, language, platform |
| `kol-strategy` | KOL 合作策略 | kol, platform, sentiment |
| `crisis-response` | 危機應對 | sentiment, trend, kol |

Each purpose type defines **affinity weights** (0-1) per dimension.

Unknown purpose types → all affinities default to 0.5 (neutral).

## Relevance Score Calculation

```
relevance_score = affinity_weight × signal_strength
```

- `affinity_weight`: from purpose type lookup table
- `signal_strength`: derived from analysis.json dimension data:
  - Has anomaly → 1.0
  - Has growth/decline insight → 0.8
  - Normal data present → 0.5
  - Insufficient data / missing → 0.2

## Hook Generation

### Rule-based Templates (v1)

Each purpose × dimension combination has a template:

```javascript
const HOOK_TEMPLATES = {
  'sell-venue': {
    trend: '{brand} 聲量{趨勢方向} {pct}%，{季節}正值{venue}{特性}',
    platform: '{top_platform} {效率描述}契合{venue}{場地特性}',
    search: '{search_intent_top} 搜尋意圖與{venue}定位高度吻合',
    kol: '{kol_count} 位 KOL 覆蓋{reach}觸及，強化{venue}品牌曝光',
    sentiment: '正面聲量佔 {positive_pct}%，{venue}品牌形象加分',
  },
  // ... other purpose types
};
```

Template variables extracted from analysis.json:

| Variable | Source |
|----------|--------|
| `{brand}` | brand.json → name |
| `{venue}` | interview.json → venue.name |
| `{pct}` | dimension.derived_metrics (e.g. mom_growth) |
| `{趨勢方向}` | insight type: growth→成長, decline→下滑, anomaly→異常波動 |
| `{top_platform}` | platform dimension → highest efficiency platform |
| `{positive_pct}` | sentiment dimension → positive_ratio |
| `{季節}` | inferred from data date range (Q1→春節, Q4→年末旺季, etc.) |

Generation flow:
1. Look up `HOOK_TEMPLATES[purpose][dimension]`
2. Has template → extract variables from analysis.json → fill template → hook
3. No template → hook = null
4. Missing variable → omit that phrase, output simplified version

### LLM Interface (reserved, not implemented in v1)

```javascript
async function generateHook(dimension, context, options = {}) {
  if (options.useLLM && options.llmProvider) {
    // provider-agnostic: accepts async (prompt) → string
    return await options.llmProvider(buildHookPrompt(dimension, context));
  }
  return templateBasedHook(dimension, context);
}
```

The `llmProvider` is a simple `async (prompt) → string` function. The caller decides which provider (Claude, OpenAI, etc.) to use. §5 itself has zero SDK dependencies.

## §7 Integration

### intent-scorer.js

Current formula:
```
final_score = signal_score × base_weight × intent_boost
```

Updated formula:
```
final_score = signal_score × base_weight × intent_boost × purpose_factor
```

`purpose_factor` calculation:
- Has purpose.json + dimension has binding → `0.5 + (relevance_score × 0.5)` (range 0.5-1.0)
- Has purpose.json but dimension has no binding → `0.5`
- No purpose.json → `1.0` (no effect, backward compatible)

### headline-generator.js

```javascript
function generateHeadline(chapter, purposeBindings) {
  // 1. Has hook → use it
  const binding = purposeBindings?.find(b => b.dimension === chapter.focus);
  if (binding?.hook) return binding.hook;

  // 2. No hook → existing logic (anomaly > decline > growth > leader > ...)
  return existingHeadlineLogic(chapter);
}
```

## Fallback Matrix

| Scenario | Behavior |
|----------|----------|
| No interview.json | Skip §5, no purpose.json, §7 unaffected |
| interview.json has no `purpose` field | Same as above |
| Unknown purpose type | All affinities = 0.5, all hooks = null |
| purpose.json exists but dimension missing | purpose_factor = 0.5, headline uses existing logic |
| Template variable missing in analysis.json | Simplified hook without that phrase |

## File Structure

```
engines/purpose-binder/
├── purpose-binder.js       # Orchestrator: reads inputs, produces purpose.json
├── affinity-table.js       # Purpose type → dimension affinity weights
├── signal-scorer.js        # Reads analysis.json → signal_strength per dimension
├── hook-generator.js       # Template-based hook generation + LLM interface
└── __tests__/
    ├── purpose-binder.test.js
    ├── affinity-table.test.js
    ├── signal-scorer.test.js
    └── hook-generator.test.js
```

Modifications to existing files:
- `engines/script-planner/intent-scorer.js` — add purpose_factor to scoring formula
- `engines/script-planner/headline-generator.js` — add hook fallback logic
- `engines/script-planner/script-planner.js` — read purpose.json, pass to scorers

## Tech Stack

- Node.js, CommonJS
- Jest 30 for testing
- No external dependencies (rule-based v1)
- LLM integration deferred (provider-agnostic interface reserved)
