/**
 * gdocs.js — Google Docs renderer (Deep Analysis Report)
 *
 * Three-pass approach:
 *   Pass 1: Insert ALL text (with table placeholders <<TABLE_N>>)
 *   Pass 2: Style all ranges (headings, bold, colors, italic, etc.)
 *   Pass 3: Replace each placeholder with a real Google Docs table
 *           (one batchUpdate per table to avoid index conflicts)
 *
 * Priority: reads narrative.json from run folder for rich report.
 * Fallback: simple page dump from engine intermediate format.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const {
  getGoogleAuth, hexToRgb, resolveColor, readJSON,
  formatNumber, formatPct,
  findOrCreateDriveFolder, moveFileToFolder, generateSequentialTitle,
} = require('../helpers');

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

const HR_THIN = '────────────────────────────────────────────────────────────';
const HR_THICK = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

// ── Line collector helpers ──────────────────────────

// Strip emoji/pictographic characters from text
function stripEmoji(str) {
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function L(text, opts = {}) {
  return { text: stripEmoji(text) + '\n', ...opts };
}

function heading1(text) { return L(text, { style: 'HEADING_1' }); }
function heading2(text) { return L(text, { style: 'HEADING_2', italic: true, color: '666666' }); }
function heading3(text) { return L(text, { style: 'HEADING_3' }); }
function body(text) { return L(text, { fontSize: 11 }); }
function small(text) { return L(text, { fontSize: 9, color: '888888' }); }
function blank() { return { text: '\n' }; }
function hrThin() { return L(HR_THIN, { color: 'CCCCCC', fontSize: 8 }); }
function hrThick() { return L(HR_THICK, { color: 'BFA06A', fontSize: 8 }); }
function boldLine(text) { return L(text, { bold: true }); }
function label(prefix, text) { return L(`${prefix}　${text}`, { bold: true, fontSize: 11 }); }
function labelBody(text) { return L(text, { fontSize: 10, color: '444444' }); }
function caption(text) { return L(text, { italic: true, fontSize: 9, color: '666666' }); }
function pageBreak() { return { text: '\n', isPageBreak: true }; }

// ── Build narrative lines + collect tables ───────────

function buildNarrativeLines(narrative, brand) {
  const lines = [];
  const tables = []; // { placeholder, label, headers, rows }
  let tableCounter = 0;

  const brandName = (brand && brand.name) || narrative.title?.split(' ')[0] || 'Brand';
  const primaryColor = resolveColor('primary', brand);
  const accentColor = (brand && brand.colors?.accent) || 'D4B483';
  const today = new Date().toISOString().substring(0, 10);
  const period = narrative.meta?.generated_at
    ? narrative.meta.generated_at.substring(0, 10)
    : today;

  // Helper: add a table placeholder
  function addTable(label, headers, rows) {
    tableCounter++;
    const placeholder = `<<TABLE_${tableCounter}>>`;
    const tableLabel = `表 ${tableCounter}　${label}`;
    tables.push({ placeholder, label: tableLabel, headers, rows });
    lines.push(L(placeholder));
    lines.push(caption(tableLabel));
    lines.push(blank());
  }

  // Helper: callout block — unified style with accent bar
  function calloutBlock(labelText, text, accentColor) {
    lines.push(L(`▎ ${labelText}`, { bold: true, fontSize: 11, color: accentColor }));
    lines.push(L(text, { fontSize: 10, italic: true, color: '555555' }));
    lines.push(blank());
  }

  // Helper: analysis note
  function analysisNote(prefix, text) {
    lines.push(L(`${prefix}：${text}`, { fontSize: 10, color: '555555' }));
    lines.push(blank());
  }

  // ══════════════════════════════════════════════════════
  // 封面頁
  // ══════════════════════════════════════════════════════
  lines.push(blank());
  lines.push(blank());
  lines.push(blank());
  lines.push(blank());
  lines.push(blank());
  lines.push(blank());
  lines.push(hrThick());
  lines.push(blank());
  lines.push(L(brandName, { fontSize: 36, bold: true, color: primaryColor }));
  lines.push(blank());
  lines.push(L('品牌社群深度分析報告', { fontSize: 22, color: '333333' }));
  lines.push(L('Brand Social Media Deep Analysis Report', { fontSize: 12, italic: true, color: '999999' }));
  lines.push(blank());
  lines.push(hrThick());
  lines.push(blank());
  lines.push(blank());
  lines.push(blank());
  lines.push(L(`分析期間　　${period}`, { fontSize: 11, color: '555555' }));
  lines.push(L(`產出日期　　${today}`, { fontSize: 11, color: '555555' }));
  lines.push(L(`報告版本　　v1.0`, { fontSize: 11, color: '555555' }));
  lines.push(blank());
  lines.push(blank());
  lines.push(hrThin());
  lines.push(small('CONFIDENTIAL — 本報告僅供內部使用，未經授權不得轉載或散布'));
  lines.push(blank());
  lines.push(L('FonTrends × Journey101', { fontSize: 10, color: accentColor, bold: true }));
  lines.push(pageBreak());

  // ══════════════════════════════════════════════════════
  // 目錄頁
  // ══════════════════════════════════════════════════════
  let chapterNum = 0;

  // Pre-compute chapter list for TOC
  const tocEntries = [];
  tocEntries.push({ num: 1, title: '執行摘要' });
  if (narrative.chapters) {
    for (let i = 0; i < narrative.chapters.length; i++) {
      tocEntries.push({ num: i + 2, title: narrative.chapters[i].title });
    }
  }
  let nextNum = tocEntries.length + 1;
  // Self-comparison & competitor chapters (if data exists)
  {
    const hasSelf = (narrative.chapters || []).some(ch => ch.self_comparison);
    const hasComp = (narrative.chapters || []).some(ch => ch.competitor_comparison);
    if (hasSelf) tocEntries.push({ num: nextNum++, title: '自比分析：趨勢與成長追蹤' });
    if (hasComp) tocEntries.push({ num: nextNum++, title: '競品分析：市場競爭態勢' });
  }
  if (narrative.market_analysis?.swot) {
    tocEntries.push({ num: nextNum++, title: 'SWOT 分析與市場定位' });
  }
  if (narrative.recommendations?.length > 0) {
    tocEntries.push({ num: nextNum++, title: '策略建議與行動方案' });
  }
  tocEntries.push({ num: null, title: '附錄 A：研究方法' });
  tocEntries.push({ num: null, title: '附錄 B：數據品質說明' });
  tocEntries.push({ num: null, title: '免責聲明' });

  lines.push(heading1('目　錄'));
  lines.push(hrThick());
  lines.push(blank());
  for (const entry of tocEntries) {
    const prefix = entry.num ? `第 ${entry.num} 章` : '　　　';
    lines.push(L(`${prefix}　　${entry.title}`, { fontSize: 11 }));
  }
  lines.push(blank());

  // Table directory placeholder (will be injected later)
  const tableDirectoryIndex = lines.length;

  lines.push(pageBreak());

  // ══════════════════════════════════════════════════════
  // 第 1 章：執行摘要
  // ══════════════════════════════════════════════════════
  chapterNum++;
  lines.push(heading1(`第 ${chapterNum} 章　執行摘要`));
  lines.push(hrThick());
  lines.push(blank());
  if (narrative.executive_summary) {
    const paras = narrative.executive_summary.split('\n\n');
    for (const p of paras) {
      lines.push(body(p.replace(/\n/g, ' ')));
      lines.push(blank());
    }
  }
  lines.push(blank());

  // ══════════════════════════════════════════════════════
  // 各章節
  // ══════════════════════════════════════════════════════
  if (narrative.chapters) {
    for (const ch of narrative.chapters) {
      chapterNum++;
      lines.push(pageBreak());
      lines.push(heading1(`第 ${chapterNum} 章　${ch.title}`));
      if (ch.subtitle) {
        lines.push(heading2(ch.subtitle));
      }
      lines.push(hrThick());
      lines.push(blank());

      // Paragraphs
      if (ch.paragraphs) {
        for (const p of ch.paragraphs) {
          lines.push(body(p));
          lines.push(blank());
        }
      }

      // Data table
      if (ch.data_table && ch.data_table.headers && ch.data_table.rows) {
        addTable(ch.title, ch.data_table.headers, ch.data_table.rows);
      }

      // Source references (截圖 + 來源連結)
      if (ch.sources && ch.sources.length > 0) {
        lines.push(heading3('資料來源'));
        for (const src of ch.sources) {
          if (src.thumbnail_url) {
            lines.push({ text: '\n', isImage: true, imageUrl: src.thumbnail_url, width: 300, height: 200 });
          }
          const srcLine = src.url
            ? `${src.name || '來源'} (${src.platform || ''})`
            : `${src.name || '來源'} (${src.platform || ''})`;
          lines.push(L(srcLine, { fontSize: 9, color: '2E5090', isLink: true, linkUrl: src.url || null }));
        }
        lines.push(blank());
      }

      // Findings (重大發現 + 策略思考) — dark accent
      if (ch.insight) {
        calloutBlock('重大發現', ch.insight, '2E5090');
      }
      if (ch.so_what) {
        calloutBlock('策略思考', ch.so_what, '2E5090');
      }
      // Action (行動建議) — gold accent, distinct from findings
      if (ch.action_link) {
        calloutBlock('行動建議', ch.action_link, 'BFA06A');
      }

      lines.push(blank());
    }
  }

  // ══════════════════════════════════════════════════════
  // 獨立章：自比分析（收集各維度的 self_comparison）
  // ══════════════════════════════════════════════════════
  {
    const selfItems = (narrative.chapters || [])
      .filter(ch => ch.self_comparison)
      .map(ch => ({ title: ch.title, text: ch.self_comparison }));
    if (selfItems.length > 0) {
      chapterNum++;
      lines.push(pageBreak());
      lines.push(heading1(`第 ${chapterNum} 章　自比分析：趨勢與成長追蹤`));
      lines.push(hrThick());
      lines.push(blank());
      lines.push(body('以下彙整各維度的月環比（MoM）、季環比（QoQ）及年同比（YoY）變化，呈現品牌在不同面向的成長軌跡與潛在風險。'));
      lines.push(blank());
      for (const item of selfItems) {
        lines.push(heading2(item.title));
        analysisNote('趨勢觀察', item.text);
      }
      lines.push(blank());
    }
  }

  // ══════════════════════════════════════════════════════
  // 獨立章：競品分析（收集各維度的 competitor_comparison）
  // ══════════════════════════════════════════════════════
  {
    const compItems = (narrative.chapters || [])
      .filter(ch => ch.competitor_comparison)
      .map(ch => ({ title: ch.title, text: ch.competitor_comparison }));
    if (compItems.length > 0) {
      chapterNum++;
      lines.push(pageBreak());
      lines.push(heading1(`第 ${chapterNum} 章　競品分析：市場競爭態勢`));
      lines.push(hrThick());
      lines.push(blank());
      lines.push(body('以下彙整各維度的競爭對比分析，涵蓋主要競品深度比較與市場排名概況。'));
      lines.push(blank());
      for (const item of compItems) {
        lines.push(heading2(item.title));
        analysisNote('競爭態勢', item.text);
      }
      lines.push(blank());
    }
  }

  // ══════════════════════════════════════════════════════
  // SWOT
  // ══════════════════════════════════════════════════════
  const swot = narrative.market_analysis?.swot;
  if (swot) {
    chapterNum++;
    lines.push(pageBreak());
    lines.push(heading1(`第 ${chapterNum} 章　SWOT 分析與市場定位`));
    lines.push(hrThick());
    lines.push(blank());

    const swotRows = [];
    const maxLen = Math.max(
      swot.strengths?.length || 0, swot.weaknesses?.length || 0,
      swot.opportunities?.length || 0, swot.threats?.length || 0
    );
    for (let i = 0; i < maxLen; i++) {
      swotRows.push([
        (swot.strengths || [])[i] || '',
        (swot.weaknesses || [])[i] || '',
        (swot.opportunities || [])[i] || '',
        (swot.threats || [])[i] || '',
      ]);
    }
    addTable('SWOT 分析矩陣',
      ['Strengths 優勢', 'Weaknesses 劣勢', 'Opportunities 機會', 'Threats 威脅'],
      swotRows
    );

    if (narrative.market_analysis.positioning) {
      lines.push(heading3('市場定位評估'));
      lines.push(body(narrative.market_analysis.positioning));
      lines.push(blank());
    }
    if (narrative.market_analysis.market_share_estimate) {
      lines.push(heading3('社群聲量佔比推估'));
      lines.push(body(narrative.market_analysis.market_share_estimate));
      lines.push(blank());
    }
    lines.push(blank());
  }

  // ══════════════════════════════════════════════════════
  // 行動建議
  // ══════════════════════════════════════════════════════
  if (narrative.recommendations && narrative.recommendations.length > 0) {
    chapterNum++;
    lines.push(pageBreak());
    lines.push(heading1(`第 ${chapterNum} 章　策略建議與行動方案`));
    lines.push(hrThick());
    lines.push(blank());

    // Priority label mapping
    const priorityLabels = {
      immediate: '立即執行', medium_term: '中期規劃',
      opportunistic: '伺機而動', verify: '待驗證',
    };

    const recRows = narrative.recommendations.map(rec => [
      priorityLabels[rec.priority] || rec.priority,
      rec.who, rec.what, rec.when, rec.kpi,
    ]);
    addTable('策略建議總表',
      ['優先級', '負責單位', '執行項目', '時程', 'KPI'],
      recRows
    );

    // Rationale details
    let hasRationale = false;
    for (const rec of narrative.recommendations) {
      if (rec.rationale) { hasRationale = true; break; }
    }
    if (hasRationale) {
      lines.push(heading3('各項建議之決策依據'));
      lines.push(blank());
      for (let i = 0; i < narrative.recommendations.length; i++) {
        const rec = narrative.recommendations[i];
        if (rec.rationale) {
          lines.push(boldLine(`${i + 1}. ${rec.what}`));
          lines.push(labelBody(rec.rationale));
          lines.push(blank());
        }
      }
    }
    lines.push(blank());
  }

  // ══════════════════════════════════════════════════════
  // 附錄
  // ══════════════════════════════════════════════════════
  const appendix = narrative.appendix;

  lines.push(pageBreak());
  lines.push(heading1('附錄 A　研究方法'));
  lines.push(hrThin());
  lines.push(blank());
  if (appendix?.methodology) {
    for (const p of appendix.methodology.split('\n\n')) {
      lines.push(body(p.replace(/\n/g, ' ')));
      lines.push(blank());
    }
  } else {
    lines.push(body('（待補充）'));
    lines.push(blank());
  }

  lines.push(pageBreak());
  lines.push(heading1('附錄 B　數據品質說明'));
  lines.push(hrThin());
  lines.push(blank());
  if (appendix?.data_quality) {
    for (const p of appendix.data_quality.split('\n\n')) {
      lines.push(body(p.replace(/\n/g, ' ')));
      lines.push(blank());
    }
  } else {
    lines.push(body('（待補充）'));
    lines.push(blank());
  }

  lines.push(pageBreak());
  lines.push(heading1('免責聲明'));
  lines.push(hrThin());
  lines.push(blank());
  lines.push(body(appendix?.disclaimer || '本報告僅供內部參考使用，不構成任何投資或商業決策建議。資料來源為公開社群平台，數據擷取時間以報告標示之分析期間為準。'));
  lines.push(blank());

  // ── Inject table directory ──
  if (tables.length > 0) {
    const dirLines = [
      blank(),
      boldLine('表目錄'),
      hrThin(),
    ];
    for (const t of tables) {
      dirLines.push(L(t.label, { fontSize: 10 }));
    }
    dirLines.push(blank());
    lines.splice(tableDirectoryIndex, 0, ...dirLines);
  }

  return { lines, tables };
}

// ── Pass 2: Build style requests ────────────────────

function buildStyleRequests(lines) {
  const requests = [];
  let offset = 1;

  for (const line of lines) {
    const len = line.text.length;
    if (len === 0) continue;

    const start = offset;
    const end = offset + len;
    offset = end;

    if (len <= 1) continue;

    if (line.style === 'HEADING_1' || line.style === 'HEADING_2' || line.style === 'HEADING_3') {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          paragraphStyle: { namedStyleType: line.style },
          fields: 'namedStyleType',
        },
      });
    }
    if (line.bold) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
    }
    if (line.italic) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { italic: true },
          fields: 'italic',
        },
      });
    }
    if (line.color) {
      const rgb = hexToRgb(line.color);
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { foregroundColor: { color: { rgbColor: rgb } } },
          fields: 'foregroundColor',
        },
      });
    }
    if (line.fontSize) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: { fontSize: { magnitude: line.fontSize, unit: 'PT' } },
          fields: 'fontSize',
        },
      });
    }
    if (line.isLink && line.linkUrl) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: end - 1 },
          textStyle: {
            link: { url: line.linkUrl },
            underline: true,
          },
          fields: 'link,underline',
        },
      });
    }
  }

  return requests;
}

// ── Retry helper ─────────────────────────────────────

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = /ETIMEDOUT|ECONNRESET|UNAVAILABLE|DEADLINE_EXCEEDED|429|503/i.test(
        String(err.message || err)
      );
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`  ⚠ ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Find table element near a given index ────────────

function findTableNear(bodyContent, targetIndex) {
  for (const el of bodyContent) {
    if (el.table && el.startIndex >= targetIndex - 5) return el;
  }
  return null;
}

// ── Pass 3: Replace placeholders with real tables ───

async function insertRealTables(docs, documentId, tables) {
  if (tables.length === 0) return;

  // Process tables in REVERSE order (bottom-up) so earlier indices stay valid
  for (let t = tables.length - 1; t >= 0; t--) {
    const table = tables[t];
    const numRows = table.rows.length + 1; // +1 for header
    const numCols = table.headers.length;

    // Step 1: GET doc + find placeholder
    const { data: doc } = await withRetry(
      () => docs.documents.get({ documentId }),
      `GET for ${table.label}`
    );

    let placeholderStart = -1;
    let placeholderEnd = -1;
    for (const el of doc.body.content) {
      if (el.paragraph && el.paragraph.elements) {
        for (const run of el.paragraph.elements) {
          if (run.textRun && run.textRun.content.includes(table.placeholder)) {
            placeholderStart = run.startIndex;
            placeholderEnd = el.endIndex;
            break;
          }
        }
      }
      if (placeholderStart >= 0) break;
    }

    if (placeholderStart < 0) {
      console.warn(`  ⚠ Placeholder ${table.placeholder} not found, skipping`);
      continue;
    }

    // Step 2: Delete placeholder + insert empty table
    await withRetry(() => docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          { deleteContentRange: { range: { startIndex: placeholderStart, endIndex: placeholderEnd } } },
          { insertTable: { location: { index: placeholderStart }, rows: numRows, columns: numCols } },
        ],
      },
    }), `INSERT ${table.label}`);

    // Step 3: GET doc to find cell indices, then fill + style in ONE batch
    const { data: doc2 } = await withRetry(
      () => docs.documents.get({ documentId }),
      `GET cells for ${table.label}`
    );

    const tableElement = findTableNear(doc2.body.content, placeholderStart);
    if (!tableElement) {
      console.warn(`  ⚠ Could not find inserted table for ${table.label}`);
      continue;
    }

    // Build all requests: cell text + header style in one batch
    const allRequests = [];

    // Header bold + background (updateTableCellStyle doesn't shift indices)
    for (let c = 0; c < numCols; c++) {
      allRequests.push({
        updateTableCellStyle: {
          tableRange: {
            tableCellLocation: {
              tableStartLocation: { index: tableElement.startIndex },
              rowIndex: 0, columnIndex: c,
            },
            rowSpan: 1, columnSpan: 1,
          },
          tableCellStyle: {
            backgroundColor: { color: { rgbColor: hexToRgb('BFA06A') } },
          },
          fields: 'backgroundColor',
        },
      });
    }

    // Cell text insertions (collected forward, then reversed for index safety)
    const textInserts = [];

    for (let c = 0; c < numCols; c++) {
      const cell = tableElement.table.tableRows[0].tableCells[c];
      const idx = cell.content[0].startIndex;
      textInserts.push({ insertText: { location: { index: idx }, text: table.headers[c] || '' } });
    }
    for (let r = 0; r < table.rows.length; r++) {
      for (let c = 0; c < numCols; c++) {
        const cell = tableElement.table.tableRows[r + 1].tableCells[c];
        const idx = cell.content[0].startIndex;
        const cellText = String(table.rows[r][c] || '');
        if (cellText) {
          textInserts.push({ insertText: { location: { index: idx }, text: cellText } });
        }
      }
    }
    textInserts.reverse(); // bottom-up to preserve indices
    allRequests.push(...textInserts);

    // Step 4: Execute fill + style in ONE batch
    await withRetry(() => docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: allRequests },
    }), `FILL+STYLE ${table.label}`);

    // Header text styling deferred to Pass 5 (saves 2 API calls per table)

    console.log(`  ✅ ${table.label}`);

    // Rate limit: 60 writes/min → 1.5s between tables keeps us under limit
    if (t > 0) await new Promise(r => setTimeout(r, 1500));
  }
}

// ── Main render ─────────────────────────────────────

async function renderFromNarrative(narrative, brand, outputConfig) {
  const auth = await getGoogleAuth(SCOPES);
  const docs = google.docs({ version: 'v1', auth });

  const brandName = brand?.name || brand?.brand || 'Brand';
  const reportType = '品牌社群深度分析報告';

  // Create in Drive folder with sequential naming
  const folderId = await findOrCreateDriveFolder(auth);
  const title = await generateSequentialTitle(auth, folderId, brandName, reportType);

  const { data: doc } = await docs.documents.create({ requestBody: { title } });
  const documentId = doc.documentId;
  await moveFileToFolder(auth, documentId, folderId);
  console.log(`  Document ID: ${documentId} (${title})`);

  const { lines, tables } = buildNarrativeLines(narrative, brand);
  console.log(`  ${lines.length} lines, ${tables.length} tables`);

  // Progress tracker — saves state after each pass for resume capability
  const progressFile = outputConfig.outputDir
    ? path.join(outputConfig.outputDir, 'render-progress.json')
    : null;
  function saveProgress(pass, detail) {
    if (!progressFile) return;
    const progress = { documentId, pass, detail, totalPasses: 6, updatedAt: new Date().toISOString() };
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }

  // ── Pass 1: Insert text only (skip page break markers and image markers) ──
  const textLines = lines.filter(l => !l.isPageBreak);
  const fullText = textLines.map(l => l.text).join('');
  if (fullText.trim().length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: fullText } }],
      },
    });
  }
  console.log('  Pass 1: text inserted');
  saveProgress(1, 'text inserted');

  // ── Pass 2: Style (on text lines only) ──
  const styleRequests = buildStyleRequests(textLines);
  if (styleRequests.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < styleRequests.length; i += CHUNK) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: styleRequests.slice(i, i + CHUNK) },
      });
    }
    console.log(`  Pass 2: ${styleRequests.length} styles applied`);
    saveProgress(2, `${styleRequests.length} styles applied`);
  }

  // ── Pass 2.3: Insert inline images ──
  {
    // Collect image lines with their text offset positions
    let offset = 1;
    const imageInserts = [];
    for (const line of textLines) {
      if (line.isImage && line.imageUrl) {
        imageInserts.push({ index: offset, url: line.imageUrl, width: line.width || 300, height: line.height || 200 });
      }
      offset += line.text.length;
    }
    // Insert in reverse order to preserve indices
    for (let i = imageInserts.length - 1; i >= 0; i--) {
      const img = imageInserts[i];
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertInlineImage: {
                location: { index: img.index },
                uri: img.url,
                objectSize: {
                  width: { magnitude: img.width, unit: 'PT' },
                  height: { magnitude: img.height, unit: 'PT' },
                },
              },
            }],
          },
        });
      } catch (e) {
        console.warn(`  ⚠ Image insert failed at index ${img.index}: ${e.message}`);
      }
    }
    if (imageInserts.length > 0) {
      console.log(`  Pass 2.3: ${imageInserts.length} images inserted`);
    }
  }

  // ── Pass 2.5: Insert page breaks before chapter headings ──
  // Skip only if heading is at document start (index < 5)
  {
    const { data: docForPB } = await docs.documents.get({ documentId });
    const headingIndices = [];
    for (const el of docForPB.body.content) {
      if (el.paragraph && el.paragraph.paragraphStyle?.namedStyleType === 'HEADING_1') {
        if (el.startIndex < 5) continue; // Skip if at very start of document
        headingIndices.push(el.startIndex);
      }
    }
    // Insert in reverse order
    for (let i = headingIndices.length - 1; i >= 0; i--) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{ insertPageBreak: { location: { index: headingIndices[i] } } }],
          },
        });
      } catch (e) {
        // Some positions may fail (e.g., inside table), skip silently
      }
    }
    console.log(`  Pass 2.5: ${headingIndices.length} page breaks inserted`);
  }

  // ── Pass 3: Replace placeholders with real tables ──
  if (tables.length > 0) {
    console.log(`  Pass 3: inserting ${tables.length} tables...`);
    await insertRealTables(docs, documentId, tables);
  }

  // ── Pass 4: Header & Footer ──
  // Wait for rate limit window after Pass 3 (tables are heavy on API calls)
  await new Promise(r => setTimeout(r, 3000));
  {
    const brandName = brand?.name || brand?.brand || 'FonTrends';

    // Create header
    const { data: docForHF } = await docs.documents.get({ documentId });
    const headerFooterReqs = [];

    // Add header with brand name
    headerFooterReqs.push({
      createHeader: {
        type: 'DEFAULT',
        sectionBreakLocation: { index: 0 },
      },
    });
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: headerFooterReqs },
    });

    // Get the header ID and insert content
    const { data: docWithHeader } = await docs.documents.get({ documentId });
    const headerId = Object.keys(docWithHeader.headers || {})[0];
    if (headerId) {
      const headerContent = docWithHeader.headers[headerId];
      const headerIdx = headerContent.content?.[0]?.startIndex || 0;
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            { insertText: { location: { segmentId: headerId, index: headerIdx }, text: `${brandName}  |  品牌社群深度分析報告` } },
            {
              updateTextStyle: {
                range: { segmentId: headerId, startIndex: headerIdx, endIndex: headerIdx + `${brandName}  |  品牌社群深度分析報告`.length },
                textStyle: {
                  fontSize: { magnitude: 8, unit: 'PT' },
                  foregroundColor: { color: { rgbColor: hexToRgb('999999') } },
                },
                fields: 'fontSize,foregroundColor',
              },
            },
          ],
        },
      });
    }

    // Create footer with page number
    const footerReqs = [{
      createFooter: {
        type: 'DEFAULT',
        sectionBreakLocation: { index: 0 },
      },
    }];
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: footerReqs },
    });

    const { data: docWithFooter } = await docs.documents.get({ documentId });
    const footerId = Object.keys(docWithFooter.footers || {})[0];
    if (footerId) {
      const footerContent = docWithFooter.footers[footerId];
      const footerIdx = footerContent.content?.[0]?.startIndex || 0;
      const footerText = 'CONFIDENTIAL  |  FonTrends x Journey101';
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            { insertText: { location: { segmentId: footerId, index: footerIdx }, text: footerText } },
            {
              updateTextStyle: {
                range: { segmentId: footerId, startIndex: footerIdx, endIndex: footerIdx + footerText.length },
                textStyle: {
                  fontSize: { magnitude: 7, unit: 'PT' },
                  foregroundColor: { color: { rgbColor: hexToRgb('BBBBBB') } },
                },
                fields: 'fontSize,foregroundColor',
              },
            },
            {
              updateParagraphStyle: {
                range: { segmentId: footerId, startIndex: footerIdx, endIndex: footerIdx + footerText.length },
                paragraphStyle: { alignment: 'CENTER' },
                fields: 'alignment',
              },
            },
          ],
        },
      });
    }

    console.log('  Pass 4: header & footer added');
    saveProgress(4, 'header & footer added');
  }

  // ── Pass 5: Header text styling + alternate row shading (batched) ──
  // Combines two operations into one GET + batched updates to reduce API calls.
  // Header text styling was deferred from Pass 3 to save 2 API calls per table.
  {
    // Wait for rate limit window to reset after Pass 3+4
    await new Promise(r => setTimeout(r, 3000));

    const { data: docFinal } = await docs.documents.get({ documentId });
    const allStyleReqs = [];
    for (const el of docFinal.body.content) {
      if (!el.table) continue;
      const tableIdx = el.startIndex;
      const numRows = el.table.tableRows.length;
      const numCols = el.table.tableRows[0]?.tableCells?.length || 0;

      // Header text: bold, white, 10pt
      for (let c = 0; c < numCols; c++) {
        const cell = el.table.tableRows[0].tableCells[c];
        const cellStart = cell.content[0].startIndex;
        const cellEnd = cell.content[cell.content.length - 1].endIndex;
        if (cellEnd > cellStart) {
          allStyleReqs.push({
            updateTextStyle: {
              range: { startIndex: cellStart, endIndex: cellEnd - 1 },
              textStyle: {
                bold: true,
                fontSize: { magnitude: 10, unit: 'PT' },
                foregroundColor: { color: { rgbColor: hexToRgb('FFFFFF') } },
              },
              fields: 'bold,fontSize,foregroundColor',
            },
          });
        }
      }

      // Alternate row shading: even data rows (row 2, 4, 6...) light gray
      for (let r = 2; r < numRows; r += 2) {
        for (let c = 0; c < numCols; c++) {
          allStyleReqs.push({
            updateTableCellStyle: {
              tableRange: {
                tableCellLocation: {
                  tableStartLocation: { index: tableIdx },
                  rowIndex: r, columnIndex: c,
                },
                rowSpan: 1, columnSpan: 1,
              },
              tableCellStyle: {
                backgroundColor: { color: { rgbColor: { red: 0.96, green: 0.96, blue: 0.96 } } },
              },
              fields: 'backgroundColor',
            },
          });
        }
      }
    }
    if (allStyleReqs.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < allStyleReqs.length; i += CHUNK) {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: allStyleReqs.slice(i, i + CHUNK) },
        });
        // Brief pause between chunks
        if (i + CHUNK < allStyleReqs.length) await new Promise(r => setTimeout(r, 1000));
      }
      console.log(`  Pass 5: ${allStyleReqs.length} table styles applied (headers + row shading)`);
      saveProgress(5, `${allStyleReqs.length} table styles applied`);
    }
  }

  // ── Pass 6: Appendix — Insert Dashboard Screenshots ──
  const screenshotsDir = outputConfig?.runPath
    ? path.join(outputConfig.runPath, 'screenshots')
    : null;

  if (screenshotsDir && fs.existsSync(screenshotsDir)) {
    const screenshots = fs.readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort();

    if (screenshots.length > 0) {
      const drive = google.drive({ version: 'v3', auth });
      const docForAppendix = await docs.documents.get({ documentId });
      let endIdx = docForAppendix.data.body.content.slice(-1)[0]?.endIndex || 1;

      // Insert appendix header text
      const appendixHeader = '\n\n附錄：參考資訊\n以下為 Dashboard 原始畫面截圖，供數據佐證參考。\n\n';
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: [{ insertText: { location: { index: endIdx - 1 }, text: appendixHeader } }] },
      });

      // Style the header
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{
            updateParagraphStyle: {
              range: { startIndex: endIdx + 1, endIndex: endIdx + 1 + '附錄：參考資訊'.length + 1 },
              paragraphStyle: { namedStyleType: 'HEADING_1' },
              fields: 'namedStyleType',
            },
          }],
        },
      });

      let insertedCount = 0;
      for (const filename of screenshots) {
        const filePath = path.join(screenshotsDir, filename);
        const pageName = filename.replace(/^dashboard-/, '').replace(/\.(png|jpg|jpeg)$/i, '').replace(/_/g, ' ');

        try {
          // Upload to Drive
          const uploadRes = await drive.files.create({
            requestBody: { name: filename, mimeType: `image/${filename.endsWith('.png') ? 'png' : 'jpeg'}` },
            media: { mimeType: `image/${filename.endsWith('.png') ? 'png' : 'jpeg'}`, body: fs.createReadStream(filePath) },
            fields: 'id',
          });
          await drive.permissions.create({ fileId: uploadRes.data.id, requestBody: { role: 'reader', type: 'anyone' } });
          const imageUrl = `https://drive.google.com/uc?id=${uploadRes.data.id}`;

          // Get current end
          const docNow = await docs.documents.get({ documentId });
          const curEnd = docNow.data.body.content.slice(-1)[0]?.endIndex || 1;

          // Insert label
          await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests: [{ insertText: { location: { index: curEnd - 1 }, text: `\n${pageName}\n` } }] },
          });

          // Insert image
          const docAfter = await docs.documents.get({ documentId });
          const endAfter = docAfter.data.body.content.slice(-1)[0]?.endIndex || 1;
          await docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                insertInlineImage: {
                  location: { index: endAfter - 1 },
                  uri: imageUrl,
                  objectSize: { width: { magnitude: 468, unit: 'PT' }, height: { magnitude: 263, unit: 'PT' } },
                },
              }],
            },
          });

          insertedCount++;
          console.log(`  ✅ 附錄截圖: ${pageName}`);
          await new Promise(r => setTimeout(r, 1500));
        } catch (imgErr) {
          console.log(`  ⚠️ 截圖插入失敗 (${pageName}): ${imgErr.message}`);
        }
      }
      console.log(`  Pass 6: ${insertedCount} appendix screenshots inserted`);
      saveProgress(6, `${insertedCount} appendix screenshots inserted`);
    }
  }

  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`📄 Google Docs created: ${url}`);
  return { url, documentId };
}

// ── Fallback render from pages ──────────────────────

async function renderFromPages(pages, brand, outputConfig) {
  const auth = await getGoogleAuth(SCOPES);
  const docs = google.docs({ version: 'v1', auth });
  const brandName = brand?.name || brand?.brand || 'Brand';
  const reportType = '品牌社群分析報告';
  const folderId = await findOrCreateDriveFolder(auth);
  const title = await generateSequentialTitle(auth, folderId, brandName, reportType);
  const { data: doc } = await docs.documents.create({ requestBody: { title } });
  const documentId = doc.documentId;
  await moveFileToFolder(auth, documentId, folderId);

  // Simple text dump for fallback
  const lines = [];
  for (const page of pages) {
    lines.push(heading1(page.title || 'Untitled'));
    if (!page.elements) { lines.push(blank()); continue; }
    for (const el of page.elements) {
      const content = el.content || el.text || '';
      if (content) lines.push(body(content));
    }
    lines.push(blank());
  }

  const fullText = lines.map(l => l.text).join('');
  if (fullText.trim().length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: fullText } }] },
    });
  }
  const styleRequests = buildStyleRequests(lines);
  if (styleRequests.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < styleRequests.length; i += CHUNK) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests: styleRequests.slice(i, i + CHUNK) },
      });
    }
  }

  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  console.log(`📄 Google Docs created: ${url}`);
  return { url, documentId };
}

// ── Entry point ─────────────────────────────────────

async function render(pages, brand, theme, outputConfig) {
  const narrativePath = outputConfig?.runPath
    ? path.join(outputConfig.runPath, 'narrative.json')
    : null;
  const narrative = narrativePath ? readJSON(narrativePath) : null;

  if (narrative) {
    console.log('📖 Using narrative.json for deep analysis report');
    return renderFromNarrative(narrative, brand, outputConfig);
  }

  console.log('📄 No narrative.json found, falling back to page dump');
  return renderFromPages(pages, brand, outputConfig);
}

module.exports = { render };
