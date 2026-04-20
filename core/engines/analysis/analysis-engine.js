'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('../helpers');
const { analyzeDimension } = require('./analyzers/base-analyzer');
const { compareSelf } = require('./analyzers/self-comparator');
const { compareCompetitor } = require('./analyzers/competitor-comparator');
const { detectAnomalies } = require('./analyzers/anomaly-detector');
const { generateInsights } = require('./analyzers/insight-generator');
const { analyzeCross } = require('./analyzers/cross-analyzer');
const { resolveProfile } = require('../../knowledge-loader');

const DEFAULT_PROFILE = 'brand-social';

function interp(tpl, vars) {
  return tpl.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function loadHistoricalRuns(brand, currentDate, snapshot) {
  const runsDir = path.join(process.env.HOME, '.fontrends', 'runs');
  const result = { qoq: null, yoy: null, qoq_source: null, yoy_source: null };
  if (!fs.existsSync(runsDir)) return result;
  const qoqMin = snapshot.get('time_windows.qoq.min_days');
  const qoqMax = snapshot.get('time_windows.qoq.max_days');
  const yoyMin = snapshot.get('time_windows.yoy.min_days');
  const yoyMax = snapshot.get('time_windows.yoy.max_days');
  const brandLower = brand.toLowerCase().replace(/\s+/g, '-');
  const dirs = fs.readdirSync(runsDir)
    .filter(d => d.toLowerCase().startsWith(brandLower))
    .filter(d => d !== `${brandLower}-${currentDate}`)
    .sort().reverse();
  const current = new Date(currentDate);
  for (const dir of dirs) {
    const dateMatch = dir.match(/(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) continue;
    const runDate = new Date(dateMatch[1]);
    const daysDiff = (current - runDate) / (1000 * 60 * 60 * 24);
    if (!result.qoq && daysDiff >= qoqMin && daysDiff <= qoqMax) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) { result.qoq = data; result.qoq_source = dataPath; }
    }
    if (!result.yoy && daysDiff >= yoyMin && daysDiff <= yoyMax) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) { result.yoy = data; result.yoy_source = dataPath; }
    }
  }
  return result;
}

function generateRecommendations(dimensions, snapshot) {
  const rules = snapshot.get('copy.recommendations.by_insight_type');
  const roles = snapshot.get('copy.recommendations.roles');
  const fillers = snapshot.get('copy.recommendations.fillers');
  const minImmediate = snapshot.get('thresholds.scoring.recommendations.min_immediate');
  const minVerify = snapshot.get('thresholds.scoring.recommendations.min_verify');
  const minTotal = snapshot.get('thresholds.scoring.recommendations.min_total');
  const maxTotal = snapshot.get('thresholds.scoring.recommendations.max_total');

  const allInsights = [];
  for (const [dimId, dim] of Object.entries(dimensions)) {
    for (const insight of (dim.insights || [])) {
      allInsights.push({ ...insight, dimension: dimId });
    }
  }

  const recs = [];
  let recId = 1;
  const makeId = () => `rec_${String(recId++).padStart(3, '0')}`;

  for (const insight of allInsights) {
    const rule = rules[insight.type];
    if (!rule) continue;
    if (insight.type === 'decline' && insight.severity !== 'negative') continue;
    const metric = insight.evidence.metric;
    recs.push({
      id: makeId(),
      priority: rule.priority,
      who: roles[rule.who_key],
      what: interp(rule.what, { metric }),
      when: rule.when,
      kpi: interp(rule.kpi, { metric }),
      rationale: `dimensions.${insight.dimension}.insights: ${insight.text}`,
      linked_dimensions: [insight.dimension],
    });
  }

  // Ensure minimums
  const immediateCount = recs.filter(r => r.priority === 'immediate').length;
  const verifyCount = recs.filter(r => r.priority === 'verify').length;
  for (let i = immediateCount; i < minImmediate; i++) {
    const f = fillers.immediate;
    recs.push({ id: makeId(), priority: 'immediate', who: roles[f.who_key], what: f.what, when: f.when, kpi: f.kpi, rationale: f.rationale, linked_dimensions: f.linked_dimensions });
  }
  if (verifyCount < minVerify) {
    const f = fillers.verify;
    recs.push({ id: makeId(), priority: 'verify', who: roles[f.who_key], what: f.what, when: f.when, kpi: f.kpi, rationale: f.rationale, linked_dimensions: f.linked_dimensions });
  }
  while (recs.length < minTotal) {
    const f = fillers.medium_term;
    recs.push({ id: makeId(), priority: 'medium_term', who: roles[f.who_key], what: f.what, when: f.when, kpi: f.kpi, rationale: f.rationale, linked_dimensions: f.linked_dimensions });
  }
  return recs.slice(0, maxTotal);
}

