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

const DIM_ID_MAP = {
  social_overview: 'social_overview', language_distribution: 'language',
  trend: 'trend', platform: 'platform', kol: 'kol',
  sentiment: 'sentiment', search_intent: 'search', competitor_data: 'competitor',
};

const ANOMALY_CONFIG = {
  social_overview: { method: 'zscore' }, trend: { method: 'zscore' },
  language: { method: 'zscore' }, platform: { method: 'zscore' },
  kol: { method: 'iqr' }, sentiment: { method: 'zscore' },
  search: { method: 'zscore' }, competitor: { method: 'zscore' },
};

function loadHistoricalRuns(brand, currentDate) {
  const runsDir = path.join(process.env.HOME, '.fontrends', 'runs');
  const result = { qoq: null, yoy: null, qoq_source: null, yoy_source: null };
  if (!fs.existsSync(runsDir)) return result;
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
    if (!result.qoq && daysDiff >= 83 && daysDiff <= 97) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) { result.qoq = data; result.qoq_source = dataPath; }
    }
    if (!result.yoy && daysDiff >= 358 && daysDiff <= 372) {
      const dataPath = path.join(runsDir, dir, 'data.json');
      const data = readJSON(dataPath);
      if (data) { result.yoy = data; result.yoy_source = dataPath; }
    }
  }
  return result;
}

function deriveMoMFromTrend(trendData) {
  if (!trendData?.monthly || trendData.monthly.length < 2) return null;
  const months = trendData.monthly;
  return { current_month: months[months.length - 1], previous_month: months[months.length - 2] };
}

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
      priority = 'immediate'; who = '社群行銷團隊';
      what = `針對${insight.evidence.metric}下降趨勢，調整內容策略`;
      when = '2 週內'; kpi = `${insight.evidence.metric} 回升至前期水準`;
    } else if (insight.type === 'anomaly') {
      priority = 'verify'; who = '數據分析團隊';
      what = `驗證 ${insight.evidence.metric} 異常值，確認是否為真實事件或數據源問題`;
      when = '1 週內'; kpi = '完成異常原因確認報告';
    } else if (insight.type === 'leader') {
      priority = 'opportunistic'; who = '品牌策略團隊';
      what = `維持 ${insight.evidence.metric} 領先優勢，加碼投入`;
      when = '下季度規劃'; kpi = '維持市場排名第一';
    } else if (insight.type === 'laggard') {
      priority = 'medium_term'; who = '社群行銷團隊';
      what = `針對 ${insight.evidence.metric} 落後指標，制定追趕計畫`;
      when = '1-3 個月'; kpi = `${insight.evidence.metric} 排名提升至前 50%`;
    } else if (insight.type === 'growth') {
      priority = 'opportunistic'; who = '品牌策略團隊';
      what = `把握 ${insight.evidence.metric} 成長動能，擴大投入`;
      when = '持續進行'; kpi = '維持成長趨勢';
    } else { continue; }
    recs.push({
      id: `rec_${String(recId++).padStart(3, '0')}`, priority, who, what, when, kpi,
      rationale: `dimensions.${insight.dimension}.insights: ${insight.text}`,
      linked_dimensions: [insight.dimension],
    });
  }
  // Ensure minimums
  const immediateCount = recs.filter(r => r.priority === 'immediate').length;
  const verifyCount = recs.filter(r => r.priority === 'verify').length;
  if (immediateCount < 2) {
    for (let i = immediateCount; i < 2; i++) {
      recs.push({ id: `rec_${String(recId++).padStart(3, '0')}`, priority: 'immediate', who: '社群行銷團隊', what: '檢視當前社群內容策略，確認與品牌目標一致', when: '2 週內', kpi: '完成策略檢視報告', rationale: '基於整體分析結果的通用建議', linked_dimensions: ['social_overview'] });
    }
  }
  if (verifyCount < 1) {
    recs.push({ id: `rec_${String(recId++).padStart(3, '0')}`, priority: 'verify', who: '數據分析團隊', what: '建立定期數據品質檢查流程', when: '1 週內', kpi: '每週數據品質報告', rationale: '確保數據分析基礎穩固', linked_dimensions: ['social_overview'] });
  }
  while (recs.length < 6) {
    recs.push({ id: `rec_${String(recId++).padStart(3, '0')}`, priority: 'medium_term', who: '品牌策略團隊', what: '制定下季度社群行銷計畫', when: '1-3 個月', kpi: '產出完整季度計畫書', rationale: '基於整體分析結果的策略規劃', linked_dimensions: ['social_overview', 'trend'] });
  }
  return recs.slice(0, 12);
}

