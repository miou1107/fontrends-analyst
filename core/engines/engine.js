#!/usr/bin/env node
/**
 * engine.js — Presentation Generator Engine
 *
 * Reads JSON data from a run folder, assembles intermediate page format,
 * dispatches to the appropriate renderer (gslides/pptx/gdocs).
 *
 * Usage:
 *   node engine.js --run ~/.fontrends/runs/louis-vuitton-2025-03-19 --format gslides --schema full-13
 */

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON, resolveColor, formatNumber, formatPct } = require('./helpers');
const { validateAndWarn } = require('./validator');

// ══════════════════════════════════════════════════════
// CLI Argument Parsing
// ══════════════════════════════════════════════════════

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run' && argv[i + 1]) args.run = argv[++i];
    else if (argv[i] === '--format' && argv[i + 1]) args.format = argv[++i];
    else if (argv[i] === '--schema' && argv[i + 1]) args.schema = argv[++i];
  }
  if (!args.run) throw new Error('缺少 --run 參數（run 資料夾路徑）');
  if (!args.format) args.format = 'gslides';
  if (!args.schema) args.schema = 'full-13';
  return args;
}

// ══════════════════════════════════════════════════════
// Load Configuration
// ══════════════════════════════════════════════════════

function loadConfig(runPath, schemaName) {
  const engineDir = __dirname;
  const coreDir = path.join(engineDir, '..');

  // Load brand.json (required)
  const brand = readJSON(path.join(runPath, 'brand.json'));
  if (!brand) throw new Error(`找不到 brand.json：${runPath}/brand.json`);

  // Load theme.json (optional, fallback to default)
  let theme = readJSON(path.join(runPath, 'theme.json'));
  if (!theme) {
    theme = readJSON(path.join(coreDir, 'templates', 'theme-default.json'));
    console.log('📎 使用預設 theme');
  }

  // Load schema preset
  const schema = readJSON(path.join(coreDir, 'schemas', `${schemaName}.json`));
  if (!schema) throw new Error(`找不到 schema：${schemaName}.json`);

  // Load script.json (optional — if exists, use it; otherwise auto-generate from data.json)
  const script = readJSON(path.join(runPath, 'script.json'));

  // Load data.json (for auto-generation or data binding)
  const data = readJSON(path.join(runPath, 'data.json'))
    || readJSON(path.join(runPath, 'data_partial.json'));

  // Load narrative.json (optional)
  const narrative = readJSON(path.join(runPath, 'narrative.json'));

  // Validate key data files (non-blocking warnings)
  const interview = readJSON(path.join(runPath, 'interview.json'));
  if (interview) validateAndWarn('interview', interview, 'interview.json');
  if (narrative) validateAndWarn('narrative', narrative, 'narrative.json');

  return { brand, theme, schema, script, data, narrative };
}

// ══════════════════════════════════════════════════════
// Page Assembly — Build Intermediate Format
// ══════════════════════════════════════════════════════

/**
 * Assemble pages from script.json (chapters + fixed_pages) or fall back to data.json + schema.
 *
 * When script.json has chapters (from script-planner):
 *   - fixed_pages define structural pages (cover, summary, actions, closing)
 *   - chapters are sorted by rank and placed between summary and actions
 *   - each chapter's headline replaces the generic schema title
 *   - excluded pages are skipped
 *
 * Fallback: auto-generate from data.json + schema (original behavior).
 */
