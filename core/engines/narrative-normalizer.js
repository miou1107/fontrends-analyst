/**
 * narrative-normalizer.js — 自動修正 + 內容補齊 narrative.json
 *
 * 兩個職責：
 * 1. 欄位修正(field normalization)：content→paragraphs、table→data_table 等
 * 2. 內容補齊(content enrichment)：從 data.json/analysis.json/interview.json 自動補
 *    缺失的 so_what、action_link、data_table、executive_summary
 *
 * 用法：
 *   const { normalize } = require('./narrative-normalizer');
 *   const { narrative, warnings } = normalize(rawNarrative, { data, analysis, interview });
 */

// ══════════════════════════════════════════════════════
// 工具函式
// ══════════════════════════════════════════════════════

// Thresholds 與 site_average 從 snapshot 讀取（延遲取值，避免 require cycle）
// 其他 chapter templates 仍寫在 code（未來可透過 template DSL 完全外化）
let _snapshot = null;
function _getSnap() {
  if (_snapshot) return _snapshot;
  try {
    const { resolveProfile } = require('../knowledge-loader');  // 會 fail 時退回 defaults
    _snapshot = resolveProfile('brand-social');
  } catch {
    _snapshot = null;
  }
  return _snapshot;
}

function fmt(n) {
  if (n == null || isNaN(n)) return 'N/A';
  const snap = _getSnap();
  const wanThreshold = snap?.get?.('thresholds.format.number_wan_threshold') ?? 10000;
  if (n >= wanThreshold) return (n / wanThreshold).toFixed(1) + '萬';
  return n.toLocaleString();
}

function pct(n) {
  if (n == null || isNaN(n)) return 'N/A';
  const snap = _getSnap();
  const decimals = snap?.get?.('thresholds.format.percentage_decimals') ?? 1;
  return (n * 100).toFixed(decimals) + '%';
}

function _siteAverage() {
  const snap = _getSnap();
  return snap?.get?.('thresholds.scoring.site_average_engagement') ?? 598000;
}

// ══════════════════════════════════════════════════════
// 內容補齊：根據 chapter.id 從 data 自動產出
// ══════════════════════════════════════════════════════

// 用 template engine 替換文案，模板來自 snapshot.copy.chapter_templates
function _applyChapterTemplate(ch, chId, vars, snap) {
  const warnings = [];
  const templates = snap?.get?.('copy.chapter_templates') || {};
  const tpl = templates[chId];
  if (!tpl) return warnings;

  const { render } = require('../template-engine');

  if (!ch.so_what && tpl.so_what) {
    const rendered = render(tpl.so_what, vars);
    if (rendered) {
      ch.so_what = rendered;
      warnings.push(`enriched ${chId}.so_what`);
    }
  }
  if (!ch.action_link && tpl.action_link) {
    const rendered = render(tpl.action_link, vars);
    if (rendered) {
      ch.action_link = rendered;
      warnings.push(`enriched ${chId}.action_link`);
    }
  }
  return warnings;
}