function runAnalysis(runDir) {
  const dataJson = readJSON(path.join(runDir, 'data.json'));
  if (!dataJson) throw new Error(`data.json not found in ${runDir}`);
  const brandJson = readJSON(path.join(runDir, 'brand.json'));
  const brand = dataJson.meta?.brand || brandJson?.brand_name || 'Unknown';
  const primaryCompetitor = dataJson.meta?.competitor || brandJson?.primary_competitor || 'N/A';
  const dateMatch = runDir.match(/(\d{4}-\d{2}-\d{2})/);
  const currentDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const historical = loadHistoricalRuns(brand, currentDate);
  const dimensions = {};
  // Support competitor_data at both pages.competitor_data.data (standard)
  // and root-level competitor_data.data (legacy/extraction quirk)
  const competitorRaw = dataJson.pages?.competitor_data?.data
    || dataJson.competitor_data?.data
    || {};

  for (const [pageKey, pageData] of Object.entries(dataJson.pages || {})) {
    const dimId = DIM_ID_MAP[pageKey];
    if (!dimId) continue;
    const data = pageData.data;
    if (!data) {
      dimensions[dimId] = { derived_metrics: {}, self_comparison: { mom: null, qoq: null, yoy: null }, competitor_comparison: null, anomalies: [], insights: [] };
      continue;
    }
    const derived = analyzeDimension(pageKey, data);

    // MoM
    let momPrevious = null;
    if (dataJson.previous_month?.pages?.[pageKey]?.data) {
      momPrevious = analyzeDimension(pageKey, dataJson.previous_month.pages[pageKey].data);
    } else if (pageKey === 'trend' && data.monthly && data.monthly.length >= 2) {
      momPrevious = analyzeDimension(pageKey, { monthly: data.monthly.slice(0, -1) });
    }
    const momComparison = compareSelf(derived, momPrevious);

    // QoQ/YoY
    let qoqDerived = null, yoyDerived = null;
    if (historical.qoq?.pages?.[pageKey]?.data) qoqDerived = analyzeDimension(pageKey, historical.qoq.pages[pageKey].data);
    if (historical.yoy?.pages?.[pageKey]?.data) yoyDerived = analyzeDimension(pageKey, historical.yoy.pages[pageKey].data);
    const qoqComparison = compareSelf(derived, qoqDerived);
    const yoyComparison = compareSelf(derived, yoyDerived);

    // Competitor
    const competitorMetrics = {};
    if (dimId !== 'competitor') {
      if (competitorRaw.influence && derived?.influence) competitorMetrics.influence = competitorRaw.influence;
      if (competitorRaw.likes && derived?.total_interactions) competitorMetrics.total_interactions = competitorRaw.likes;
      if (competitorRaw.sentiment_positive != null && derived?.positive_ratio != null) competitorMetrics.positive_ratio = competitorRaw.sentiment_positive;
    }
    const marketCompetitors = (brandJson?.market_competitors || []).map(mc => typeof mc === 'string' ? { brand: mc, influence: 0 } : mc);
    const primary = Object.keys(competitorMetrics).length > 0 ? { brand: primaryCompetitor, metrics: competitorMetrics } : null;
    const compResult = derived ? compareCompetitor(derived, primary, marketCompetitors) : null;

    // Anomalies
    let anomalies = [];
    const config = ANOMALY_CONFIG[dimId] || { method: 'zscore' };
    if (pageKey === 'trend' && data.monthly) anomalies = detectAnomalies('influence', data.monthly.map(m => m.influence), config);
    else if (pageKey === 'kol' && data.items) anomalies = detectAnomalies('kol_influence', data.items.map(k => k.influence), config);

    // Insights
    const insights = generateInsights({
      derived_metrics: derived,
      self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison },
      competitor_comparison: compResult, anomalies,
    });

    dimensions[dimId] = { derived_metrics: derived || {}, self_comparison: { mom: momComparison, qoq: qoqComparison, yoy: yoyComparison }, competitor_comparison: compResult, anomalies, insights };
  }

  // Competitor dimension fallback: if competitor_data page doesn't exist,
  // synthesize a minimal competitor dimension from social_overview or google_trends
  if (!dimensions.competitor) {
    const soData = dataJson.pages?.social_overview?.data || {};
    const gtData = dataJson.pages?.google_trends?.data || {};
    const fallbackData = {};
    // Extract competitor fields from social_overview if present
    if (soData.competitor_influence != null) fallbackData.influence = soData.competitor_influence;
    if (soData.competitor_likes != null) fallbackData.likes = soData.competitor_likes;
    if (soData.competitor_sentiment_positive != null) fallbackData.sentiment_positive = soData.competitor_sentiment_positive;
    // Extract from google_trends if available
    if (gtData.competitor_avg != null) fallbackData.search_avg = gtData.competitor_avg;
    if (gtData.competitor_peak != null) fallbackData.search_peak = gtData.competitor_peak;
    // Build minimal derived metrics
    const hasFallbackData = Object.keys(fallbackData).length > 0;
    const derived = hasFallbackData ? { ...fallbackData, competitive_gap_score: null, source: 'fallback' } : {};
    dimensions.competitor = {
      derived_metrics: derived,
      self_comparison: { mom: null, qoq: null, yoy: null },
      competitor_comparison: null,
      anomalies: [],
      insights: hasFallbackData
        ? generateInsights({ derived_metrics: derived, self_comparison: { mom: null, qoq: null, yoy: null }, competitor_comparison: null, anomalies: [] })
        : [],
    };
  }

  // Cross-dimensional
  const trendMonthly = dataJson.pages?.trend?.data?.monthly;
  const timeSeries = {};
  if (trendMonthly && trendMonthly.length >= 5) timeSeries.monthly_influence = trendMonthly.map(m => m.influence);
  const crossDim = analyzeCross(dimensions, timeSeries);

  // Recommendations
  const recommendations = generateRecommendations(dimensions);

  // Quality
  const totalDims = Object.keys(DIM_ID_MAP).length;
  const filledDims = Object.values(dimensions).filter(d => Object.keys(d.derived_metrics).length > 0).length;
  const quality = {
    data_completeness: parseFloat((filledDims / totalDims).toFixed(2)),
    confidence_scores: {},
    data_sources: { current: runDir, mom_source: null, qoq_source: historical.qoq_source, yoy_source: historical.yoy_source },
    caveats: ['語言偵測準確率約 85-90%', '情緒分析無法偵測反諷與語碼轉換', 'market_share_estimate 為社群聲量佔比（SOV），非實際營收市佔'],
  };
  for (const [dimId] of Object.entries(dimensions)) {
    const pageEntry = Object.entries(dataJson.pages || {}).find(([pk]) => DIM_ID_MAP[pk] === dimId);
    quality.confidence_scores[dimId] = pageEntry?.[1]?.confidence === 'high' ? 0.95 : pageEntry?.[1]?.confidence === 'medium' ? 0.75 : 0.5;
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
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runDirIdx = args.indexOf('--run-dir');
  if (runDirIdx === -1 || !args[runDirIdx + 1]) { console.error('Usage: node analysis-engine.js --run-dir <path>'); process.exit(1); }
  const runDir = args[runDirIdx + 1];
  try {
    const result = runAnalysis(runDir);
    validateOutput(result);
    const outPath = path.join(runDir, 'analysis.json');
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
  if (!analysis.recommendations || analysis.recommendations.length < 6) errors.push('recommendations must have >= 6 items');
  if (analysis.recommendations && analysis.recommendations.length > 12) errors.push('recommendations must have <= 12 items');
  if (!analysis.quality) errors.push('quality is required');
  if (errors.length > 0) console.warn('⚠️ Output validation warnings:', errors);
  return errors;
}

module.exports = { runAnalysis, validateOutput };
