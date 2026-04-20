'use strict';

const { computeSignalScore } = require('./scorers/signal-scorer');
const { getIntentBoost, getPurposeFactor } = require('./scorers/intent-scorer');
const { assignBlocks } = require('./block-assigner');
const { generateHeadline } = require('./headline-generator');
const { resolveProfile } = require('../../knowledge-loader');

const DEFAULT_PROFILE = 'brand-social';

function planScript(analysis, brand, schemaName, options = {}) {
  const snapshot = options.snapshot || resolveProfile(options.profile || DEFAULT_PROFILE);
  const pageToDim = snapshot.get('dimensions.page_to_dim');
  const pageTitles = snapshot.get('dimensions.page_titles');
  const primaryMetrics = snapshot.get('dimensions.primary_metrics');
  const baseWeightsBySchema = snapshot.get('dimensions.base_weights_by_schema');
  const fixedPagesBySchema = snapshot.get('dimensions.fixed_pages_by_schema');
  const severityOrder = snapshot.get('dimensions.severity_order');
  const excludeThreshold = snapshot.get('thresholds.scoring.exclude_threshold');
  const insufficientEpsilon = snapshot.get('thresholds.scoring.insufficient_epsilon');
  const dataPresenceBonus = snapshot.get('thresholds.scoring.data_presence_bonus');

  const weights = baseWeightsBySchema[schemaName] || {};
  const fixedPages = fixedPagesBySchema[schemaName] || [];
  const dimensions = analysis.dimensions || {};
  const recommendations = analysis.recommendations || [];

  const chapters = [];
  const excluded = [];

  for (const [pageId, baseWeight] of Object.entries(weights)) {
    const dimId = pageToDim[pageId];
    const dim = dimId ? dimensions[dimId] : null;

    if (!dim) {
      excluded.push({ pageId, score: 0, reason: 'insufficient_data' });
      continue;
    }

    const rawSignal = computeSignalScore(dim, snapshot);
    const hasData = dim.derived_metrics && Object.keys(dim.derived_metrics).length > 0;
    const signalScore = hasData ? Math.min(rawSignal + dataPresenceBonus, 1.0) : rawSignal;
    const intentBoost = getIntentBoost(dimId, brand, snapshot);
    const purposeFactor = getPurposeFactor(dimId, options.purposeBindings, snapshot);
    const score = parseFloat((baseWeight * signalScore * intentBoost * purposeFactor).toFixed(4));

    if (score < excludeThreshold) {
      const reason = signalScore < insufficientEpsilon ? 'insufficient_data' : 'low_relevance';
      excluded.push({ pageId, score, reason });
      continue;
    }

    const { blocks, excluded_blocks } = assignBlocks(dim, dimId, recommendations, snapshot);
    const title = pageTitles[pageId] || pageId;
    const { focus, headline } = generateHeadline(dim, title, {
      focus: dimId,
      bindings: options.purposeBindings,
    }, snapshot);

    const insightIndices = selectInsightIndices(dim.insights || [], severityOrder);
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
        primary_metric: primaryMetrics[pageId] || 'influence',
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

function selectInsightIndices(insights, severityOrder) {
  if (insights.length === 0) return [];
  const indexed = insights.map((ins, i) => ({ i, severity: severityOrder[ins.severity] ?? 99 }));
  indexed.sort((a, b) => a.severity - b.severity);
  return indexed.slice(0, 3).map(x => x.i);
}

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
