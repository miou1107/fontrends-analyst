# §5 Purpose Binder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent module that reads interview.json + brand.json + analysis.json, produces purpose.json with relevance scores and narrative hooks per dimension, and wires into §7 script-planner.

**Architecture:** §5 is a standalone module at `engines/purpose-binder/` with 4 files: affinity-table (lookup), signal-scorer (data strength), hook-generator (templates), and purpose-binder (orchestrator). §7's intent-scorer and headline-generator get minimal modifications to consume purpose.json. Fully opt-in — no purpose.json means no behavior change.

**Tech Stack:** Node.js, CommonJS, Jest 30, no external dependencies.

---

## File Structure

```
engines/purpose-binder/
├── affinity-table.js       # Purpose type → dimension affinity weights
├── signal-scorer.js        # analysis.json dimension → signal_strength (0-1)
├── hook-generator.js       # Template-based hook generation + LLM interface stub
├── purpose-binder.js       # Orchestrator: reads inputs, writes purpose.json
└── __tests__/
    ├── affinity-table.test.js
    ├── signal-scorer.test.js
    ├── hook-generator.test.js
    └── purpose-binder.test.js

Modifications:
├── engines/script-planner/scorers/intent-scorer.js  (add purpose_factor)
├── engines/script-planner/headline-generator.js      (add hook fallback)
└── engines/script-planner/script-planner.js          (read purpose.json, pass bindings)
```

---

### Task 1: Affinity Table

**Files:**
- Create: `engines/purpose-binder/affinity-table.js`
- Test: `engines/purpose-binder/__tests__/affinity-table.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';

const { getAffinityWeights, PURPOSE_TYPES, DIMENSIONS } = require('../affinity-table');

describe('getAffinityWeights', () => {
  test('sell-venue returns expected high-affinity dimensions', () => {
    const w = getAffinityWeights('sell-venue');
    expect(w.trend).toBeGreaterThanOrEqual(0.8);
    expect(w.platform).toBeGreaterThanOrEqual(0.6);
    expect(w.search).toBeGreaterThanOrEqual(0.7);
    expect(w.kol).toBeGreaterThanOrEqual(0.7);
  });

  test('brand-review returns expected high-affinity dimensions', () => {
    const w = getAffinityWeights('brand-review');
    expect(w.trend).toBeGreaterThanOrEqual(0.8);
    expect(w.sentiment).toBeGreaterThanOrEqual(0.7);
    expect(w.competitor).toBeGreaterThanOrEqual(0.7);
    expect(w.social_overview).toBeGreaterThanOrEqual(0.7);
  });

  test('unknown purpose type returns all 0.5', () => {
    const w = getAffinityWeights('totally-unknown');
    for (const dim of DIMENSIONS) {
      expect(w[dim]).toBe(0.5);
    }
  });

  test('all known purpose types return weights for all dimensions', () => {
    for (const pt of PURPOSE_TYPES) {
      const w = getAffinityWeights(pt);
      for (const dim of DIMENSIONS) {
        expect(w[dim]).toBeGreaterThanOrEqual(0);
        expect(w[dim]).toBeLessThanOrEqual(1);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/purpose-binder/__tests__/affinity-table.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

const DIMENSIONS = [
  'social_overview', 'trend', 'language', 'platform',
  'kol', 'sentiment', 'search', 'competitor',
];

const PURPOSE_TYPES = [
  'sell-venue', 'brand-review', 'market-entry', 'kol-strategy', 'crisis-response',
];

const AFFINITY_TABLE = {
  'sell-venue': {
    social_overview: 0.5, trend: 0.9, language: 0.4, platform: 0.7,
    kol: 0.7, sentiment: 0.5, search: 0.8, competitor: 0.5,
  },
  'brand-review': {
    social_overview: 0.8, trend: 0.9, language: 0.5, platform: 0.6,
    kol: 0.5, sentiment: 0.7, search: 0.4, competitor: 0.7,
  },
  'market-entry': {
    social_overview: 0.5, trend: 0.6, language: 0.8, platform: 0.7,
    kol: 0.4, sentiment: 0.5, search: 0.9, competitor: 0.8,
  },
  'kol-strategy': {
    social_overview: 0.4, trend: 0.5, language: 0.4, platform: 0.7,
    kol: 0.9, sentiment: 0.7, search: 0.3, competitor: 0.4,
  },
  'crisis-response': {
    social_overview: 0.5, trend: 0.8, language: 0.3, platform: 0.5,
    kol: 0.7, sentiment: 0.9, search: 0.5, competitor: 0.4,
  },
};

function getAffinityWeights(purposeType) {
  if (AFFINITY_TABLE[purposeType]) return { ...AFFINITY_TABLE[purposeType] };
  const neutral = {};
  for (const dim of DIMENSIONS) neutral[dim] = 0.5;
  return neutral;
}

module.exports = { getAffinityWeights, PURPOSE_TYPES, DIMENSIONS, AFFINITY_TABLE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest engines/purpose-binder/__tests__/affinity-table.test.js --no-coverage`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add engines/purpose-binder/affinity-table.js engines/purpose-binder/__tests__/affinity-table.test.js
git commit -m "feat(purpose-binder): add affinity table for purpose-dimension weights"
```

---

### Task 2: Signal Scorer

**Files:**
- Create: `engines/purpose-binder/signal-scorer.js`
- Test: `engines/purpose-binder/__tests__/signal-scorer.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';

