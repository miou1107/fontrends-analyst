'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CORRECTIONS_PATH = path.resolve(
  __dirname, '../../learned/corrections.jsonl'
);

/**
 * Read corrections from a JSONL file.
 * @param {string} [filePath] - path to corrections.jsonl
 * @returns {Array<Object>} parsed correction entries
 */
function readCorrections(filePath) {
  const target = filePath || DEFAULT_CORRECTIONS_PATH;
  if (!fs.existsSync(target)) return [];
  const content = fs.readFileSync(target, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

/**
 * Group corrections by source and type.
 * @param {Array<Object>} corrections
 * @returns {Object} { bySource: { [source]: [...] }, byType: { [type]: [...] } }
 */
function groupCorrections(corrections) {
  const bySource = {};
  const byType = {};
  for (const c of corrections) {
    const src = c.source || 'unknown';
    const typ = c.type || 'unknown';
    if (!bySource[src]) bySource[src] = [];
    bySource[src].push(c);
    if (!byType[typ]) byType[typ] = [];
    byType[typ].push(c);
  }
  return { bySource, byType };
}

/**
 * Summarize patterns from corrections.
 * @param {Array<Object>} corrections
 * @returns {Object} summary with counts, top sources, top types, recent entries
 */
function summarizePatterns(corrections) {
  if (!corrections || corrections.length === 0) {
    return {
      total: 0,
      bySource: {},
      byType: {},
      topSources: [],
      topTypes: [],
      recent: [],
      patterns: [],
    };
  }

  const { bySource, byType } = groupCorrections(corrections);

  // Count by source
  const sourceCounts = {};
  for (const [src, items] of Object.entries(bySource)) {
    sourceCounts[src] = items.length;
  }

  // Count by type
  const typeCounts = {};
  for (const [typ, items] of Object.entries(byType)) {
    typeCounts[typ] = items.length;
  }

  // Top sources (sorted by count desc)
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  // Top types (sorted by count desc)
  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  // Most recent entries
  const sorted = [...corrections].sort((a, b) => {
    const ta = a.timestamp || '';
    const tb = b.timestamp || '';
    return tb.localeCompare(ta);
  });
  const recent = sorted.slice(0, 5);

  // Detect repeated patterns (same source+type appearing 3+ times)
  const patterns = [];
  for (const [src, items] of Object.entries(bySource)) {
    const typeGroups = {};
    for (const item of items) {
      const t = item.type || 'unknown';
      if (!typeGroups[t]) typeGroups[t] = [];
      typeGroups[t].push(item);
    }
    for (const [typ, group] of Object.entries(typeGroups)) {
      if (group.length >= 3) {
        patterns.push({
          source: src,
          type: typ,
          count: group.length,
          description: `Repeated ${typ} corrections from ${src} (${group.length} times)`,
        });
      }
    }
  }

  return {
    total: corrections.length,
    bySource: sourceCounts,
    byType: typeCounts,
    topSources,
    topTypes,
    recent,
    patterns,
  };
}

// ══════════════════════════════════════════════════════
// 自動修正：產出 learned-rules.json
// ══════════════════════════════════════════════════════

const DEFAULT_RULES_PATH = path.resolve(__dirname, '../../learned/learned-rules.json');

/**
 * 從 corrections 中提取可自動套用的規則
 * 只有重複 3+ 次的模式才會產出規則（避免過度反應）
 */
function generateRules(corrections, snapshot) {
  const textReplaceMin = snapshot?.get?.('thresholds.learning.text_replace_min_count') ?? 2;
  const categoryMin = snapshot?.get?.('thresholds.learning.category_pattern_min_count') ?? 2;
  const auditMin = snapshot?.get?.('thresholds.learning.audit_rule_min_count') ?? 3;
  const styleMin = snapshot?.get?.('thresholds.learning.style_rule_min_count') ?? 3;
  const confDivisor = snapshot?.get?.('thresholds.learning.confidence_divisor') ?? 5;

  const rules = {
    generated_at: new Date().toISOString(),
    total_corrections: corrections.length,
    narrative_rules: [],
    audit_rules: [],
    renderer_rules: [],
  };

  if (corrections.length === 0) return rules;

  const { byType } = groupCorrections(corrections);

  const contentCorrections = (byType.content || []).concat(byType.format || []);
  const replaceMap = {};
  for (const c of contentCorrections) {
    if (c.old_value && c.new_value && c.old_value !== c.new_value) {
      const key = `${c.old_value}→${c.new_value}`;
      if (!replaceMap[key]) replaceMap[key] = { old: c.old_value, new: c.new_value, count: 0, source: c.source };
      replaceMap[key].count++;
    }
  }
  for (const r of Object.values(replaceMap)) {
    if (r.count >= textReplaceMin) {
      rules.narrative_rules.push({
        type: 'text_replace',
        old_value: r.old,
        new_value: r.new,
        confidence: Math.min(r.count / confDivisor, 1),
        source: r.source,
      });
    }
  }

  const v2Entries = corrections.filter(c => c.schemaVersion === 2 && c.approved);
  const categoryRules = {};
  for (const c of v2Entries) {
    const cat = c.category || 'general';
    if (!categoryRules[cat]) categoryRules[cat] = [];
    categoryRules[cat].push({
      rule: c.rule,
      original: c.original,
      correction: c.correction,
    });
  }
  for (const [cat, items] of Object.entries(categoryRules)) {
    if (items.length >= categoryMin) {
      rules.narrative_rules.push({
        type: 'category_pattern',
        category: cat,
        examples: items.slice(0, 5),
        count: items.length,
        confidence: Math.min(items.length / confDivisor, 1),
      });
    }
  }

  const valueErrors = byType.value || [];
  const fieldErrors = {};
  for (const c of valueErrors) {
    const field = c.context?.field || c.description || 'unknown';
    if (!fieldErrors[field]) fieldErrors[field] = 0;
    fieldErrors[field]++;
  }
  for (const [field, count] of Object.entries(fieldErrors)) {
    if (count >= auditMin) {
      rules.audit_rules.push({
        type: 'value_check',
        field,
        count,
        description: `欄位 "${field}" 已出錯 ${count} 次，建議加強檢查`,
      });
    }
  }

  const styleCorrections = byType.style || [];
  const stylePatterns = {};
  for (const c of styleCorrections) {
    const key = c.context?.property || c.description || 'unknown';
    if (!stylePatterns[key]) stylePatterns[key] = { count: 0, lastValue: c.new_value };
    stylePatterns[key].count++;
    if (c.new_value) stylePatterns[key].lastValue = c.new_value;
  }
  for (const [prop, info] of Object.entries(stylePatterns)) {
    if (info.count >= styleMin) {
      rules.renderer_rules.push({
        type: 'style_override',
        property: prop,
        value: info.lastValue,
        count: info.count,
      });
    }
  }

  return rules;
}

/**
 * 寫入 learned-rules.json
 */
function applyLearning(corrections, rulesPath) {
  const target = rulesPath || DEFAULT_RULES_PATH;
  const rules = generateRules(corrections);

  // 確保目錄存在
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(target, JSON.stringify(rules, null, 2));
  return rules;
}

/**
 * 讀取 learned-rules.json（供 normalizer/audit 使用）
 */
function loadRules(rulesPath) {
  const target = rulesPath || DEFAULT_RULES_PATH;
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const runDirIdx = args.indexOf('--run-dir');
  const fileIdx = args.indexOf('--file');
  const applyFlag = args.includes('--apply');

  let filePath = DEFAULT_CORRECTIONS_PATH;

  // 支援 --run-dir（從 run 目錄找 corrections）
  if (runDirIdx !== -1 && args[runDirIdx + 1]) {
    const runDir = args[runDirIdx + 1].replace(/^~/, process.env.HOME);
    const runCorrections = path.join(runDir, 'corrections.jsonl');
    if (fs.existsSync(runCorrections)) filePath = runCorrections;
  }
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    filePath = args[fileIdx + 1];
  }

  const corrections = readCorrections(filePath);
  const summary = summarizePatterns(corrections);

  console.log(`\n📚 自我學習引擎(Self-Learning)`);
  console.log(`   修正紀錄: ${summary.total} 筆`);

  if (summary.patterns.length > 0) {
    console.log(`   重複模式: ${summary.patterns.length} 個`);
    for (const p of summary.patterns) {
      console.log(`   - ${p.description}`);
    }
  }

  // --apply：產出 learned-rules.json
  if (applyFlag || summary.patterns.length > 0) {
    const rules = applyLearning(corrections);
    const totalRules = rules.narrative_rules.length + rules.audit_rules.length + rules.renderer_rules.length;
    console.log(`\n   ✅ learned-rules.json 已產出（${totalRules} 條規則）`);
    console.log(`      narrative 規則: ${rules.narrative_rules.length}`);
    console.log(`      audit 規則: ${rules.audit_rules.length}`);
    console.log(`      renderer 規則: ${rules.renderer_rules.length}`);
  } else {
    console.log(`   ℹ️  無重複模式，未產出規則`);
  }
}

module.exports = {
  readCorrections,
  groupCorrections,
  summarizePatterns,
  generateRules,
  applyLearning,
  loadRules,
};
