'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('../helpers');

/**
 * verify-engine.js — §7b 敘事驗證引擎（Pre-Report Quality Gate）
 *
 * 在 §9 報告產出之前執行，提早攔截問題，避免浪費 §9 的成本。
 * 比 §10 audit-engine 更輕量，專注於 narrative.json 的結構和內容品質。
 *
 * 檢查維度：
 * 1. 必要檔案存在性（narrative.json, data.json, interview.json）
 * 2. narrative 結構完整性（chapters, paragraphs, data_table）
 * 3. 品質三角形（insight + so_what + action_link）
 * 4. 訪談需求覆蓋度（key_angles）
 * 5. 數據引用驗證（narrative 是否引用 data.json 的數字）
 * 6. 禁止空話（無數據佐證的判斷）
 *
 * CLI:
 *   node verify-engine.js --run-dir <path>
 *
 * Exit codes:
 *   0 = PASS (可繼續 §9)
 *   1 = FAIL (必須修正 narrative 後重跑)
 */

// ══════════════════════════════════════════════════════
// 1. 必要檔案檢查
// ══════════════════════════════════════════════════════

function checkRequiredFiles(runDir) {
  const errors = [];
  const warnings = [];

  const required = ['narrative.json', 'interview.json'];
  const recommended = ['data.json', 'analysis.json', 'script.json', 'brand.json'];

  for (const file of required) {
    if (!fs.existsSync(path.join(runDir, file))) {
      errors.push(`必要檔案缺失: ${file}`);
    }
  }

  for (const file of recommended) {
    if (!fs.existsSync(path.join(runDir, file))) {
      warnings.push(`建議檔案缺失: ${file}`);
    }
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// 2. Narrative 結構驗證
// ══════════════════════════════════════════════════════

function verifyStructure(narrative) {
  const errors = [];
  const warnings = [];

  if (!narrative) {
    errors.push('narrative.json 無法解析或為空');
    return { errors, warnings };
  }

  // 頂層必要欄位
  if (!narrative.title) errors.push('缺少 title');
  if (!narrative.executive_summary) errors.push('缺少 executive_summary');

  const chapters = narrative.chapters || [];
  if (chapters.length === 0) {
    errors.push('chapters 為空陣列');
    return { errors, warnings };
  }

  if (chapters.length < 5) {
    warnings.push(`僅 ${chapters.length} 個章節（建議 >= 5）`);
  }

  // 研究方法章節
  if (!chapters.some(ch => ch.id === 'methodology')) {
    warnings.push('缺少研究方法章節 (id=methodology)');
  }

  // SWOT
  const swot = narrative.market_analysis?.swot;
  if (!swot) {
    warnings.push('缺少 SWOT 分析');
  }

  // recommendations
  if (!narrative.recommendations || narrative.recommendations.length === 0) {
    warnings.push('缺少 recommendations');
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// 3. 品質三角形驗證（insight + so_what + action_link）
// ══════════════════════════════════════════════════════

function verifyQualityTriangle(narrative) {
  const errors = [];
  const warnings = [];

  const chapters = narrative?.chapters || [];
  let missingCount = 0;

  for (const ch of chapters) {
    const chId = ch.id || 'unknown';
    if (chId === 'methodology') continue; // methodology 不需要完整三角形

    const missing = [];
    if (!ch.paragraphs || ch.paragraphs.length === 0) missing.push('paragraphs');
    if (!ch.insight?.trim()) missing.push('insight');
    if (!ch.so_what?.trim()) missing.push('so_what');
    if (!ch.action_link?.trim()) missing.push('action_link');

    if (missing.length > 0) {
      missingCount++;
      if (missing.length >= 3) {
        errors.push(`章節 ${chId}: 嚴重不完整，缺少 ${missing.join(', ')}`);
      } else {
        warnings.push(`章節 ${chId}: 缺少 ${missing.join(', ')}`);
      }
    }

    // data_table 檢查
    if (!ch.data_table) {
      warnings.push(`章節 ${chId}: 缺少 data_table`);
    } else if (!ch.data_table.headers || ch.data_table.headers.length === 0) {
      errors.push(`章節 ${chId}: data_table 缺少 headers`);
    }
  }

  // 超過一半章節不完整 → 嚴重問題
  const nonMethodChapters = chapters.filter(ch => ch.id !== 'methodology').length;
  if (nonMethodChapters > 0 && missingCount / nonMethodChapters > 0.5) {
    errors.push(`超過 50% 章節品質三角形不完整 (${missingCount}/${nonMethodChapters})`);
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// 4. 訪談需求覆蓋度
// ══════════════════════════════════════════════════════

function verifyInterviewCoverage(narrative, interview) {
  const errors = [];
  const warnings = [];

  if (!interview) return { errors, warnings };

  const narrativeText = JSON.stringify(narrative).toLowerCase();
  const keyAngles = interview.key_angles || [];
  let covered = 0;

  for (const angle of keyAngles) {
    const keywords = angle.replace(/[的了和與在是]/g, '').split(/[\s,，、]+/).filter(w => w.length > 1);
    const found = keywords.some(kw => narrativeText.includes(kw.toLowerCase()));
    if (found) {
      covered++;
    } else {
      warnings.push(`訪談需求未覆蓋: "${angle}"`);
    }
  }

  if (keyAngles.length > 0) {
    const coverageRate = covered / keyAngles.length;
    if (coverageRate < 0.5) {
      errors.push(`訪談需求覆蓋率過低: ${(coverageRate * 100).toFixed(0)}% (${covered}/${keyAngles.length})`);
    }
  }

  // competitor 必須被提到
  if (interview.competitor && !narrativeText.includes(interview.competitor.toLowerCase())) {
    errors.push(`競品 "${interview.competitor}" 未在 narrative 中出現`);
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// 5. 數據引用驗證
// ══════════════════════════════════════════════════════

function verifyDataReferences(narrative, data) {
  const errors = [];
  const warnings = [];

  if (!data) {
    warnings.push('data.json 不存在，跳過數據引用驗證');
    return { errors, warnings };
  }

  const narrativeText = JSON.stringify(narrative);
  const so = data.pages?.social_overview?.data || {};

  // 關鍵指標必須在 narrative 中出現
  const keyMetrics = [];
  if (so.influence) keyMetrics.push({ name: '影響力', value: so.influence });
  if (so.total_posts) keyMetrics.push({ name: '文章數', value: so.total_posts });

  let referencedCount = 0;
  for (const metric of keyMetrics) {
    const strVal = String(metric.value);
    const wanVal = (metric.value / 10000).toFixed(1);
    if (narrativeText.includes(strVal) || narrativeText.includes(wanVal)) {
      referencedCount++;
    } else {
      warnings.push(`${metric.name}=${metric.value} 未在 narrative 中被引用`);
    }
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// 6. 空話偵測
// ══════════════════════════════════════════════════════

function verifyNoEmptyTalk(narrative) {
  const errors = [];
  const warnings = [];

  const emptyTalkPatterns = [
    { pattern: /表現不錯(?!.*\d)/, label: '無數據佐證的正面判斷' },
    { pattern: /值得關注(?!.*因為|.*原因)/, label: '無原因的關注建議' },
    { pattern: /建議持續觀察(?!.*指標|.*KPI)/, label: '無指標的觀察建議' },
    { pattern: /有很大的潛力(?!.*\d)/, label: '無數據的潛力判斷' },
    { pattern: /表現亮眼(?!.*比|.*倍|.*%)/, label: '無比較基準的亮眼判斷' },
  ];

  const chapters = narrative?.chapters || [];
  let emptyTalkCount = 0;

  for (const ch of chapters) {
    for (const para of (ch.paragraphs || [])) {
      for (const { pattern, label } of emptyTalkPatterns) {
        if (pattern.test(para)) {
          emptyTalkCount++;
          warnings.push(`章節 ${ch.id || 'unknown'}: ${label} — "${para.substring(0, 40)}..."`);
        }
      }
    }
  }

  if (emptyTalkCount > 5) {
    errors.push(`空話過多: ${emptyTalkCount} 處（容許 <= 5）`);
  }

  return { errors, warnings };
}

// ══════════════════════════════════════════════════════
// Main: Pre-Report Verification
// ══════════════════════════════════════════════════════

function runVerification(runDir) {
  const narrative = readJSON(path.join(runDir, 'narrative.json'));
  const data = readJSON(path.join(runDir, 'data.json'));
  const interview = readJSON(path.join(runDir, 'interview.json'));

  const dimensions = [
    { name: '必要檔案', ...checkRequiredFiles(runDir) },
    { name: '結構完整性', ...verifyStructure(narrative) },
    { name: '品質三角形', ...verifyQualityTriangle(narrative) },
    { name: '訪談覆蓋度', ...verifyInterviewCoverage(narrative, interview) },
    { name: '數據引用', ...verifyDataReferences(narrative, data) },
    { name: '空話偵測', ...verifyNoEmptyTalk(narrative) },
  ];

  const allErrors = dimensions.flatMap(d => d.errors);
  const allWarnings = dimensions.flatMap(d => d.warnings);
  const passed = allErrors.length === 0;

  // 分數計算
  const errorPenalty = Math.min(60, allErrors.length * 10);
  const warningPenalty = Math.min(30, allWarnings.length * 2);
  const score = Math.max(0, 100 - errorPenalty - warningPenalty);

  const result = {
    passed,
    score,
    errors: allErrors,
    warnings: allWarnings,
    dimensions: dimensions.map(d => ({
      name: d.name,
      errors: d.errors.length,
      warnings: d.warnings.length,
      status: d.errors.length > 0 ? 'FAIL' : d.warnings.length > 0 ? 'WARN' : 'PASS',
    })),
    verified_at: new Date().toISOString(),
  };

  // 寫入驗證報告
  writeJSON(path.join(runDir, 'verify-report.json'), result);

  return result;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run-dir') !== -1 ? args.indexOf('--run-dir') : args.indexOf('--run');
  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node verify-engine.js --run-dir <path>');
    process.exit(1);
  }

  const runDir = args[runIdx + 1].replace(/^~/, process.env.HOME);
  const result = runVerification(runDir);

  console.log(`\n🔍 敘事驗證報告（分數：${result.score}/100）\n`);
  for (const d of result.dimensions) {
    const icon = d.status === 'PASS' ? '✅' : d.status === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${icon} ${d.name}: ${d.errors} errors, ${d.warnings} warnings`);
  }

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  console.log(`\n${result.passed ? '✅ PASS — 可繼續 §9 報告產出' : '❌ FAIL — 必須修正 narrative 後重跑 §7'}`);
  process.exit(result.passed ? 0 : 1);
}

module.exports = { runVerification };
