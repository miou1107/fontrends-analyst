#!/usr/bin/env node
'use strict';

/**
 * CLI 介面驅動(CLI Driver) — 用終端機驅動 Pipeline
 *
 * 這是第一個「不依賴 Claude」的介面實作。
 * 證明 pipeline 可以脫離 AI 框架獨立運作。
 *
 * 用法：
 *   # 自動模式（用現有 run 目錄，跳過訪談和敘事）
 *   node cli.js --run ~/.fontrends/runs/dior-2026-03-24 --auto
 *
 *   # 互動模式（全新分析，終端機問答）
 *   node cli.js --brand Dior --competitor Chanel --period "2025-03~2026-03"
 *
 *   # 從斷點續接
 *   node cli.js --run ~/.fontrends/runs/dior-2026-03-24 --resume
 *
 *   # 指定報告格式
 *   node cli.js --run ~/.fontrends/runs/dior-2026-03-24 --auto --format pptx --schema full-13
 */

const fs = require('fs');
const path = require('path');
const { Pipeline } = require('./orchestrator');
const { CliInput, PresetInput } = require('./interfaces/user-input');

// ══════════════════════════════════════════════════════
// 參數解析
// ══════════════════════════════════════════════════════

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--run': args.run = argv[++i]; break;
      case '--brand': args.brand = argv[++i]; break;
      case '--competitor': args.competitor = argv[++i]; break;
      case '--period': args.period = argv[++i]; break;
      case '--format': args.format = argv[++i]; break;
      case '--schema': args.schema = argv[++i]; break;
      case '--auto': args.auto = true; break;
      case '--resume': args.resume = true; break;
      case '--skip-narrative': args.skipNarrative = true; break;
      case '--profile': args.profile = argv[++i]; break;
      case '--density': args.density = argv[++i]; break;
      case '--help': args.help = true; break;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
📊 fontrends-analyst CLI — 品牌社群數據分析 Pipeline

用法：
  node cli.js [選項]

選項：
  --run <path>        指定 run 目錄路徑
  --brand <name>      品牌名稱（建立新 run）
  --competitor <name> 競品名稱
  --period <range>    分析期間（如 "2025-03~2026-03"）
  --format <type>     報告格式: pptx, gslides, gdocs（預設: pptx）
  --schema <name>     報告模板: full-13, compact-8, mini-3（預設: full-13）
  --profile <name>    知識 profile: brand-social, brand-social-for-ceo（預設: brand-social）
  --density <name>    詳盡度: sparse（精簡給老闆）, standard, deep（分析師用）
  --auto              自動模式（跳過互動問答）
  --resume            從斷點續接
  --skip-narrative    跳過 §7 敘事包裝（需 AI 產出）
  --help              顯示說明

範例：
  # 給 LV 老闆看的精簡版
  node cli.js --brand louis-vuitton --density sparse --auto

  # Taipei 101 觀景台深度版分析
  node cli.js --brand taipei-101 --density deep --auto

  # Taipei FunPass 標準報告
  node cli.js --brand taipei-funpass --density standard --auto

  # 自動跑現有 run
  node cli.js --run ~/.fontrends/runs/dior-2026-03-24 --auto --skip-narrative

  # 從斷點續接
  node cli.js --run ~/.fontrends/runs/dior-2026-03-24 --resume
`);
}

// ══════════════════════════════════════════════════════
// Run 目錄管理
// ══════════════════════════════════════════════════════

function resolveRunDir(args) {
  if (args.run) {
    // 展開 ~
    const resolved = args.run.replace(/^~/, process.env.HOME);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Run 目錄不存在: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }

  if (args.brand) {
    const slug = args.brand.toLowerCase().replace(/\s+/g, '-');
    const date = new Date().toISOString().slice(0, 10);
    const runsBase = path.join(process.env.HOME, '.fontrends', 'runs');
    const runDir = path.join(runsBase, `${slug}-${date}`);

    if (!fs.existsSync(runsBase)) fs.mkdirSync(runsBase, { recursive: true });
    if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });

    // 寫入基本 interview.json
    const interview = {
      brand: args.brand,
      competitor: args.competitor || '',
      period: args.period || '',
      sources: ['mysql'],
    };
    fs.writeFileSync(path.join(runDir, 'interview.json'), JSON.stringify(interview, null, 2));

    console.log(`📁 建立新 run: ${runDir}`);
    return runDir;
  }

  console.error('❌ 請指定 --run <path> 或 --brand <name>');
  printHelp();
  process.exit(1);
}

// ══════════════════════════════════════════════════════
// 主程式
// ══════════════════════════════════════════════════════

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const runDir = resolveRunDir(args);

  // 選擇使用者輸入介面
  let userInput;
  if (args.auto) {
    // 自動模式：從 interview.json 載入預設答案
    const interviewPath = path.join(runDir, 'interview.json');
    if (fs.existsSync(interviewPath)) {
      const interview = JSON.parse(fs.readFileSync(interviewPath, 'utf-8'));
      userInput = PresetInput.fromInterview(interview);
    } else {
      userInput = new PresetInput();
    }
  } else {
    // 互動模式：終端機問答
    userInput = new CliInput();
  }

  // 建立 pipeline
  const pipeline = new Pipeline(runDir, userInput, {
    format: args.format || 'pptx',
    schema: args.schema || 'full-13',
    auto: args.auto || false,
    skipNarrative: args.skipNarrative || false,
  });

  try {
    if (args.resume) {
      await pipeline.resume();
    } else {
      await pipeline.run();
    }
  } catch (err) {
    console.error(`\n❌ Pipeline 異常: ${err.message}`);
    process.exit(1);
  } finally {
    if (userInput.close) userInput.close();
  }
}

main();
