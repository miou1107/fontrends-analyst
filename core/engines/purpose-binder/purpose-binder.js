'use strict';

const { getAffinityWeights } = require('./affinity-table');
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

// CLI
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

module.exports = { bindPurpose, detectPrimaryInsightType, inferSeason };
