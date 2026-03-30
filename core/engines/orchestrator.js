#!/usr/bin/env node
'use strict';

/**
 * orchestrator.js — Pipeline 調度核心(Orchestrator)
 *
 * 獨立的 Node.js 模組，不依賴任何 AI。
 * 純程式碼的階段直接執行，需要 AI 的階段透過 Provider 介面委託。
 *
 * CLI:
 *   node orchestrator.js --run-dir <path> [--mode auto|resume] [--rerun §N] [--format pptx|gslides]
 *
 * API:
 *   const { runPipeline } = require('./orchestrator');
 *   const result = await runPipeline({ runDir, mode, providers, format });
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readJSON, writeJSON } = require('./helpers');

// ══════════════════════════════════════════════════════
// 階段定義(Stage Definitions)
// ══════════════════════════════════════════════════════

const ENGINES_DIR = __dirname;

const STAGES = [
  { id: '§1',  name: '需求訪談',   type: 'provider', provider: 'interview', output: 'interview.json' },
  { id: '§2',  name: '研究蒐集',   type: 'engine',   cmd: 'research/extract-all.js', output: 'research.json', mergeWith: '§3' },
  { id: '§3',  name: '數據擷取',   type: 'merged',   mergedInto: '§2', output: 'data.json' },
  { id: '§4',  name: '數據分析',   type: 'engine',   cmd: 'analysis/analysis-engine.js', output: 'analysis.json' },
  { id: '§5',  name: '目的綁定',   type: 'engine',   cmd: 'purpose-binder/purpose-binder.js', output: 'purpose.json' },
  { id: '§6',  name: '腳本規劃',   type: 'engine',   cmd: 'script-planner/script-planner.js', output: 'script.json' },
  { id: '§7',  name: '敘事包裝',   type: 'provider', provider: 'narrative', output: 'narrative.json' },
  { id: '§7b', name: '敘事驗證',   type: 'engine',   cmd: 'pre-report-verify/verify-engine.js', output: 'verify-report.json' },
  { id: '§8',  name: '視覺設計',   type: 'skip',     reason: '品牌色自動處理' },
  { id: '§9',  name: '報告產出',   type: 'engine',   cmd: 'engine.js', output: 'output/', extraArgs: true },
  { id: '§10', name: '品質審核',   type: 'engine',   cmd: 'report-audit/audit-engine.js', output: 'audit-report' },
  { id: '§11', name: '人工回饋',   type: 'conditional', condition: 'guided', cmd: 'comment-feedback/index.js' },
  { id: '§12', name: '自我學習',   type: 'engine',   cmd: 'self-learning/learning-engine.js', output: 'learnings' },
];

// ══════════════════════════════════════════════════════
// 狀態管理(State Machine)
// ══════════════════════════════════════════════════════

function initStatus(runDir, mode) {
  const stages = {};
  for (const s of STAGES) {
    stages[s.id] = { status: 'pending' };
  }
  return {
    run_id: path.basename(runDir),
    status: 'in_progress',
    mode,
    current_stage: null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stages,
    errors: [],
  };
}

function loadOrInitStatus(runDir, mode) {
  const statusPath = path.join(runDir, 'run-status.json');
  const existing = readJSON(statusPath);
  if (existing && (mode === 'resume' || mode === 'auto')) {
    existing.mode = mode;
    existing.status = 'in_progress';
    existing.errors = existing.errors || [];
    // 確保所有 STAGES 都有對應的 status entry
    for (const s of STAGES) {
      if (!existing.stages[s.id]) {
        existing.stages[s.id] = { status: 'pending' };
      }
    }
    return existing;
  }
  return initStatus(runDir, mode);
}

function saveStatus(runDir, status) {
  status.updated_at = new Date().toISOString();
  writeJSON(path.join(runDir, 'run-status.json'), status);
}

// ══════════════════════════════════════════════════════
// 階段執行(Stage Execution)
// ══════════════════════════════════════════════════════

function runEngine(cmd, runDir, extraArgs = []) {
  const scriptPath = path.join(ENGINES_DIR, cmd);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`引擎不存在: ${scriptPath}`);
  }

  // 決定 CLI flag（不同 engine 用 --run-dir 或 --run）
  const useRunFlag = cmd === 'engine.js' ? '--run' : '--run-dir';
  const args = ['node', scriptPath, useRunFlag, runDir, ...extraArgs].join(' ');

  try {
    const output = execSync(args, {
      cwd: ENGINES_DIR,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (err) {
    // 有些 engine exit code 1 但其實有產出（如 audit failed）
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    return { success: false, output: stdout, error: stderr || err.message };
  }
}

// ══════════════════════════════════════════════════════
// 主函式(Main Pipeline)
// ══════════════════════════════════════════════════════

/**
 * 執行 pipeline
 * @param {object} options
 * @param {string} options.runDir — run 目錄路徑
 * @param {string} [options.mode='auto'] — auto | resume | guided
 * @param {string} [options.rerun] — 指定重跑的階段 id（如 '§4'）
 * @param {string} [options.format='pptx'] — 報告格式
 * @param {string} [options.schema='full-13'] — 報告 schema
 * @param {object} [options.providers={}] — AI provider 函式
 * @returns {Promise<{status, stages, duration, errors}>}
 */
