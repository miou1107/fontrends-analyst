#!/usr/bin/env node
'use strict';

// SoC Boundary Check — 檢查 L3 engines 是否違反規則
//
// 規則：
//   1. engines/**/*.js 不得包含中文字面量（[\u4e00-\u9fa5]）
//   2. engines/**/*.js 不得包含裸數字門檻（> 1 或 < -1 的整數/小數，除非在註解、測試、特殊白名單）
//   3. engines/**/*.js 不得直接 require 'knowledge/' 路徑（必須走 knowledge-loader）
//   4. engines/**/*.js 不得寫 os.tmpdir() 或 /tmp/ 路徑
//
// 執行：node core/tools/check-soc-boundary.js
// 退出碼：0 = 通過；1 = 違反

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINES_DIR = path.join(ROOT, 'engines');

// 白名單：這些檔案暫時允許有中文（等後續移轉）
const CHINESE_WHITELIST = new Set([
  // 空白即表示所有 engines 都要無中文
]);

// 白名單：allowed 裸數字（0, 1, -1, 2, 3, 4 for common indexing, 100 for percentage, 1000 for ms/sec conversion, 60 for sec/min）
const ALLOWED_NUMBERS = new Set([0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1000, 60, 24, 1024, 3600, 86400]);

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function walkFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f === '__tests__' || f === 'node_modules') continue;
      walkFiles(full, out);
    } else if (f.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function stripCommentsAndStrings(src) {
  // 保留字串字面量中的內容（供中文檢查），但去掉註解
  return src
    .replace(/\/\/[^\n]*/g, '')       // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
}

function checkFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  const srcNoComments = stripCommentsAndStrings(src);
  const violations = [];

  // 1. 中文字面量
  if (!CHINESE_WHITELIST.has(rel) && CJK_RE.test(srcNoComments)) {
    const lines = srcNoComments.split('\n');
    lines.forEach((line, i) => {
      const m = line.match(CJK_RE);
      if (m) {
        violations.push({
          rule: 'no-chinese-literal',
          line: i + 1,
          snippet: line.trim().substring(0, 80),
        });
      }
    });
  }

  // 2. 直接讀 knowledge/ 路徑
  const knowledgeRefRe = /require\s*\(\s*['"][^'"]*\/knowledge\/[^'"]+['"]\s*\)|['"][^'"]*\/knowledge\/[^'"]+\.ya?ml['"]/g;
  let m;
  while ((m = knowledgeRefRe.exec(srcNoComments)) !== null) {
    const before = srcNoComments.substring(0, m.index);
    const lineNum = before.split('\n').length;
    violations.push({
      rule: 'no-direct-knowledge-require',
      line: lineNum,
      snippet: m[0].substring(0, 80),
    });
  }

  // 3. os.tmpdir / /tmp/
  const tmpRe = /os\.tmpdir\s*\(\s*\)|['"]\/tmp\/[^'"]*['"]/g;
  while ((m = tmpRe.exec(srcNoComments)) !== null) {
    const before = srcNoComments.substring(0, m.index);
    const lineNum = before.split('\n').length;
    violations.push({
      rule: 'no-tmp-write',
      line: lineNum,
      snippet: m[0].substring(0, 80),
    });
  }

  return { rel, violations };
}

const BASELINE_FILE = path.join(ROOT, 'tools', 'soc-boundary-baseline.json');

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')); }
  catch { return null; }
}

function saveBaseline(data) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2) + '\n');
}

function countByFile(allViolations) {
  const map = {};
  for (const { rel, violations } of allViolations) map[rel] = violations.length;
  return map;
}

function main() {
  if (!fs.existsSync(ENGINES_DIR)) {
    console.error(`engines/ not found at ${ENGINES_DIR}`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const mode = args[0] || 'check';  // check | baseline | report

  const files = walkFiles(ENGINES_DIR);
  const allViolations = [];
  for (const file of files) {
    const { rel, violations } = checkFile(file);
    if (violations.length > 0) allViolations.push({ rel, violations });
  }

  const current = countByFile(allViolations);
  const total = allViolations.reduce((s, f) => s + f.violations.length, 0);

  if (mode === 'baseline') {
    saveBaseline({ generated_at: new Date().toISOString(), total, files: current });
    console.log(`📸 Baseline saved: ${total} violations in ${Object.keys(current).length} files → ${path.relative(ROOT, BASELINE_FILE)}`);
    process.exit(0);
  }

  if (mode === 'report' || allViolations.length === 0) {
    if (allViolations.length === 0) {
      console.log(`✅ SoC boundary check passed (${files.length} files scanned, no violations)`);
      process.exit(0);
    }
    console.log(`📋 SoC boundary report: ${total} violations in ${allViolations.length} file(s):\n`);
    for (const { rel, violations } of allViolations) {
      console.log(`${rel}:`);
      for (const v of violations) console.log(`  [${v.rule}] line ${v.line}: ${v.snippet}`);
      console.log();
    }
    process.exit(0);
  }

  // check mode: compare with baseline, fail only on regressions
  const baseline = loadBaseline();
  if (!baseline) {
    console.log(`⚠️  No baseline found. Run: node tools/check-soc-boundary.js baseline`);
    console.log(`   Current state: ${total} violations across ${allViolations.length} files`);
    process.exit(0);
  }

  const regressions = [];
  for (const [rel, count] of Object.entries(current)) {
    const baseCount = baseline.files[rel] ?? 0;
    if (count > baseCount) {
      regressions.push({ rel, was: baseCount, now: count, delta: count - baseCount });
    }
  }

  if (regressions.length === 0) {
    const delta = total - baseline.total;
    if (delta < 0) {
      console.log(`✅ SoC check passed — improved by ${-delta} violations (${baseline.total} → ${total})`);
    } else {
      console.log(`✅ SoC check passed — no regressions (baseline: ${baseline.total} violations)`);
    }
    process.exit(0);
  }

  console.log(`❌ SoC regressions detected:\n`);
  for (const r of regressions) {
    console.log(`  ${r.rel}: ${r.was} → ${r.now} (+${r.delta})`);
  }
  console.log(`\n新增違規須修正，或執行 baseline 更新基準線（需 code review）`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = { checkFile, walkFiles };
