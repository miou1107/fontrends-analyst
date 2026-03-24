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

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const runIdx = args.indexOf('--run');
  const fileIdx = args.indexOf('--file');

  let filePath = DEFAULT_CORRECTIONS_PATH;
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    filePath = args[fileIdx + 1];
  }

  const corrections = readCorrections(filePath);
  const summary = summarizePatterns(corrections);

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nTotal corrections: ${summary.total}`);
  if (summary.patterns.length > 0) {
    console.log(`Detected ${summary.patterns.length} repeated patterns:`);
    for (const p of summary.patterns) {
      console.log(`  - ${p.description}`);
    }
  }
}

module.exports = { readCorrections, groupCorrections, summarizePatterns };