async function runPipeline(options = {}) {
  const {
    runDir,
    mode = 'auto',
    rerun = null,
    format = 'pptx',
    schema = 'full-13',
    providers = {},
  } = options;

  if (!runDir) throw new Error('runDir is required');
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  const startTime = Date.now();
  const status = loadOrInitStatus(runDir, mode);

  // 如果指定重跑，把該階段及下游全部重設為 pending
  if (rerun) {
    const rerunIdx = STAGES.findIndex(s => s.id === rerun);
    if (rerunIdx === -1) throw new Error(`未知階段: ${rerun}`);
    for (let i = rerunIdx; i < STAGES.length; i++) {
      status.stages[STAGES[i].id] = { status: 'pending' };
    }
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`  Pipeline 調度核心(Orchestrator)`);
  console.log(`  Run: ${path.basename(runDir)}`);
  console.log(`  模式: ${mode}  格式: ${format}`);
  console.log(`══════════════════════════════════════\n`);

  const results = [];

  for (const stage of STAGES) {
    const stageStatus = status.stages[stage.id];

    // 跳過已完成的
    if (stageStatus.status === 'completed') {
      console.log(`  ✅ ${stage.id} ${stage.name} — 已完成，跳過`);
      results.push({ id: stage.id, status: 'skipped_completed' });
      continue;
    }

    // 跳過 skip 類型
    if (stage.type === 'skip') {
      stageStatus.status = 'skipped';
      stageStatus.reason = stage.reason;
      console.log(`  ⏭️  ${stage.id} ${stage.name} — 跳過（${stage.reason}）`);
      results.push({ id: stage.id, status: 'skipped' });
      saveStatus(runDir, status);
      continue;
    }

    // §3 merged into §2
    if (stage.type === 'merged') {
      stageStatus.status = status.stages[stage.mergedInto]?.status || 'pending';
      if (stageStatus.status === 'completed') {
        console.log(`  ✅ ${stage.id} ${stage.name} — 合併於 ${stage.mergedInto}，已完成`);
        results.push({ id: stage.id, status: 'merged_completed' });
      }
      continue;
    }

    // §11 conditional（只在 guided 模式下執行）
    if (stage.type === 'conditional') {
      if (mode !== stage.condition) {
        stageStatus.status = 'skipped';
        stageStatus.reason = `僅 ${stage.condition} 模式`;
        console.log(`  ⏭️  ${stage.id} ${stage.name} — 跳過（非 ${stage.condition} 模式）`);
        results.push({ id: stage.id, status: 'skipped' });
        saveStatus(runDir, status);
        continue;
      }
    }

    // Provider 類型（§1 訪談、§7 敘事）
    if (stage.type === 'provider') {
      const providerFn = providers[stage.provider];
      const outputPath = path.join(runDir, stage.output);

      // 如果輸出已存在且沒有 provider → 跳過
      if (!providerFn && fs.existsSync(outputPath)) {
        stageStatus.status = 'completed';
        stageStatus.completed_at = new Date().toISOString();
        stageStatus.output = stage.output;
        stageStatus.note = '使用既有檔案';
        console.log(`  ✅ ${stage.id} ${stage.name} — 使用既有 ${stage.output}`);
        results.push({ id: stage.id, status: 'existing' });
        saveStatus(runDir, status);
        continue;
      }

      // 如果有 provider → 呼叫
      if (providerFn) {
        console.log(`  🔄 ${stage.id} ${stage.name} — 呼叫 provider...`);
        stageStatus.status = 'in_progress';
        stageStatus.started_at = new Date().toISOString();
        status.current_stage = stage.id;
        saveStatus(runDir, status);

        try {
          await providerFn(runDir);
          stageStatus.status = 'completed';
          stageStatus.completed_at = new Date().toISOString();
          stageStatus.output = stage.output;
          console.log(`  ✅ ${stage.id} ${stage.name} — 完成`);
          results.push({ id: stage.id, status: 'completed' });
        } catch (err) {
          stageStatus.status = 'failed';
          stageStatus.error = err.message;
          status.errors.push({ stage: stage.id, error: err.message, at: new Date().toISOString() });
          console.error(`  ❌ ${stage.id} ${stage.name} — 失敗: ${err.message}`);
          results.push({ id: stage.id, status: 'failed', error: err.message });
          saveStatus(runDir, status);
          break; // 停止 pipeline
        }
        saveStatus(runDir, status);
        continue;
      }

      // 沒有 provider 也沒有既有檔案 → 跳過或失敗
      if (stage.provider === 'interview') {
        // 訪談是必要的
        stageStatus.status = 'failed';
        stageStatus.error = '缺少 interview.json 且未提供 interview provider';
        status.errors.push({ stage: stage.id, error: stageStatus.error, at: new Date().toISOString() });
        console.error(`  ❌ ${stage.id} ${stage.name} — ${stageStatus.error}`);
        results.push({ id: stage.id, status: 'failed', error: stageStatus.error });
        saveStatus(runDir, status);
        break;
      }
      // narrative 可選（normalizer 會補齊）
      stageStatus.status = 'skipped';
      stageStatus.reason = '無 provider 且無既有檔案';
      console.log(`  ⚠️  ${stage.id} ${stage.name} — 跳過（無 provider）`);
      results.push({ id: stage.id, status: 'skipped' });
      saveStatus(runDir, status);
      continue;
    }

    // Engine 類型（純 Node.js）
    if (stage.type === 'engine' || stage.type === 'conditional') {
      console.log(`  🔄 ${stage.id} ${stage.name} — 執行中...`);
      stageStatus.status = 'in_progress';
      stageStatus.started_at = new Date().toISOString();
      status.current_stage = stage.id;
      saveStatus(runDir, status);

      // 組裝額外參數
      const extraArgs = [];
      if (stage.id === '§9') {
        extraArgs.push('--format', format, '--schema', schema);
      }

      const result = runEngine(stage.cmd, runDir, extraArgs);

      if (result.success) {
        stageStatus.status = 'completed';
        stageStatus.completed_at = new Date().toISOString();
        stageStatus.output = stage.output;
        console.log(`  ✅ ${stage.id} ${stage.name} — 完成`);
        results.push({ id: stage.id, status: 'completed' });

        // §2 完成時一起標記 §3
        if (stage.mergeWith) {
          const mergedStage = status.stages[stage.mergeWith];
          if (mergedStage) {
            mergedStage.status = 'completed';
            mergedStage.completed_at = stageStatus.completed_at;
          }
        }
      } else {
        // §7b 驗證失敗 → 攔截，不繼續 §9（節省報告產出成本）
        if (stage.id === '§7b' && result.output.includes('敘事驗證報告')) {
          const verifyPassed = result.output.includes('PASS');
          stageStatus.status = verifyPassed ? 'completed' : 'failed';
          stageStatus.completed_at = new Date().toISOString();
          stageStatus.output = stage.output;
          stageStatus.note = verifyPassed ? 'verify_passed' : 'verify_failed';
          const scoreMatch = result.output.match(/分數：(\d+)\/100/);
          if (scoreMatch) stageStatus.score = parseInt(scoreMatch[1]);
          console.log(`  ${verifyPassed ? '✅' : '❌'} ${stage.id} ${stage.name} — ${stageStatus.note} (${stageStatus.score || '?'}/100)`);
          results.push({ id: stage.id, status: verifyPassed ? 'completed' : 'failed', note: stageStatus.note });
          saveStatus(runDir, status);
          if (!verifyPassed) {
            console.log(`  ⛔ 敘事驗證未通過，停止 pipeline。請修正 narrative.json 後重跑 §7。`);
            break; // 阻止進入 §9
          }
          continue;
        }
        // §10 audit 失敗不中斷（exit code 1 但有產出）
        if (stage.id === '§10' && result.output.includes('品質審核報告')) {
          stageStatus.status = 'completed';
          stageStatus.completed_at = new Date().toISOString();
          stageStatus.output = stage.output;
          stageStatus.note = result.output.includes('FAILED') ? 'audit_failed' : 'audit_passed';
          console.log(`  ⚠️  ${stage.id} ${stage.name} — 完成（${stageStatus.note}）`);
          if (result.output) {
            // 擷取分數
            const scoreMatch = result.output.match(/分數：(\d+)\/100/);
            if (scoreMatch) stageStatus.score = parseInt(scoreMatch[1]);
          }
          results.push({ id: stage.id, status: 'completed', note: stageStatus.note });
        }
        // §12 失敗非致命
        else if (stage.id === '§12') {
          stageStatus.status = 'completed';
          stageStatus.note = 'non_fatal_error';
          console.log(`  ⚠️  ${stage.id} ${stage.name} — 非致命錯誤，繼續`);
          results.push({ id: stage.id, status: 'completed', note: 'non_fatal' });
        }
        else {
          stageStatus.status = 'failed';
          stageStatus.error = result.error || 'Unknown error';
          status.errors.push({ stage: stage.id, error: stageStatus.error, at: new Date().toISOString() });
          console.error(`  ❌ ${stage.id} ${stage.name} — 失敗`);
          if (result.error) console.error(`     ${result.error.slice(0, 200)}`);
          results.push({ id: stage.id, status: 'failed', error: stageStatus.error });
          saveStatus(runDir, status);
          break; // 停止 pipeline
        }
      }
      saveStatus(runDir, status);
    }
  }

  // 完成
  const allCompleted = STAGES.every(s =>
    ['completed', 'skipped', 'merged'].includes(status.stages[s.id]?.status)
    || s.type === 'merged'
  );
  status.status = allCompleted ? 'completed' : 'failed';
  status.duration_ms = Date.now() - startTime;
  saveStatus(runDir, status);

  const duration = (status.duration_ms / 1000).toFixed(1);
  console.log(`\n══════════════════════════════════════`);
  console.log(`  ${allCompleted ? '✅' : '❌'} Pipeline ${status.status}`);
  console.log(`  耗時: ${duration}s`);
  if (status.errors.length > 0) {
    console.log(`  錯誤: ${status.errors.length} 個`);
  }
  console.log(`══════════════════════════════════════\n`);

  return { status: status.status, stages: results, duration_ms: status.duration_ms, errors: status.errors };
}

// ══════════════════════════════════════════════════════
// CLI 入口
// ══════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const runDir = getArg('--run-dir');
  const mode = getArg('--mode') || 'auto';
  const rerun = getArg('--rerun');
  const format = getArg('--format') || 'pptx';
  const schema = getArg('--schema') || 'full-13';

  if (!runDir) {
    console.error('Usage: node orchestrator.js --run-dir <path> [--mode auto|resume] [--rerun §N] [--format pptx|gslides]');
    process.exit(1);
  }

  const resolvedDir = runDir.replace(/^~/, process.env.HOME);

  runPipeline({ runDir: resolvedDir, mode, rerun, format, schema })
    .then(result => {
      process.exit(result.status === 'completed' ? 0 : 1);
    })
    .catch(err => {
      console.error('Pipeline 錯誤:', err.message);
      process.exit(1);
    });
}

module.exports = { runPipeline, STAGES };
