'use strict';

/**
 * extract-all.js — §2+§3 統一數據擷取入口
 *
 * 一次執行完成：
 * 1. MySQL DB 查詢（品牌社群數據 + 競品 + 搜量）
 * 2. DataForSEO 補充（關鍵字建議 + 新聞事件）
 * 3. 輸出 data.json + research.json
 *
 * 用法：
 *   node extract-all.js --run-dir ~/.fontrends/runs/dior-2026-03-24
 */

const fs = require('fs');
const path = require('path');
const { extractBrandData } = require('./mysql-adapter');
const { collectResearch } = require('./research-collector');

/**
 * 統一擷取：DB + DataForSEO 一次完成
 * @param {string} runDir
 */
async function extractAll(runDir) {
  const interviewPath = path.join(runDir, 'interview.json');
  if (!fs.existsSync(interviewPath)) {
    throw new Error(`interview.json not found: ${interviewPath}`);
  }

  const interview = JSON.parse(fs.readFileSync(interviewPath, 'utf8'));
  const { brand, competitor, period } = interview;

  // 解析時間區間（支援 "2025-03 ~ 2026-03" 和 "2025-03-01 ~ 2026-03-01"）
  const periodParts = (period || '').split('~').map(s => s.trim().replace(/\//g, '-'));
  let startDate = periodParts[0] || '2025-03-01';
  let endDate = periodParts[1] || '2026-03-01';
  // 補日期：如果只有年月（2025-03），補 01
  if (startDate.match(/^\d{4}-\d{2}$/)) startDate += '-01';
  if (endDate.match(/^\d{4}-\d{2}$/)) endDate += '-01';

  console.log(`\n══════════════════════════════════════`);
  console.log(`  §2+§3 統一數據擷取：${brand} vs ${competitor || 'N/A'}`);
  console.log(`  期間：${startDate} ~ ${endDate}`);
  console.log(`══════════════════════════════════════\n`);

  // ── §3: MySQL DB 查詢（主要數據）──
  console.log(`[§3] MySQL DB 擷取...`);
  const dbData = await extractBrandData(brand, competitor, startDate, endDate);
  const dataPath = path.join(runDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify(dbData, null, 2));
  console.log(`  ✅ data.json 寫入完成`);

  // ── §2: DataForSEO 補充（關鍵字+新聞）──
  console.log(`\n[§2] DataForSEO 研究蒐集...`);
  let research = null;
  try {
    research = await collectResearch(runDir);
    console.log(`  ✅ research.json 寫入完成`);
  } catch (err) {
    console.log(`  ⚠️ DataForSEO 失敗（非致命）: ${err.message}`);
    console.log(`  繼續 pipeline，research.json 為空`);
  }

  // ── 摘要 ──
  const so = dbData.pages?.social_overview?.data || {};
  console.log(`\n══════════════════════════════════════`);
  console.log(`  ✅ 擷取完成`);
  console.log(`  ${brand}: ${so.posts?.toLocaleString() || 'N/A'} 篇, ${so.authors?.toLocaleString() || 'N/A'} 作者`);
  if (dbData.competitor_data) {
    const co = dbData.competitor_data.data || {};
    console.log(`  ${competitor}: ${co.posts?.toLocaleString() || 'N/A'} 篇`);
  }
  if (research) {
    console.log(`  研究: ${research.related_keywords?.length || 0} 關鍵字, ${research.news_events?.length || 0} 新聞`);
    console.log(`  DataForSEO 花費: $${research.cost?.toFixed(4) || '0'}`);
  }
  console.log(`══════════════════════════════════════\n`);

  return { data: dbData, research };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run-dir');
  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node extract-all.js --run-dir <path>');
    process.exit(1);
  }

  extractAll(args[runIdx + 1]).catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}

module.exports = { extractAll };
