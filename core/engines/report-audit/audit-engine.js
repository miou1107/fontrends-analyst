'use strict';

const fs = require('fs');
const path = require('path');
const { readJSON } = require('../helpers');

/**
 * audit-engine.js — §10 品質審核引擎（深化版）
 *
 * 檢查維度：
 * 1. 結構完整性（章節、表格、欄位）
 * 2. 數值合理性（異常值、空值、矛盾）
 * 3. 訪談需求覆蓋度（key_angles 是否都有對應章節）
 * 4. 三層對比框架（自比、競比、環比是否齊全）
 * 5. 數據一致性（narrative 的數字是否跟 data.json 一致）
 * 6. 方法論規範（禁止空話、禁止無佐證判斷）
 */

// ══════════════════════════════════════════════════════
// 1. 結構完整性
// ══════════════════════════════════════════════════════

function auditStructure(narrative) {
  const checks = [];
  const warnings = [];
  const errors = [];

  if (!narrative) {
    errors.push('narrative.json is null or missing');
    return { checks, warnings, errors };
  }

  // executive_summary
  checks.push('executive_summary_exists');
  const summary = narrative.executive_summary || '';
  if (!summary) {
    errors.push('executive_summary is missing or empty');
  } else if (summary.length < 100) {
    warnings.push(`executive_summary too short (${summary.length} chars, recommend >= 100)`);
  } else if (summary.length > 2000) {
    warnings.push(`executive_summary too long (${summary.length} chars, recommend <= 2000)`);
  }

  // chapters
  const chapters = narrative.chapters || [];
  checks.push('chapters_exist');
  if (chapters.length === 0) {
    errors.push('No chapters found');
  } else if (chapters.length < 5) {
    warnings.push(`Only ${chapters.length} chapters (recommend >= 5 for comprehensive report)`);
  }

  // 研究方法章節
  checks.push('methodology_chapter');
  const hasMethodology = chapters.some(ch => ch.id === 'methodology');
  if (!hasMethodology) {
    warnings.push('Missing 研究方法 chapter (id=methodology)');
  }

  for (const chapter of chapters) {
    const chId = chapter.id || 'unknown';

    // paragraphs
    checks.push(`chapter.${chId}.paragraphs`);
    if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
      if (!chapter.insight && !chapter.so_what) {
        warnings.push(`chapter ${chId}: no paragraphs, insight, or so_what`);
      }
    }

    // data_table
    if (chapter.data_table) {
      checks.push(`chapter.${chId}.data_table`);
      const headers = chapter.data_table.headers || [];
      const rows = chapter.data_table.rows || [];
      if (headers.length === 0) {
        errors.push(`chapter ${chId}: data_table has no headers`);
      }
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].length !== headers.length) {
          errors.push(`chapter ${chId}: row ${i} has ${rows[i].length} cols, expected ${headers.length}`);
        }
      }
    } else if (chId !== 'methodology') {
      warnings.push(`chapter ${chId}: no data_table`);
    }

    // insight + so_what + action_link（品質三角形）
    checks.push(`chapter.${chId}.quality_triangle`);
    const hasInsight = chapter.insight && chapter.insight.trim().length > 0;
    const hasSoWhat = chapter.so_what && chapter.so_what.trim().length > 0;
    const hasAction = chapter.action_link && chapter.action_link.trim().length > 0;
    if (!hasInsight) warnings.push(`chapter ${chId}: missing insight`);
    if (!hasSoWhat) warnings.push(`chapter ${chId}: missing so_what`);
    if (!hasAction && chId !== 'methodology') warnings.push(`chapter ${chId}: missing action_link`);
  }

  // recommendations
  checks.push('recommendations');
  const recs = narrative.recommendations || [];
  if (recs.length === 0) {
    warnings.push('No recommendations');
  }
  for (let i = 0; i < recs.length; i++) {
    for (const field of ['priority', 'who', 'what', 'when', 'kpi']) {
      if (!recs[i][field]) {
        errors.push(`recommendation[${i}] missing: ${field}`);
      }
    }
  }

  // SWOT
  checks.push('swot');
  const swot = narrative.market_analysis?.swot;
  if (!swot) {
    warnings.push('Missing SWOT analysis');
  } else {
    for (const key of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
      if (!swot[key] || swot[key].length === 0) {
        warnings.push(`SWOT missing: ${key}`);
      }
    }
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// 2. 數值合理性
// ══════════════════════════════════════════════════════

function auditValues(narrative) {
  const checks = [];
  const warnings = [];
  const errors = [];

  const chapters = narrative?.chapters || [];
  for (const chapter of chapters) {
    const chId = chapter.id || 'unknown';
    const rows = chapter.data_table?.rows || [];

    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows[i].length; j++) {
        const val = String(rows[i][j]);
        // N/A, undefined, null
        if (val === 'N/A' || val === 'undefined' || val === 'null' || val === '') {
          warnings.push(`chapter ${chId}: table[${i}][${j}] = "${val}"`);
        }
        // 負數影響力（不合理）
        if (val.match(/^-[\d,]+$/) && chapter.data_table.headers?.[j]?.includes('影響力')) {
          errors.push(`chapter ${chId}: negative influence value "${val}" at row ${i}`);
        }
      }
    }

    // 段落中的空話檢查
    checks.push(`chapter.${chId}.no_empty_talk`);
    const emptyTalkPatterns = [
      /表現不錯(?!.*\d)/,
      /值得關注(?!.*因為|.*原因)/,
      /建議持續觀察(?!.*指標|.*KPI)/,
      /有很大的潛力(?!.*\d)/,
      /表現亮眼(?!.*比|.*倍|.*%)/,
    ];
    for (const para of (chapter.paragraphs || [])) {
      for (const pattern of emptyTalkPatterns) {
        if (pattern.test(para)) {
          warnings.push(`chapter ${chId}: empty talk detected — "${para.substring(0, 50)}..."`);
        }
      }
    }
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// 3. 訪談需求覆蓋度
// ══════════════════════════════════════════════════════

function auditInterviewCoverage(narrative, interview) {
  const checks = [];
  const warnings = [];
  const errors = [];

  if (!interview) {
    checks.push('interview_coverage_skipped');
    return { checks, warnings, errors };
  }

  // 檢查 key_angles 是否在 narrative 中有提到
  const keyAngles = interview.key_angles || [];
  const narrativeText = JSON.stringify(narrative).toLowerCase();

  checks.push('key_angles_coverage');
  for (const angle of keyAngles) {
    // 取關鍵詞（去掉停用詞）
    const keywords = angle.replace(/[的了和與在是]/g, '').split(/[\s,，、]+/).filter(w => w.length > 1);
    const found = keywords.some(kw => narrativeText.includes(kw.toLowerCase()));
    if (!found) {
      warnings.push(`key_angle not covered in narrative: "${angle}"`);
    }
  }

  // 檢查 competitor 是否在 narrative 中有提到
  if (interview.competitor) {
    checks.push('competitor_mentioned');
    if (!narrativeText.includes(interview.competitor.toLowerCase())) {
      errors.push(`competitor "${interview.competitor}" not mentioned in narrative`);
    }
  }

  // 檢查 venue 是否在 narrative 中有提到
  if (interview.venue) {
    checks.push('venue_mentioned');
    if (!narrativeText.includes(interview.venue.toLowerCase())) {
      warnings.push(`venue "${interview.venue}" not mentioned in narrative`);
    }
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// 4. 三層對比框架
// ══════════════════════════════════════════════════════

function auditComparisons(narrative) {
  const checks = [];
  const warnings = [];
  const errors = [];

  const chapters = narrative?.chapters || [];
  const narrativeText = JSON.stringify(narrative);

  // 自比（MoM/QoQ/YoY/高峰/低谷/成長/衰退）
  checks.push('self_comparison');
  const selfPatterns = /較前期|年增|月增|成長|衰退|高峰|低谷|vs 低谷|MoM|QoQ|YoY|倍/;
  if (!selfPatterns.test(narrativeText)) {
    warnings.push('Missing self-comparison (自比): no MoM/QoQ/YoY/高峰/低谷 found');
  }

  // 競比（vs 競品/倍數差/領先/落後）
  checks.push('competitor_comparison');
  const compPatterns = /vs |競品|領先|落後|倍.*差|佔有率/;
  if (!compPatterns.test(narrativeText)) {
    warnings.push('Missing competitor-comparison (競比): no vs/領先/落後 found');
  }

  // 環比（全站平均/產業均值/SOV）
  checks.push('market_comparison');
  const marketPatterns = /全站平均|平均影響力|產業|市場|SOV|佔比/;
  if (!marketPatterns.test(narrativeText)) {
    warnings.push('Missing market-comparison (環比): no 全站平均/SOV found');
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// 5. 數據一致性（narrative vs data.json）
// ══════════════════════════════════════════════════════

function auditDataConsistency(narrative, data) {
  const checks = [];
  const warnings = [];
  const errors = [];

  if (!data || !narrative) {
    checks.push('data_consistency_skipped');
    return { checks, warnings, errors };
  }

  // 抓 narrative 中的數字
  const narrativeText = JSON.stringify(narrative);
  const so = data.pages?.social_overview?.data || {};

  // 檢查影響力數字是否一致（允許格式差異：161.8萬 vs 1618000）
  checks.push('influence_consistency');
  if (so.influence) {
    const influenceWan = (so.influence / 10000).toFixed(1);
    if (!narrativeText.includes(String(so.influence)) && !narrativeText.includes(influenceWan)) {
      warnings.push(`data.json influence=${so.influence} (${influenceWan}萬) not found in narrative text`);
    }
  }

  // 檢查好感度數字
  const sent = data.pages?.sentiment?.data || {};
  if (sent.positive) {
    checks.push('sentiment_consistency');
    if (!narrativeText.includes(String(sent.positive))) {
      warnings.push(`data.json sentiment positive=${sent.positive}% not found in narrative`);
    }
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// 6. 產出物檢查
// ══════════════════════════════════════════════════════

function auditOutput(runDir) {
  const checks = [];
  const warnings = [];
  const errors = [];

  // output-meta.json
  const metaPath = path.join(runDir, 'output-meta.json');
  checks.push('output_meta_exists');
  if (!fs.existsSync(metaPath)) {
    warnings.push('output-meta.json not found (report may not have been generated yet)');
  } else {
    const meta = readJSON(metaPath);
    if (!meta) {
      errors.push('output-meta.json could not be parsed');
    } else {
      if (!meta.format) warnings.push('output-meta.json missing format');
      if (!meta.generated_at) warnings.push('output-meta.json missing generated_at');
    }
  }

  // screenshots
  checks.push('screenshots_exist');
  const screenshotsDir = path.join(runDir, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    warnings.push('screenshots/ directory not found');
  } else {
    const files = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (files.length === 0) {
      warnings.push('screenshots/ directory is empty');
    }
  }

  // research.json
  checks.push('research_exists');
  if (!fs.existsSync(path.join(runDir, 'research.json'))) {
    warnings.push('research.json not found (§2 research collection may not have run)');
  }

  return { checks, warnings, errors };
}

// ══════════════════════════════════════════════════════
// Main: Full Audit
// ══════════════════════════════════════════════════════

/**
 * @param {string} runDir
 * @returns {{ passed, score, checks, warnings, errors, summary }}
 */
function runAudit(runDir) {
  const narrative = readJSON(path.join(runDir, 'narrative.json'));
  const data = readJSON(path.join(runDir, 'data.json'));
  const interview = readJSON(path.join(runDir, 'interview.json'));

  const results = [
    { name: '結構完整性', ...auditStructure(narrative) },
    { name: '數值合理性', ...auditValues(narrative) },
    { name: '訪談需求覆蓋', ...auditInterviewCoverage(narrative, interview) },
    { name: '三層對比框架', ...auditComparisons(narrative) },
    { name: '數據一致性', ...auditDataConsistency(narrative, data) },
    { name: '產出物檢查', ...auditOutput(runDir) },
  ];

  const allChecks = results.flatMap(r => r.checks);
  const allWarnings = results.flatMap(r => r.warnings);
  const allErrors = results.flatMap(r => r.errors);
  const passed = allErrors.length === 0;

  // 計算品質分數（100 分制）
  const totalChecks = allChecks.length || 1;
  const deductions = allErrors.length * 10 + allWarnings.length * 2;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  const summary = results.map(r => ({
    name: r.name,
    checks: r.checks.length,
    warnings: r.warnings.length,
    errors: r.errors.length,
    status: r.errors.length > 0 ? '❌' : r.warnings.length > 0 ? '⚠️' : '✅',
  }));

  return { passed, score, checks: allChecks, warnings: allWarnings, errors: allErrors, summary };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run') !== -1 ? args.indexOf('--run') : args.indexOf('--run-dir');
  if (runIdx === -1 || !args[runIdx + 1]) {
    console.error('Usage: node audit-engine.js --run <path>');
    process.exit(1);
  }
  const runDir = args[runIdx + 1];
  const result = runAudit(runDir);

  console.log(`\n📋 品質審核報告（分數：${result.score}/100）\n`);
  for (const s of result.summary) {
    console.log(`  ${s.status} ${s.name}：${s.checks} checks, ${s.warnings} warnings, ${s.errors} errors`);
  }
  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }
  console.log(`\n${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  process.exit(result.passed ? 0 : 1);
}

module.exports = { auditNarrative: auditStructure, auditOutput, runAudit };