function assemblePages(config) {
  const { schema, script, data, brand, narrative, theme } = config;

  // Script-planner integration: use chapters + fixed_pages
  if (script && script.chapters) {
    console.log('📄 使用 script.json 的章節排序（script-planner 輸出）');
    const pages = [];
    const schemaMap = {};
    schema.pages.forEach(s => { schemaMap[s.pageId] = s; });

    // 1. Build fixed pages in order: cover, summary first
    const fixedPages = script.fixed_pages || [];
    const frontFixed = fixedPages.filter(id => id === 'cover' || id === 'summary');
    const backFixed = fixedPages.filter(id => id !== 'cover' && id !== 'summary');

    // 2. Add front fixed pages
    for (const pageId of frontFixed) {
      const schemaDef = schemaMap[pageId];
      if (!schemaDef) continue;
      const page = buildPage(pageId, schemaDef.title, schemaDef.background, data, brand, narrative, theme);
      pages.push(page);
    }

    // 3. Add chapters sorted by rank
    const sortedChapters = [...script.chapters].sort((a, b) => a.rank - b.rank);
    for (const chapter of sortedChapters) {
      const schemaDef = schemaMap[chapter.pageId];
      const bg = schemaDef ? schemaDef.background : 'light';
      // Use script-planner's headline as page title
      const title = chapter.headline || (schemaDef ? schemaDef.title : chapter.pageId);
      const page = buildPage(chapter.pageId, title, bg, data, brand, narrative, theme);
      // Attach script metadata for renderers that can use it
      page.scriptMeta = {
        rank: chapter.rank,
        score: chapter.score,
        focus: chapter.focus,
        blocks: chapter.blocks,
        data_refs: chapter.data_refs,
      };
      pages.push(page);
    }

    // 4. Add back fixed pages (actions, closing, etc.)
    for (const pageId of backFixed) {
      const schemaDef = schemaMap[pageId];
      if (!schemaDef) continue;
      const page = buildPage(pageId, schemaDef.title, schemaDef.background, data, brand, narrative, theme);
      pages.push(page);
    }

    // 5. Log excluded pages
    if (script.excluded && script.excluded.length > 0) {
      console.log(`📋 排除頁面：${script.excluded.map(e => `${e.pageId}(${e.reason})`).join(', ')}`);
    }

    return pages;
  }

  // Legacy: script.pages direct pass-through
  if (script && script.pages) {
    console.log('📄 使用 script.json 的頁面定義（legacy）');
    return script.pages;
  }

  // Fallback: auto-generate from data + schema
  console.log('📄 從 data.json + schema 自動組裝頁面');
  const pages = [];

  schema.pages.forEach((schemaDef, i) => {
    const page = buildPage(schemaDef.pageId, schemaDef.title, schemaDef.background, data, brand, narrative, theme);
    pages.push(page);
  });

  return pages;
}

/**
 * Build a single page using pageBuilders.
 */
function buildPage(pageId, title, background, data, brand, narrative, theme) {
  const page = {
    pageId,
    title,
    background: background || 'light',
    speakerNotes: '',
    elements: [],
  };

  const builder = pageBuilders[pageId];
  if (builder) {
    builder(page, data, brand, narrative, theme);
  } else {
    page.elements.push({
      type: 'text',
      x: 0.5, y: 2.5, w: 9, h: 1,
      content: `${title}（待填入）`,
      fontSize: 14, color: 'midGray', align: 'CENTER',
    });
  }

  return page;
}

// ══════════════════════════════════════════════════════
// Narrative → Page Builder (data-driven)
// ══════════════════════════════════════════════════════

/**
 * Map schema pageId → narrative chapter id.
 * Structural pages (cover, summary, closing) have dedicated builders.
 * Content pages map to narrative chapters via this table.
 */
const PAGE_TO_CHAPTER = {
  kpi:         'social_overview',
  trend:       'trend_seasonality',
  language:    'language_audience',
  platform:    'platform_efficiency',
  kol:         'kol_ecosystem',
  sentiment:   'sentiment_risk',
  venue:       'search_intent',
  validation:  'venue_connection',
  competitor:  'competitive_landscape',
  actions:     'action_recommendations',
};

/**
 * Find a narrative chapter by pageId mapping or direct id match.
 */
function findChapter(narrative, pageId) {
  if (!narrative?.chapters) return null;
  const chapterId = PAGE_TO_CHAPTER[pageId] || pageId;
  return narrative.chapters.find(c => c.id === chapterId) || null;
}

/**
 * Generic builder: creates table + insight from a narrative chapter.
 * Falls back to data.json-based legacy builder if no chapter found.
 */
function buildFromNarrative(page, chapter) {
  const elements = [];

  // Table from chapter.data_table
  if (chapter.data_table) {
    const rowCount = chapter.data_table.rows.length;
    const tableH = Math.min(0.4 + rowCount * 0.35, 3.2);
    elements.push({
      type: 'table', x: 0.3, y: 1.2, w: 9.4, h: tableH,
      headers: chapter.data_table.headers,
      rows: chapter.data_table.rows,
      headerBg: 'primary',
    });
  }

  // Insight text
  if (chapter.insight) {
    elements.push({
      type: 'text', x: 0.5, y: 5.1, w: 9, h: 0.3,
      content: chapter.insight,
      fontSize: 10, italic: true, color: 'primary',
    });
  }

  page.elements = elements;

  // Speaker notes from narrative fields
  const notes = [`【${chapter.title}】`];
  if (chapter.so_what) notes.push(`要點：${chapter.so_what}`);
  if (chapter.action_link) notes.push(`場域連結：${chapter.action_link}`);
  page.speakerNotes = notes.join('\n');
}

