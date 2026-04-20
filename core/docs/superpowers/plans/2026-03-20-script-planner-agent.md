# §7 Script Planner Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an editorial decision engine that scores analysis dimensions and outputs script.json to control report chapter order, selection, and block composition.

**Architecture:** Four focused modules (signal-scorer, intent-scorer, block-assigner, headline-generator) orchestrated by script-planner.js. Each module is a pure function with no side effects — reads analysis.json + brand.json + schema, writes script.json.

**Tech Stack:** Node.js, Jest for testing, no external dependencies.

**Spec:** `docs/superpowers/specs/2026-03-20-script-planner-agent-design.md`

---

### Task 1: signal-scorer.js — Signal Strength Calculation

**Files:**
- Create: `engines/script-planner/scorers/signal-scorer.js`
- Test: `engines/script-planner/__tests__/signal-scorer.test.js`

This module computes a 0–1.0 signal_score for an analysis dimension based on insight count, anomaly count, max MoM change, and competitor data presence.

- [ ] **Step 1: Write the tests**

```javascript
// engines/script-planner/__tests__/signal-scorer.test.js
'use strict';

const { computeSignalScore } = require('../scorers/signal-scorer');

describe('computeSignalScore', () => {
  test('returns 0 for empty dimension', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    expect(computeSignalScore(dim)).toBe(0);
  });

  test('insight_signal: 3 insights = max 0.35', () => {
    const dim = {
      insights: [{ type: 'growth' }, { type: 'decline' }, { type: 'anomaly' }],
      anomalies: [], self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.35, 2);
  });

  test('insight_signal: 5 insights still caps at 0.35', () => {
    const dim = {
      insights: Array(5).fill({ type: 'growth' }),
      anomalies: [], self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.35, 2);
  });

  test('anomaly_signal: 2 anomalies = max 0.25', () => {
    const dim = {
      insights: [], anomalies: [{ metric: 'a' }, { metric: 'b' }],
      self_comparison: { mom: null }, competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.25, 2);
  });

  test('change_signal: max |change_pct| = 50 → 0.25', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { metric_a: { change_pct: 50 }, metric_b: { change_pct: -30 } } },
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.25, 2);
  });

  test('change_signal: max |change_pct| = 100 still caps at 0.25', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 100 } } },
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.25, 2);
  });

  test('compete_signal: competitor present → 0.15', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: { brand: 'Chanel' }, market: null },
    };
    expect(computeSignalScore(dim)).toBeCloseTo(0.15, 2);
  });

  test('compete_signal: market only (no primary) → 0', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: null, market: { brands: ['A'] } },
    };
    expect(computeSignalScore(dim)).toBe(0);
  });

  test('all signals maxed → 1.0', () => {
    const dim = {
      insights: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
      anomalies: [{ metric: 'x' }, { metric: 'y' }],
      self_comparison: { mom: { m: { change_pct: 60 } } },
      competitor_comparison: { primary: { brand: 'X' } },
    };
    expect(computeSignalScore(dim)).toBeCloseTo(1.0, 2);
  });

  test('self_comparison null → change_signal = 0', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: null,
      competitor_comparison: null,
    };
    expect(computeSignalScore(dim)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/signal-scorer.test.js --no-coverage 2>&1`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```javascript
// engines/script-planner/scorers/signal-scorer.js
'use strict';

/**
 * Compute signal_score (0–1.0) for a single analysis dimension.
 *
 * Formula:
 *   insight_signal  = min(insight_count / 3, 1.0) × 0.35
 *   anomaly_signal  = min(anomaly_count / 2, 1.0) × 0.25
 *   change_signal   = min(max_change_pct / 50, 1.0) × 0.25
 *   compete_signal  = has_primary_competitor ? 0.15 : 0
 *   signal_score    = sum
 */
function computeSignalScore(dimension) {
  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];
  const mom = dimension.self_comparison?.mom;
  const hasPrimary = dimension.competitor_comparison?.primary != null;

  // insight signal
  const insightSignal = Math.min(insights.length / 3, 1.0) * 0.35;

  // anomaly signal
  const anomalySignal = Math.min(anomalies.length / 2, 1.0) * 0.25;

  // change signal — max |change_pct| from MoM
  let maxChangePct = 0;
  if (mom && typeof mom === 'object') {
    for (const val of Object.values(mom)) {
      if (val && typeof val.change_pct === 'number') {
        maxChangePct = Math.max(maxChangePct, Math.abs(val.change_pct));
      }
    }
  }
  const changeSignal = Math.min(maxChangePct / 50, 1.0) * 0.25;

  // compete signal
  const competeSignal = hasPrimary ? 0.15 : 0;

  return insightSignal + anomalySignal + changeSignal + competeSignal;
}

module.exports = { computeSignalScore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/signal-scorer.test.js --no-coverage 2>&1`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/scorers/signal-scorer.js engines/script-planner/__tests__/signal-scorer.test.js
git commit -m "feat(§7): add signal-scorer with signal_score computation"
```

---

### Task 2: intent-scorer.js — Client Intent Boost

**Files:**
- Create: `engines/script-planner/scorers/intent-scorer.js`
- Test: `engines/script-planner/__tests__/intent-scorer.test.js`

This module returns the intent_boost multiplier (1.0 or 1.5) based on whether a dimension is in brand.json focus_dimensions.

- [ ] **Step 1: Write the tests**

```javascript
// engines/script-planner/__tests__/intent-scorer.test.js
'use strict';

