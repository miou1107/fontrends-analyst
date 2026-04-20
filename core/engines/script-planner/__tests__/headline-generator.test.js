const { resolveProfile } = require('../../../knowledge-loader');
const snap = resolveProfile('brand-social');

'use strict';

const { generateHeadline } = require('../headline-generator');

describe('generateHeadline', () => {
  test('anomaly focus when anomalies exist', () => {
    const dim = {
      insights: [{ type: 'growth', severity: 'positive', text: 'Growth text', evidence: { metric: 'influence' } }],
      anomalies: [{ metric: 'influence', value: 2700000, expected: 150000 }],
    };
    const { focus, headline } = generateHeadline(dim, '聲量趨勢', null, snap);
    expect(focus).toBe('anomaly');
    expect(headline).toMatch(/影響力.*異常飆升.*18\.0 倍/);
  });

  test('growth focus with evidence.metric produces Chinese label', () => {
    const dim = {
      insights: [{ type: 'growth', severity: 'positive', text: '互動率 MoM 成長 54.5%', evidence: { metric: 'engagement_rate' } }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '聲量趨勢', null, snap);
    expect(focus).toBe('growth');
    expect(headline).toBe('互動率 成長 54.5%');
  });

  test('growth focus without evidence falls back to text', () => {
    const dim = {
      insights: [{ type: 'growth', severity: 'positive', text: '持續成長中' }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '趨勢', null, snap);
    expect(focus).toBe('growth');
    expect(headline).toBe('持續成長中');
  });

  test('decline focus with evidence.metric', () => {
    const dim = {
      insights: [{ type: 'decline', severity: 'negative', text: '互動率 MoM 下降 -20%', evidence: { metric: 'engagement_rate' } }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '平台', null, snap);
    expect(focus).toBe('decline');
    expect(headline).toBe('互動率 下滑 -20%');
  });

  test('decline focus without evidence falls back to text', () => {
    const dim = {
      insights: [{ type: 'decline', severity: 'negative', text: '下降趨勢明顯' }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '平台', null, snap);
    expect(focus).toBe('decline');
    expect(headline).toBe('下降趨勢明顯');
  });

  test('leader focus with evidence.metric', () => {
    const dim = {
      insights: [{ type: 'leader', severity: 'positive', text: '排名第一', evidence: { metric: 'influence' } }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, 'KOL', null, snap);
    expect(focus).toBe('leader');
    expect(headline).toBe('影響力 領先市場');
  });

  test('overview focus when no strong signals', () => {
    const dim = { insights: [], anomalies: [] };
    const { focus, headline } = generateHeadline(dim, '語系分布', null, snap);
    expect(focus).toBe('overview');
    expect(headline).toBe('語系分布');
  });

  test('anomaly headline with unknown metric uses raw name', () => {
    const dim = { insights: [], anomalies: [{ metric: 'xyz_unknown', value: 100, expected: 10 }] };
    const { focus, headline } = generateHeadline(dim, '好感度', null, snap);
    expect(focus).toBe('anomaly');
    expect(headline).toBe('xyz_unknown 異常飆升 10.0 倍');
  });

  test('anomaly headline with known metric uses Chinese label', () => {
    const dim = { insights: [], anomalies: [{ metric: 'kol_influence', value: 100, expected: 10 }] };
    const { focus, headline } = generateHeadline(dim, '好感度', null, snap);
    expect(focus).toBe('anomaly');
    expect(headline).toBe('KOL 影響力 異常飆升 10.0 倍');
  });

  test('priority order: anomaly > decline > growth > leader', () => {
    const dim = {
      insights: [
        { type: 'growth', severity: 'positive', text: 'g', evidence: { metric: 'influence' } },
        { type: 'decline', severity: 'negative', text: 'd -15%', evidence: { metric: 'engagement_rate' } },
        { type: 'leader', severity: 'positive', text: 'l', evidence: { metric: 'influence' } },
      ],
      anomalies: [],
    };
    // decline beats growth
    const { focus } = generateHeadline(dim, 'X', null, snap);
    expect(focus).toBe('decline');
  });

  test('laggard focus when only laggard insight', () => {
    const dim = {
      insights: [{ type: 'laggard', severity: 'negative', text: '排名低', evidence: { metric: 'net_sentiment_score' } }],
      anomalies: [],
    };
    const { focus, headline } = generateHeadline(dim, '好感度', null, snap);
    expect(focus).toBe('laggard');
    expect(headline).toBe('淨好感度 有待加強');
  });
});

describe('generateHeadline with purpose hooks', () => {
  test('uses hook when available', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const bindings = [{ dimension: 'trend', hook: 'Q4 聲量高峰與 101 旺季重疊' }];
    const { headline } = generateHeadline(dim, '聲量趨勢', { focus: 'trend', bindings }, snap);
    expect(headline).toBe('Q4 聲量高峰與 101 旺季重疊');
  });

  test('falls back to existing logic when no hook', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const bindings = [{ dimension: 'trend', hook: null }];
    const { headline } = generateHeadline(dim, '聲量趨勢', { focus: 'trend', bindings }, snap);
    expect(headline).not.toBe(null);
    expect(headline).toContain('成長');
  });

  test('falls back when no bindings provided', () => {
    const dim = { insights: [{ type: 'growth', severity: 'positive', evidence: { metric: 'influence' }, text: 'MoM +54%' }], anomalies: [] };
    const { headline } = generateHeadline(dim, '聲量趨勢', null, snap);
    expect(headline).toContain('成長');
  });
});