// ══════════════════════════════════════════════════════
// Page Builders
// ══════════════════════════════════════════════════════

const pageBuilders = {
  // ── Structural pages ──────────────────────────────

  cover(page, data, brand, narrative) {
    const brandName = narrative?.meta?.brand || brand.name || brand.brand || 'Brand';
    const period = narrative?.meta?.period || data?.meta?.period || '分析期間';
    const title = narrative?.title || '品牌社群聲量分析報告';
    page.elements = [
      { type: 'text', x: 0.5, y: 1.2, w: 9, h: 1, content: brandName.toUpperCase(),
        fontSize: 44, bold: true, color: 'primary', align: 'CENTER' },
      { type: 'text', x: 0.5, y: 2.1, w: 9, h: 0.6, content: title,
        fontSize: 20, color: 'white', align: 'CENTER' },
      { type: 'text', x: 0.5, y: 2.7, w: 9, h: 0.5, content: `分析期間：${period}`,
        fontSize: 14, color: 'lightGray', align: 'CENTER' },
      { type: 'text', x: 0.5, y: 4.7, w: 9, h: 0.5, content: 'Powered by FonTrends × Journey101',
        fontSize: 12, color: 'midGray', align: 'CENTER' },
    ];
    page.speakerNotes = `【開場白】\n今天要分享的是 ${brandName} 在台灣社群媒體上的品牌聲量分析報告。\n分析期間：${period}。`;
  },

  summary(page, data, brand, narrative) {
    // Try narrative executive_summary first, then chapters' insights, then fallback
    let content;
    if (narrative?.executive_summary) {
      // Truncate for slide use — first 3 sentences
      const sentences = narrative.executive_summary.split(/[。！]/).filter(s => s.trim()).slice(0, 3);
      content = sentences.map(s => `▸ ${s.trim()}`).join('\n\n');
    } else if (narrative?.chapters) {
      content = narrative.chapters.slice(0, 5).map(c => `▸ ${c.insight}`).join('\n\n');
    } else {
      content = [
        '▸ 社群影響力分析結果',
        '▸ 聲量趨勢與季節性',
        '▸ 平台分布與效率',
        '▸ 好感度與競品比較',
        '▸ 場域關聯與行動建議',
      ].join('\n\n');
    }
    page.elements = [
      { type: 'text', x: 0.5, y: 1.2, w: 9, h: 3.8,
        content, fontSize: 13, color: 'text_on_light' },
    ];
    page.speakerNotes = '【執行摘要】\n這頁是整份報告的精華。';
  },

  closing(page, data, brand, narrative) {
    const brandName = narrative?.meta?.brand || brand.name || brand.brand || 'Brand';
    const venue = narrative?.meta?.venue || '台北 101';
    page.elements = [
      { type: 'text', x: 0.5, y: 1.0, w: 9, h: 0.8, content: 'Thank You',
        fontSize: 40, bold: true, color: 'primary', align: 'CENTER' },
      { type: 'text', x: 0.5, y: 2.0, w: 9, h: 1,
        content: `${venue} × ${brandName}\n攜手打造精品行銷新高度`,
        fontSize: 18, bold: true, color: 'white', align: 'CENTER' },
      { type: 'text', x: 0.5, y: 5.1, w: 9, h: 0.4,
        content: 'FonTrends × Journey101  |  Confidential',
        fontSize: 10, color: 'midGray', align: 'CENTER' },
    ];
    page.speakerNotes = `【結語】\n感謝各位的時間。建議下一步安排品牌對口窗口會議。`;
  },

  // ── Content pages (narrative-driven with data.json fallback) ──

  kpi(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'kpi');
    if (chapter?.data_table) {
      buildFromNarrative(page, chapter);
      return;
    }
    // Fallback: data.json
    const so = data?.pages?.social_overview?.data || {};
    page.elements = [
      { value: formatNumber(so.influence), label: '總影響力', accentColor: 'primary' },
      { value: formatNumber(so.posts), label: '總發文數', accentColor: 'secondary' },
      { value: formatNumber(so.likes), label: '總讚數', accentColor: 'primary' },
      { value: formatNumber(so.comments), label: '總留言數', accentColor: 'secondary' },
      { value: formatNumber(so.shares), label: '總分享數', accentColor: 'secondary' },
      { value: so.sentiment_positive ? `${so.sentiment_positive}% 正面` : 'N/A', label: '好感度', accentColor: 'positive' },
    ].map((card, i) => ({ type: 'kpi_card', index: i, ...card }));
    page.speakerNotes = '【KPI 卡片說明】\n這六個數字是品牌在台灣社群的全貌。';
  },

  trend(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'trend');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const monthly = data?.pages?.trend?.data?.monthly || [];
    const rows = monthly.slice(0, 5).map(m => [m.month, `~${formatNumber(m.influence)}`, m.event || '']);
    page.elements = [
      { type: 'table', x: 0.3, y: 1.2, w: 9.4, h: 2.2,
        headers: ['月份', '影響力', '事件標註'], rows, headerBg: 'primary' },
    ];
    page.speakerNotes = '【趨勢分析重點】';
  },

  language(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'language');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const lang = data?.pages?.language_distribution?.data || {};
    page.elements = [
      { type: 'bar_chart', x: 0.5, y: 1.45, bars: [
        { label: '英文', pct: lang.english || 0, color: 'primary' },
        { label: '中文', pct: lang.chinese || 0, color: 'secondary' },
        { label: '日文', pct: lang.japanese || 0, color: 'midGray' },
        { label: '其他', pct: lang.other || 0, color: 'lightGray' },
      ]},
    ];
    page.speakerNotes = '【語系分布解讀】';
  },

  platform(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'platform');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const items = data?.pages?.platform?.data?.items || [];
    const rows = items.slice(0, 6).map(p => [p.name, formatNumber(p.influence), formatPct(p.share), formatNumber(p.posts)]);
    page.elements = [
      { type: 'table', x: 0.3, y: 1.2, w: 9.4, h: 2.8,
        headers: ['平台', '影響力', '佔比', '發文數'], rows, headerBg: 'primary' },
    ];
    page.speakerNotes = '【平台分析重點】';
  },

  kol(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'kol');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const items = data?.pages?.kol?.data?.items || [];
    const rows = items.slice(0, 5).map(k => [String(k.rank), k.name, k.platform, formatNumber(k.influence), k.type]);
    page.elements = [
      { type: 'table', x: 0.3, y: 1.2, w: 9.4, h: 2.2,
        headers: ['#', 'KOL 名稱', '平台', '影響力', '類型'], rows, headerBg: 'primary' },
    ];
    page.speakerNotes = '【KOL 排行解讀】';
  },

  sentiment(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'sentiment');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const sent = data?.pages?.sentiment?.data || {};
    const comp = data?.pages?.competitor_data?.data || {};
    page.elements = [
      { type: 'bar_chart', x: 0.5, y: 1.5, bars: [
        { label: '正面', pct: sent.positive || 0, color: 'positive' },
        { label: '中立', pct: sent.neutral || 0, color: 'neutral_sent' },
        { label: '負面', pct: sent.negative || 0, color: 'negative' },
      ]},
      { type: 'table', x: 0.5, y: 3.2, w: 9, h: 1.6,
        headers: ['指標', '品牌', '競品', '差異'],
        rows: [
          ['正面', formatPct(sent.positive), formatPct(comp.sentiment_positive), ''],
          ['中立', formatPct(sent.neutral), '', ''],
          ['負面', formatPct(sent.negative), formatPct(comp.sentiment_negative), ''],
        ], headerBg: 'primary' },
    ];
    page.speakerNotes = '【好感度分析】';
  },

  venue(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'venue');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const si = data?.pages?.search_intent?.data || {};
    page.elements = [
      { type: 'text', x: 0.5, y: 1.2, w: 9, h: 4, content: [
        '搜尋意圖洞察',
        `• 加權搜尋指數：${formatNumber(si.weighted_index)}`,
        `• 關鍵字組數：${si.keyword_count || 'N/A'} 組`,
        `• 月均搜量：${formatNumber(si.monthly_avg)}`,
      ].join('\n'), fontSize: 11, color: 'text_on_light' },
    ];
    page.speakerNotes = '【場域關聯分析】';
  },

  validation(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'validation');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const monthly = data?.pages?.trend?.data?.monthly || [];
    const peaked = monthly.filter(m => m.event).slice(0, 4);
    const rows = peaked.map(m => [m.month, `~${formatNumber(m.influence)}`, m.event]);
    page.elements = [
      { type: 'table', x: 0.3, y: 1.2, w: 9.4, h: 1.8,
        headers: ['時間', '聲量', '驗證事件'], rows, headerBg: 'primary' },
    ];
    page.speakerNotes = '【外部驗證】';
  },

  competitor(page, data, brand, narrative) {
    const chapter = findChapter(narrative, 'competitor');
    if (chapter) { buildFromNarrative(page, chapter); return; }
    const so = data?.pages?.social_overview?.data || {};
    const comp = data?.pages?.competitor_data?.data || {};
    const brandName = data?.meta?.brand || '品牌';
    const compName = data?.meta?.competitor || '競品';
    page.elements = [
      { type: 'table', x: 0.3, y: 1.2, w: 9.4, h: 2.2,
        headers: ['指標', brandName, compName, '優勢'],
        rows: [
          ['總影響力', formatNumber(so.influence), formatNumber(comp.influence), ''],
          ['總讚數', formatNumber(so.likes), formatNumber(comp.likes), ''],
          ['正面好感', formatPct(so.sentiment_positive), formatPct(comp.sentiment_positive), ''],
        ], headerBg: 'primary' },
    ];
    page.speakerNotes = '【競品比較】';
  },

  actions(page, data, brand, narrative) {
    // Try narrative.recommendations first
    let rows;
    if (narrative?.recommendations?.length) {
      rows = narrative.recommendations.map(r => [r.priority, r.who, r.what, r.when, r.kpi]);
    } else if (narrative?.action_items) {
      rows = narrative.action_items;
    } else {
      rows = [
        ['立即', '行銷部', 'Q4 聯名快閃', 'Q3 籌備', '到店+20%'],
        ['中期', '數位部', '社群導流內容', 'Q2', 'CTR>3%'],
      ];
    }
    page.elements = [
      { type: 'table', x: 0.2, y: 1.15, w: 9.6, h: 2.5,
        headers: ['優先級', 'WHO', 'WHAT', 'WHEN', 'KPI'],
        rows, headerBg: 'secondary' },
    ];
    page.speakerNotes = '【行動建議】\n每個建議都有明確的負責人、內容、時程和 KPI。';
  },

  // ── Combined pages for mini-3 ─────────────────────

  overview(page, data, brand, narrative) {
    pageBuilders.kpi(page, data, brand, narrative);
    page.speakerNotes = '【品牌總覽】\nKPI 數據一覽。';
  },

  actions_closing(page, data, brand, narrative) {
    pageBuilders.actions(page, data, brand, narrative);
    page.elements.push({
      type: 'text', x: 0.5, y: 4.5, w: 9, h: 0.8,
      content: '感謝您的時間 — 期待進一步合作討論',
      fontSize: 14, bold: true, color: 'primary', align: 'CENTER',
    });
    page.speakerNotes = '【行動建議 & 結語】\n具體建議如上，感謝各位。';
  },
};