const { getIntentBoost } = require('../scorers/intent-scorer');

describe('getIntentBoost', () => {
  test('dimension in focus_dimensions → 1.5', () => {
    const brand = { focus_dimensions: ['kol', 'trend'] };
    expect(getIntentBoost('kol', brand)).toBe(1.5);
  });

  test('dimension NOT in focus_dimensions → 1.0', () => {
    const brand = { focus_dimensions: ['kol', 'trend'] };
    expect(getIntentBoost('sentiment', brand)).toBe(1.0);
  });

  test('no focus_dimensions → 1.0', () => {
    expect(getIntentBoost('kol', {})).toBe(1.0);
    expect(getIntentBoost('kol', { name: 'LV' })).toBe(1.0);
  });

  test('null brand → 1.0', () => {
    expect(getIntentBoost('kol', null)).toBe(1.0);
  });

  test('empty focus_dimensions → 1.0', () => {
    expect(getIntentBoost('kol', { focus_dimensions: [] })).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/intent-scorer.test.js --no-coverage 2>&1`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```javascript
// engines/script-planner/scorers/intent-scorer.js
'use strict';

/**
 * Returns intent_boost multiplier for a dimension.
 * If dimension is in brand.focus_dimensions → 1.5, else → 1.0
 */
function getIntentBoost(analysisDimension, brand) {
  const focusDims = brand?.focus_dimensions;
  if (!Array.isArray(focusDims) || focusDims.length === 0) return 1.0;
  return focusDims.includes(analysisDimension) ? 1.5 : 1.0;
}

module.exports = { getIntentBoost };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/intent-scorer.test.js --no-coverage 2>&1`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/scorers/intent-scorer.js engines/script-planner/__tests__/intent-scorer.test.js
git commit -m "feat(§7): add intent-scorer for client focus boost"
```

---

### Task 3: block-assigner.js — Block Selection per Chapter

**Files:**
- Create: `engines/script-planner/block-assigner.js`
- Test: `engines/script-planner/__tests__/block-assigner.test.js`

Determines which paragraph blocks to include and exclude for a chapter based on analysis dimension data.

- [ ] **Step 1: Write the tests**

```javascript
// engines/script-planner/__tests__/block-assigner.test.js
'use strict';

const { assignBlocks } = require('../block-assigner');

describe('assignBlocks', () => {
  test('data_table always included', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('data_table');
  });

  test('insight_block and so_what included when insights exist', () => {
    const dim = { insights: [{ type: 'growth' }], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('insight_block');
    expect(blocks).toContain('so_what');
  });

  test('insight_block and so_what excluded when no insights', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks, excluded_blocks } = assignBlocks(dim);
    expect(blocks).not.toContain('insight_block');
    expect(blocks).not.toContain('so_what');
    expect(excluded_blocks).toContain('insight_block');
    expect(excluded_blocks).toContain('so_what');
  });

  test('anomaly_callout included when anomalies exist', () => {
    const dim = { insights: [], anomalies: [{ metric: 'x' }], self_comparison: { mom: null }, competitor_comparison: null };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('anomaly_callout');
  });

  test('anomaly_callout excluded when no anomalies', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('anomaly_callout');
  });

  test('self_comparison_note included when |change_pct| > 10', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 15 } } },
      competitor_comparison: null,
    };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('self_comparison_note');
  });

  test('self_comparison_note excluded when all |change_pct| <= 10', () => {
    const dim = {
      insights: [], anomalies: [],
      self_comparison: { mom: { x: { change_pct: 5 }, y: { change_pct: -8 } } },
      competitor_comparison: null,
    };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('self_comparison_note');
  });

  test('competitor_note included when competitor_comparison is not null', () => {
    const dim = {
      insights: [], anomalies: [], self_comparison: { mom: null },
      competitor_comparison: { primary: { brand: 'X' } },
    };
    const { blocks } = assignBlocks(dim);
    expect(blocks).toContain('competitor_note');
  });

  test('competitor_note excluded when competitor_comparison is null', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const { excluded_blocks } = assignBlocks(dim);
    expect(excluded_blocks).toContain('competitor_note');
  });

  test('action_link included when recommendations match dimension', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const recs = [
      { id: 'rec_001', linked_dimensions: ['trend'] },
      { id: 'rec_002', linked_dimensions: ['kol'] },
    ];
    const { blocks } = assignBlocks(dim, 'trend', recs);
    expect(blocks).toContain('action_link');
  });

  test('action_link excluded when no recommendations match', () => {
    const dim = { insights: [], anomalies: [], self_comparison: { mom: null }, competitor_comparison: null };
    const recs = [{ id: 'rec_001', linked_dimensions: ['kol'] }];
    const { excluded_blocks } = assignBlocks(dim, 'trend', recs);
    expect(excluded_blocks).toContain('action_link');
  });

  test('full dimension with everything → all blocks included', () => {
    const dim = {
      insights: [{ type: 'growth' }],
      anomalies: [{ metric: 'x' }],
      self_comparison: { mom: { x: { change_pct: 25 } } },
      competitor_comparison: { primary: { brand: 'Y' } },
    };
    const recs = [{ id: 'rec_001', linked_dimensions: ['trend'] }];
    const { blocks, excluded_blocks } = assignBlocks(dim, 'trend', recs);
    expect(blocks).toEqual(expect.arrayContaining([
      'data_table', 'insight_block', 'so_what', 'anomaly_callout',
      'self_comparison_note', 'competitor_note', 'action_link',
    ]));
    expect(excluded_blocks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/block-assigner.test.js --no-coverage 2>&1`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```javascript
// engines/script-planner/block-assigner.js
'use strict';

const ALL_BLOCKS = [
  'data_table', 'insight_block', 'so_what', 'action_link',
  'anomaly_callout', 'self_comparison_note', 'competitor_note',
];

/**
 * Determine which blocks to include/exclude for a chapter.
 * @param {object} dimension - analysis.json dimension data
 * @param {string} [analysisDimId] - dimension ID (for matching recommendations)
 * @param {Array} [recommendations] - all recommendations from analysis.json
 * @returns {{ blocks: string[], excluded_blocks: string[] }}
 */
function assignBlocks(dimension, analysisDimId = '', recommendations = []) {
  const blocks = [];
  const excluded = [];

  // data_table: always included
  blocks.push('data_table');

  // insight_block + so_what: require insights
  const hasInsights = (dimension.insights || []).length > 0;
  if (hasInsights) {
    blocks.push('insight_block');
    blocks.push('so_what');
  } else {
    excluded.push('insight_block');
    excluded.push('so_what');
  }

  // action_link: require matching recommendation
  const hasMatchingRec = recommendations.some(r =>
    (r.linked_dimensions || []).includes(analysisDimId)
  );
  if (hasMatchingRec) {
    blocks.push('action_link');
  } else {
    excluded.push('action_link');
  }

  // anomaly_callout: require anomalies
  if ((dimension.anomalies || []).length > 0) {
    blocks.push('anomaly_callout');
  } else {
    excluded.push('anomaly_callout');
  }

  // self_comparison_note: require any |change_pct| > 10 in MoM
  let hasSignificantChange = false;
  const mom = dimension.self_comparison?.mom;
  if (mom && typeof mom === 'object') {
    for (const val of Object.values(mom)) {
      if (val && typeof val.change_pct === 'number' && Math.abs(val.change_pct) > 10) {
        hasSignificantChange = true;
        break;
      }
    }
  }
  if (hasSignificantChange) {
    blocks.push('self_comparison_note');
  } else {
    excluded.push('self_comparison_note');
  }

  // competitor_note: require competitor_comparison
  if (dimension.competitor_comparison != null) {
    blocks.push('competitor_note');
  } else {
    excluded.push('competitor_note');
  }

  return { blocks, excluded_blocks: excluded };
}

module.exports = { assignBlocks };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/block-assigner.test.js --no-coverage 2>&1`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/block-assigner.js engines/script-planner/__tests__/block-assigner.test.js
git commit -m "feat(§7): add block-assigner for chapter block selection"
```

---

### Task 4: headline-generator.js — Focus + Headline

**Files:**
- Create: `engines/script-planner/headline-generator.js`
- Test: `engines/script-planner/__tests__/headline-generator.test.js`

Determines the focus type and headline text for a chapter based on insight/anomaly data.

- [ ] **Step 1: Write the tests**

```javascript
// engines/script-planner/__tests__/headline-generator.test.js
'use strict';

const { generateHeadline } = require('../headline-generator');

describe('generateHeadline', () => {
  test('anomaly focus when anomalies exist', () => {
    const dim = {
      insights: [{ type: 'growth', severity: 'positive', text: 'Growth text' }],
      anomalies: [{ metric: 'influence' }],
    };
    const { focus } = generateHeadline(dim, '聲量趨勢');
    expect(focus).toBe('anomaly');
  });

  test('growth focus when growth insight with positive severity', () => {
    const dim = {
      insights: [{ type: 'growth', severity: 'positive', text: 'momentum_score MoM 成長 54.5%' }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '聲量趨勢');
    expect(focus).toBe('growth');
    expect(headline).toBe('momentum_score MoM 成長 54.5%');
  });

  test('decline focus when decline insight exists', () => {
    const dim = {
      insights: [{ type: 'decline', severity: 'negative', text: '互動率下降 20%' }],
      anomalies: [],
    };
    const { focus } = generateHeadline(dim, '平台');
    expect(focus).toBe('decline');
  });

  test('leader focus when leader insight exists', () => {
    const dim = {
      insights: [{ type: 'leader', severity: 'positive', text: '排名第一' }],
      anomalies: [],
    };
    const { focus } = generateHeadline(dim, 'KOL');
    expect(focus).toBe('leader');
  });

  test('overview focus when no strong signals', () => {
    const dim = { insights: [], anomalies: [] };
    const { focus, headline } = generateHeadline(dim, '語系分布');
    expect(focus).toBe('overview');
    expect(headline).toBe('語系分布分析概況');
  });

  test('headline uses insights[0].text', () => {
    const dim = {
      insights: [
        { type: 'growth', severity: 'positive', text: '第一筆洞察' },
        { type: 'decline', severity: 'negative', text: '第二筆' },
      ],
      anomalies: [],
    };
    const { headline } = generateHeadline(dim, '趨勢');
    expect(headline).toBe('第一筆洞察');
  });

  test('headline fallback when no insights', () => {
    const dim = { insights: [], anomalies: [{ metric: 'x' }] };
    const { headline } = generateHeadline(dim, '好感度');
    expect(headline).toBe('好感度分析概況');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/headline-generator.test.js --no-coverage 2>&1`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```javascript
// engines/script-planner/headline-generator.js
'use strict';

/**
 * Determine focus type and headline for a chapter.
 * @param {object} dimension - analysis.json dimension data
 * @param {string} dimensionTitle - Chinese name (e.g., '聲量趨勢')
 * @returns {{ focus: string, headline: string }}
 */
function generateHeadline(dimension, dimensionTitle) {
  const insights = dimension.insights || [];
  const anomalies = dimension.anomalies || [];

  // Focus cascade: anomaly > growth > decline > leader > overview
  let focus = 'overview';
  if (anomalies.length > 0) {
    focus = 'anomaly';
  } else if (insights.some(i => i.type === 'growth' && i.severity === 'positive')) {
    focus = 'growth';
  } else if (insights.some(i => i.type === 'decline')) {
    focus = 'decline';
  } else if (insights.some(i => i.type === 'leader')) {
    focus = 'leader';
  }

  // Headline: first insight text, or fallback
  const headline = insights.length > 0 && insights[0].text
    ? insights[0].text
    : `${dimensionTitle}分析概況`;

  return { focus, headline };
}

module.exports = { generateHeadline };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/headline-generator.test.js --no-coverage 2>&1`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/headline-generator.js engines/script-planner/__tests__/headline-generator.test.js
git commit -m "feat(§7): add headline-generator for focus and headline"
```

---

### Task 5: script-planner.js — Main Orchestrator

**Files:**
- Create: `engines/script-planner/script-planner.js`
- Test: `engines/script-planner/__tests__/script-planner.test.js`

Orchestrates all modules: loads analysis.json + brand.json + schema, scores dimensions, assigns blocks, sorts chapters, writes script.json.

**Constants needed:**

```javascript
// pageId → analysis dimension ID mapping
const PAGE_TO_DIM = {
  kpi: 'social_overview', trend: 'trend', language: 'language',
  platform: 'platform', kol: 'kol', sentiment: 'sentiment',
  venue: 'search', competitor: 'competitor',
};

// pageId → Chinese title for headline fallback
const PAGE_TITLES = {
  kpi: '品牌社群影響力', trend: '聲量趨勢', language: '語系分布',
  platform: '平台效率', kol: 'KOL 生態', sentiment: '好感度',
  venue: '搜尋聲量與場域', competitor: '競爭態勢',
};

// pageId → primary_metric (per spec)
const PRIMARY_METRICS = {
  kpi: 'influence', trend: 'influence', language: 'language_diversity_index',
  platform: 'platform_efficiency', kol: 'kol_coverage', sentiment: 'net_sentiment_score',
  venue: 'search_volume_index', competitor: 'market_share_estimate',
};

// base_weight per schema × pageId
const BASE_WEIGHTS = {
  // validation omitted — no analysis dimension maps to it
  'full-13':     { kpi: 0.9, trend: 0.8, language: 0.5, platform: 0.7, kol: 0.8, sentiment: 0.6, venue: 0.4, competitor: 0.7 },
  'compact-8':   { kpi: 0.9, trend: 0.8, platform: 0.7, sentiment: 0.6 },
  'executive-5': { kpi: 0.9 },
  'mini-3':      {},  // all fixed, no scoreable pages
};

// Fixed pages per schema (not scored)
const FIXED_PAGES = {
  'full-13':     ['cover', 'summary', 'actions', 'closing'],
  'compact-8':   ['cover', 'summary', 'actions', 'closing'],
  'executive-5': ['cover', 'summary', 'actions', 'closing'],
  'mini-3':      ['cover', 'overview', 'actions_closing'],
};

// Severity sort order for insight_indices
const SEVERITY_ORDER = { negative: 0, warning: 1, positive: 2, neutral: 3 };
```

- [ ] **Step 1: Write the tests**

```javascript
// engines/script-planner/__tests__/script-planner.test.js
'use strict';

const { planScript } = require('../script-planner');

// Minimal analysis fixture
function makeAnalysis(overrides = {}) {
  const baseDim = () => ({
    derived_metrics: { influence: 1000 },
    self_comparison: { mom: null, qoq: null, yoy: null },
    competitor_comparison: null,
    anomalies: [],
    insights: [],
  });
  return {
    meta: { brand: 'TestBrand', period: '2025-03', schema_version: '1.0' },
    dimensions: {
      social_overview: baseDim(),
      trend: { ...baseDim(), insights: [{ type: 'growth', severity: 'positive', text: 'MoM +54%', evidence: { metric: 'momentum' } }], self_comparison: { mom: { momentum: { change_pct: 54 } }, qoq: null, yoy: null } },
      language: baseDim(),
      platform: baseDim(),
      kol: { ...baseDim(), anomalies: [{ metric: 'kol_influence', value: 500000 }], insights: [{ type: 'anomaly', severity: 'warning', text: 'KOL 影響力異常', evidence: { metric: 'kol_influence' } }] },
      sentiment: baseDim(),
      search: baseDim(),
      competitor: baseDim(),
      ...overrides,
    },
    recommendations: [
      { id: 'rec_001', priority: 'opportunistic', linked_dimensions: ['trend'] },
      { id: 'rec_002', priority: 'verify', linked_dimensions: ['kol'] },
      { id: 'rec_003', priority: 'immediate', linked_dimensions: ['social_overview'] },
      { id: 'rec_004', priority: 'immediate', linked_dimensions: ['social_overview'] },
      { id: 'rec_005', priority: 'medium_term', linked_dimensions: ['trend'] },
      { id: 'rec_006', priority: 'medium_term', linked_dimensions: ['platform'] },
    ],
    quality: { data_completeness: 1.0 },
  };
}

describe('planScript', () => {
  const brand = { name: 'TestBrand' };

  test('full-13: returns valid script.json structure', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    expect(result.meta.brand).toBe('TestBrand');
    expect(result.meta.schema).toBe('full-13');
    expect(result.meta.generated_at).toBeDefined();
    expect(result.fixed_pages).toEqual(['cover', 'summary', 'actions', 'closing']);
    expect(Array.isArray(result.chapters)).toBe(true);
    expect(Array.isArray(result.excluded)).toBe(true);
    expect(result.meta.total_chapters).toBe(result.chapters.length);
    expect(result.meta.excluded_count).toBe(result.excluded.length);
  });

  test('chapters are sorted by score descending', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    for (let i = 1; i < result.chapters.length; i++) {
      expect(result.chapters[i].score).toBeLessThanOrEqual(result.chapters[i - 1].score);
    }
  });

  test('trend chapter ranked high (has insights + MoM change)', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend).toBeDefined();
    expect(trend.rank).toBeLessThanOrEqual(3);
    expect(trend.focus).toBe('growth');
    expect(trend.headline).toBe('MoM +54%');
  });

  test('kol chapter has anomaly focus', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const kol = result.chapters.find(c => c.pageId === 'kol');
    expect(kol).toBeDefined();
    expect(kol.focus).toBe('anomaly');
  });

  test('chapters have correct blocks', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.blocks).toContain('data_table');
    expect(trend.blocks).toContain('insight_block');
    expect(trend.blocks).toContain('self_comparison_note'); // 54% > 10
    expect(trend.blocks).toContain('action_link'); // rec_001 links to trend
  });

  test('chapters have data_refs', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.data_refs.primary_metric).toBe('influence');
    expect(Array.isArray(trend.data_refs.insight_indices)).toBe(true);
    expect(Array.isArray(trend.data_refs.anomaly_indices)).toBe(true);
    expect(Array.isArray(trend.data_refs.recommendation_indices)).toBe(true);
  });

  test('intent_boost raises score for focused dimensions', () => {
    const analysis = makeAnalysis();
    const brandFocus = { name: 'TestBrand', focus_dimensions: ['sentiment'] };
    const result = planScript(analysis, brandFocus, 'full-13');
    const sentiment = result.chapters.find(c => c.pageId === 'sentiment');
    // sentiment has no insights/anomalies, but intent_boost = 1.5
    // Without boost: base_weight(0.6) × signal(low) × 1.0
    // With boost: base_weight(0.6) × signal(low) × 1.5
    // It may still be low but should exist if not excluded
    expect(sentiment).toBeDefined();
  });

  test('mini-3: passthrough, no chapters (all fixed)', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'mini-3');
    expect(result.chapters).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(result.fixed_pages).toEqual(['cover', 'overview', 'actions_closing']);
  });

  test('compact-8: only includes schema pages', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'compact-8');
    const pageIds = result.chapters.map(c => c.pageId);
    // compact-8 scoreable: kpi, trend, platform, sentiment
    for (const pid of pageIds) {
      expect(['kpi', 'trend', 'platform', 'sentiment']).toContain(pid);
    }
  });

  test('dimension with score < 0.2 is excluded', () => {
    // Make a dimension with zero signals
    const analysis = makeAnalysis({
      language: {
        derived_metrics: {},
        self_comparison: { mom: null, qoq: null, yoy: null },
        competitor_comparison: null,
        anomalies: [],
        insights: [],
      },
    });
    const result = planScript(analysis, brand, 'full-13');
    // language has base_weight=0.5, signal_score=0 → score=0 → excluded
    const langExcluded = result.excluded.find(e => e.pageId === 'language');
    expect(langExcluded).toBeDefined();
    expect(langExcluded.reason).toBe('insufficient_data');
  });

  test('low_relevance reason when signal > 0 but score < 0.2', () => {
    // Give venue (base=0.4) a tiny signal: 1 insight → signal ≈ 0.117
    // score = 0.4 × 0.117 × 1.0 = 0.047 → excluded as low_relevance
    const analysis = makeAnalysis({
      search: {
        derived_metrics: { search_volume_index: 10 },
        self_comparison: { mom: null, qoq: null, yoy: null },
        competitor_comparison: null,
        anomalies: [],
        insights: [{ type: 'growth', severity: 'positive', text: 'Minor growth', evidence: { metric: 'x' } }],
      },
    });
    const result = planScript(analysis, brand, 'full-13');
    const venueExcluded = result.excluded.find(e => e.pageId === 'venue');
    expect(venueExcluded).toBeDefined();
    expect(venueExcluded.reason).toBe('low_relevance');
  });

  test('empty dimensions → all chapters excluded', () => {
    const analysis = {
      meta: { brand: 'Empty', period: '2025-03', schema_version: '1.0' },
      dimensions: {},
      recommendations: [],
      quality: { data_completeness: 0 },
    };
    const result = planScript(analysis, brand, 'full-13');
    expect(result.chapters).toEqual([]);
    expect(result.excluded.length).toBeGreaterThan(0);
    result.excluded.forEach(e => expect(e.reason).toBe('insufficient_data'));
  });

  test('rank is sequential starting from 1', () => {
    const analysis = makeAnalysis();
    const result = planScript(analysis, brand, 'full-13');
    for (let i = 0; i < result.chapters.length; i++) {
      expect(result.chapters[i].rank).toBe(i + 1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/script-planner.test.js --no-coverage 2>&1`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```javascript
// engines/script-planner/script-planner.js
'use strict';

const { computeSignalScore } = require('./scorers/signal-scorer');
const { getIntentBoost } = require('./scorers/intent-scorer');
const { assignBlocks } = require('./block-assigner');
const { generateHeadline } = require('./headline-generator');

// ── Constants ────────────────────────────────────────────

// pageId → analysis dimension ID
const PAGE_TO_DIM = {
  kpi: 'social_overview', trend: 'trend', language: 'language',
  platform: 'platform', kol: 'kol', sentiment: 'sentiment',
  venue: 'search', competitor: 'competitor',
};

// pageId → Chinese display title
const PAGE_TITLES = {
  kpi: '品牌社群影響力', trend: '聲量趨勢', language: '語系分布',
  platform: '平台效率', kol: 'KOL 生態', sentiment: '好感度',
  venue: '搜尋聲量與場域', competitor: '競爭態勢',
};

// pageId → primary_metric
const PRIMARY_METRICS = {
  kpi: 'influence', trend: 'influence', language: 'language_diversity_index',
  platform: 'platform_efficiency', kol: 'kol_coverage',
  sentiment: 'net_sentiment_score', venue: 'search_volume_index',
  competitor: 'market_share_estimate',
};

// base_weight per schema (only scoreable pages listed)
const BASE_WEIGHTS = {
  // validation omitted — no analysis dimension maps to it
  'full-13':     { kpi: 0.9, trend: 0.8, language: 0.5, platform: 0.7, kol: 0.8, sentiment: 0.6, venue: 0.4, competitor: 0.7 },
  'compact-8':   { kpi: 0.9, trend: 0.8, platform: 0.7, sentiment: 0.6 },
  'executive-5': { kpi: 0.9 },
  'mini-3':      {},
};

// Fixed pages per schema
const FIXED_PAGES = {
  'full-13':     ['cover', 'summary', 'actions', 'closing'],
  'compact-8':   ['cover', 'summary', 'actions', 'closing'],
  'executive-5': ['cover', 'summary', 'actions', 'closing'],
  'mini-3':      ['cover', 'overview', 'actions_closing'],
};

// Severity sort order for insight selection
const SEVERITY_ORDER = { negative: 0, warning: 1, positive: 2, neutral: 3 };

// ── Score threshold ──────────────────────────────────────

const EXCLUDE_THRESHOLD = 0.2;
const INSUFFICIENT_EPSILON = 0.01;

// ── Main function ────────────────────────────────────────

/**
 * Plan the script: score dimensions, assign blocks, sort chapters.
 * @param {object} analysis - analysis.json content
 * @param {object} brand - brand.json content
 * @param {string} schemaName - schema preset name (e.g., 'full-13')
 * @returns {object} script.json structure
 */
function planScript(analysis, brand, schemaName) {
  const weights = BASE_WEIGHTS[schemaName] || {};
  const fixedPages = FIXED_PAGES[schemaName] || [];
  const dimensions = analysis.dimensions || {};
  const recommendations = analysis.recommendations || [];

  const chapters = [];
  const excluded = [];

  // Score each scoreable page
  for (const [pageId, baseWeight] of Object.entries(weights)) {
    const dimId = PAGE_TO_DIM[pageId];
    const dim = dimId ? dimensions[dimId] : null;

    if (!dim) {
      excluded.push({ pageId, score: 0, reason: 'insufficient_data' });
      continue;
    }

    const signalScore = computeSignalScore(dim);
    const intentBoost = getIntentBoost(dimId, brand);
    const score = parseFloat((baseWeight * signalScore * intentBoost).toFixed(4));

    if (score < EXCLUDE_THRESHOLD) {
      const reason = signalScore < INSUFFICIENT_EPSILON ? 'insufficient_data' : 'low_relevance';
      excluded.push({ pageId, score, reason });
      continue;
    }

    // Assign blocks
    const { blocks, excluded_blocks } = assignBlocks(dim, dimId, recommendations);

    // Generate headline + focus
    const title = PAGE_TITLES[pageId] || pageId;
    const { focus, headline } = generateHeadline(dim, title);

    // Build data_refs
    const insightIndices = selectInsightIndices(dim.insights || []);
    const anomalyIndices = (dim.anomalies || []).map((_, i) => i);
    const recommendationIndices = [];
    recommendations.forEach((rec, idx) => {
      if ((rec.linked_dimensions || []).includes(dimId)) {
        recommendationIndices.push(idx);
      }
    });

    chapters.push({
      pageId,
      rank: 0, // assigned after sort
      score,
      headline,
      focus,
      blocks,
      excluded_blocks,
      data_refs: {
        primary_metric: PRIMARY_METRICS[pageId] || 'influence',
        insight_indices: insightIndices,
        anomaly_indices: anomalyIndices,
        recommendation_indices: recommendationIndices,
      },
    });
  }

  // Sort by score descending
  chapters.sort((a, b) => b.score - a.score);

  // Assign rank
  chapters.forEach((ch, i) => { ch.rank = i + 1; });

  return {
    meta: {
      brand: brand?.name || analysis.meta?.brand || 'Unknown',
      schema: schemaName,
      generated_at: new Date().toISOString(),
      total_chapters: chapters.length,
      excluded_count: excluded.length,
    },
    chapters,
    excluded,
    fixed_pages: fixedPages,
  };
}

/**
 * Select top 3 insight indices, sorted by severity (negative first).
 */
function selectInsightIndices(insights) {
  if (insights.length === 0) return [];
  const indexed = insights.map((ins, i) => ({ i, severity: SEVERITY_ORDER[ins.severity] ?? 99 }));
  indexed.sort((a, b) => a.severity - b.severity);
  return indexed.slice(0, 3).map(x => x.i);
}

module.exports = { planScript };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/__tests__/script-planner.test.js --no-coverage 2>&1`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/script-planner.js engines/script-planner/__tests__/script-planner.test.js
git commit -m "feat(§7): add script-planner orchestrator with scoring and sorting"
```

---

### Task 6: CLI Entry Point

**Files:**
- Modify: `engines/script-planner/script-planner.js` (append CLI block)

Add CLI support so the planner can be invoked standalone:
`node engines/script-planner/script-planner.js --run-dir <path> --schema full-13`

- [ ] **Step 1: Append CLI block to script-planner.js**

Add at the end of `engines/script-planner/script-planner.js`, before the `module.exports` line:

```javascript
// ── CLI ──────────────────────────────────────────────────

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run-dir');
  const schemaIdx = args.indexOf('--schema');
  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node script-planner.js --run-dir <path> [--schema full-13]');
    process.exit(1);
  }
  const runDir = args[runIdx + 1];
  const schemaName = schemaIdx !== -1 && args[schemaIdx + 1] ? args[schemaIdx + 1] : 'full-13';

  // Read inputs
  const analysisPath = path.join(runDir, 'analysis.json');
  const brandPath = path.join(runDir, 'brand.json');
  if (!fs.existsSync(analysisPath)) { console.error(`analysis.json not found: ${analysisPath}`); process.exit(1); }
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const brand = fs.existsSync(brandPath) ? JSON.parse(fs.readFileSync(brandPath, 'utf-8')) : {};

  // Plan
  const script = planScript(analysis, brand, schemaName);

  // Write
  const outPath = path.join(runDir, 'script.json');
  fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`script.json written: ${outPath}`);
  console.log(`  chapters: ${script.chapters.length}`);
  console.log(`  excluded: ${script.excluded.length}`);
  console.log(`  fixed: ${script.fixed_pages.join(', ')}`);
}
```

- [ ] **Step 2: Test CLI with real LV data**

Run: `cd /tmp/fontrends-core && node engines/script-planner/script-planner.js --run-dir /Users/vincentkao/.fontrends/runs/louis-vuitton-2025-03-19 --schema full-13 2>&1`
Expected: `script.json written:` + chapter/excluded counts

- [ ] **Step 3: Verify script.json output**

Run: `cd /tmp/fontrends-core && node -e "const s=JSON.parse(require('fs').readFileSync('/Users/vincentkao/.fontrends/runs/louis-vuitton-2025-03-19/script.json','utf8')); console.log('chapters:', s.chapters.map(c => c.pageId + '(' + c.score + ')').join(', ')); console.log('excluded:', s.excluded.map(e => e.pageId + '(' + e.reason + ')').join(', '));" 2>&1`

- [ ] **Step 4: Commit**

```bash
git add engines/script-planner/script-planner.js
git commit -m "feat(§7): add CLI entry point for script-planner"
```

---

### Task 7: Run All Tests

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd /tmp/fontrends-core && npx jest engines/script-planner/ --no-coverage 2>&1`
Expected: 4 test suites, all passing (signal-scorer: 10, intent-scorer: 5, block-assigner: 12, script-planner: 13 = ~40 tests total)

- [ ] **Step 2: Run analysis engine tests to confirm no regression**

Run: `cd /tmp/fontrends-core && npx jest engines/analysis/ --no-coverage 2>&1`
Expected: 8 test suites, 72 tests, all passing

---