function runAnalysis(runDir, options = {}) {
  const snapshot = options.snapshot || resolveProfile(options.profile || DEFAULT_PROFILE);
  const pageKeyMap = snapshot.get('dimensions.page_key_map');
  const anomalyMethodMap = snapshot.get('thresholds.anomaly.per_dimension_method');
  const confidenceScores = snapshot.get('thresholds.confidence_scores');
  const caveats = snapshot.get('copy.quality_caveats');
  const minTotal = snapshot.get('thresholds.scoring.recommendations.min_total');
  const maxTotal = snapshot.get('thresholds.scoring.recommendations.max_total');

  const dataJson = readJSON(path.join(runDir, 'data.json'));
  if (!dataJson) throw new Error(`data.json not found in ${runDir}`);
  const brandJson = readJSON(path.join(runDir, 'brand.json'));
  const brand = dataJson.meta?.brand || brandJson?.brand_name || 'Unknown';
  const primaryCompetitor = dataJson.meta?.competitor || brandJson?.primary_competitor || 'N/A';
  const dateMatch = runDir.match(/(\d{4}-\d{2}-\d{2})/);
  const currentDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const historical = loadHistoricalRuns(brand, currentDate, snapshot);
  const dimensions = {};
  const competitorRaw = dataJson.pages?.competitor_data?.data
    || dataJson.competitor_data?.data
    || {};

  for (const [pageKey, pageData] of Object.entries(dataJson.pages || {})) {
    const dimId = pageKeyMap[pageKey];
    if (!dimId) continue;
    const data = pageData.data;
    if (!data) {
      dimensions[dimId] = { derived_metrics: {}, self_comparison: { mom: null, qoq: null, yoy: null }, competitor_comparison: null, anomalies: [], insights: [] };
      continue;
    }
    const derived = analyzeDimension(pageKey, data);

    let momPrevious = null;
    if (dataJson.previous_month?.pages?.[pageKey]?.data) {
      momPrevious = analyzeDimension(pageKey, dataJson.previous_month.pages[pageKey].data);
    } else if (pageKey === 'trend' && data.monthly && data.monthly.length >= 2) {
      momPrevious = analyzeDimension(pageKey, { monthly: data.monthly.slice(0, -1) });
    }
    const momComparison = compareSelf(derived, momPrevious);

    let qoqDerived = null, yoyDerived = null;
    if (historical.qoq?.pages?.[pageKey]?.data) qoqDerived = analyzeDimension(pageKey, historical.qoq.pages[pageKey].data);
    if (historical.yoy?.pages?.[pageKey]?.data) yoyDerived = analyzeDimension(pageKey, historical.yoy.pages[pageKey].data);
    const qoqComparison = compareSelf(derived, qoqDerived);
    const yoyComparison = compareSelf(derived, yoyDerived);

    const competitorMetrics = {};
    if (dimId !== 'competitor') {
      if (competitorRaw.influence && derived?.influence) competitorMetrics.influence = competitorRaw.influence;
      if (competitorRaw.likes && derived?.total_interactions) competitorMetrics.total_interactions = competitorRaw.likes;
      if (competitorRaw.sentiment_positive != null && derived?.positive_ratio != null) competitorMetrics.positive_ratio = competitorRaw.sentiment_positive;
    }
    const marketCompetitors = (brandJson?.market_competitors || []).map(mc => typeof mc === 'string' ? { brand: mc, influence: 0 } : mc);
    const primary = Object.keys(competitorMetrics).length > 0 ? { brand: primaryCompetitor, metrics: competitorMetrics } : null;
    const compResult = derived ? compareCompetitor(derived, primary, marketCompetitors, snapshot) : null;

    let anomalies = [];
    const method = anomalyMethodMap[dimId] || 'zscore';
    const config = { method };
    if (pageKey === 'trend' && data.monthly) anomalies = detectAnomalies('influence', data.monthly.map(m => m.influence), config, snapshot);
    else if (pageKey === 'kol' && data.items) anomalies = detectAnomalies('kol_influence', data.items.map(k => k.influence), config, snapshot);

    const insights = generateInsights({
      derived_metrics: derived,
      self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison },
      competitor_comparison: compResult, anomalies,
    }, snapshot);

    dimensions[dimId] = { derived_metrics: derived || {}, self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison }, competitor_comparison: compResult, anomalies, insights };
  }

  if (!dimensions.competitor) {
    const soData = dataJson.pages?.social_overview?.data || {};
    const gtData = dataJson.pages?.google_trends?.data || {};
    const fallbackData = {};
    if (soData.competitor_influence != null) fallbackData.influence = soData.competitor_influence;
    if (soData.competitor_likes != null) fallbackData.likes = soData.competitor_likes;
    if (soData.competitor_sentiment_positive != null) fallbackData.sentiment_positive = soData.competitor_sentiment_positive;
    if (gtData.competitor_avg != null) fallbackData.search_avg = gtData.competitor_avg;
    if (gtData.competitor_peak != null) fallbackData.search_peak = gtData.competitor_peak;
    const hasFallbackData = Object.keys(fallbackData).length > 0;
    const derived = hasFallbackData ? { ...fallbackData, competitive_gap_score: null, source: 'fallback' } : {};
    dimensions.competitor = {
      derived_metrics: derived,
      self_comparison: { mom: null, qoq: null, yoy: null },
      competitor_comparison: null,
      anomalies: [],
      insights: hasFallbackData
        ? generateInsights({ derived_metrics: derived, self_comparison: { mom: null, qoq: null, yoy: null }, competitor_comparison: null, anomalies: [] }, snapshot)
        : [],
    };
  }

  const trendMonthly = dataJson.pages?.trend?.data?.monthly;
  const timeSeries = {};
  if (trendMonthly && trendMonthly.length >= 5) timeSeries.monthly_influence = trendMonthly.map(m => m.influence);
  const crossDim = analyzeCross(dimensions, timeSeries, snapshot);

  const recommendations = generateRecommendations(dimensions, snapshot);

  const totalDims = Object.keys(pageKeyMap).length;
  const filledDims = Object.values(dimensions).filter(d => Object.keys(d.derived_metrics).length > 0).length;
  const quality = {
    data_completeness: parseFloat((filledDims / totalDims).toFixed(2)),
    confidence_scores: {},
    data_sources: { current: runDir, mom_source: null, qoq_source: historical.qoq_source, yoy_source: historical.yoy_source },
    caveats,
  };
  for (const [dimId] of Object.entries(dimensions)) {
    const pageEntry = Object.entries(dataJson.pages || {}).find(([pk]) => pageKeyMap[pk] === dimId);
    const conf = pageEntry?.[1]?.confidence;
    quality.confidence_scores[dimId] = confidenceScores[conf] ?? confidenceScores.low;
  }

  function compPeriodStatus(source, historicalData) {
    if (source) return { status: 'available', period: historicalData?.meta?.period || null };
    return { status: 'insufficient_data', period: null };
  }

  return {
    meta: {
      brand, period: dataJson.meta?.period || currentDate.slice(0, 7),
      generated_at: new Date().toISOString(),
      comparison_periods: {
        mom: { status: (dataJson.previous_month || (trendMonthly && trendMonthly.length >= 2)) ? 'available' : 'insufficient_data', period: null },
        qoq: compPeriodStatus(historical.qoq_source, historical.qoq),
        yoy: compPeriodStatus(historical.yoy_source, historical.yoy),
      },
      schema_version: '1.0', primary_competitor: primaryCompetitor,
      market_competitors: brandJson?.market_competitors?.map(mc => typeof mc === 'string' ? mc : mc.brand) || [],
      methodology_version: '1.0',
    },
    dimensions, cross_dimensional: crossDim, recommendations, quality, ml_insights: null,
    _bounds: { minTotal, maxTotal },
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDirIdx = args.indexOf('--run-dir');
  if (runDirIdx === -1 || !args[runDirIdx + 1]) { console.error('Usage: node analysis-engine.js --run-dir <path>'); process.exit(1); }
  const runDir = args[runDirIdx + 1];
  try {
    const result = runAnalysis(runDir);
    validateOutput(result);
    const outPath = path.join(runDir, 'analysis.json');
    delete result._bounds;
    writeJSON(outPath, result);
    console.log(`analysis.json written: ${outPath}`);
    console.log(`   dimensions: ${Object.keys(result.dimensions).length}`);
    console.log(`   insights: ${Object.values(result.dimensions).flatMap(d => d.insights).length}`);
    console.log(`   recommendations: ${result.recommendations.length}`);
    console.log(`   quality: ${(result.quality.data_completeness * 100).toFixed(0)}%`);
  } catch (e) { console.error('Analysis failed:', e.message); process.exit(1); }
}

function validateOutput(analysis) {
  const errors = [];
  if (!analysis.meta?.brand) errors.push('meta.brand is required');
  if (!analysis.meta?.schema_version) errors.push('meta.schema_version is required');
  if (!analysis.dimensions || Object.keys(analysis.dimensions).length === 0) errors.push('dimensions is empty');
  for (const [dimId, dim] of Object.entries(analysis.dimensions || {})) {
    if (!dim.derived_metrics) errors.push(`${dimId}.derived_metrics missing`);
    if (!dim.insights) errors.push(`${dimId}.insights missing`);
  }
  const minTotal = analysis._bounds?.minTotal ?? 6;
  const maxTotal = analysis._bounds?.maxTotal ?? 12;
  if (!analysis.recommendations || analysis.recommendations.length < minTotal) errors.push(`recommendations must have >= ${minTotal} items`);
  if (analysis.recommendations && analysis.recommendations.length > maxTotal) errors.push(`recommendations must have <= ${maxTotal} items`);
  if (!analysis.quality) errors.push('quality is required');
  if (errors.length > 0) console.warn('⚠️ Output validation warnings:', errors);
  return errors;
}

module.exports = { runAnalysis, validateOutput };