const { computeSignalStrength } = require('../signal-scorer');

describe('computeSignalStrength', () => {
  test('returns 1.0 when dimension has anomalies', () => {
    const dim = { anomalies: [{ metric: 'x', value: 100 }], insights: [] };
    expect(computeSignalStrength(dim)).toBe(1.0);
  });

  test('returns 0.8 for growth insight', () => {
    const dim = { anomalies: [], insights: [{ type: 'growth', severity: 'positive' }] };
    expect(computeSignalStrength(dim)).toBe(0.8);
  });

  test('returns 0.8 for decline insight', () => {
    const dim = { anomalies: [], insights: [{ type: 'decline', severity: 'negative' }] };
    expect(computeSignalStrength(dim)).toBe(0.8);
  });

  test('returns 0.5 for normal data', () => {
    const dim = { anomalies: [], insights: [{ type: 'leader', severity: 'positive' }], derived_metrics: { x: 1 } };
    expect(computeSignalStrength(dim)).toBe(0.5);
  });

  test('returns 0.2 for empty dimension', () => {
    expect(computeSignalStrength({})).toBe(0.2);
    expect(computeSignalStrength(null)).toBe(0.2);
  });

  test('anomaly takes priority over growth', () => {
    const dim = {
      anomalies: [{ metric: 'x' }],
      insights: [{ type: 'growth', severity: 'positive' }],
    };
    expect(computeSignalStrength(dim)).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/purpose-binder/__tests__/signal-scorer.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

function computeSignalStrength(dimension) {
  if (!dimension) return 0.2;

  const anomalies = dimension.anomalies || [];
  const insights = dimension.insights || [];

  if (anomalies.length > 0) return 1.0;

  const hasGrowthOrDecline = insights.some(
    i => i.type === 'growth' || i.type === 'decline'
  );
  if (hasGrowthOrDecline) return 0.8;

  const hasAnyData = (insights.length > 0) ||
    (dimension.derived_metrics && Object.keys(dimension.derived_metrics).length > 0);
  if (hasAnyData) return 0.5;

  return 0.2;
}

module.exports = { computeSignalStrength };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest engines/purpose-binder/__tests__/signal-scorer.test.js --no-coverage`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add engines/purpose-binder/signal-scorer.js engines/purpose-binder/__tests__/signal-scorer.test.js
git commit -m "feat(purpose-binder): add signal scorer for dimension data strength"
```

---

### Task 3: Hook Generator

**Files:**
- Create: `engines/purpose-binder/hook-generator.js`
- Test: `engines/purpose-binder/__tests__/hook-generator.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';

const { generateHook, templateBasedHook, HOOK_TEMPLATES } = require('../hook-generator');

describe('templateBasedHook', () => {
  test('sell-venue + trend produces hook with brand and venue', () => {
    const ctx = {
      brand: 'Louis Vuitton',
      venue: '台北101',
      dimension: 'trend',
      metrics: { mom_growth: 54.5 },
      insightType: 'growth',
      season: 'Q4',
    };
    const hook = templateBasedHook('sell-venue', 'trend', ctx);
    expect(hook).toContain('Louis Vuitton');
    expect(hook).toContain('101');
    expect(hook).toContain('54.5');
  });

  test('sell-venue + platform produces hook', () => {
    const ctx = {
      brand: 'LV',
      venue: '台北101',
      dimension: 'platform',
      metrics: { top_platform: 'Instagram' },
    };
    const hook = templateBasedHook('sell-venue', 'platform', ctx);
    expect(hook).toContain('Instagram');
    expect(hook).toContain('101');
  });

  test('returns null for unknown purpose + dimension combo', () => {
    const ctx = { brand: 'X', venue: 'Y', dimension: 'xyz', metrics: {} };
    expect(templateBasedHook('unknown-purpose', 'xyz', ctx)).toBeNull();
  });

  test('returns null when no template for dimension', () => {
    const ctx = { brand: 'X', venue: 'Y', dimension: 'language', metrics: {} };
    expect(templateBasedHook('sell-venue', 'language', ctx)).toBeNull();
  });

  test('handles missing metrics gracefully', () => {
    const ctx = { brand: 'LV', venue: '101', dimension: 'trend', metrics: {} };
    const hook = templateBasedHook('sell-venue', 'trend', ctx);
    // Should not throw, returns simplified version or null
    expect(hook === null || typeof hook === 'string').toBe(true);
  });
});

describe('generateHook', () => {
  test('without LLM uses template-based', async () => {
    const ctx = {
      brand: 'LV', venue: '台北101', dimension: 'trend',
      metrics: { mom_growth: 54.5 }, insightType: 'growth', season: 'Q4',
    };
    const hook = await generateHook('sell-venue', 'trend', ctx);
    expect(typeof hook === 'string' || hook === null).toBe(true);
  });

  test('with llmProvider calls the provider', async () => {
    const provider = jest.fn().mockResolvedValue('LLM 潤飾後的 hook');
    const ctx = { brand: 'LV', venue: '101', dimension: 'trend', metrics: {} };
    const hook = await generateHook('sell-venue', 'trend', ctx, {
      useLLM: true,
      llmProvider: provider,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(hook).toBe('LLM 潤飾後的 hook');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/purpose-binder/__tests__/hook-generator.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

const HOOK_TEMPLATES = {
  'sell-venue': {
    trend: (ctx) => {
      const dir = ctx.insightType === 'growth' ? '成長' : ctx.insightType === 'decline' ? '下滑' : '波動';
      const pct = ctx.metrics?.mom_growth;
      if (!pct) return null;
      const season = ctx.season ? `${ctx.season} ` : '';
      return `${ctx.brand} 聲量${dir} ${pct}%，${season}正值${ctx.venue}旺季`;
    },
    platform: (ctx) => {
      const top = ctx.metrics?.top_platform;
      if (!top) return null;
      return `${top} 高互動效率契合${ctx.venue}地標視覺特性`;
    },
    search: (ctx) => {
      const top = ctx.metrics?.search_intent_top;
      if (!top) return `搜尋意圖與${ctx.venue}定位高度吻合`;
      return `${top} 搜尋意圖與${ctx.venue}定位高度吻合`;
    },
    kol: (ctx) => {
      const count = ctx.metrics?.kol_count;
      if (!count) return `KOL 覆蓋強化${ctx.venue}品牌曝光`;
      return `${count} 位 KOL 覆蓋，強化${ctx.venue}品牌曝光`;
    },
    sentiment: (ctx) => {
      const pct = ctx.metrics?.positive_ratio;
      if (!pct) return null;
      return `正面聲量佔 ${(pct * 100).toFixed(0)}%，${ctx.venue}品牌形象加分`;
    },
  },
  'brand-review': {
    trend: (ctx) => {
      const dir = ctx.insightType === 'growth' ? '成長' : ctx.insightType === 'decline' ? '下滑' : '持平';
      const pct = ctx.metrics?.mom_growth;
      if (!pct) return `${ctx.brand} 聲量趨勢${dir}`;
      return `${ctx.brand} 聲量${dir} ${pct}%`;
    },
    sentiment: (ctx) => {
      const score = ctx.metrics?.net_sentiment_score;
      if (score == null) return null;
      const eval_ = score > 0.3 ? '正向' : score < -0.1 ? '偏負' : '中性';
      return `品牌好感度${eval_}，整體口碑表現穩定`;
    },
    competitor: (ctx) => {
      const share = ctx.metrics?.market_share_estimate;
      if (share == null) return null;
      return `市佔率 ${(share * 100).toFixed(0)}%，競爭態勢清晰`;
    },
    social_overview: (ctx) => {
      return `${ctx.brand} 社群影響力全面盤點`;
    },
  },
  'market-entry': {
    search: (ctx) => `搜尋熱度顯示市場需求信號`,
    competitor: (ctx) => `競爭格局分析，進入時機評估`,
    language: (ctx) => `語系分布揭示目標受眾結構`,
    platform: (ctx) => `平台效率指引進入策略選擇`,
  },
  'kol-strategy': {
    kol: (ctx) => {
      const count = ctx.metrics?.kol_count;
      return count ? `${count} 位 KOL 生態，合作潛力評估` : 'KOL 生態與合作潛力評估';
    },
    platform: (ctx) => `各平台 KOL 效率差異，策略配置建議`,
    sentiment: (ctx) => `KOL 帶動之品牌好感度分析`,
  },
  'crisis-response': {
    sentiment: (ctx) => {
      const neg = ctx.metrics?.negative_ratio;
      if (neg == null) return '輿情走勢與危機信號監測';
      return `負面聲量佔 ${(neg * 100).toFixed(0)}%，危機等級評估`;
    },
    trend: (ctx) => `聲量異常波動與危機時間軸`,
    kol: (ctx) => `KOL 輿論影響力與擴散風險`,
  },
};

function templateBasedHook(purposeType, dimension, context) {
  const purposeTemplates = HOOK_TEMPLATES[purposeType];
  if (!purposeTemplates) return null;
  const templateFn = purposeTemplates[dimension];
  if (!templateFn) return null;
  try {
    return templateFn(context);
  } catch {
    return null;
  }
}

function buildHookPrompt(purposeType, dimension, context) {
  return [
    `Purpose: ${purposeType}`,
    `Dimension: ${dimension}`,
    `Brand: ${context.brand}`,
    `Venue: ${context.venue || 'N/A'}`,
    `Metrics: ${JSON.stringify(context.metrics || {})}`,
    `Insight type: ${context.insightType || 'unknown'}`,
    '',
    '請用一句中文（≤30字）將上述數據洞察與商業目的連結。',
  ].join('\n');
}

async function generateHook(purposeType, dimension, context, options = {}) {
  if (options?.useLLM && options?.llmProvider) {
    const prompt = buildHookPrompt(purposeType, dimension, context);
    return await options.llmProvider(prompt);
  }
  return templateBasedHook(purposeType, dimension, context);
}

module.exports = { generateHook, templateBasedHook, buildHookPrompt, HOOK_TEMPLATES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest engines/purpose-binder/__tests__/hook-generator.test.js --no-coverage`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add engines/purpose-binder/hook-generator.js engines/purpose-binder/__tests__/hook-generator.test.js
git commit -m "feat(purpose-binder): add template-based hook generator with LLM interface"
```

---

### Task 4: Purpose Binder Orchestrator

**Files:**
- Create: `engines/purpose-binder/purpose-binder.js`
- Test: `engines/purpose-binder/__tests__/purpose-binder.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';

const { bindPurpose } = require('../purpose-binder');

const mockAnalysis = {
  dimensions: {
    trend: {
      anomalies: [{ metric: 'influence', value: 500, expected: 100 }],
      insights: [{ type: 'growth', severity: 'positive', text: 'MoM +54%' }],
      derived_metrics: { mom_growth: 54.5 },
    },
    platform: {
      anomalies: [],
      insights: [{ type: 'leader', severity: 'positive' }],
      derived_metrics: { platform_efficiency: 0.85, top_platform: 'Instagram' },
    },
    sentiment: {
      anomalies: [],
      insights: [],
      derived_metrics: { positive_ratio: 0.65 },
    },
  },
};

const mockInterview = {
  purpose: 'sell-venue',
  venue: { name: '台北101', characteristics: ['地標', '觀光'] },
};

const mockBrand = { name: 'Louis Vuitton', industry: 'luxury' };

describe('bindPurpose', () => {
  test('produces bindings for all dimensions in analysis', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    expect(result.meta.purpose).toBe('sell-venue');
    expect(result.meta.brand).toBe('Louis Vuitton');
    expect(result.meta.venue).toBe('台北101');
    expect(result.bindings).toHaveLength(3);
  });

  test('trend has highest relevance due to anomaly', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    const trend = result.bindings.find(b => b.dimension === 'trend');
    expect(trend.relevance_score).toBe(0.9); // 0.9 affinity × 1.0 signal
  });

  test('bindings include hooks where templates exist', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand);
    const trend = result.bindings.find(b => b.dimension === 'trend');
    expect(trend.hook).toBeTruthy();
    expect(trend.hook).toContain('Louis Vuitton');
  });

  test('CLI purpose override works', async () => {
    const result = await bindPurpose(mockAnalysis, mockInterview, mockBrand, {
      purposeOverride: 'brand-review',
    });
    expect(result.meta.purpose).toBe('brand-review');
  });

  test('missing interview returns null', async () => {
    const result = await bindPurpose(mockAnalysis, null, mockBrand);
    expect(result).toBeNull();
  });

  test('missing interview purpose returns null', async () => {
    const result = await bindPurpose(mockAnalysis, {}, mockBrand);
    expect(result).toBeNull();
  });

  test('CLI override rescues missing interview purpose', async () => {
    const result = await bindPurpose(mockAnalysis, {}, mockBrand, {
      purposeOverride: 'sell-venue',
    });
    expect(result).not.toBeNull();
    expect(result.meta.purpose).toBe('sell-venue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/purpose-binder/__tests__/purpose-binder.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

const { getAffinityWeights, DIMENSIONS } = require('./affinity-table');
const { computeSignalStrength } = require('./signal-scorer');
const { generateHook } = require('./hook-generator');

const PURPOSE_LABELS = {
  'sell-venue': '推銷場地給品牌',
  'brand-review': '品牌回顧報告',
  'market-entry': '新市場評估',
  'kol-strategy': 'KOL 合作策略',
  'crisis-response': '危機應對',
};

async function bindPurpose(analysis, interview, brand, options = {}) {
  const purpose = options.purposeOverride || interview?.purpose;
  if (!purpose) return null;

  const venueName = interview?.venue?.name || '';
  const brandName = brand?.name || 'Unknown';
  const affinityWeights = getAffinityWeights(purpose);
  const dimensions = analysis?.dimensions || {};

  const bindings = [];

  for (const dimId of Object.keys(dimensions)) {
    const dim = dimensions[dimId];
    const affinity = affinityWeights[dimId] ?? 0.5;
    const signalStrength = computeSignalStrength(dim);
    const relevanceScore = parseFloat((affinity * signalStrength).toFixed(2));

    // Build context for hook generation
    const insightType = detectPrimaryInsightType(dim);
    const season = inferSeason(analysis.meta?.date_range);
    const context = {
      brand: brandName,
      venue: venueName,
      dimension: dimId,
      metrics: dim.derived_metrics || {},
      insightType,
      season,
    };

    const hook = await generateHook(purpose, dimId, context, options);

    bindings.push({
      dimension: dimId,
      relevance_score: relevanceScore,
      hook: hook || null,
      rationale: `affinity=${affinity} × signal=${signalStrength}`,
    });
  }

  bindings.sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    meta: {
      purpose,
      purpose_label: PURPOSE_LABELS[purpose] || purpose,
      venue: venueName,
      brand: brandName,
      generated_at: new Date().toISOString(),
    },
    bindings,
  };
}

function detectPrimaryInsightType(dim) {
  if (!dim) return 'unknown';
  if ((dim.anomalies || []).length > 0) return 'anomaly';
  const insights = dim.insights || [];
  if (insights.some(i => i.type === 'decline')) return 'decline';
  if (insights.some(i => i.type === 'growth')) return 'growth';
  if (insights.some(i => i.type === 'leader')) return 'leader';
  return 'unknown';
}

function inferSeason(dateRange) {
  if (!dateRange) return null;
  const end = dateRange.end || dateRange.to;
  if (!end) return null;
  const month = new Date(end).getMonth() + 1;
  if (month >= 1 && month <= 3) return 'Q1';
  if (month >= 4 && month <= 6) return 'Q2';
  if (month >= 7 && month <= 9) return 'Q3';
  return 'Q4';
}

module.exports = { bindPurpose, detectPrimaryInsightType, inferSeason };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest engines/purpose-binder/__tests__/purpose-binder.test.js --no-coverage`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add engines/purpose-binder/purpose-binder.js engines/purpose-binder/__tests__/purpose-binder.test.js
git commit -m "feat(purpose-binder): add main orchestrator that produces purpose.json"
```

---

### Task 5: Wire §7 intent-scorer with purpose_factor

**Files:**
- Modify: `engines/script-planner/scorers/intent-scorer.js`
- Modify: `engines/script-planner/__tests__/intent-scorer.test.js`

- [ ] **Step 1: Write the failing test**

Add to existing test file:

```javascript
describe('getPurposeFactor', () => {
  const { getPurposeFactor } = require('../scorers/intent-scorer');

  test('returns purpose_factor from bindings', () => {
    const bindings = [
      { dimension: 'trend', relevance_score: 0.9 },
      { dimension: 'platform', relevance_score: 0.3 },
    ];
    expect(getPurposeFactor('trend', bindings)).toBeCloseTo(0.95); // 0.5 + 0.9*0.5
    expect(getPurposeFactor('platform', bindings)).toBeCloseTo(0.65); // 0.5 + 0.3*0.5
  });

  test('returns 0.5 for dimension not in bindings', () => {
    const bindings = [{ dimension: 'trend', relevance_score: 0.9 }];
    expect(getPurposeFactor('kol', bindings)).toBe(0.5);
  });

  test('returns 1.0 when no bindings provided', () => {
    expect(getPurposeFactor('trend', null)).toBe(1.0);
    expect(getPurposeFactor('trend', undefined)).toBe(1.0);
    expect(getPurposeFactor('trend', [])).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/script-planner/__tests__/intent-scorer.test.js --no-coverage`
Expected: FAIL — getPurposeFactor not exported

- [ ] **Step 3: Add getPurposeFactor to intent-scorer.js**

Add after existing `getIntentBoost`:

```javascript
function getPurposeFactor(analysisDimension, bindings) {
  if (!bindings || bindings.length === 0) return 1.0;
  const binding = bindings.find(b => b.dimension === analysisDimension);
  if (!binding) return 0.5;
  return 0.5 + (binding.relevance_score * 0.5);
}

module.exports = { getIntentBoost, getPurposeFactor };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest engines/script-planner/__tests__/intent-scorer.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/scorers/intent-scorer.js engines/script-planner/__tests__/intent-scorer.test.js
git commit -m "feat(script-planner): add getPurposeFactor to intent-scorer"
```

---

### Task 6: Wire §7 headline-generator with hook fallback

**Files:**
- Modify: `engines/script-planner/headline-generator.js`
- Modify: `engines/script-planner/__tests__/headline-generator.test.js`

- [ ] **Step 1: Write the failing test**

Add to existing test file:

```javascript
describe('generateHeadline with purpose hooks', () => {
  test('uses hook when available', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const bindings = [{ dimension: 'trend', hook: 'Q4 聲量高峰與 101 旺季重疊' }];
    const { headline } = generateHeadline(dim, '聲量趨勢', { focus: 'trend', bindings });
    expect(headline).toBe('Q4 聲量高峰與 101 旺季重疊');
  });

  test('falls back to existing logic when no hook', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const bindings = [{ dimension: 'trend', hook: null }];
    const { headline } = generateHeadline(dim, '聲量趨勢', { focus: 'trend', bindings });
    expect(headline).not.toBe(null);
    expect(headline).toContain('成長');
  });

  test('falls back when no bindings provided', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const { headline } = generateHeadline(dim, '聲量趨勢');
    expect(headline).toContain('成長');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/script-planner/__tests__/headline-generator.test.js --no-coverage`
Expected: FAIL — generateHeadline doesn't accept 3rd param

- [ ] **Step 3: Update headline-generator.js**

Change the function signature and add hook check at the top:

```javascript
function generateHeadline(dimension, dimensionTitle, options) {
  // Hook override from purpose bindings
  if (options?.bindings && options?.focus) {
    const binding = options.bindings.find(b => b.dimension === options.focus);
    if (binding?.hook) return { focus: options.focus || 'overview', headline: binding.hook };
  }

  // ... existing logic unchanged ...
}
```

- [ ] **Step 4: Run all headline-generator tests**

Run: `npx jest engines/script-planner/__tests__/headline-generator.test.js --no-coverage`
Expected: PASS (all existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/headline-generator.js engines/script-planner/__tests__/headline-generator.test.js
git commit -m "feat(script-planner): add purpose hook fallback to headline-generator"
```

---

### Task 7: Wire §7 script-planner to read purpose.json

**Files:**
- Modify: `engines/script-planner/script-planner.js`
- Modify: `engines/script-planner/__tests__/script-planner.test.js`

- [ ] **Step 1: Write the failing test**

Add to existing test file:

```javascript
describe('planScript with purpose bindings', () => {
  test('applies purpose_factor to scoring', () => {
    const bindings = [
      { dimension: 'trend', relevance_score: 0.9, hook: 'trend hook' },
      { dimension: 'sentiment', relevance_score: 0.2, hook: null },
    ];
    const result = planScript(mockAnalysis, mockBrand, 'full-13', { purposeBindings: bindings });
    const trend = result.chapters.find(c => c.pageId === 'trend');
    const sentiment = result.chapters.find(c => c.pageId === 'sentiment');
    // trend should be boosted more than sentiment
    expect(trend).toBeTruthy();
    if (sentiment) {
      expect(trend.score).toBeGreaterThan(sentiment.score);
    }
  });

  test('uses hook as headline when available', () => {
    const bindings = [{ dimension: 'trend', relevance_score: 0.9, hook: '自訂 hook 標題' }];
    const result = planScript(mockAnalysis, mockBrand, 'full-13', { purposeBindings: bindings });
    const trend = result.chapters.find(c => c.pageId === 'trend');
    expect(trend.headline).toBe('自訂 hook 標題');
  });

  test('works without purposeBindings (backward compat)', () => {
    const result = planScript(mockAnalysis, mockBrand, 'full-13');
    expect(result.chapters.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest engines/script-planner/__tests__/script-planner.test.js --no-coverage`
Expected: FAIL — planScript doesn't accept 4th param

- [ ] **Step 3: Update script-planner.js**

1. Import `getPurposeFactor`:
```javascript
const { getIntentBoost, getPurposeFactor } = require('./scorers/intent-scorer');
```

2. Change `planScript` signature to accept options:
```javascript
function planScript(analysis, brand, schemaName, options = {}) {
```

3. In the scoring loop, multiply by purpose_factor:
```javascript
const purposeFactor = getPurposeFactor(dimId, options.purposeBindings);
const score = parseFloat((baseWeight * signalScore * intentBoost * purposeFactor).toFixed(4));
```

4. Pass bindings to headline generator:
```javascript
const { focus, headline } = generateHeadline(dim, title, {
  focus: dimId,
  bindings: options.purposeBindings,
});
```

5. In CLI section, read purpose.json if it exists:
```javascript
const purposePath = path.join(runDir, 'purpose.json');
const purposeBindings = fs.existsSync(purposePath)
  ? JSON.parse(fs.readFileSync(purposePath, 'utf-8')).bindings
  : null;
const script = planScript(analysis, brand, schemaName, { purposeBindings });
```

- [ ] **Step 4: Run all script-planner tests**

Run: `npx jest engines/script-planner/ --no-coverage`
Expected: PASS (all existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add engines/script-planner/script-planner.js engines/script-planner/__tests__/script-planner.test.js
git commit -m "feat(script-planner): integrate purpose bindings into scoring and headlines"
```

---

### Task 8: CLI Entry Point + Integration Test

**Files:**
- Modify: `engines/purpose-binder/purpose-binder.js` (add CLI section)
- Test: manual integration with LV data

- [ ] **Step 1: Add CLI to purpose-binder.js**

```javascript
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run-dir');
  const purposeIdx = args.indexOf('--purpose');

  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node purpose-binder.js --run-dir <path> [--purpose <type>]');
    process.exit(1);
  }

  const runDir = args[runIdx + 1];
  const purposeOverride = purposeIdx !== -1 ? args[purposeIdx + 1] : undefined;

  const analysisPath = path.join(runDir, 'analysis.json');
  const interviewPath = path.join(runDir, 'interview.json');
  const brandPath = path.join(runDir, 'brand.json');

  if (!fs.existsSync(analysisPath)) {
    console.error(`analysis.json not found: ${analysisPath}`);
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const interview = fs.existsSync(interviewPath)
    ? JSON.parse(fs.readFileSync(interviewPath, 'utf-8'))
    : {};
  const brand = fs.existsSync(brandPath)
    ? JSON.parse(fs.readFileSync(brandPath, 'utf-8'))
    : {};

  bindPurpose(analysis, interview, brand, { purposeOverride }).then(result => {
    if (!result) {
      console.error('No purpose found in interview.json and no --purpose override given.');
      process.exit(1);
    }
    const outPath = path.join(runDir, 'purpose.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`purpose.json written: ${outPath}`);
    console.log(`  purpose: ${result.meta.purpose}`);
    console.log(`  bindings: ${result.bindings.length}`);
    console.log(`  hooks: ${result.bindings.filter(b => b.hook).length}`);
  });
}
```

- [ ] **Step 2: Create a test interview.json for LV run**

```bash
echo '{"purpose":"sell-venue","venue":{"name":"台北101","characteristics":["地標","觀光","購物"]}}' > /Users/vincentkao/.fontrends/runs/louis-vuitton-2025-03-19/interview.json
```

- [ ] **Step 3: Run purpose binder on LV data**

```bash
node engines/purpose-binder/purpose-binder.js --run-dir /Users/vincentkao/.fontrends/runs/louis-vuitton-2025-03-19/
```

Expected: purpose.json written with 8 bindings, multiple hooks.

- [ ] **Step 4: Run script-planner with purpose.json present**

```bash
node engines/script-planner/script-planner.js --run-dir /Users/vincentkao/.fontrends/runs/louis-vuitton-2025-03-19/ --schema full-13
```

Expected: script.json chapters now reflect purpose_factor in scores and use hooks as headlines.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add engines/purpose-binder/purpose-binder.js
git commit -m "feat(purpose-binder): add CLI entry point for purpose.json generation"
```
