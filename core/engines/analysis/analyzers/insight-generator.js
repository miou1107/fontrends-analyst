'use strict';

const MAX_INSIGHTS = 5;

const METRIC_LABELS = {
  engagement_rate: '互動率', avg_interaction_per_post: '平均互動數', influence_density: '影響力密度',
  growth_rate: '成長率', dominant_language_pct: '主要語言佔比', concentration_index: '平台集中度',
  top_kol_contribution_pct: 'Top KOL 貢獻比', net_sentiment_score: '淨好感度',
  search_volume_index: '搜尋量指數', influence: '影響力',
  momentum_score: '聲量動能', total_months: '趨勢月數', kol_influence: 'KOL 影響力',
  positive_ratio: '正面好感比', negative_ratio: '負面比例', neutral_ratio: '中性比例',
  market_share_estimate: '市場聲量佔比', platform_efficiency: '平台效率',
  language_diversity_index: '語系多樣性', kol_coverage: 'KOL 覆蓋率',
  total_interactions: '總互動數', posts: '發文數', likes: '讚數', comments: '留言數', shares: '分享數',
};

function label(metric) { return METRIC_LABELS[metric] || metric; }

function generateInsights(input) {
  if (!input) return [];
  const insights = [];

  // 1. Self-comparison insights
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
            type: 'growth', severity: 'positive',
            text: `${label(metric)} ${periodLabels[period]} 成長 ${data.change_pct}%`,
            evidence: { metric, comparison: period }, _sort: pctAbs,
          });
        } else if (data.direction === 'down' && pctAbs > 10) {
          insights.push({
            type: 'decline', severity: 'negative',
            text: `${label(metric)} ${periodLabels[period]} 下降 ${data.change_pct}%，需關注趨勢變化`,
            evidence: { metric, comparison: period }, _sort: pctAbs,
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
        type: 'anomaly', severity: 'warning',
        text: `${label(a.metric)} 出現異常值（${a.value.toLocaleString()}），為預期值的 ${mult} 倍，建議確認是否有特殊事件`,
        evidence: { metric: a.metric, comparison: 'anomaly' }, _sort: Math.abs(a.z_score || 0) * 10,
      });
    }
  }

  // 3. Competitor ranking insights
  if (input.competitor_comparison?.market?.ranking) {
    for (const [metric, rank] of Object.entries(input.competitor_comparison.market.ranking)) {
      if (rank.rank === 1 && rank.total >= 3) {
        insights.push({
          type: 'leader', severity: 'positive',
          text: `在 ${rank.total} 個競品中 ${label(metric)} 排名第一`,
          evidence: { metric, comparison: 'market' }, _sort: rank.total * 5,
        });
      } else if (rank.rank > rank.total / 2) {
        insights.push({
          type: 'laggard', severity: 'negative',
          text: `${label(metric)} 在 ${rank.total} 個競品中排名第 ${rank.rank}`,
          evidence: { metric, comparison: 'market' }, _sort: rank.rank * 3,
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
          type: 'correlation', severity: 'neutral',
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
  insights.sort((a, b) => (b._sort || 0) - (a._sort || 0));
  for (const ins of insights) {
    const key = `${ins.evidence.metric}_${ins.type}`;
    const altKey = ins.type === 'decline' ? `${ins.evidence.metric}_laggard`
      : ins.type === 'laggard' ? `${ins.evidence.metric}_decline` : null;
    if (seen.has(key)) continue;
    if (altKey && seen.has(altKey)) continue;
    seen.add(key);
    deduped.push(ins);
  }

  return deduped.slice(0, MAX_INSIGHTS).map(({ _sort, ...rest }) => rest);
}

module.exports = { generateInsights, METRIC_LABELS };
