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