function enrichChapter(ch, { data, analysis, interview } = {}) {
  if (!data || !data.pages) return [];
  const warnings = [];
  const snap = _getSnap();
  const brand = data.meta?.brand || interview?.brand || '';
  const competitor = data.meta?.competitor || interview?.competitor || '';
  const so = data.pages?.social_overview?.data || {};
  const compRaw = data.competitor_data?.data || {};
  const comp = compRaw.pages?.social_overview?.data || compRaw;

  // 對每個章節：計算 vars → 套 template → 特殊的 data_table 個別處理
  switch (ch.id) {
    case 'social_overview': {
      const avg = _siteAverage();
      const multiplier = so.influence && avg ? (so.influence / avg).toFixed(1) : null;
      const vars = {
        brand, competitor,
        influence_str: fmt(so.influence),
        avg_str: fmt(avg),
        multiplier,
      };
      warnings.push(..._applyChapterTemplate(ch, 'social_overview', vars, snap));
      if (!ch.data_table && so.influence) {
        const compLabel = competitor || (snap?.get?.('copy.chapter_templates.social_overview.data_table_headers')?.[2]) || '競品';
        ch.data_table = {
          headers: ['指標', brand, compLabel, '倍數'],
          rows: [
            ['影響力指數', fmt(so.influence), fmt(comp.influence), comp.influence ? (so.influence / comp.influence).toFixed(1) + 'x' : 'N/A'],
            ['發文數', fmt(so.posts), fmt(comp.posts), comp.posts ? (so.posts / comp.posts).toFixed(1) + 'x' : 'N/A'],
            ['讚數', fmt(so.likes), fmt(comp.likes), ''],
            ['留言數', fmt(so.comments), fmt(comp.comments), ''],
            ['分享數', fmt(so.shares), fmt(comp.shares), ''],
          ],
        };
        warnings.push(`enriched social_overview.data_table`);
      }
      break;
    }

    case 'monthly_trend': {
      const monthly = so.monthly || [];
      let vars = { brand };
      if (monthly.length > 0) {
        const peak = monthly.reduce((a, b) => a.influence > b.influence ? a : b);
        const trough = monthly.reduce((a, b) => a.influence < b.influence ? a : b);
        const ratio = trough.influence > 0 ? (peak.influence / trough.influence).toFixed(1) : 'N/A';
        vars = {
          brand,
          peak_month: peak.month, peak_str: fmt(peak.influence),
          trough_month: trough.month, trough_str: fmt(trough.influence),
          ratio,
        };
      }
      warnings.push(..._applyChapterTemplate(ch, 'monthly_trend', vars, snap));
      if (!ch.data_table && monthly.length > 0) {
        ch.data_table = {
          headers: ['月份', '影響力', '發文數', '讚數'],
          rows: monthly.slice(0, 6).map(m => [m.month, fmt(m.influence), fmt(m.posts), fmt(m.likes)]),
        };
        warnings.push(`enriched monthly_trend.data_table`);
      }
      break;
    }

    case 'sentiment': {
      const sentimentRaw = data.pages?.sentiment?.data || {};
      let posRatio;
      if (typeof sentimentRaw.positive === 'number') posRatio = sentimentRaw.positive;
      else if (Array.isArray(sentimentRaw)) {
        const pos = sentimentRaw.find(s => s.sentiment === '正面' || s.sentiment === 'positive');
        posRatio = pos?.ratio ? pos.ratio * 100 : null;
      }
      const vars = {
        brand,
        positive_pct: posRatio != null ? posRatio.toFixed(1) : null,
        negative_pct: (sentimentRaw.negative || 0).toFixed(1),
      };
      warnings.push(..._applyChapterTemplate(ch, 'sentiment', vars, snap));
      break;
    }

    case 'platform': {
      const platformRaw = data.pages?.platform?.data || {};
      const platformItems = platformRaw.items || (Array.isArray(platformRaw) ? platformRaw : []);
      const top = platformItems[0];
      const vars = {
        brand,
        top_platform: top ? (top.name || top.platform) : null,
        top_platform_influence: top ? fmt(top.influence) : null,
      };
      warnings.push(..._applyChapterTemplate(ch, 'platform', vars, snap));
      break;
    }

    case 'kol': {
      const kolRaw = data.pages?.kol?.data || {};
      const kolItems = kolRaw.items || (Array.isArray(kolRaw) ? kolRaw : []);
      let vars = { brand };
      if (kolItems.length > 0) {
        const top3 = kolItems.slice(0, 3);
        const top3Influence = top3.reduce((a, b) => a + (b.influence || 0), 0);
        const totalInfluence = kolItems.reduce((a, b) => a + (b.influence || 0), 0);
        const ratio = totalInfluence > 0 ? (top3Influence / totalInfluence * 100).toFixed(0) : null;
        vars.top3_ratio = ratio;
      }
      warnings.push(..._applyChapterTemplate(ch, 'kol', vars, snap));
      break;
    }

    case 'search_intent': {
      warnings.push(..._applyChapterTemplate(ch, 'search_intent', { brand }, snap));
      break;
    }

    case 'competitor_comparison': {
      const multiplier = so.influence && comp.influence ? (so.influence / comp.influence).toFixed(1) : null;
      const vars = { brand, competitor, so_vs_comp_multiplier: multiplier };
      warnings.push(..._applyChapterTemplate(ch, 'competitor_comparison', vars, snap));
      break;
    }

    case 'news_events': {
      warnings.push(..._applyChapterTemplate(ch, 'news_events', { brand }, snap));
      break;
    }

    case 'swot': {
      warnings.push(..._applyChapterTemplate(ch, 'swot', { brand }, snap));
      break;
    }

    case 'actions': {
      warnings.push(..._applyChapterTemplate(ch, 'actions', { brand }, snap));
      break;
    }
  }

  return warnings;
}