// ══════════════════════════════════════════════════════
// Renderer Dispatch
// ══════════════════════════════════════════════════════

async function renderOutput(pages, config, format, runPath) {
  const rendererPath = path.join(__dirname, 'renderers', `${format}.js`);
  if (!fs.existsSync(rendererPath)) {
    throw new Error(`Renderer 不存在：${format}.js\n支援格式：gslides, pptx, gdocs`);
  }

  const renderer = require(rendererPath);
  const outputConfig = {
    format,
    runPath,
    outputDir: path.join(runPath, 'output'),
    brandName: config.brand.name || config.brand.brand || 'Brand',
  };

  // Ensure output dir exists
  if (!fs.existsSync(outputConfig.outputDir)) {
    fs.mkdirSync(outputConfig.outputDir, { recursive: true });
  }

  console.log(`🎨 使用 ${format} renderer...`);
  const result = await renderer.render(pages, config.brand, config.theme, outputConfig);

  // Write output metadata
  writeJSON(path.join(runPath, 'output-meta.json'), {
    format,
    generated_at: new Date().toISOString(),
    ...result,
  });

  return result;
}

// ══════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════

async function main() {
  console.log('🚀 Presentation Engine 啟動\n');

  const args = parseArgs();
  console.log(`📁 Run: ${args.run}`);
  console.log(`📊 Format: ${args.format}`);
  console.log(`📐 Schema: ${args.schema}\n`);

  // Load all config
  const config = loadConfig(args.run, args.schema);
  console.log(`✅ 品牌：${config.brand.name || config.brand.brand}`);
  console.log(`✅ Schema：${config.schema.name}（${config.schema.pages.length} 頁）`);
  console.log(`✅ 資料來源：${config.data ? '有 data.json' : '無 data.json'}`);
  console.log(`✅ Script：${config.script ? '有 script.json' : '自動組裝'}\n`);

  // Assemble pages
  const pages = assemblePages(config);
  console.log(`📄 組裝完成：${pages.length} 頁\n`);

  // Render
  const result = await renderOutput(pages, config, args.format, args.run);

  console.log('\n✅ 產出完成！');
  if (result.url) console.log(`🔗 ${result.url}`);
  if (result.file) console.log(`📄 ${result.file}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
