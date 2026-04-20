# §4 Data Analysis Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an analysis engine that reads data.json and produces analysis.json with derived metrics, self-comparison, competitor comparison, anomaly detection, and rule-based insights.

**Architecture:** Modular analyzer pipeline — analysis-engine.js orchestrates 6 focused analyzers (base, self-comparator, competitor-comparator, anomaly-detector, insight-generator, cross-analyzer). Pure Node.js, no external dependencies. stats.js provides all math functions.

**Tech Stack:** Node.js (CommonJS), no npm dependencies, JSON Schema for output validation

**Spec:** `docs/superpowers/specs/2026-03-20-data-analysis-agent-design.md`

**Test data:** `~/.fontrends/runs/louis-vuitton-2025-03-19/data.json`

---

## File Structure

```
/tmp/fontrends-core/engines/analysis/
├── analysis-engine.js          — Orchestrator: reads inputs, runs pipeline, writes output
├── analyzers/
│   ├── base-analyzer.js        — Derived metrics per dimension (rates, averages, ratios)
│   ├── self-comparator.js      — MoM/QoQ/YoY comparison with direction
│   ├── competitor-comparator.js — Primary deep + market shallow comparison
│   ├── anomaly-detector.js     — Z-score + IQR anomaly detection
│   ├── insight-generator.js    — Rule-based insight text generation (Chinese)
│   └── cross-analyzer.js       — Pearson correlation + market position quadrant
├── schemas/
│   └── analysis-schema.json    — JSON Schema for output validation
├── utils/
│   └── stats.js                — Pure math: mean, stddev, zScore, percentile, pearson, iqr, changePct, direction, multiplier
└── __tests__/
    ├── stats.test.js
    ├── base-analyzer.test.js
    ├── self-comparator.test.js
    ├── competitor-comparator.test.js
    ├── anomaly-detector.test.js
    ├── insight-generator.test.js
    ├── cross-analyzer.test.js
    └── analysis-engine.test.js
```

**Important notes for implementer:**
- `helpers.js` lives at `/tmp/fontrends-core/engines/helpers.js` — the engine imports via `require('../helpers')`
- `readJSON()` from helpers.js returns `null` on error (never throws)
- data.json currently has single-period data; when §3 adds `previous_month` top-level field, MoM will use it for all dimensions. Until then, MoM is derived from `trend.monthly` for the trend dimension only; other dimensions get MoM = null
- `brand.json` may contain `market_competitors: [...]` array; if present, pass to competitor-comparator for market ranking

---

### Task 1: stats.js — Pure Math Utilities

**Files:**
- Create: `engines/analysis/utils/stats.js`
- Create: `engines/analysis/__tests__/stats.test.js`

- [ ] **Step 1: Write failing tests for all stats functions**