// ══════════════════════════════════════════════════════
// 訪談需求覆蓋(key_angles coverage)
// ══════════════════════════════════════════════════════

function enrichKeyAngles(n, interview) {
  if (!interview?.key_angles || !Array.isArray(n.chapters)) return [];
  const warnings = [];
  const snap = _getSnap();
  const { interp } = require('../template-engine');
  const tpl = snap?.get?.('copy.top_level.key_angle_injection') ?? '本報告特別關注「${angle}」，從數據中觀察此面向的表現與趨勢。';
  const allText = n.chapters.map(ch =>
    (ch.paragraphs || []).join(' ') + ' ' + (ch.insight || '') + ' ' + (ch.so_what || '')
  ).join(' ');

  for (const angle of interview.key_angles) {
    if (!allText.includes(angle)) {
      const target = n.chapters.find(ch => ch.id === 'social_overview') || n.chapters[0];
      if (target && target.paragraphs) {
        target.paragraphs.push(interp(tpl, { angle }));
        warnings.push(`key_angle "${angle}" injected into chapter ${target.id}`);
      }
    }
  }
  return warnings;
}

// ══════════════════════════════════════════════════════
// 數據引用檢查(data reference injection)
// ══════════════════════════════════════════════════════

function enrichDataReferences(n, data) {
  if (!data?.pages?.social_overview?.data) return [];
  const warnings = [];
  const so = data.pages.social_overview.data;
  const brand = data.meta?.brand || '';
  const allText = n.chapters?.map(ch => (ch.paragraphs || []).join(' ')).join(' ') || '';

  const snap = _getSnap();
  const { interp } = require('../template-engine');
  const refTpl = snap?.get?.('copy.top_level.data_reference_injection')
    ?? '${brand} 在過去期間累計影響力指數達 ${influence_str}，發文數 ${posts_str} 篇，來自 ${authors_str} 位作者、${channels_str} 個頻道。總互動數（讚+留言+分享）達 ${total_engagement_str}。';
  const sentTpl = snap?.get?.('copy.top_level.sentiment_injection') ?? '正面情緒佔比 ${positive_pct}。';

  const influenceStr = fmt(so.influence);
  if (!allText.includes(influenceStr) && !allText.includes(String(so.influence))) {
    const target = n.chapters?.find(ch => ch.id === 'social_overview');
    if (target && target.paragraphs) {
      target.paragraphs[0] = interp(refTpl, {
        brand,
        influence_str: influenceStr,
        posts_str: fmt(so.posts),
        authors_str: fmt(so.authors),
        channels_str: fmt(so.channels),
        total_engagement_str: fmt((so.likes || 0) + (so.comments || 0) + (so.shares || 0)),
      }) + target.paragraphs[0];
      warnings.push(`injected influence ${influenceStr} into social_overview paragraphs`);
    }
  }

  const sentimentData = data.pages?.sentiment?.data;
  let positivePct;
  if (sentimentData && typeof sentimentData.positive === 'number') {
    positivePct = sentimentData.positive.toFixed(1) + '%';
  } else if (Array.isArray(sentimentData)) {
    const pos = sentimentData.find(s => s.sentiment === '正面' || s.sentiment === 'positive');
    if (pos?.ratio) positivePct = pct(pos.ratio);
  }
  if (positivePct && !allText.includes(positivePct)) {
    const target = n.chapters?.find(ch => ch.id === 'sentiment');
    if (target && target.paragraphs) {
      target.paragraphs[0] = interp(sentTpl, { positive_pct: positivePct }) + target.paragraphs[0];
      warnings.push(`injected sentiment ${positivePct} into sentiment paragraphs`);
    }
  }

  return warnings;
}

// ══════════════════════════════════════════════════════
// 主函式
// ══════════════════════════════════════════════════════

/**
 * 正規化 + 內容補齊 narrative.json
 * @param {object} raw — 原始 narrative 物件
 * @param {object} [options] — 可選的資料來源
 * @param {object} [options.data] — data.json
 * @param {object} [options.analysis] — analysis.json
 * @param {object} [options.interview] — interview.json
 * @returns {{ narrative: object, warnings: string[] }}
 */
