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

function fmt(n) {
  if (n == null || isNaN(n)) return 'N/A';
  if (n >= 10000) return (n / 10000).toFixed(1) + '萬';
  return n.toLocaleString();
}

function pct(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return (n * 100).toFixed(1) + '%';
}

// ══════════════════════════════════════════════════════
// 內容補齊：根據 chapter.id 從 data 自動產出
// ══════════════════════════════════════════════════════

function enrichChapter(ch, { data, analysis, interview } = {}) {
  if (!data || !data.pages) return [];
  const warnings = [];
  const brand = data.meta?.brand || interview?.brand || '';
  const competitor = data.meta?.competitor || interview?.competitor || '';
  const so = data.pages?.social_overview?.data || {};
  // 競品數據可能在 data.pages.social_overview.data 或直接在 data.data 下
  const compRaw = data.competitor_data?.data || {};
  const comp = compRaw.pages?.social_overview?.data || compRaw;

  switch (ch.id) {
    case 'social_overview': {
      if (!ch.so_what) {
        const avg = 598000; // 全站平均（來自 LS 固定值，未來可動態）
        const multiplier = so.influence && avg ? (so.influence / avg).toFixed(1) : null;
        ch.so_what = multiplier
          ? `${brand} 影響力 ${fmt(so.influence)}，為全站平均 ${fmt(avg)} 的 ${multiplier} 倍，顯示品牌在場域具有顯著社群主導力。`
          : `${brand} 累計影響力 ${fmt(so.influence)}，社群能見度表現亮眼。`;
        warnings.push(`enriched social_overview.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議持續監控月度影響力趨勢，在高峰月份前加碼社群內容投入。';
        warnings.push(`enriched social_overview.action_link`);
      }
      if (!ch.data_table && so.influence) {
        ch.data_table = {
          headers: ['指標', brand, competitor || '競品', '倍數'],
          rows: [
            ['影響力指數', fmt(so.influence), fmt(comp.influence), comp.influence ? (so.influence / comp.influence).toFixed(1) + 'x' : 'N/A'],
            ['發文數', fmt(so.posts), fmt(comp.posts), comp.posts ? (so.posts / comp.posts).toFixed(1) + 'x' : 'N/A'],
            ['讚數', fmt(so.likes), fmt(comp.likes), ''],
            ['留言數', fmt(so.comments), fmt(comp.comments), ''],
            ['分享數', fmt(so.shares), fmt(comp.shares), '']
          ]
        };
        warnings.push(`enriched social_overview.data_table`);
      }
      break;
    }

    case 'monthly_trend': {
      const monthly = so.monthly || [];
      if (!ch.so_what && monthly.length > 0) {
        const peak = monthly.reduce((a, b) => a.influence > b.influence ? a : b);
        const trough = monthly.reduce((a, b) => a.influence < b.influence ? a : b);
        const ratio = trough.influence > 0 ? (peak.influence / trough.influence).toFixed(1) : 'N/A';
        ch.so_what = `高峰月份 ${peak.month}（影響力 ${fmt(peak.influence)}），低谷 ${trough.month}（${fmt(trough.influence)}），峰谷比 ${ratio} 倍。波動幅度大，需在淡季主動維持聲量。`;
        warnings.push(`enriched monthly_trend.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議在歷史高峰月份前 1 個月提前佈局社群內容，淡季加碼短影音維持基本聲量。';
        warnings.push(`enriched monthly_trend.action_link`);
      }
      if (!ch.data_table && monthly.length > 0) {
        ch.data_table = {
          headers: ['月份', '影響力', '發文數', '讚數'],
          rows: monthly.slice(0, 6).map(m => [m.month, fmt(m.influence), fmt(m.posts), fmt(m.likes)])
        };
        warnings.push(`enriched monthly_trend.data_table`);
      }
      break;
    }

    case 'sentiment': {
      const sentimentRaw = data.pages?.sentiment?.data || {};
      if (!ch.so_what) {
        // 支援兩種格式：{positive: 50.6} 或 [{sentiment:'正面', ratio:0.5}]
        let posRatio;
        if (typeof sentimentRaw.positive === 'number') {
          posRatio = sentimentRaw.positive;
        } else if (Array.isArray(sentimentRaw)) {
          const pos = sentimentRaw.find(s => s.sentiment === '正面' || s.sentiment === 'positive');
          posRatio = pos?.ratio ? pos.ratio * 100 : null;
        }
        ch.so_what = posRatio != null
          ? `正面情緒佔 ${posRatio.toFixed(1)}%，品牌形象維護良好。需持續關注負面聲量（${(sentimentRaw.negative || 0).toFixed(1)}%）的來源和趨勢。`
          : '整體好感度表現穩定，正面情緒佔多數。';
        warnings.push(`enriched sentiment.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議定期監控負面聲量來源，針對高頻負面議題制定回應策略。';
        warnings.push(`enriched sentiment.action_link`);
      }
      break;
    }

    case 'platform': {
      const platformRaw = data.pages?.platform?.data || {};
      const platformItems = platformRaw.items || (Array.isArray(platformRaw) ? platformRaw : []);
      if (!ch.so_what && platformItems.length > 0) {
        const top = platformItems[0];
        ch.so_what = top
          ? `${top.name || top.platform} 是 ${brand} 社群討論的主要場域（影響力 ${fmt(top.influence)}），建議優先經營此平台。`
          : '平台分布均勻，無明顯集中趨勢。';
        warnings.push(`enriched platform.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議根據各平台特性差異化內容策略：Instagram 重視覺、Facebook 重互動、YouTube 重深度。';
        warnings.push(`enriched platform.action_link`);
      }
      break;
    }

    case 'kol': {
      const kolRaw = data.pages?.kol?.data || {};
      const kolItems = kolRaw.items || (Array.isArray(kolRaw) ? kolRaw : []);
      if (!ch.so_what && kolItems.length > 0) {
        const top3 = kolItems.slice(0, 3);
        const top3Influence = top3.reduce((a, b) => a + (b.influence || 0), 0);
        const totalInfluence = kolItems.reduce((a, b) => a + (b.influence || 0), 0);
        const ratio = totalInfluence > 0 ? (top3Influence / totalInfluence * 100).toFixed(0) : 'N/A';
        ch.so_what = `前 3 大 KOL 佔總 KOL 影響力的 ${ratio}%，頭部集中效應明顯。與頭部 KOL 的合作關係是品牌聲量的關鍵支柱。`;
        warnings.push(`enriched kol.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議與前 3 大 KOL 建立長期合作關係，同時發展中腰部 KOL 降低風險集中度。';
        warnings.push(`enriched kol.action_link`);
      }
      break;
    }

    case 'search_intent': {
      if (!ch.so_what) {
        ch.so_what = `搜尋數據顯示消費者對 ${brand} 有明確的購物和資訊搜尋需求，長尾字反映出具體的產品偏好。`;
        warnings.push(`enriched search_intent.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議針對高搜量的購物意圖關鍵字優化搜尋引擎內容和到站頁面。';
        warnings.push(`enriched search_intent.action_link`);
      }
      break;
    }

    case 'competitor_comparison': {
      if (!ch.so_what && so.influence && comp.influence) {
        const multiplier = (so.influence / comp.influence).toFixed(1);
        ch.so_what = `${brand} 影響力為 ${competitor} 的 ${multiplier} 倍，在社群能見度上保持領先。但需持續監控競品動態，防止差距縮小。`;
        warnings.push(`enriched competitor_comparison.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = `建議每月追蹤 ${brand} vs ${competitor} 的影響力倍數變化，作為品牌健康度 KPI。`;
        warnings.push(`enriched competitor_comparison.action_link`);
      }
      break;
    }

    case 'news_events': {
      if (!ch.so_what) {
        ch.so_what = '新聞事件與社群聲量波動有對應關係，可作為趨勢歸因的重要參考。重大事件應標註在趨勢圖上。';
        warnings.push(`enriched news_events.so_what`);
      }
      if (!ch.action_link) {
        ch.action_link = '建議建立新聞事件監測機制，在重大事件發生時快速調整社群內容策略。';
        warnings.push(`enriched news_events.action_link`);
      }
      break;
    }

    case 'swot': {
      if (!ch.so_what) {
        ch.so_what = `綜合 SWOT 分析，${brand} 在場域具有社群主導力優勢，應把握搜尋意圖強的機會期，同時注意淡季波動和競品威脅。`;
        warnings.push(`enriched swot.so_what`);
      }
      break;
    }

    case 'actions': {
      if (!ch.so_what) {
        ch.so_what = '以上建議根據數據分析結果提出，按優先級排序，聚焦在時機把握、KOL 合作、搜尋優化三大方向。';
        warnings.push(`enriched actions.so_what`);
      }
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
  const allText = n.chapters.map(ch =>
    (ch.paragraphs || []).join(' ') + ' ' + (ch.insight || '') + ' ' + (ch.so_what || '')
  ).join(' ');

  for (const angle of interview.key_angles) {
    if (!allText.includes(angle)) {
      // 找最相關的章節補進去
      const target = n.chapters.find(ch => ch.id === 'social_overview') || n.chapters[0];
      if (target && target.paragraphs) {
        target.paragraphs.push(`本報告特別關注「${angle}」，從數據中觀察此面向的表現與趨勢。`);
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

  // 檢查影響力數字是否被引用
  const influenceStr = fmt(so.influence);
  if (!allText.includes(influenceStr) && !allText.includes(String(so.influence))) {
    const target = n.chapters?.find(ch => ch.id === 'social_overview');
    if (target && target.paragraphs) {
      target.paragraphs[0] = `${brand} 在過去期間累計影響力指數達 ${influenceStr}，發文數 ${fmt(so.posts)} 篇，來自 ${fmt(so.authors)} 位作者、${fmt(so.channels)} 個頻道。總互動數（讚+留言+分享）達 ${fmt(so.likes + so.comments + so.shares)}。` + target.paragraphs[0];
      warnings.push(`injected influence ${influenceStr} into social_overview paragraphs`);
    }
  }

  // 檢查好感度數字（支援 {positive: 50.6} 和 [{sentiment:'正面', ratio:0.5}] 兩種格式）
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
      target.paragraphs[0] = `正面情緒佔比 ${positivePct}。` + target.paragraphs[0];
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
    n.title = `${n.meta.brand} 品牌社群深度分析報告`;
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
      n.recommendations = n.chapters[actIdx].recommendations.map((r, i) => {
        if (typeof r === 'string') {
          return {
            priority: i < 2 ? '立即' : '短期',
            who: '行銷團隊',
            what: r,
            when: i < 2 ? '本月' : '本季',
            kpi: '待定義'
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
