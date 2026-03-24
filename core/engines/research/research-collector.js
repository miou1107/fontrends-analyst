'use strict';

/**
 * research-collector.js — §2 Research Collection Module
 *
 * Collects external research data for brand analysis:
 * 1. Brand + competitor search volume trends (DataForSEO Labs API)
 * 2. Brand related keywords + long-tail keywords
 * 3. News events for anomaly attribution (DataForSEO SERP API)
 *
 * Usage:
 *   node research-collector.js --run-dir ~/.fontrends/runs/louis-vuitton-2026-03-23
 */

const fs = require('fs');
const path = require('path');
const {
  getHistoricalSearchVolume,
  getRelatedKeywords,
  getKeywordSuggestions,
  searchNews,
} = require('./dataforseo-client');

// ══════════════════════════════════════════════════════
// Main: Collect Research
// ══════════════════════════════════════════════════════

/**
 * Collect research data for a brand analysis run.
 * @param {string} runDir - Path to run directory (contains interview.json)
 * @returns {Promise<Object>} research.json content
 */
async function collectResearch(runDir) {
  const interviewPath = path.join(runDir, 'interview.json');
  if (!fs.existsSync(interviewPath)) {
    throw new Error(`interview.json not found: ${interviewPath}`);
  }

  const interview = JSON.parse(fs.readFileSync(interviewPath, 'utf8'));
  const { brand, competitor, period } = interview;

  console.log(`[research] 開始蒐集 ${brand} vs ${competitor} 的研究數據`);
  let totalCost = 0;

  // ── 功能 1: 品牌+競品搜量歷史趨勢 ──
  console.log('  [1/3] 搜量歷史趨勢...');
  const keywords = [brand.toLowerCase()];
  if (competitor) keywords.push(competitor.toLowerCase());

  // 加入品牌+場域組合（如有）
  const venue = interview.venue;
  if (venue) {
    keywords.push(`${brand.toLowerCase()} ${venue}`);
  }

  const volumeResult = await getHistoricalSearchVolume(keywords);
  totalCost += volumeResult.cost || 0;

  const searchTrends = volumeResult.success ? volumeResult.items : [];
  console.log(`    ✅ ${searchTrends.length} 個關鍵字搜量取得（$${(volumeResult.cost || 0).toFixed(4)}）`);

  // ── 功能 2: 品牌相關關鍵字 + 長尾字 ──
  console.log('  [2/3] 相關關鍵字 + 長尾字...');
  const relatedResult = await getRelatedKeywords(brand.toLowerCase(), { limit: 30 });
  totalCost += relatedResult.cost || 0;
  const relatedKeywords = relatedResult.success ? relatedResult.items : [];
  console.log(`    ✅ ${relatedKeywords.length} 個相關關鍵字（$${(relatedResult.cost || 0).toFixed(4)}）`);

  const suggestResult = await getKeywordSuggestions(brand.toLowerCase(), { limit: 30 });
  totalCost += suggestResult.cost || 0;
  const suggestions = suggestResult.success ? suggestResult.items : [];
  console.log(`    ✅ ${suggestions.length} 個長尾字建議（$${(suggestResult.cost || 0).toFixed(4)}）`);

  // ── 功能 3: 新聞事件搜尋（用於外部因子歸因）──
  console.log('  [3/3] 新聞事件搜尋...');
  const newsQueries = [
    `${brand} 台灣`,
    `${brand} ${venue || ''}`.trim(),
  ];

  const newsResults = [];
  for (const q of newsQueries) {
    const newsResult = await searchNews(q, { depth: 10 });
    totalCost += newsResult.cost || 0;
    if (newsResult.success) {
      newsResults.push(...newsResult.items);
    }
  }
  // 去重（by URL）
  const seen = new Set();
  const uniqueNews = newsResults.filter(n => {
    if (seen.has(n.url)) return false;
    seen.add(n.url);
    return true;
  });
  console.log(`    ✅ ${uniqueNews.length} 篇新聞事件（$${totalCost.toFixed(4)}）`);

  // ── 組裝 research.json ──
  const research = {
    brand,
    competitor,
    period,
    venue: venue || null,
    generated_at: new Date().toISOString(),
    cost: totalCost,
    status: 'completed',

    search_trends: searchTrends.map(item => ({
      keyword: item.keyword,
      current_volume: item.search_volume,
      competition: item.competition,
      cpc: item.cpc,
      difficulty: item.difficulty,
      trend: item.trend,
      monthly: item.monthly_searches.slice(0, 24), // 最近 2 年
    })),

    related_keywords: relatedKeywords.map(item => ({
      keyword: item.keyword,
      volume: item.search_volume,
      difficulty: item.difficulty,
      cpc: item.cpc,
    })).sort((a, b) => b.volume - a.volume),

    long_tail_keywords: suggestions.map(item => ({
      keyword: item.keyword,
      volume: item.search_volume,
      difficulty: item.difficulty,
    })).sort((a, b) => b.volume - a.volume),

    news_events: uniqueNews.slice(0, 20),

    // 意圖分類（簡易版，從長尾字推斷）
    intent_analysis: classifyIntents([...relatedKeywords, ...suggestions]),
  };

  // 寫入 research.json
  const outputPath = path.join(runDir, 'research.json');
  fs.writeFileSync(outputPath, JSON.stringify(research, null, 2));
  console.log(`\n✅ research.json 已寫入: ${outputPath}`);
  console.log(`   搜量趨勢: ${searchTrends.length} 關鍵字`);
  console.log(`   相關關鍵字: ${relatedKeywords.length} 個`);
  console.log(`   長尾字: ${suggestions.length} 個`);
  console.log(`   新聞事件: ${uniqueNews.length} 篇`);
  console.log(`   總花費: $${totalCost.toFixed(4)}`);

  return research;
}

// ══════════════════════════════════════════════════════
// Intent Classification (簡易版)
// ══════════════════════════════════════════════════════

/**
 * Classify keywords by search intent
 */
function classifyIntents(keywords) {
  const intents = {
    shopping: { keywords: [], count: 0 },    // 購物意圖
    info: { keywords: [], count: 0 },         // 資訊意圖
    navigation: { keywords: [], count: 0 },   // 導航意圖
    comparison: { keywords: [], count: 0 },   // 比較意圖
    other: { keywords: [], count: 0 },
  };

  const patterns = {
    shopping: /價格|價位|哪裡買|代購|打折|優惠|outlet|sale|buy|price|shop/i,
    info: /什麼|介紹|歷史|設計師|是誰|系列|新款|spring|fall|collection/i,
    navigation: /官網|門市|專櫃|地址|台北|101|店|store|boutique/i,
    comparison: /vs|比較|推薦|值得|好嗎|差別|review|worth/i,
  };

  for (const kw of keywords) {
    const word = kw.keyword || '';
    let classified = false;
    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(word)) {
        intents[intent].keywords.push(word);
        intents[intent].count++;
        classified = true;
        break;
      }
    }
    if (!classified) {
      intents.other.keywords.push(word);
      intents.other.count++;
    }
  }

  // 只保留 top 5 keywords per intent
  for (const intent of Object.values(intents)) {
    intent.keywords = intent.keywords.slice(0, 5);
  }

  return intents;
}

// ══════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDirIdx = args.indexOf('--run-dir');
  const runDir = runDirIdx !== -1 ? args[runDirIdx + 1] : null;

  if (!runDir) {
    console.error('Usage: node research-collector.js --run-dir <path>');
    process.exit(1);
  }

  collectResearch(runDir).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

module.exports = { collectResearch, classifyIntents };
