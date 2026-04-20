'use strict';

// Hook Generator — L3 Engine
// 文案模板完全從 snapshot 讀（YAML），用 mini template engine 渲染
// 不再保留任何 Chinese literal

const { render, interp } = require('../../template-engine');

function buildContext(purposeType, dimension, ctx, snapshot) {
  const dirSellVenue = snapshot.get('copy.hook_labels.direction_sell_venue');
  const dirBrandReview = snapshot.get('copy.hook_labels.direction_brand_review');
  const sentEval = snapshot.get('copy.hook_labels.sentiment_eval');
  const positiveThr = snapshot.get('thresholds.scoring.hook_sentiment.positive');
  const negativeThr = snapshot.get('thresholds.scoring.hook_sentiment.negative');

  const pickDir = (type, map) =>
    type === 'growth' ? map.growth : type === 'decline' ? map.decline : map.default;

  const score = ctx.metrics?.net_sentiment_score;
  const sentimentLabel = score == null ? null
    : score > positiveThr ? sentEval.positive
    : score < negativeThr ? sentEval.negative
    : sentEval.neutral;

  const posPct = ctx.metrics?.positive_ratio != null ? (ctx.metrics.positive_ratio * 100).toFixed(0) : null;
  const negPct = ctx.metrics?.negative_ratio != null ? (ctx.metrics.negative_ratio * 100).toFixed(0) : null;
  const sharePct = ctx.metrics?.market_share_estimate != null ? (ctx.metrics.market_share_estimate * 100).toFixed(0) : null;

  return {
    ...ctx,
    purposeType,
    dimension,
    direction_sell_venue: pickDir(ctx.insightType, dirSellVenue),
    direction_brand_review: pickDir(ctx.insightType, dirBrandReview),
    sentiment_label: sentimentLabel,
    positive_pct: posPct,
    negative_pct: negPct,
    market_share_pct: sharePct,
  };
}

function templateBasedHook(purposeType, dimension, ctx, snapshot) {
  const templates = snapshot.get('copy.hook_templates');
  const purposeTpls = templates[purposeType];
  if (!purposeTpls) return null;
  const spec = purposeTpls[dimension];
  if (spec == null) return null;

  const vars = buildContext(purposeType, dimension, ctx, snapshot);
  const rendered = render(spec, vars);
  return rendered || null;
}

function buildHookPrompt(purposeType, dimension, ctx, snapshot) {
  const charLimit = snapshot.get('thresholds.format.hook_character_limit');
  const promptTpl = snapshot.get('copy.hook_llm_prompt');
  return interp(promptTpl, {
    purposeType,
    dimension,
    brand: ctx.brand,
    venue: ctx.venue,
    metricsJson: JSON.stringify(ctx.metrics || {}),
    insightType: ctx.insightType,
    charLimit: String(charLimit),
  });
}

async function generateHook(purposeType, dimension, context, options = {}, snapshot) {
  if (!snapshot && options?.snapshot) snapshot = options.snapshot;
  if (!snapshot) throw new Error('[hook-generator] snapshot required');
  if (options?.useLLM && options?.llmProvider) {
    const prompt = buildHookPrompt(purposeType, dimension, context, snapshot);
    return await options.llmProvider(prompt);
  }
  return templateBasedHook(purposeType, dimension, context, snapshot);
}

module.exports = { generateHook, templateBasedHook, buildHookPrompt };
