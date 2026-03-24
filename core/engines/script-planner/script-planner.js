'use strict';

const { computeSignalScore } = require('./scorers/signal-scorer');
const { getIntentBoost, getPurposeFactor } = require('./scorers/intent-scorer');
const { assignBlocks } = require('./block-assigner');
const { generateHeadline } = require('./headline-generator');

const PAGE_TO_DIM = {
  kpi: 'social_overview', trend: 'trend', language: 'language',
  platform: 'platform', kol: 'kol', sentiment: 'sentiment',
  venue: 'search', competitor: 'competitor',
};

const PAGE_TITLES = {
  kpi: '品牌社群影響力', trend: '聲量趨勢', language: '語系分布',
  platform: '平台效率', kol: 'KOL 生態', sentiment: '好感度',
  venue: '搜尋聲量與場域', competitor: '競爭態勢',
};

const PRIMARY_METRICS = {
  kpi: 'influence', trend: 'influence', language: 'language_diversity_index',
  platform: 'platform_efficiency', kol: 'kol_coverage',
  sentiment: 'net_sentiment_score', venue: 'search_volume_index',
  competitor: 'market_share_estimate',
};

const BASE_WEIGHTS = {
  'full-13':     { kpi: 0.9, trend: 0.8, language: 0.5, platform: 0.7, kol: 0.8, sentiment: 0.6, venue: 0.4, competitor: 0.7 },
  'compact-8':   { kpi: 0.9, trend: 0.8, platform: 0.7, sentiment: 0.6 },
  'executive-5': { kpi: 0.9 },
  'mini-3':      {},
};

const FIXED_PAGES = {
  'full-13':     ['cover', 'summary', 'actions', 'closing'],
  'compact-8':   ['cover', 'summary', 'actions', 'closing'],
  'executive-5': ['cover', 'summary', 'actions', 'closing'],
  'mini-3':      ['cover', 'overview', 'actions_closing'],
};

const SEVERITY_ORDER = { negative: 0, warning: 1, positive: 2, neutral: 3 };

const EXCLUDE_THRESHOLD = 0.1;
const INSUFFICIENT_EPSILON = 0.01;
const DATA_PRESENCE_BONUS = 0.35;

function planScript(analysis, brand, schemaName, options = {}) {
  const weights = BASE_WEIGHTS[schemaName] || {};
  const fixedPages = FIXED_PAGES[schemaName] || [];
  const dimensions = analysis.dimensions || {};
  const recommendations = analysis.recommendations || [];

  const chapters = [];
  const excluded = [];

  for (const [pageId, baseWeight] of Object.entries(weights)) {
    const dimId = PAGE_TO_DIM[pageId];
    const dim = dimId ? dimensions[dimId] : null;

    if (!dim) {
      excluded.push({ pageId, score: 0, reason: 'insufficient_data' });
      continue;
    }

    const rawSignal = computeSignalScore(dim);
    const hasData = dim.derived_metrics && Object.keys(dim.derived_metrics).length > 0;
    const signalScore = hasData ? Math.min(rawSignal + DATA_PRESENCE_BONUS, 1.0) : rawSignal;
    const intentBoost = getIntentBoost(dimId, brand);
    const purposeFactor = getPurposeFactor(dimId, options.purposeBindings);
    const score = parseFloat((baseWeight * signalScore * intentBoost * purposeFactor).toFixed(4));

    if (score < EXCLUDE_THRESHOLD) {
      const reason = signalScore < INSUFFICIENT_EPSILON ? 'insufficient_data' : 'low_relevance';
      excluded.push({ pageId, score, reason });
      continue;
    }

    const { blocks, excluded_blocks } = assignBlocks(dim, dimId, recommendations);
    const title = PAGE_TITLES[pageId] || pageId;
    const { focus, headline } = generateHeadline(dim, title, {
      focus: dimId,
      bindings: options.purposeBindings,
    });

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
      rank: 0,
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

  chapters.sort((a, b) => b.score - a.score);
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

function selectInsightIndices(insights) {
  if (insights.length === 0) return [];
  const indexed = insights.map((ins, i) => ({ i, severity: SEVERITY_ORDER[ins.severity] ?? 99 }));
  indexed.sort((a, b) => a.severity - b.severity);
  return indexed.slice(0, 3).map(x => x.i);
}

// CLI
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

  const analysisPath = path.join(runDir, 'analysis.json');
  const brandPath = path.join(runDir, 'brand.json');
  if (!fs.existsSync(analysisPath)) { console.error(`analysis.json not found: ${analysisPath}`); process.exit(1); }
  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
  const brand = fs.existsSync(brandPath) ? JSON.parse(fs.readFileSync(brandPath, 'utf-8')) : {};

  const purposePath = path.join(runDir, 'purpose.json');
  const purposeBindings = fs.existsSync(purposePath)
    ? JSON.parse(fs.readFileSync(purposePath, 'utf-8')).bindings
    : null;
  const script = planScript(analysis, brand, schemaName, { purposeBindings });

  const outPath = path.join(runDir, 'script.json');
  fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`script.json written: ${outPath}`);
  console.log(`  chapters: ${script.chapters.length}`);
  console.log(`  excluded: ${script.excluded.length}`);
  console.log(`  fixed: ${script.fixed_pages.join(', ')}`);
}

module.exports = { planScript };