function normalize(raw, { data, analysis, interview, profile } = {}) {
  const warnings = [];
  const n = JSON.parse(JSON.stringify(raw)); // deep clone

  // ── 頂層欄位 ──────────────────────────────────

  // title
  if (!n.title && n.meta?.brand) {
    const snap = _getSnap();
    const { interp } = require('../template-engine');
    const titleTpl = snap?.get?.('copy.top_level.title_template') ?? '${brand} 品牌社群深度分析報告';
    n.title = interp(titleTpl, { brand: n.meta.brand });
    warnings.push('auto-generated title from meta.brand');
  }

  // ── chapters 欄位修正 ─────────────────────────

  if (Array.isArray(n.chapters)) {
    for (const ch of n.chapters) {
      // content (string) → paragraphs (array)
      if (ch.content && !ch.paragraphs) {
        ch.paragraphs = typeof ch.content === 'string'
          ? ch.content.split('\n\n').filter(p => p.trim())
          : [String(ch.content)];
        delete ch.content;
        warnings.push(`chapter ${ch.id}: content → paragraphs`);
      }

      // paragraphs 必須是 array
      if (ch.paragraphs && !Array.isArray(ch.paragraphs)) {
        ch.paragraphs = [String(ch.paragraphs)];
        warnings.push(`chapter ${ch.id}: paragraphs converted to array`);
      }

      // 確保 paragraphs 存在
      if (!ch.paragraphs || ch.paragraphs.length === 0) {
        ch.paragraphs = [ch.insight || ch.title || '（待補充）'];
        warnings.push(`chapter ${ch.id}: empty paragraphs, using insight as fallback`);
      }

      // table → data_table
      if (ch.table && !ch.data_table) {
        ch.data_table = ch.table;
        delete ch.table;
        warnings.push(`chapter ${ch.id}: table → data_table`);
      }

      // data_table 驗證
      if (ch.data_table) {
        if (!ch.data_table.headers || !Array.isArray(ch.data_table.headers)) {
          warnings.push(`chapter ${ch.id}: data_table missing headers`);
          delete ch.data_table;
        } else if (!ch.data_table.rows || !Array.isArray(ch.data_table.rows)) {
          warnings.push(`chapter ${ch.id}: data_table missing rows`);
          delete ch.data_table;
        } else {
          // 確保 rows 每列都是 string array 且長度匹配 headers
          const colCount = ch.data_table.headers.length;
          ch.data_table.rows = ch.data_table.rows.map(row => {
            const normalized = Array.isArray(row) ? row : [String(row)];
            while (normalized.length < colCount) normalized.push('');
            return normalized.slice(0, colCount).map(String);
          });
        }
      }

      // ── 內容補齊：so_what / action_link / data_table ──
      const enrichWarnings = enrichChapter(ch, { data, analysis, interview });
      warnings.push(...enrichWarnings);

      // 最終檢查：缺失警告
      if (!ch.so_what && ch.id !== 'methodology') {
        warnings.push(`chapter ${ch.id}: still missing so_what after enrichment`);
      }
      if (!ch.action_link && ch.id !== 'methodology') {
        warnings.push(`chapter ${ch.id}: still missing action_link after enrichment`);
      }
    }

    // ── SWOT chapter → market_analysis.swot ──────

    const swotIdx = n.chapters.findIndex(ch => ch.id === 'swot');
    if (swotIdx !== -1 && n.chapters[swotIdx].swot) {
      if (!n.market_analysis) n.market_analysis = {};
      n.market_analysis.swot = n.chapters[swotIdx].swot;
      warnings.push('moved swot from chapter to market_analysis.swot');
    }

    // ── recommendations chapter → 頂層 ──────────

    const actIdx = n.chapters.findIndex(ch => ch.id === 'actions');
    if (actIdx !== -1 && n.chapters[actIdx].recommendations && !n.recommendations) {
      const snap = _getSnap();
      const priorities = snap?.get?.('copy.top_level.recommendation_priorities') ?? ['立即', '短期'];
      const fb = snap?.get?.('copy.top_level.recommendation_fallback') ?? { who: '行銷團隊', immediate_when: '本月', short_when: '本季', kpi: '待定義' };
      n.recommendations = n.chapters[actIdx].recommendations.map((r, i) => {
        if (typeof r === 'string') {
          return {
            priority: i < 2 ? priorities[0] : priorities[1],
            who: fb.who,
            what: r,
            when: i < 2 ? fb.immediate_when : fb.short_when,
            kpi: fb.kpi
          };
        }
        return r;
      });
      warnings.push(`converted ${n.recommendations.length} string recommendations to structured format`);
    }
  }

  // ── executive_summary（在 enrichment 之後，有更多 so_what 可用）──

  if (!n.executive_summary && Array.isArray(n.chapters)) {
    const parts = n.chapters
      .map(ch => ch.so_what || ch.insight)
      .filter(Boolean);
    if (parts.length > 0) {
      n.executive_summary = parts.join(' ');
      warnings.push(`auto-generated executive_summary from ${parts.length} chapter so_what/insights`);
    }
  }
  // 如果 summary 太短，用 so_what 補充
  if (n.executive_summary && n.executive_summary.length < 100 && Array.isArray(n.chapters)) {
    const extra = n.chapters
      .map(ch => ch.so_what)
      .filter(Boolean)
      .filter(s => !n.executive_summary.includes(s));
    if (extra.length > 0) {
      n.executive_summary += ' ' + extra.join(' ');
      warnings.push(`extended executive_summary to ${n.executive_summary.length} chars`);
    }
  }

  // ── recommendations 確保存在 ────────────────────

  if (!n.recommendations || !Array.isArray(n.recommendations) || n.recommendations.length === 0) {
    warnings.push('no recommendations found');
  }

  // ── market_analysis 確保存在 ────────────────────

  if (!n.market_analysis) {
    n.market_analysis = {};
    warnings.push('market_analysis created as empty object');
  }

  // ── 訪談需求覆蓋 ────────────────────────────────

  if (interview) {
    const angleWarnings = enrichKeyAngles(n, interview);
    warnings.push(...angleWarnings);
  }

  // ── 數據引用注入 ────────────────────────────────

  if (data) {
    const refWarnings = enrichDataReferences(n, data);
    warnings.push(...refWarnings);
  }

  // ── 個人檔案(profile) learned_rules 套用 ────────────

  if (profile && Array.isArray(profile.learned_rules)) {
    for (const rule of profile.learned_rules) {
      if (!rule.rule) continue;
      // presentation 類規則：加到相關章節的備註
      if (rule.category === 'presentation' && rule.applies_to) {
        const target = rule.applies_to === '*'
          ? n.chapters
          : (n.chapters || []).filter(ch => ch.id === rule.applies_to);
        for (const ch of (target || [])) {
          if (!ch._profile_hints) ch._profile_hints = [];
          ch._profile_hints.push(rule.rule);
        }
        warnings.push(`profile rule applied: "${rule.rule}"`);
      }
    }
  }

  // ── 自我學習規則套用(learned-rules) ────────────────

  try {
    const { loadRules } = require('./self-learning/learning-engine');
    const rules = loadRules();
    if (rules && rules.narrative_rules && rules.narrative_rules.length > 0) {
      const ruleWarnings = applyLearnedRules(n, rules.narrative_rules);
      warnings.push(...ruleWarnings);
    }
  } catch {
    // learned-rules.json 不存在或讀取失敗，靜默跳過
  }

  return { narrative: n, warnings };
}

// ══════════════════════════════════════════════════════
// 自我學習規則套用
// ══════════════════════════════════════════════════════

function applyLearnedRules(n, rules) {
  const warnings = [];

  for (const rule of rules) {
    if (rule.type === 'text_replace' && rule.old_value && rule.new_value) {
      // 在所有 paragraphs 中做文字替換
      let replaced = 0;
      for (const ch of (n.chapters || [])) {
        if (!ch.paragraphs) continue;
        for (let i = 0; i < ch.paragraphs.length; i++) {
          if (ch.paragraphs[i].includes(rule.old_value)) {
            ch.paragraphs[i] = ch.paragraphs[i].split(rule.old_value).join(rule.new_value);
            replaced++;
          }
        }
      }
      if (replaced > 0) {
        warnings.push(`learned-rule: replaced "${rule.old_value}" → "${rule.new_value}" (${replaced} 處)`);
      }
    }
  }

  return warnings;
}

module.exports = { normalize };