```javascript
// engines/analysis/__tests__/stats.test.js
const {
  mean, stddev, zScore, percentile, pearson, iqr,
  changePct, direction, multiplier
} = require('../utils/stats');

describe('stats', () => {
  describe('mean', () => {
    test('calculates arithmetic mean', () => {
      expect(mean([2, 4, 6])).toBe(4);
    });
    test('returns null for empty array', () => {
      expect(mean([])).toBeNull();
    });
    test('handles single element', () => {
      expect(mean([5])).toBe(5);
    });
  });

  describe('stddev', () => {
    test('calculates population standard deviation', () => {
      expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
    });
    test('returns null for empty array', () => {
      expect(stddev([])).toBeNull();
    });
  });

  describe('zScore', () => {
    test('calculates z-score of value against array', () => {
      const arr = [2, 4, 4, 4, 5, 5, 7, 9];
      const z = zScore(9, arr);
      expect(z).toBeGreaterThan(1.5);
    });
    test('returns null for empty array', () => {
      expect(zScore(5, [])).toBeNull();
    });
    test('returns null when stddev is 0', () => {
      expect(zScore(5, [5, 5, 5])).toBeNull();
    });
  });

  describe('percentile', () => {
    test('calculates 50th percentile (median)', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });
    test('calculates 25th percentile', () => {
      expect(percentile([1, 2, 3, 4, 5, 6, 7, 8], 25)).toBe(2.75);
    });
    test('returns null for empty array', () => {
      expect(percentile([], 50)).toBeNull();
    });
  });

  describe('pearson', () => {
    test('perfect positive correlation', () => {
      expect(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1.0, 5);
    });
    test('perfect negative correlation', () => {
      expect(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1.0, 5);
    });
    test('returns null for arrays shorter than 5', () => {
      expect(pearson([1, 2, 3], [4, 5, 6])).toBeNull();
    });
    test('returns null for mismatched lengths', () => {
      expect(pearson([1, 2, 3, 4, 5], [1, 2, 3])).toBeNull();
    });
  });

  describe('iqr', () => {
    test('calculates IQR', () => {
      const result = iqr([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.q1).toBeCloseTo(2.75, 1);
      expect(result.q3).toBeCloseTo(6.25, 1);
      expect(result.iqr).toBeCloseTo(3.5, 1);
      expect(result.lowerFence).toBeCloseTo(-2.5, 0);
      expect(result.upperFence).toBeCloseTo(11.5, 0);
    });
    test('returns null for empty array', () => {
      expect(iqr([])).toBeNull();
    });
  });

  describe('changePct', () => {
    test('positive change', () => {
      expect(changePct(120, 100)).toBeCloseTo(20.0, 1);
    });
    test('negative change', () => {
      expect(changePct(80, 100)).toBeCloseTo(-20.0, 1);
    });
    test('returns null when previous is 0', () => {
      expect(changePct(100, 0)).toBeNull();
    });
    test('returns null for null inputs', () => {
      expect(changePct(null, 100)).toBeNull();
    });
  });

  describe('direction', () => {
    test('up when change > threshold', () => {
      expect(direction(15)).toBe('up');
    });
    test('down when change < -threshold', () => {
      expect(direction(-15)).toBe('down');
    });
    test('flat within default 1% threshold', () => {
      expect(direction(0.5)).toBe('flat');
    });
    test('custom threshold', () => {
      expect(direction(3, 5)).toBe('flat');
      expect(direction(6, 5)).toBe('up');
    });
  });

  describe('multiplier', () => {
    test('calculates a/b ratio', () => {
      expect(multiplier(200, 100)).toBeCloseTo(2.0, 1);
    });
    test('returns null when b is 0', () => {
      expect(multiplier(100, 0)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/stats.test.js --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement stats.js**

```javascript
// engines/analysis/utils/stats.js
'use strict';

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (!arr || arr.length === 0) return null;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function zScore(value, arr) {
  if (!arr || arr.length === 0) return null;
  const m = mean(arr);
  const sd = stddev(arr);
  if (sd === 0) return null;
  return (value - m) / sd;
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function pearson(arrA, arrB) {
  if (!arrA || !arrB) return null;
  if (arrA.length !== arrB.length) return null;
  if (arrA.length < 5) return null;
  const n = arrA.length;
  const mA = mean(arrA);
  const mB = mean(arrB);
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const dA = arrA[i] - mA;
    const dB = arrB[i] - mB;
    num += dA * dB;
    denA += dA * dA;
    denB += dB * dB;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return null;
  return num / den;
}

function iqr(arr) {
  if (!arr || arr.length === 0) return null;
  const q1 = percentile(arr, 25);
  const q3 = percentile(arr, 75);
  const iqrVal = q3 - q1;
  return {
    q1, q3, iqr: iqrVal,
    lowerFence: q1 - 1.5 * iqrVal,
    upperFence: q3 + 1.5 * iqrVal,
    median: percentile(arr, 50),
  };
}

function changePct(current, previous) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function direction(changePctVal, threshold = 1) {
  if (changePctVal === null || changePctVal === undefined) return null;
  if (changePctVal > threshold) return 'up';
  if (changePctVal < -threshold) return 'down';
  return 'flat';
}

function multiplier(a, b) {
  if (b === 0 || b === null || b === undefined) return null;
  return a / b;
}

module.exports = {
  mean, stddev, zScore, percentile, pearson, iqr,
  changePct, direction, multiplier,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/stats.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/utils/stats.js engines/analysis/__tests__/stats.test.js
git commit -m "feat(analysis): add stats.js pure math utilities with tests"
```

---

### Task 2: base-analyzer.js — Derived Metrics Per Dimension

**Files:**
- Create: `engines/analysis/analyzers/base-analyzer.js`
- Create: `engines/analysis/__tests__/base-analyzer.test.js`

**Context:** Each dimension in data.json has raw numbers. base-analyzer computes derived metrics (rates, averages, indices) from those raw numbers. It must handle missing pages gracefully (return null for that dimension).

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/base-analyzer.test.js
const { analyzeDimension } = require('../analyzers/base-analyzer');

describe('base-analyzer', () => {
  test('social_overview: computes engagement_rate and avg_interaction_per_post', () => {
    const data = {
      influence: 4248000, posts: 107000, likes: 33314000,
      comments: 548000, shares: 275000, site_avg_influence: 736000,
    };
    const result = analyzeDimension('social_overview', data);
    expect(result.engagement_rate).toBeCloseTo(
      (33314000 + 548000 + 275000) / 107000 / 100, 0
    );
    expect(result.avg_interaction_per_post).toBeCloseTo(
      (33314000 + 548000 + 275000) / 107000, 0
    );
    expect(result.influence_density).toBeCloseTo(4248000 / 107000, 0);
  });

  test('trend: computes growth_rate and momentum_score', () => {
    const data = {
      monthly: [
        { month: '2024/04', influence: 20000 },
        { month: '2024/09', influence: 180000 },
        { month: '2024/11', influence: 350000 },
        { month: '2024/12', influence: 950000 },
        { month: '2025/01', influence: 950000 },
      ],
    };
    const result = analyzeDimension('trend', data);
    expect(result.growth_rate).toBeDefined();
    expect(result.trend_direction).toMatch(/up|down|flat/);
    expect(result.peak_month).toBe('2024/12');
  });

  test('language: computes dominant_language_pct', () => {
    const data = { english: 66.7, chinese: 27.8, japanese: 2.1, other: 3.4, total_articles: 107032 };
    const result = analyzeDimension('language', data);
    expect(result.dominant_language).toBe('english');
    expect(result.dominant_language_pct).toBe(66.7);
  });

  test('platform: computes platform_efficiency and concentration_index', () => {
    const data = {
      items: [
        { name: 'Instagram', influence: 3223000, posts: 15000, share: 75.9 },
        { name: 'Threads', influence: 454000, posts: 16000, share: 10.7 },
        { name: 'Facebook', influence: 313000, posts: 42000, share: 7.4 },
      ],
    };
    const result = analyzeDimension('platform', data);
    expect(result.platform_efficiency).toBeDefined();
    expect(result.concentration_index).toBeGreaterThan(0);
    expect(result.top_platform).toBe('Instagram');
  });

  test('kol: computes kol_coverage and top_kol_contribution', () => {
    const data = {
      items: [
        { rank: 1, name: 'louisvuitton', influence: 2700000, type: '官方' },
        { rank: 2, name: 'pharrell', influence: 200000, type: '創意總監' },
        { rank: 3, name: 'leeyufen', influence: 150000, type: '明星藝人' },
      ],
    };
    const result = analyzeDimension('kol', data);
    expect(result.total_kol_influence).toBe(3050000);
    expect(result.top_kol_contribution_pct).toBeGreaterThan(80);
    expect(result.kol_count).toBe(3);
  });

  test('sentiment: computes net_sentiment_score', () => {
    const data = { positive: 53.0, neutral: 36.1, negative: 10.9 };
    const result = analyzeDimension('sentiment', data);
    expect(result.positive_ratio).toBe(53.0);
    expect(result.negative_ratio).toBe(10.9);
    expect(result.net_sentiment_score).toBeCloseTo(42.1, 1);
  });

  test('search_intent: computes search_volume_index', () => {
    const data = { weighted_index: 290000000, keyword_count: 377, monthly_avg: 20590 };
    const result = analyzeDimension('search_intent', data);
    expect(result.search_volume_index).toBe(290000000);
    expect(result.avg_volume_per_keyword).toBeCloseTo(290000000 / 377, 0);
  });

  test('competitor_data: passes through raw metrics', () => {
    const data = { influence: 1118000, likes: 7015000, sentiment_positive: 50.2 };
    const result = analyzeDimension('competitor_data', data);
    expect(result.influence).toBe(1118000);
  });

  test('returns null for unknown dimension', () => {
    expect(analyzeDimension('unknown', {})).toBeNull();
  });

  test('returns null for null data', () => {
    expect(analyzeDimension('social_overview', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/base-analyzer.test.js --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement base-analyzer.js**

```javascript
// engines/analysis/analyzers/base-analyzer.js
'use strict';

const { mean, direction, changePct } = require('../utils/stats');

const ANALYZERS = {
  social_overview(data) {
    const totalInteractions = (data.likes || 0) + (data.comments || 0) + (data.shares || 0);
    const posts = data.posts || 1;
    return {
      engagement_rate: totalInteractions / posts / 100,
      avg_interaction_per_post: totalInteractions / posts,
      influence_density: (data.influence || 0) / posts,
      total_interactions: totalInteractions,
    };
  },

  trend(data) {
    if (!data.monthly || data.monthly.length === 0) return {};
    const values = data.monthly.map(m => m.influence);
    const first = values[0];
    const last = values[values.length - 1];
    const growthRate = changePct(last, first);
    // Momentum: last 2 months vs previous 2 months
    const recentAvg = mean(values.slice(-2));
    const earlierAvg = mean(values.slice(0, 2));
    const momentumScore = changePct(recentAvg, earlierAvg);
    // Peak
    const maxVal = Math.max(...values);
    const peakIdx = values.indexOf(maxVal);
    return {
      growth_rate: growthRate,
      trend_direction: direction(growthRate),
      momentum_score: momentumScore,
      peak_month: data.monthly[peakIdx].month,
      peak_influence: maxVal,
      total_months: data.monthly.length,
    };
  },

  language(data) {
    const langs = { english: data.english, chinese: data.chinese, japanese: data.japanese, other: data.other };
    const entries = Object.entries(langs).filter(([, v]) => v != null);
    entries.sort((a, b) => b[1] - a[1]);
    const dominant = entries[0] || ['unknown', 0];
    // Language diversity: 1 - HHI (Herfindahl index)
    const hhi = entries.reduce((s, [, pct]) => s + (pct / 100) ** 2, 0);
    return {
      dominant_language: dominant[0],
      dominant_language_pct: dominant[1],
      language_diversity_index: parseFloat((1 - hhi).toFixed(4)),
      total_articles: data.total_articles || 0,
    };
  },

  platform(data) {
    if (!data.items || data.items.length === 0) return {};
    const sorted = [...data.items].sort((a, b) => b.influence - a.influence);
    const totalInfluence = sorted.reduce((s, p) => s + p.influence, 0);
    // Efficiency: influence per post for each platform
    const efficiency = sorted.map(p => ({
      name: p.name,
      efficiency: p.posts > 0 ? p.influence / p.posts : 0,
    }));
    // HHI concentration index
    const hhi = sorted.reduce((s, p) => s + ((p.share || 0) / 100) ** 2, 0);
    return {
      top_platform: sorted[0].name,
      platform_efficiency: efficiency,
      concentration_index: parseFloat(hhi.toFixed(4)),
      platform_count: sorted.length,
      total_influence: totalInfluence,
    };
  },

  kol(data) {
    if (!data.items || data.items.length === 0) return {};
    const total = data.items.reduce((s, k) => s + k.influence, 0);
    const topContribution = total > 0 ? (data.items[0].influence / total) * 100 : 0;
    const types = {};
    data.items.forEach(k => {
      types[k.type] = (types[k.type] || 0) + 1;
    });
    return {
      total_kol_influence: total,
      top_kol_contribution_pct: parseFloat(topContribution.toFixed(1)),
      kol_count: data.items.length,
      kol_type_distribution: types,
      avg_kol_influence: parseFloat((total / data.items.length).toFixed(0)),
      kol_coverage: data.items.length, // number of KOLs tracked
    };
  },

  sentiment(data) {
    return {
      positive_ratio: data.positive,
      negative_ratio: data.negative,
      neutral_ratio: data.neutral,
      net_sentiment_score: parseFloat(((data.positive || 0) - (data.negative || 0)).toFixed(1)),
    };
  },

  search_intent(data) {
    const kwCount = data.keyword_count || 1;
    return {
      search_volume_index: data.weighted_index,
      keyword_count: data.keyword_count,
      monthly_avg: data.monthly_avg,
      avg_volume_per_keyword: parseFloat((data.weighted_index / kwCount).toFixed(0)),
      brand_vs_generic_ratio: null, // requires keyword-level data from §3 expansion
    };
  },

  competitor_data(data) {
    return {
      ...data,
      competitive_gap_score: null, // computed by competitor-comparator, placeholder here
    };
  },
};

// Map data.json page keys to analyzer keys
const PAGE_KEY_MAP = {
  social_overview: 'social_overview',
  language_distribution: 'language',
  trend: 'trend',
  platform: 'platform',
  kol: 'kol',
  sentiment: 'sentiment',
  search_intent: 'search_intent',
  competitor_data: 'competitor_data',
};

function analyzeDimension(pageKey, data) {
  if (!data) return null;
  const analyzerKey = PAGE_KEY_MAP[pageKey] || pageKey;
  const analyzer = ANALYZERS[analyzerKey];
  if (!analyzer) return null;
  return analyzer(data);
}

module.exports = { analyzeDimension, PAGE_KEY_MAP };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/base-analyzer.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/base-analyzer.js engines/analysis/__tests__/base-analyzer.test.js
git commit -m "feat(analysis): add base-analyzer with derived metrics for 8 dimensions"
```

---

### Task 3: self-comparator.js — MoM/QoQ/YoY Self-Comparison

**Files:**
- Create: `engines/analysis/analyzers/self-comparator.js`
- Create: `engines/analysis/__tests__/self-comparator.test.js`

**Context:** Compares current derived metrics against previous periods. Uses trend.monthly for MoM (last month vs second-to-last). QoQ/YoY come from historical run data loaded by the engine. Returns structured comparison with change_pct and direction.

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/self-comparator.test.js
const { compareSelf } = require('../analyzers/self-comparator');

describe('self-comparator', () => {
  test('computes MoM comparison for numeric metrics', () => {
    const current = { engagement_rate: 3.2, avg_interaction_per_post: 1250 };
    const previous = { engagement_rate: 2.8, avg_interaction_per_post: 1100 };
    const result = compareSelf(current, previous);
    expect(result.engagement_rate.current).toBe(3.2);
    expect(result.engagement_rate.previous).toBe(2.8);
    expect(result.engagement_rate.change_pct).toBeCloseTo(14.3, 0);
    expect(result.engagement_rate.direction).toBe('up');
  });

  test('returns null when previous is null', () => {
    const current = { engagement_rate: 3.2 };
    expect(compareSelf(current, null)).toBeNull();
  });

  test('skips non-numeric fields', () => {
    const current = { top_platform: 'Instagram', engagement_rate: 3.2 };
    const previous = { top_platform: 'Instagram', engagement_rate: 2.8 };
    const result = compareSelf(current, previous);
    expect(result.top_platform).toBeUndefined();
    expect(result.engagement_rate).toBeDefined();
  });

  test('handles metric missing in previous', () => {
    const current = { engagement_rate: 3.2, new_metric: 100 };
    const previous = { engagement_rate: 2.8 };
    const result = compareSelf(current, previous);
    expect(result.engagement_rate.direction).toBe('up');
    expect(result.new_metric).toBeUndefined();
  });

  test('flat direction for small changes', () => {
    const current = { engagement_rate: 3.02 };
    const previous = { engagement_rate: 3.0 };
    const result = compareSelf(current, previous);
    expect(result.engagement_rate.direction).toBe('flat');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/self-comparator.test.js --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement self-comparator.js**

```javascript
// engines/analysis/analyzers/self-comparator.js
'use strict';

const { changePct, direction } = require('../utils/stats');

/**
 * Compare current derived metrics against previous period.
 * Only compares numeric fields that exist in both objects.
 * @param {Object} current - derived_metrics from current period
 * @param {Object} previous - derived_metrics from previous period
 * @param {number} [threshold=1] - direction threshold (%)
 * @returns {Object|null} comparison per metric, or null if previous is missing
 */
function compareSelf(current, previous, threshold = 1) {
  if (!current || !previous) return null;
  const result = {};
  for (const key of Object.keys(current)) {
    if (typeof current[key] !== 'number') continue;
    if (typeof previous[key] !== 'number') continue;
    const change = changePct(current[key], previous[key]);
    result[key] = {
      current: current[key],
      previous: previous[key],
      change_abs: parseFloat((current[key] - previous[key]).toFixed(4)),
      change_pct: change !== null ? parseFloat(change.toFixed(1)) : null,
      direction: direction(change, threshold),
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

module.exports = { compareSelf };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/self-comparator.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/self-comparator.js engines/analysis/__tests__/self-comparator.test.js
git commit -m "feat(analysis): add self-comparator for MoM/QoQ/YoY comparison"
```

---

### Task 4: competitor-comparator.js — Primary + Market Comparison

**Files:**
- Create: `engines/analysis/analyzers/competitor-comparator.js`
- Create: `engines/analysis/__tests__/competitor-comparator.test.js`

**Context:** Compares brand metrics against primary competitor (deep: multiplier per metric) and market (shallow: ranking, SOV). Market ranking only generated when total brands >= 3.

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/competitor-comparator.test.js
const { compareCompetitor } = require('../analyzers/competitor-comparator');

describe('competitor-comparator', () => {
  const selfMetrics = { influence: 4248000, engagement_rate: 3.2 };

  test('primary comparison with multiplier and advantage', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 1118000, engagement_rate: 2.1 } };
    const result = compareCompetitor(selfMetrics, primary, []);
    expect(result.primary.brand).toBe('Gucci');
    expect(result.primary.metrics.influence.multiplier).toBeCloseTo(3.8, 0);
    expect(result.primary.metrics.influence.advantage).toBe('self');
    expect(result.primary.metrics.engagement_rate.advantage).toBe('self');
  });

  test('competitor advantage when competitor is higher', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 5000000 } };
    const result = compareCompetitor(selfMetrics, primary, []);
    expect(result.primary.metrics.influence.advantage).toBe('competitor');
  });

  test('market ranking with >= 3 brands', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 1118000 } };
    const market = [
      { brand: 'Hermes', influence: 3000000 },
      { brand: 'Chanel', influence: 2000000 },
      { brand: 'Dior', influence: 1500000 },
    ];
    const result = compareCompetitor(selfMetrics, primary, market);
    expect(result.market.ranking.influence.rank).toBe(1);
    expect(result.market.ranking.influence.total).toBe(5);
    expect(result.market.market_share_estimate).toBeGreaterThan(0);
  });

  test('no market ranking with < 3 total brands', () => {
    const primary = { brand: 'Gucci', metrics: { influence: 1118000 } };
    const result = compareCompetitor(selfMetrics, primary, []);
    expect(result.market.ranking).toEqual({});
    expect(result.market.market_share_estimate).toBeNull();
  });

  test('returns null when self metrics is null', () => {
    expect(compareCompetitor(null, { brand: 'Gucci', metrics: {} }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/competitor-comparator.test.js --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement competitor-comparator.js**

```javascript
// engines/analysis/analyzers/competitor-comparator.js
'use strict';

const { multiplier: calcMultiplier } = require('../utils/stats');

/**
 * Compare brand vs primary competitor (deep) and market (shallow).
 * @param {Object} selfMetrics - brand's derived_metrics (numeric fields)
 * @param {Object} primary - { brand: string, metrics: { [key]: number } }
 * @param {Array} market - [{ brand: string, influence: number, ...metricFields }]
 * @returns {Object|null}
 */
function compareCompetitor(selfMetrics, primary, market = []) {
  if (!selfMetrics) return null;

  // Primary comparison
  const primaryResult = { brand: primary?.brand || 'N/A', metrics: {} };
  if (primary?.metrics) {
    for (const key of Object.keys(primary.metrics)) {
      if (typeof primary.metrics[key] !== 'number') continue;
      const selfVal = selfMetrics[key];
      const compVal = primary.metrics[key];
      if (selfVal == null) continue;
      const mult = calcMultiplier(selfVal, compVal);
      let advantage = 'tie';
      if (selfVal > compVal * 1.05) advantage = 'self';
      else if (compVal > selfVal * 1.05) advantage = 'competitor';
      primaryResult.metrics[key] = {
        self: selfVal,
        competitor: compVal,
        multiplier: mult !== null ? parseFloat(mult.toFixed(2)) : null,
        advantage,
      };
    }
  }

  // Market comparison
  const allBrands = [
    { brand: 'self', ...selfMetrics },
    ...(primary?.metrics ? [{ brand: primary.brand, ...primary.metrics }] : []),
    ...market,
  ];
  const totalBrands = allBrands.length;
  const marketResult = {
    brands: allBrands.filter(b => b.brand !== 'self').map(b => b.brand),
    ranking: {},
    market_share_estimate: null,
  };

  if (totalBrands >= 3) {
    // Rank by influence (or any shared numeric key)
    const influenceValues = allBrands
      .map(b => ({ brand: b.brand, value: b.influence || 0 }))
      .sort((a, b) => b.value - a.value);

    const selfRank = influenceValues.findIndex(b => b.brand === 'self') + 1;
    const totalInfluence = influenceValues.reduce((s, b) => s + b.value, 0);

    if (totalInfluence > 0) {
      marketResult.ranking.influence = {
        rank: selfRank,
        total: totalBrands,
        percentile: parseFloat(((1 - (selfRank - 1) / totalBrands) * 100).toFixed(1)),
      };
      marketResult.market_share_estimate = parseFloat(
        (((selfMetrics.influence || 0) / totalInfluence) * 100).toFixed(1)
      );
    }
  }

  return { primary: primaryResult, market: marketResult };
}

module.exports = { compareCompetitor };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/competitor-comparator.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/competitor-comparator.js engines/analysis/__tests__/competitor-comparator.test.js
git commit -m "feat(analysis): add competitor-comparator with primary deep + market shallow comparison"
```

---

### Task 5: anomaly-detector.js — Z-score + IQR Detection

**Files:**
- Create: `engines/analysis/analyzers/anomaly-detector.js`
- Create: `engines/analysis/__tests__/anomaly-detector.test.js`

**Context:** Detects anomalous values in metric arrays. Uses Z-score for normally-distributed data (monthly volumes), IQR for skewed data (KOL influence). Returns anomaly objects with z_score, expected value, and severity.

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/anomaly-detector.test.js
const { detectAnomalies } = require('../analyzers/anomaly-detector');

describe('anomaly-detector', () => {
  test('detects z-score anomaly in monthly data', () => {
    const values = [20000, 180000, 350000, 950000, 950000];
    const result = detectAnomalies('influence', values, { method: 'zscore' });
    // 950000 should be flagged
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].metric).toBe('influence');
    expect(result[0].z_score).toBeGreaterThan(1);
  });

  test('detects IQR outlier in skewed data', () => {
    const values = [100, 120, 130, 150, 200, 2700000];
    const result = detectAnomalies('kol_influence', values, { method: 'iqr' });
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(2700000);
  });

  test('returns empty array for normal data', () => {
    const values = [100, 105, 110, 108, 103];
    const result = detectAnomalies('metric', values, { method: 'zscore' });
    expect(result).toEqual([]);
  });

  test('returns empty for empty array', () => {
    expect(detectAnomalies('metric', [], { method: 'zscore' })).toEqual([]);
  });

  test('returns empty for null', () => {
    expect(detectAnomalies('metric', null, { method: 'zscore' })).toEqual([]);
  });

  test('respects custom zscore threshold', () => {
    const values = [100, 100, 100, 100, 200];
    const strict = detectAnomalies('m', values, { method: 'zscore', threshold: 1.5 });
    const loose = detectAnomalies('m', values, { method: 'zscore', threshold: 3.0 });
    expect(strict.length).toBeGreaterThanOrEqual(loose.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/anomaly-detector.test.js --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement anomaly-detector.js**

```javascript
// engines/analysis/analyzers/anomaly-detector.js
'use strict';

const { mean, zScore, iqr } = require('../utils/stats');

/**
 * Detect anomalies in a numeric array.
 * @param {string} metricName - name for reporting
 * @param {number[]} values - array of values to check
 * @param {Object} opts
 * @param {string} opts.method - 'zscore' or 'iqr'
 * @param {number} [opts.threshold=2.5] - z-score threshold
 * @returns {Array<{metric, value, expected, z_score, likely_cause}>}
 */
function detectAnomalies(metricName, values, opts = {}) {
  if (!values || values.length < 3) return [];
  const method = opts.method || 'zscore';
  const threshold = opts.threshold || 2.5;
  const anomalies = [];

  if (method === 'zscore') {
    const avg = mean(values);
    for (const val of values) {
      const z = zScore(val, values);
      if (z !== null && Math.abs(z) > threshold) {
        anomalies.push({
          metric: metricName,
          value: val,
          expected: parseFloat(avg.toFixed(2)),
          z_score: parseFloat(z.toFixed(2)),
          likely_cause: null,
        });
      }
    }
  } else if (method === 'iqr') {
    const result = iqr(values);
    if (!result) return [];
    for (const val of values) {
      if (val > result.upperFence || val < result.lowerFence) {
        anomalies.push({
          metric: metricName,
          value: val,
          expected: parseFloat(result.median.toFixed(2)),
          z_score: zScore(val, values) ? parseFloat(zScore(val, values).toFixed(2)) : null,
          likely_cause: null,
        });
      }
    }
  }

  return anomalies;
}

module.exports = { detectAnomalies };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/anomaly-detector.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/anomaly-detector.js engines/analysis/__tests__/anomaly-detector.test.js
git commit -m "feat(analysis): add anomaly-detector with Z-score and IQR methods"
```

---

### Task 6: insight-generator.js — Rule-Based Insight Text

**Files:**
- Create: `engines/analysis/analyzers/insight-generator.js`
- Create: `engines/analysis/__tests__/insight-generator.test.js`

**Context:** Takes derived_metrics, self_comparison, competitor_comparison, and anomalies for one dimension. Produces an array of insight objects with Chinese text. Max 5 insights per dimension, sorted by severity. Dedup: same metric can't trigger both decline + laggard.

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/insight-generator.test.js
const { generateInsights } = require('../analyzers/insight-generator');

describe('insight-generator', () => {
  test('generates growth insight for MoM > 10%', () => {
    const input = {
      self_comparison: {
        mom: {
          engagement_rate: { current: 3.2, previous: 2.8, change_pct: 14.3, direction: 'up' },
        },
      },
    };
    const insights = generateInsights(input);
    expect(insights.length).toBeGreaterThan(0);
    const growth = insights.find(i => i.type === 'growth');
    expect(growth).toBeDefined();
    expect(growth.text).toContain('14.3%');
    expect(growth.severity).toBe('positive');
  });

  test('generates decline insight for MoM < -10%', () => {
    const input = {
      self_comparison: {
        mom: {
          engagement_rate: { current: 2.0, previous: 3.0, change_pct: -33.3, direction: 'down' },
        },
      },
    };
    const insights = generateInsights(input);
    const decline = insights.find(i => i.type === 'decline');
    expect(decline).toBeDefined();
    expect(decline.severity).toBe('negative');
  });

  test('generates anomaly insight', () => {
    const input = {
      anomalies: [
        { metric: 'influence', value: 950000, expected: 300000, z_score: 2.8 },
      ],
    };
    const insights = generateInsights(input);
    const anomaly = insights.find(i => i.type === 'anomaly');
    expect(anomaly).toBeDefined();
    expect(anomaly.severity).toBe('warning');
  });

  test('generates leader insight for rank 1', () => {
    const input = {
      competitor_comparison: {
        market: {
          ranking: { influence: { rank: 1, total: 5, percentile: 100 } },
        },
      },
    };
    const insights = generateInsights(input);
    const leader = insights.find(i => i.type === 'leader');
    expect(leader).toBeDefined();
    expect(leader.severity).toBe('positive');
  });

  test('generates correlation insight', () => {
    const input = {
      correlations: [
        { metric_a: 'influence', metric_b: 'search_volume', correlation: 0.87, strength: 'strong' },
      ],
    };
    const insights = generateInsights(input);
    const corr = insights.find(i => i.type === 'correlation');
    expect(corr).toBeDefined();
    expect(corr.severity).toBe('neutral');
    expect(corr.text).toContain('0.87');
  });

  test('dedup: same metric decline + laggard keeps only one', () => {
    const input = {
      self_comparison: {
        mom: {
          engagement_rate: { current: 2.0, previous: 3.0, change_pct: -33.3, direction: 'down' },
        },
      },
      competitor_comparison: {
        market: {
          ranking: { engagement_rate: { rank: 4, total: 5, percentile: 20 } },
        },
      },
    };
    const insights = generateInsights(input);
    const engInsights = insights.filter(i => i.evidence.metric === 'engagement_rate');
    expect(engInsights.length).toBe(1);
  });

  test('max 5 insights per call', () => {
    const input = {
      self_comparison: {
        mom: {
          m1: { change_pct: 50, direction: 'up' },
          m2: { change_pct: 40, direction: 'up' },
          m3: { change_pct: 30, direction: 'up' },
          m4: { change_pct: 20, direction: 'up' },
          m5: { change_pct: 15, direction: 'up' },
          m6: { change_pct: 12, direction: 'up' },
        },
      },
    };
    const insights = generateInsights(input);
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  test('returns empty for null input', () => {
    expect(generateInsights(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/insight-generator.test.js --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement insight-generator.js**

```javascript
// engines/analysis/analyzers/insight-generator.js
'use strict';

const MAX_INSIGHTS = 5;

const METRIC_LABELS = {
  engagement_rate: '互動率',
  avg_interaction_per_post: '平均互動數',
  influence_density: '影響力密度',
  growth_rate: '成長率',
  dominant_language_pct: '主要語言佔比',
  concentration_index: '平台集中度',
  top_kol_contribution_pct: 'Top KOL 貢獻比',
  net_sentiment_score: '淨好感度',
  search_volume_index: '搜尋量指數',
  influence: '影響力',
};

function label(metric) {
  return METRIC_LABELS[metric] || metric;
}

/**
 * Generate rule-based insights from dimension analysis results.
 * @param {Object} input - { derived_metrics, self_comparison, competitor_comparison, anomalies }
 * @returns {Array<{type, severity, text, evidence}>}
 */
function generateInsights(input) {
  if (!input) return [];
  const insights = [];

  // 1. Self-comparison insights (MoM/QoQ/YoY)
  const compPeriods = ['mom', 'qoq', 'yoy'];
  const periodLabels = { mom: 'MoM', qoq: 'QoQ', yoy: 'YoY' };

  if (input.self_comparison) {
    for (const period of compPeriods) {
      const comp = input.self_comparison[period];
      if (!comp) continue;
      for (const [metric, data] of Object.entries(comp)) {
        if (!data || data.change_pct === null) continue;
        const pctAbs = Math.abs(data.change_pct);
        if (data.direction === 'up' && pctAbs > 10) {
          insights.push({
            type: 'growth',
            severity: 'positive',
            text: `${label(metric)} ${periodLabels[period]} 成長 ${data.change_pct}%`,
            evidence: { metric, comparison: period },
            _sort: pctAbs,
          });
        } else if (data.direction === 'down' && pctAbs > 10) {
          insights.push({
            type: 'decline',
            severity: 'negative',
            text: `${label(metric)} ${periodLabels[period]} 下降 ${data.change_pct}%，需關注趨勢變化`,
            evidence: { metric, comparison: period },
            _sort: pctAbs,
          });
        }
      }
    }
  }

  // 2. Anomaly insights
  if (input.anomalies && input.anomalies.length > 0) {
    for (const a of input.anomalies) {
      const mult = a.expected > 0 ? (a.value / a.expected).toFixed(1) : 'N/A';
      insights.push({
        type: 'anomaly',
        severity: 'warning',
        text: `${label(a.metric)} 出現異常值（${a.value.toLocaleString()}），為預期值的 ${mult} 倍，建議確認是否有特殊事件`,
        evidence: { metric: a.metric, comparison: 'anomaly' },
        _sort: Math.abs(a.z_score || 0) * 10,
      });
    }
  }

  // 3. Competitor ranking insights
  if (input.competitor_comparison?.market?.ranking) {
    for (const [metric, rank] of Object.entries(input.competitor_comparison.market.ranking)) {
      if (rank.rank === 1 && rank.total >= 3) {
        insights.push({
          type: 'leader',
          severity: 'positive',
          text: `在 ${rank.total} 個競品中 ${label(metric)} 排名第一`,
          evidence: { metric, comparison: 'market' },
          _sort: rank.total * 5,
        });
      } else if (rank.rank > rank.total / 2) {
        insights.push({
          type: 'laggard',
          severity: 'negative',
          text: `${label(metric)} 在 ${rank.total} 個競品中排名第 ${rank.rank}`,
          evidence: { metric, comparison: 'market' },
          _sort: rank.rank * 3,
        });
      }
    }
  }

  // 4. Correlation insights
  if (input.correlations && input.correlations.length > 0) {
    for (const c of input.correlations) {
      if (Math.abs(c.correlation) > 0.7) {
        const dirLabel = c.correlation > 0 ? '正' : '負';
        insights.push({
          type: 'correlation',
          severity: 'neutral',
          text: `${label(c.metric_a)} 與 ${label(c.metric_b)} 呈${c.strength === 'strong' ? '高度' : '中度'}${dirLabel}相關（r=${c.correlation.toFixed(2)}）`,
          evidence: { metric: `${c.metric_a}_x_${c.metric_b}`, comparison: 'correlation' },
          _sort: Math.abs(c.correlation) * 10,
        });
      }
    }
  }

  // Dedup: same metric with decline + laggard → keep higher severity
  const seen = new Set();
  const deduped = [];
  // Sort by _sort descending first
  insights.sort((a, b) => (b._sort || 0) - (a._sort || 0));
  for (const ins of insights) {
    const key = `${ins.evidence.metric}_${ins.type}`;
    const altKey = ins.type === 'decline'
      ? `${ins.evidence.metric}_laggard`
      : ins.type === 'laggard'
        ? `${ins.evidence.metric}_decline`
        : null;
    if (seen.has(key)) continue;
    if (altKey && seen.has(altKey)) continue;
    seen.add(key);
    deduped.push(ins);
  }

  // Return top N, strip internal _sort
  return deduped.slice(0, MAX_INSIGHTS).map(({ _sort, ...rest }) => rest);
}

module.exports = { generateInsights, METRIC_LABELS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/insight-generator.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/insight-generator.js engines/analysis/__tests__/insight-generator.test.js
git commit -m "feat(analysis): add insight-generator with rule-based Chinese text generation"
```

---

### Task 7: cross-analyzer.js — Correlations + Market Position

**Files:**
- Create: `engines/analysis/analyzers/cross-analyzer.js`
- Create: `engines/analysis/__tests__/cross-analyzer.test.js`

**Context:** Runs after all dimensions are analyzed. Computes Pearson correlations between monthly time series (min n=5). Calculates market_position quadrant from overall scores. Collects cross-dimensional anomalies.

- [ ] **Step 1: Write failing tests**

```javascript
// engines/analysis/__tests__/cross-analyzer.test.js
const { analyzeCross } = require('../analyzers/cross-analyzer');

describe('cross-analyzer', () => {
  const dimensions = {
    social_overview: {
      derived_metrics: { engagement_rate: 3.2, influence: 4248000 },
      insights: [{ type: 'growth', severity: 'positive' }],
    },
    trend: {
      derived_metrics: {
        growth_rate: 4650,
        monthly_values: [20000, 180000, 350000, 950000, 950000],
      },
    },
    sentiment: {
      derived_metrics: { net_sentiment_score: 42.1 },
    },
  };

  test('computes correlations when monthly data available', () => {
    const result = analyzeCross(dimensions, {
      monthly_influence: [20000, 180000, 350000, 950000, 950000],
      monthly_search: [10000, 90000, 200000, 500000, 480000],
    });
    expect(result.correlations.length).toBeGreaterThan(0);
    expect(result.correlations[0].correlation).toBeDefined();
    expect(result.correlations[0].strength).toMatch(/strong|moderate|weak/);
  });

  test('skips correlation when n < 5', () => {
    const result = analyzeCross(dimensions, {
      monthly_influence: [100, 200, 300],
      monthly_search: [50, 100, 150],
    });
    expect(result.correlations).toEqual([]);
  });

  test('computes market position', () => {
    const result = analyzeCross(dimensions, {});
    expect(result.market_position.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.market_position.overall_score).toBeLessThanOrEqual(100);
    expect(result.market_position.quadrant).toMatch(/leader|challenger|niche|follower/);
    expect(result.market_position.strengths).toBeDefined();
    expect(result.market_position.weaknesses).toBeDefined();
  });

  test('returns empty structure for null dimensions', () => {
    const result = analyzeCross(null, {});
    expect(result.correlations).toEqual([]);
    expect(result.market_position.overall_score).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/cross-analyzer.test.js --no-cache`
Expected: FAIL

- [ ] **Step 3: Implement cross-analyzer.js**

```javascript
// engines/analysis/analyzers/cross-analyzer.js
'use strict';

const { pearson } = require('../utils/stats');

const CORRELATION_PAIRS = [
  { key_a: 'monthly_influence', key_b: 'monthly_search', dim_a: 'social_overview', dim_b: 'search', metric_a: 'influence', metric_b: 'search_volume' },
];

function correlationStrength(r) {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'strong';
  if (abs >= 0.4) return 'moderate';
  return 'weak';
}

/**
 * Cross-dimensional analysis.
 * @param {Object} dimensions - all dimension results keyed by dimension_id
 * @param {Object} timeSeries - { monthly_influence: [...], monthly_search: [...], ... }
 * @returns {{ correlations, anomalies, market_position }}
 */
function analyzeCross(dimensions, timeSeries = {}) {
  const correlations = [];
  const anomalies = [];

  if (!dimensions) {
    return {
      correlations: [],
      anomalies: [],
      market_position: { overall_score: 0, quadrant: 'follower', strengths: [], weaknesses: [] },
    };
  }

  // 1. Pearson correlations on monthly time series
  for (const pair of CORRELATION_PAIRS) {
    const arrA = timeSeries[pair.key_a];
    const arrB = timeSeries[pair.key_b];
    const r = pearson(arrA, arrB);
    if (r !== null) {
      const strength = correlationStrength(r);
      const dirLabel = r > 0 ? '正' : '負';
      correlations.push({
        dim_a: pair.dim_a,
        dim_b: pair.dim_b,
        metric_a: pair.metric_a,
        metric_b: pair.metric_b,
        correlation: parseFloat(r.toFixed(3)),
        strength,
        insight: `${pair.metric_a} 與 ${pair.metric_b} 呈${strength === 'strong' ? '高度' : strength === 'moderate' ? '中度' : '低度'}${dirLabel}相關（r=${r.toFixed(2)}）`,
      });
    }
  }

  // 2. Market position scoring
  // Score based on: sentiment (positive), trend direction, engagement
  let score = 50; // baseline
  const strengths = [];
  const weaknesses = [];

  const sentiment = dimensions.sentiment?.derived_metrics;
  if (sentiment) {
    if (sentiment.net_sentiment_score > 30) { score += 15; strengths.push('net_sentiment_score'); }
    else if (sentiment.net_sentiment_score < 0) { score -= 15; weaknesses.push('net_sentiment_score'); }
  }

  const trend = dimensions.trend?.derived_metrics;
  if (trend) {
    if (trend.trend_direction === 'up') { score += 15; strengths.push('growth_rate'); }
    else if (trend.trend_direction === 'down') { score -= 15; weaknesses.push('growth_rate'); }
  }

  const social = dimensions.social_overview?.derived_metrics;
  if (social) {
    if (social.engagement_rate > 2) { score += 10; strengths.push('engagement_rate'); }
    else if (social.engagement_rate < 1) { score -= 10; weaknesses.push('engagement_rate'); }
  }

  // Positive insights bonus
  const positiveCount = Object.values(dimensions)
    .flatMap(d => d.insights || [])
    .filter(i => i.severity === 'positive').length;
  score += Math.min(positiveCount * 2, 10);

  score = Math.max(0, Math.min(100, score));

  let quadrant;
  if (score >= 70) quadrant = 'leader';
  else if (score >= 50) quadrant = 'challenger';
  else if (score >= 30) quadrant = 'niche';
  else quadrant = 'follower';

  return {
    correlations: correlations.slice(0, 5),
    anomalies,
    market_position: {
      overall_score: score,
      quadrant,
      strengths,
      weaknesses,
    },
  };
}

module.exports = { analyzeCross };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/cross-analyzer.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add engines/analysis/analyzers/cross-analyzer.js engines/analysis/__tests__/cross-analyzer.test.js
git commit -m "feat(analysis): add cross-analyzer with Pearson correlations and market position scoring"
```

---

### Task 8: analysis-engine.js — Orchestrator + Integration Test

**Files:**
- Create: `engines/analysis/analysis-engine.js`
- Create: `engines/analysis/__tests__/analysis-engine.test.js`

**Context:** The main entry point. Reads data.json + brand.json, scans historical runs, orchestrates all analyzers in sequence, assembles analysis.json, validates constraints (>= 6 recommendations), writes output. Can be run via CLI: `node analysis-engine.js --run-dir ~/.fontrends/runs/louis-vuitton-2025-03-19`

- [ ] **Step 1: Write failing integration test**

```javascript
// engines/analysis/__tests__/analysis-engine.test.js
const path = require('path');
const fs = require('fs');
const { runAnalysis } = require('../analysis-engine');

// Use real LV data for integration test
const RUN_DIR = path.join(process.env.HOME, '.fontrends/runs/louis-vuitton-2025-03-19');

describe('analysis-engine integration', () => {
  let result;

  beforeAll(() => {
    // Skip if test data not available
    if (!fs.existsSync(path.join(RUN_DIR, 'data.json'))) {
      console.warn('Skipping integration test: LV data not found');
      return;
    }
    result = runAnalysis(RUN_DIR);
  });

  test('produces valid meta', () => {
    if (!result) return;
    expect(result.meta.brand).toBe('Louis Vuitton');
    expect(result.meta.schema_version).toBe('1.0');
    expect(result.meta.generated_at).toBeDefined();
    expect(result.meta.primary_competitor).toBe('Gucci');
  });

  test('has all 8 dimensions', () => {
    if (!result) return;
    const dims = Object.keys(result.dimensions);
    expect(dims.length).toBe(8);
    expect(dims).toContain('social_overview');
    expect(dims).toContain('trend');
    expect(dims).toContain('sentiment');
  });

  test('each dimension has derived_metrics and insights', () => {
    if (!result) return;
    for (const [key, dim] of Object.entries(result.dimensions)) {
      expect(dim.derived_metrics).toBeDefined();
      expect(dim.insights).toBeDefined();
      expect(Array.isArray(dim.insights)).toBe(true);
    }
  });

  test('has cross_dimensional with market_position', () => {
    if (!result) return;
    expect(result.cross_dimensional.market_position).toBeDefined();
    expect(result.cross_dimensional.market_position.quadrant).toMatch(/leader|challenger|niche|follower/);
  });

  test('has >= 6 recommendations', () => {
    if (!result) return;
    expect(result.recommendations.length).toBeGreaterThanOrEqual(6);
  });

  test('has quality scores', () => {
    if (!result) return;
    expect(result.quality.data_completeness).toBeGreaterThan(0);
    expect(result.quality.caveats.length).toBeGreaterThan(0);
  });

  test('ml_insights is null', () => {
    if (!result) return;
    expect(result.ml_insights).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/analysis-engine.test.js --no-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analysis-engine.js**

```javascript
// engines/analysis/analysis-engine.js
'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('../helpers');
const { analyzeDimension, PAGE_KEY_MAP } = require('./analyzers/base-analyzer');
const { compareSelf } = require('./analyzers/self-comparator');
const { compareCompetitor } = require('./analyzers/competitor-comparator');
const { detectAnomalies } = require('./analyzers/anomaly-detector');
const { generateInsights } = require('./analyzers/insight-generator');
const { analyzeCross } = require('./analyzers/cross-analyzer');

// Dimension ID mapping: data.json page key → analysis.json dimension key
const DIM_ID_MAP = {
  social_overview: 'social_overview',
  language_distribution: 'language',
  trend: 'trend',
  platform: 'platform',
  kol: 'kol',
  sentiment: 'sentiment',
  search_intent: 'search',
  competitor_data: 'competitor',
};

// Anomaly detection method per dimension
const ANOMALY_CONFIG = {
  social_overview: { method: 'zscore' },
  trend: { method: 'zscore' },
  language: { method: 'zscore' },
  platform: { method: 'zscore' },
  kol: { method: 'iqr' },
  sentiment: { method: 'zscore' },
  search: { method: 'zscore' },
  competitor: { method: 'zscore' },
};

/**
 * Scan historical runs for QoQ/YoY data.
 * @param {string} brand - brand name
 * @param {string} currentDate - current run date string
 * @returns {{ qoq: Object|null, yoy: Object|null, qoq_source: string|null, yoy_source: string|null }}
 */
function loadHistoricalRuns(brand, currentDate) {
  const runsDir = path.join(process.env.HOME, '.fontrends', 'runs');
  const result = { qoq: null, yoy: null, qoq_source: null, yoy_source: null };

  if (!fs.existsSync(runsDir)) return result;

  const brandLower = brand.toLowerCase().replace(/\s+/g, '-');
  const dirs = fs.readdirSync(runsDir)
    .filter(d => d.toLowerCase().startsWith(brandLower))
    .filter(d => d !== `${brandLower}-${currentDate}`)
    .sort()
    .reverse();

  // Parse current date for comparison
  const current = new Date(currentDate);

  for (const dir of dirs) {
    const dateMatch = dir.match(/(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) continue;
    const runDate = new Date(dateMatch[1]);
    const daysDiff = (current - runDate) / (1000 * 60 * 60 * 24);

    // QoQ: ~90 days ± 7
    if (!result.qoq && daysDiff >= 83 && daysDiff <= 97) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) {
        result.qoq = data;
        result.qoq_source = dataPath;
      }
    }

    // YoY: ~365 days ± 7
    if (!result.yoy && daysDiff >= 358 && daysDiff <= 372) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) {
        result.yoy = data;
        result.yoy_source = dataPath;
      }
    }
  }

  return result;
}

/**
 * Build MoM previous metrics from trend monthly data.
 * Since current data.json is single-period, we derive MoM from the monthly array.
 */
function deriveMoMFromTrend(trendData) {
  if (!trendData?.monthly || trendData.monthly.length < 2) return null;
  const months = trendData.monthly;
  return {
    current_month: months[months.length - 1],
    previous_month: months[months.length - 2],
  };
}

/**
 * Generate recommendations from all dimension insights.
 * Minimum 6, maximum 12. At least 2 immediate, 1 verify.
 */
function generateRecommendations(dimensions) {
  const allInsights = [];
  for (const [dimId, dim] of Object.entries(dimensions)) {
    for (const insight of (dim.insights || [])) {
      allInsights.push({ ...insight, dimension: dimId });
    }
  }

  const recs = [];
  let recId = 1;

  for (const insight of allInsights) {
    let priority, who, what, when, kpi;

    if (insight.type === 'decline' && insight.severity === 'negative') {
      priority = 'immediate';
      who = '社群行銷團隊';
      what = `針對${insight.evidence.metric}下降趨勢，調整內容策略`;
      when = '2 週內';
      kpi = `${insight.evidence.metric} 回升至前期水準`;
    } else if (insight.type === 'anomaly') {
      priority = 'verify';
      who = '數據分析團隊';
      what = `驗證 ${insight.evidence.metric} 異常值，確認是否為真實事件或數據源問題`;
      when = '1 週內';
      kpi = '完成異常原因確認報告';
    } else if (insight.type === 'leader') {
      priority = 'opportunistic';
      who = '品牌策略團隊';
      what = `維持 ${insight.evidence.metric} 領先優勢，加碼投入`;
      when = '下季度規劃';
      kpi = '維持市場排名第一';
    } else if (insight.type === 'laggard') {
      priority = 'medium_term';
      who = '社群行銷團隊';
      what = `針對 ${insight.evidence.metric} 落後指標，制定追趕計畫`;
      when = '1-3 個月';
      kpi = `${insight.evidence.metric} 排名提升至前 50%`;
    } else if (insight.type === 'growth') {
      priority = 'opportunistic';
      who = '品牌策略團隊';
      what = `把握 ${insight.evidence.metric} 成長動能，擴大投入`;
      when = '持續進行';
      kpi = '維持成長趨勢';
    } else {
      continue;
    }

    recs.push({
      id: `rec_${String(recId++).padStart(3, '0')}`,
      priority,
      who,
      what,
      when,
      kpi,
      rationale: `dimensions.${insight.dimension}.insights: ${insight.text}`,
      linked_dimensions: [insight.dimension],
    });
  }

  // Ensure minimums
  const immediateCount = recs.filter(r => r.priority === 'immediate').length;
  const verifyCount = recs.filter(r => r.priority === 'verify').length;

  // Pad with generic recommendations if needed
  if (immediateCount < 2) {
    for (let i = immediateCount; i < 2; i++) {
      recs.push({
        id: `rec_${String(recId++).padStart(3, '0')}`,
        priority: 'immediate',
        who: '社群行銷團隊',
        what: '檢視當前社群內容策略，確認與品牌目標一致',
        when: '2 週內',
        kpi: '完成策略檢視報告',
        rationale: '基於整體分析結果的通用建議',
        linked_dimensions: ['social_overview'],
      });
    }
  }

  if (verifyCount < 1) {
    recs.push({
      id: `rec_${String(recId++).padStart(3, '0')}`,
      priority: 'verify',
      who: '數據分析團隊',
      what: '建立定期數據品質檢查流程',
      when: '1 週內',
      kpi: '每週數據品質報告',
      rationale: '確保數據分析基礎穩固',
      linked_dimensions: ['social_overview'],
    });
  }

  // Ensure minimum 6 total
  while (recs.length < 6) {
    recs.push({
      id: `rec_${String(recId++).padStart(3, '0')}`,
      priority: 'medium_term',
      who: '品牌策略團隊',
      what: '制定下季度社群行銷計畫',
      when: '1-3 個月',
      kpi: '產出完整季度計畫書',
      rationale: '基於整體分析結果的策略規劃',
      linked_dimensions: ['social_overview', 'trend'],
    });
  }

  // Cap at 12
  return recs.slice(0, 12);
}

/**
 * Main analysis function.
 * @param {string} runDir - path to run directory containing data.json
 * @returns {Object} analysis.json content
 */
function runAnalysis(runDir) {
  // 1. Read inputs
  const dataJson = readJSON(path.join(runDir, 'data.json'));
  if (!dataJson) throw new Error(`data.json not found in ${runDir}`);

  const brandJson = readJSON(path.join(runDir, 'brand.json'));

  const brand = dataJson.meta?.brand || brandJson?.brand_name || 'Unknown';
  const primaryCompetitor = dataJson.meta?.competitor || brandJson?.primary_competitor || 'N/A';
  const dateMatch = runDir.match(/(\d{4}-\d{2}-\d{2})/);
  const currentDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);

  // 2. Load historical runs
  const historical = loadHistoricalRuns(brand, currentDate);

  // 3. Analyze each dimension
  const dimensions = {};
  const competitorRaw = dataJson.pages?.competitor_data?.data || {};

  for (const [pageKey, pageData] of Object.entries(dataJson.pages || {})) {
    const dimId = DIM_ID_MAP[pageKey];
    if (!dimId) continue;

    const data = pageData.data;
    if (!data) {
      dimensions[dimId] = { derived_metrics: {}, self_comparison: { mom: null, qoq: null, yoy: null }, competitor_comparison: null, anomalies: [], insights: [] };
      continue;
    }

    // a. Base analysis
    const derived = analyzeDimension(pageKey, data);

    // b. Self comparison — MoM
    // If data.json has top-level previous_month, use it for all dimensions
    // Otherwise, for trend dimension only, derive from monthly array
    let momPrevious = null;
    if (dataJson.previous_month?.pages?.[pageKey]?.data) {
      momPrevious = analyzeDimension(pageKey, dataJson.previous_month.pages[pageKey].data);
    } else if (pageKey === 'trend' && data.monthly && data.monthly.length >= 2) {
      momPrevious = analyzeDimension(pageKey, { monthly: data.monthly.slice(0, -1) });
    }
    const momComparison = compareSelf(derived, momPrevious);

    // QoQ/YoY from historical
    let qoqDerived = null;
    let yoyDerived = null;
    if (historical.qoq?.pages?.[pageKey]?.data) {
      qoqDerived = analyzeDimension(pageKey, historical.qoq.pages[pageKey].data);
    }
    if (historical.yoy?.pages?.[pageKey]?.data) {
      yoyDerived = analyzeDimension(pageKey, historical.yoy.pages[pageKey].data);
    }
    const qoqComparison = compareSelf(derived, qoqDerived);
    const yoyComparison = compareSelf(derived, yoyDerived);

    // c. Competitor comparison
    const competitorMetrics = {};
    if (dimId !== 'competitor') {
      if (competitorRaw.influence && derived?.influence) {
        competitorMetrics.influence = competitorRaw.influence;
      }
      if (competitorRaw.likes && derived?.total_interactions) {
        competitorMetrics.total_interactions = competitorRaw.likes;
      }
      if (competitorRaw.sentiment_positive != null && derived?.positive_ratio != null) {
        competitorMetrics.positive_ratio = competitorRaw.sentiment_positive;
      }
    }

    const marketCompetitors = (brandJson?.market_competitors || []).map(mc =>
      typeof mc === 'string' ? { brand: mc, influence: 0 } : mc
    );
    const primary = Object.keys(competitorMetrics).length > 0
      ? { brand: primaryCompetitor, metrics: competitorMetrics }
      : null;
    const compResult = derived ? compareCompetitor(derived, primary, marketCompetitors) : null;

    // d. Anomaly detection
    let anomalies = [];
    const config = ANOMALY_CONFIG[dimId] || { method: 'zscore' };
    if (pageKey === 'trend' && data.monthly) {
      const values = data.monthly.map(m => m.influence);
      anomalies = detectAnomalies('influence', values, config);
    } else if (pageKey === 'kol' && data.items) {
      const values = data.items.map(k => k.influence);
      anomalies = detectAnomalies('kol_influence', values, config);
    }

    // e. Insights
    const insights = generateInsights({
      derived_metrics: derived,
      self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison },
      competitor_comparison: compResult,
      anomalies,
    });

    dimensions[dimId] = {
      derived_metrics: derived || {},
      self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison },
      competitor_comparison: compResult,
      anomalies,
      insights,
    };
  }

  // 4. Cross-dimensional analysis
  const trendMonthly = dataJson.pages?.trend?.data?.monthly;
  const timeSeries = {};
  if (trendMonthly && trendMonthly.length >= 5) {
    timeSeries.monthly_influence = trendMonthly.map(m => m.influence);
  }
  const crossDim = analyzeCross(dimensions, timeSeries);

  // 5. Recommendations
  const recommendations = generateRecommendations(dimensions);

  // 6. Quality
  const totalDims = Object.keys(DIM_ID_MAP).length;
  const filledDims = Object.values(dimensions).filter(d => Object.keys(d.derived_metrics).length > 0).length;

  const quality = {
    data_completeness: parseFloat((filledDims / totalDims).toFixed(2)),
    confidence_scores: {},
    data_sources: {
      current: runDir,
      mom_source: null,
      qoq_source: historical.qoq_source,
      yoy_source: historical.yoy_source,
    },
    caveats: [
      '語言偵測準確率約 85-90%',
      '情緒分析無法偵測反諷與語碼轉換',
      'market_share_estimate 為社群聲量佔比（SOV），非實際營收市佔',
    ],
  };

  for (const [dimId, dim] of Object.entries(dimensions)) {
    const pageEntry = Object.entries(dataJson.pages || {}).find(([pk]) => DIM_ID_MAP[pk] === dimId);
    quality.confidence_scores[dimId] = pageEntry?.[1]?.confidence === 'high' ? 0.95 : pageEntry?.[1]?.confidence === 'medium' ? 0.75 : 0.5;
  }

  // 7. Assemble
  function compPeriodStatus(source, historicalData) {
    if (source) {
      const period = historicalData?.meta?.period || null;
      return { status: 'available', period };
    }
    return { status: 'insufficient_data', period: null };
  }

  const analysis = {
    meta: {
      brand,
      period: dataJson.meta?.period || currentDate.slice(0, 7),
      generated_at: new Date().toISOString(),
      comparison_periods: {
        mom: { status: (dataJson.previous_month || (trendMonthly && trendMonthly.length >= 2)) ? 'available' : 'insufficient_data', period: null },
        qoq: compPeriodStatus(historical.qoq_source, historical.qoq),
        yoy: compPeriodStatus(historical.yoy_source, historical.yoy),
      },
      schema_version: '1.0',
      primary_competitor: primaryCompetitor,
      market_competitors: [],
      methodology_version: '1.0',
    },
    dimensions,
    cross_dimensional: crossDim,
    recommendations,
    quality,
    ml_insights: null,
  };

  return analysis;
}

/**
 * CLI entry point.
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const runDirIdx = args.indexOf('--run-dir');
  if (runDirIdx === -1 || !args[runDirIdx + 1]) {
    console.error('Usage: node analysis-engine.js --run-dir <path>');
    process.exit(1);
  }
  const runDir = args[runDirIdx + 1];
  try {
    const result = runAnalysis(runDir);
    const outPath = path.join(runDir, 'analysis.json');
    writeJSON(outPath, result);
    console.log(`✅ analysis.json 已寫入：${outPath}`);
    console.log(`   維度：${Object.keys(result.dimensions).length}`);
    console.log(`   洞察：${Object.values(result.dimensions).flatMap(d => d.insights).length} 條`);
    console.log(`   建議：${result.recommendations.length} 條`);
    console.log(`   品質：${(result.quality.data_completeness * 100).toFixed(0)}%`);
  } catch (e) {
    console.error('❌ 分析失敗：', e.message);
    process.exit(1);
  }
}

module.exports = { runAnalysis };
```

- [ ] **Step 4: Run integration test**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/__tests__/analysis-engine.test.js --no-cache`
Expected: All PASS

- [ ] **Step 5: Run full analysis on LV data to verify output**

Run: `cd /tmp/fontrends-core && node engines/analysis/analysis-engine.js --run-dir ~/.fontrends/runs/louis-vuitton-2025-03-19`
Expected: `✅ analysis.json 已寫入` with dimensions=8, insights>0, recommendations>=6

- [ ] **Step 6: Commit**

```bash
git add engines/analysis/analysis-engine.js engines/analysis/__tests__/analysis-engine.test.js
git commit -m "feat(analysis): add analysis-engine orchestrator with CLI and integration test"
```

---

### Task 9: analysis-schema.json — Output Validation Schema

**Files:**
- Create: `engines/analysis/schemas/analysis-schema.json`

**Context:** JSON Schema for validating analysis.json output. Used by analysis-engine after assembly.

- [ ] **Step 1: Create the JSON Schema**

Create `engines/analysis/schemas/analysis-schema.json` with a JSON Schema that validates the top-level structure:
- `meta` (required: brand, period, generated_at, schema_version, comparison_periods)
- `dimensions` (object, each value has derived_metrics, self_comparison, insights)
- `cross_dimensional` (correlations array, market_position object)
- `recommendations` (array, minItems: 6, maxItems: 12)
- `quality` (data_completeness, confidence_scores, caveats, data_sources)
- `ml_insights` (nullable)

Note: Keep the schema practical — validate structure and required fields, not every possible metric name. The schema should catch missing sections, not enforce specific derived metric keys (which vary by dimension).

- [ ] **Step 2: Add validation to analysis-engine.js**

Add a `validateOutput(analysis)` function that loads the schema and validates using a lightweight approach (check required top-level keys, check recommendations count, check dimensions have required subkeys). No external JSON Schema library needed — use simple programmatic checks:

```javascript
function validateOutput(analysis) {
  const errors = [];
  if (!analysis.meta?.brand) errors.push('meta.brand is required');
  if (!analysis.meta?.schema_version) errors.push('meta.schema_version is required');
  if (!analysis.dimensions || Object.keys(analysis.dimensions).length === 0) errors.push('dimensions is empty');
  for (const [dimId, dim] of Object.entries(analysis.dimensions || {})) {
    if (!dim.derived_metrics) errors.push(`${dimId}.derived_metrics missing`);
    if (!dim.insights) errors.push(`${dimId}.insights missing`);
  }
  if (!analysis.recommendations || analysis.recommendations.length < 6) errors.push('recommendations must have >= 6 items');
  if (analysis.recommendations && analysis.recommendations.length > 12) errors.push('recommendations must have <= 12 items');
  if (!analysis.quality) errors.push('quality is required');
  if (errors.length > 0) {
    console.warn('⚠️ Output validation warnings:', errors);
  }
  return errors;
}
```

- [ ] **Step 3: Commit**

```bash
git add engines/analysis/schemas/analysis-schema.json
git commit -m "feat(analysis): add output validation schema and validateOutput function"
```

---

### Task 10: Run All Tests + Final Validation

**Files:** None new — validation only

- [ ] **Step 1: Run entire test suite**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/ --no-cache --verbose`
Expected: All tests PASS (stats, base-analyzer, self-comparator, competitor-comparator, anomaly-detector, insight-generator, cross-analyzer, analysis-engine)

- [ ] **Step 2: Run CLI on real data and inspect output**

Run: `cd /tmp/fontrends-core && node engines/analysis/analysis-engine.js --run-dir ~/.fontrends/runs/louis-vuitton-2025-03-19`

Then inspect:
```bash
node -e "const d=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.fontrends/runs/louis-vuitton-2025-03-19/analysis.json','utf8')); console.log('Dims:', Object.keys(d.dimensions)); console.log('Insights:', Object.values(d.dimensions).flatMap(x=>x.insights).length); console.log('Recs:', d.recommendations.length); console.log('Quality:', d.quality.data_completeness); console.log('Quadrant:', d.cross_dimensional.market_position.quadrant); console.log('MoM status:', d.meta.comparison_periods.mom.status);"
```

Expected:
```
Dims: [ 'social_overview', 'trend', 'language', 'platform', 'kol', 'sentiment', 'search', 'competitor' ]
Insights: > 0
Recs: 6-12
Quality: >= 0.8
Quadrant: leader or challenger
MoM status: available
```

- [ ] **Step 3: Verify recommendations constraints**

```bash
node -e "const d=JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.fontrends/runs/louis-vuitton-2025-03-19/analysis.json','utf8')); const imm=d.recommendations.filter(r=>r.priority==='immediate').length; const ver=d.recommendations.filter(r=>r.priority==='verify').length; console.log('Total:', d.recommendations.length, '(6-12)'); console.log('Immediate:', imm, '(>=2)'); console.log('Verify:', ver, '(>=1)');"
```

- [ ] **Step 4: Final commit with all files**

```bash
git add -A engines/analysis/
git commit -m "feat(analysis): complete §4 data analysis engine — 8 dimensions, self/competitor comparison, anomaly detection, insight generation"
```
