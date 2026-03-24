/**
 * gslides.js — Google Slides Renderer
 *
 * Translates the intermediate page format (from engine.js) into
 * Google Slides API batchUpdate requests.
 *
 * Usage (called by engine.js):
 *   const { render } = require('./renderers/gslides');
 *   const result = await render(pages, brand, theme, outputConfig);
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const {
  getGoogleAuth,
  hexToRgb,
  rgbColor,
  solidFill,
  inches,
  pt,
  uid,
  resetIdCounter,
  resolveColor,
  readJSON,
  findOrCreateDriveFolder,
  moveFileToFolder,
  generateSequentialTitle,
} = require('../helpers');

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file',
];

const BATCH_SIZE = 500;

// ══════════════════════════════════════════════════════
// Low-level request builders
// ══════════════════════════════════════════════════════

function setPageBackground(slideId, hex) {
  return {
    updatePageProperties: {
      objectId: slideId,
      pageProperties: { pageBackgroundFill: solidFill(hex) },
      fields: 'pageBackgroundFill',
    },
  };
}

function createTextBox(slideId, id, x, y, w, h) {
  return {
    createShape: {
      objectId: id,
      shapeType: 'TEXT_BOX',
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: { magnitude: inches(w), unit: 'EMU' },
          height: { magnitude: inches(h), unit: 'EMU' },
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(x), translateY: inches(y),
          unit: 'EMU',
        },
      },
    },
  };
}

function insertText(objectId, text, idx = 0) {
  return { insertText: { objectId, text, insertionIndex: idx } };
}

function styleAllText(objectId, opts) {
  const style = {};
  const fields = [];

  if (opts.fontFamily) { style.fontFamily = opts.fontFamily; fields.push('fontFamily'); }
  if (opts.fontSize) { style.fontSize = pt(opts.fontSize); fields.push('fontSize'); }
  if (opts.bold !== undefined) { style.bold = opts.bold; fields.push('bold'); }
  if (opts.italic !== undefined) { style.italic = opts.italic; fields.push('italic'); }
  if (opts.color) {
    style.foregroundColor = { opaqueColor: rgbColor(opts.color) };
    fields.push('foregroundColor');
  }

  return {
    updateTextStyle: {
      objectId,
      style,
      textRange: { type: 'ALL' },
      fields: fields.join(','),
    },
  };
}

function alignParagraph(objectId, alignment) {
  return {
    updateParagraphStyle: {
      objectId,
      style: { alignment },
      textRange: { type: 'ALL' },
      fields: 'alignment',
    },
  };
}

// ══════════════════════════════════════════════════════
// Composite helpers
// ══════════════════════════════════════════════════════

function addStyledText(slideId, text, opts, brand) {
  const id = uid(opts.prefix || 'txt');
  const colorHex = resolveColor(opts.color, brand);
  const reqs = [
    createTextBox(slideId, id, opts.x, opts.y, opts.w, opts.h),
    insertText(id, text),
    styleAllText(id, {
      fontFamily: opts.fontFamily || 'Noto Sans TC',
      fontSize: opts.fontSize || 14,
      bold: opts.bold || false,
      italic: opts.italic || false,
      color: colorHex,
    }),
  ];
  if (opts.align) reqs.push(alignParagraph(id, opts.align));
  return reqs;
}

function addRect(slideId, x, y, w, h, fillHex) {
  const id = uid('rect');
  const reqs = [{
    createShape: {
      objectId: id,
      shapeType: 'RECTANGLE',
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: { magnitude: inches(w), unit: 'EMU' },
          height: { magnitude: inches(h), unit: 'EMU' },
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(x), translateY: inches(y),
          unit: 'EMU',
        },
      },
    },
  }];

  const shapeProps = {};
  const shapeFields = [];

  if (fillHex) {
    shapeProps.shapeBackgroundFill = solidFill(fillHex);
    shapeFields.push('shapeBackgroundFill');
  }
  // Outline weight must be >= 0.01 (not 0)
  shapeProps.outline = {
    outlineFill: solidFill(fillHex || 'FFFFFF'),
    weight: { magnitude: 0.01, unit: 'PT' },
  };
  shapeFields.push('outline');

  reqs.push({
    updateShapeProperties: {
      objectId: id,
      shapeProperties: shapeProps,
      fields: shapeFields.join(','),
    },
  });

  return reqs;
}

function addHeader(slideId, prefix, title, brand) {
  const textOnLight = resolveColor('text_on_light', brand);
  const primary = resolveColor('primary', brand);
  return [
    ...addStyledText(slideId, title, {
      prefix: `${prefix}_title`, x: 0.5, y: 0.3, w: 9, h: 0.6,
      fontSize: 24, bold: true, color: 'text_on_light',
    }, brand),
    ...addRect(slideId, 0.5, 0.95, 2, 0.04, primary),
  ];
}

function addTable(slideId, prefix, x, y, w, h, headers, rows, headerBgKey, brand) {
  const data = [headers, ...rows];
  const numRows = data.length;
  const numCols = headers.length;
  const tableId = uid(`${prefix}_tbl`);

  const reqs = [{
    createTable: {
      objectId: tableId,
      elementProperties: {
        pageObjectId: slideId,
        size: {
          width: { magnitude: inches(w), unit: 'EMU' },
          height: { magnitude: inches(h), unit: 'EMU' },
        },
        transform: {
          scaleX: 1, scaleY: 1,
          translateX: inches(x), translateY: inches(y),
          unit: 'EMU',
        },
      },
      rows: numRows,
      columns: numCols,
    },
  }];

  // Fill cells with text
  data.forEach((row, ri) => {
    row.forEach((cellText, ci) => {
      reqs.push({
        insertText: {
          objectId: tableId,
          cellLocation: { rowIndex: ri, columnIndex: ci },
          text: String(cellText || ''),
          insertionIndex: 0,
        },
      });
    });
  });

  // Style header row: background + white bold text
  if (headerBgKey) {
    const headerBgHex = resolveColor(headerBgKey, brand);
    for (let ci = 0; ci < numCols; ci++) {
      reqs.push({
        updateTableCellProperties: {
          objectId: tableId,
          tableRange: {
            location: { rowIndex: 0, columnIndex: ci },
            rowSpan: 1, columnSpan: 1,
          },
          tableCellProperties: {
            tableCellBackgroundFill: solidFill(headerBgHex),
          },
          fields: 'tableCellBackgroundFill',
        },
      });
      // Header text must explicitly be white + bold
      reqs.push({
        updateTextStyle: {
          objectId: tableId,
          cellLocation: { rowIndex: 0, columnIndex: ci },
          style: {
            foregroundColor: { opaqueColor: rgbColor('FFFFFF') },
            bold: true,
            fontSize: pt(9),
          },
          textRange: { type: 'ALL' },
          fields: 'foregroundColor,bold,fontSize',
        },
      });
    }
  }

  return reqs;
}

// ══════════════════════════════════════════════════════
// Element Renderers
// ══════════════════════════════════════════════════════

function renderTextElement(slideId, el, brand, theme, pagePrefix) {
  return addStyledText(slideId, el.content || '', {
    prefix: `${pagePrefix}_txt`,
    x: el.x, y: el.y, w: el.w, h: el.h,
    fontSize: el.fontSize || 14,
    bold: el.bold || false,
    italic: el.italic || false,
    color: el.color || 'text_on_light',
    align: el.align || null,
    fontFamily: el.fontFamily || 'Noto Sans TC',
  }, brand);
}

function renderTableElement(slideId, el, brand, theme, pagePrefix) {
  return addTable(
    slideId, pagePrefix,
    el.x, el.y, el.w, el.h,
    el.headers, el.rows,
    el.headerBg, brand
  );
}

function renderKpiCardElement(slideId, el, brand, theme) {
  // KPI cards layout: 2 rows x 3 cols
  const cfg = (theme && theme.kpi_card) || {};
  const cardW = cfg.cardW || 2.8;
  const cardH = cfg.cardH || 1.4;
  const gapX = cfg.gapX || 0.3;
  const gapY = cfg.gapY || 0.25;
  const startX = cfg.startX || 0.5;
  const startY = cfg.startY || 1.2;

  const i = el.index;
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = startX + col * (cardW + gapX);
  const y = startY + row * (cardH + gapY);

  const accentHex = resolveColor(el.accentColor || 'primary', brand);
  const whiteHex = resolveColor('white', brand);
  const grayHex = resolveColor('gray', brand);

  return [
    // Card white background
    ...addRect(slideId, x, y, cardW, cardH, whiteHex),
    // Left accent bar
    ...addRect(slideId, x, y, 0.06, cardH, accentHex),
    // Large value text
    ...addStyledText(slideId, el.value || '', {
      prefix: `kpi_val${i}`, x: x + 0.2, y: y + 0.15, w: cardW - 0.4, h: 0.7,
      fontSize: 22, bold: true, color: el.accentColor || 'primary',
    }, brand),
    // Small label text
    ...addStyledText(slideId, el.label || '', {
      prefix: `kpi_lbl${i}`, x: x + 0.2, y: y + 0.85, w: cardW - 0.4, h: 0.35,
      fontSize: 11, color: 'gray',
    }, brand),
  ];
}

function renderBarChartElement(slideId, el, brand, theme) {
  const bars = el.bars || [];
  const barMaxW = 3.2;
  const barH = 0.28;
  const startY = el.y || 1.45;
  const labelX = el.x || 0.5;
  const barX = labelX + 1.2;
  const valX = barX + barMaxW + 0.2;

  const reqs = [];
  bars.forEach((bar, i) => {
    const y = startY + i * 0.40;
    const colorHex = resolveColor(bar.color || 'primary', brand);
    const secondaryHex = resolveColor('secondary', brand);

    // Label
    reqs.push(...addStyledText(slideId, bar.label || '', {
      prefix: `bar_lbl${i}`, x: labelX, y, w: 1.0, h: barH,
      fontSize: 10, bold: true, color: 'secondary',
    }, brand));

    // Colored rectangle (bar)
    const barW = barMaxW * (Math.min(bar.pct || 0, 100) / 100);
    if (barW > 0) {
      reqs.push(...addRect(slideId, barX, y + 0.03, barW, barH - 0.06, colorHex));
    }

    // Percentage text
    reqs.push(...addStyledText(slideId, `${bar.pct || 0}%`, {
      prefix: `bar_val${i}`, x: valX, y, w: 0.7, h: barH,
      fontSize: 10, bold: true, color: bar.color || 'primary',
    }, brand));
  });

  return reqs;
}

function renderRectElement(slideId, el, brand) {
  const fillHex = resolveColor(el.fill || el.color || 'primary', brand);
  return addRect(slideId, el.x, el.y, el.w, el.h, fillHex);
}

// ══════════════════════════════════════════════════════
// Page Renderer
// ══════════════════════════════════════════════════════

function renderPage(slideId, page, brand, theme) {
  const reqs = [];
  const bgKey = page.background || 'light';
  const pagePrefix = page.pageId || `p${page.pageIndex}`;

  // 1. Set page background
  if (bgKey === 'dark') {
    const darkBg = resolveColor('dark_bg', brand);
    reqs.push(setPageBackground(slideId, darkBg));
  } else {
    const lightBg = resolveColor('light_bg', brand);
    reqs.push(setPageBackground(slideId, lightBg));
  }

  // 2. Add header for light-background pages (skip cover/closing)
  if (bgKey !== 'dark' && page.title) {
    reqs.push(...addHeader(slideId, pagePrefix, page.title, brand));
  }

  // 3. Render each element
  (page.elements || []).forEach((el) => {
    switch (el.type) {
      case 'text':
        reqs.push(...renderTextElement(slideId, el, brand, theme, pagePrefix));
        break;
      case 'table':
        reqs.push(...renderTableElement(slideId, el, brand, theme, pagePrefix));
        break;
      case 'kpi_card':
        reqs.push(...renderKpiCardElement(slideId, el, brand, theme));
        break;
      case 'bar_chart':
        reqs.push(...renderBarChartElement(slideId, el, brand, theme));
        break;
      case 'rect':
        reqs.push(...renderRectElement(slideId, el, brand));
        break;
      default:
        console.warn(`  Unknown element type: ${el.type}, skipping`);
    }
  });

  return reqs;
}

// ══════════════════════════════════════════════════════
// Speaker Notes
// ══════════════════════════════════════════════════════

async function addSpeakerNotes(slidesApi, presentationId, pages) {
  const fullPres = await slidesApi.presentations.get({ presentationId });
  const notesReqs = [];

  fullPres.data.slides.forEach((slide, i) => {
    if (i < pages.length && pages[i].speakerNotes) {
      const notesId = slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
      if (notesId) {
        notesReqs.push({
          insertText: {
            objectId: notesId,
            text: pages[i].speakerNotes,
            insertionIndex: 0,
          },
        });
      }
    }
  });

  if (notesReqs.length > 0) {
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: notesReqs },
    });
    console.log(`  ${notesReqs.length} speaker notes written`);
  }
}

// ══════════════════════════════════════════════════════
// Batch Execution
// ══════════════════════════════════════════════════════

async function executeBatch(slidesApi, presentationId, allRequests, progressFile) {
  const totalBatches = Math.ceil(allRequests.length / BATCH_SIZE);
  for (let i = 0; i < allRequests.length; i += BATCH_SIZE) {
    const batch = allRequests.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} requests`);
    try {
      await slidesApi.presentations.batchUpdate({
        presentationId,
        requestBody: { requests: batch },
      });
      // Save progress after each successful batch
      if (progressFile) {
        const progress = { presentationId, completedRequests: i + batch.length, totalRequests: allRequests.length, batchNum, totalBatches, updatedAt: new Date().toISOString() };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }
    } catch (err) {
      console.error(`  ❌ Batch ${batchNum} failed: ${err.message}`);
      if (progressFile) {
        const progress = { presentationId, completedRequests: i, totalRequests: allRequests.length, failedAtBatch: batchNum, error: err.message, updatedAt: new Date().toISOString() };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }
      throw err;
    }
  }
}

// ══════════════════════════════════════════════════════
// Narrative → Slides (chapter-by-chapter)
// ══════════════════════════════════════════════════════

/**
 * Build slide content requests for a single narrative chapter.
 * Layout: title (top) → table (middle, max 6 rows) → insight (bottom italic).
 * Speaker notes get the full so_what + action_link.
 */
function buildChapterSlide(slideId, chapter, brand) {
  const reqs = [];
  const lightBg = resolveColor('light_bg', brand);
  reqs.push(setPageBackground(slideId, lightBg));

  // Title
  reqs.push(...addHeader(slideId, slideId, chapter.title, brand));

  // Subtitle (if present)
  if (chapter.subtitle) {
    reqs.push(...addStyledText(slideId, chapter.subtitle, {
      prefix: `${slideId}_sub`, x: 0.5, y: 1.05, w: 9, h: 0.4,
      fontSize: 12, italic: true, color: 'gray',
    }, brand));
  }

  let contentY = chapter.subtitle ? 1.55 : 1.2;

  // Data table (max 6 data rows)
  if (chapter.data_table) {
    const headers = chapter.data_table.headers;
    const rows = chapter.data_table.rows.slice(0, 6);
    const rowCount = rows.length + 1; // +1 for header
    const tableH = Math.min(0.35 + rowCount * 0.32, 3.0);
    reqs.push(...addTable(slideId, slideId, 0.3, contentY, 9.4, tableH, headers, rows, 'primary', brand));
    contentY += tableH + 0.15;
  }

  // Paragraph text — one key point, max 100 chars
  if (!chapter.data_table && chapter.paragraphs?.length) {
    const para = chapter.paragraphs[0].slice(0, 100) + (chapter.paragraphs[0].length > 100 ? '…' : '');
    reqs.push(...addStyledText(slideId, para, {
      prefix: `${slideId}_para`, x: 0.5, y: contentY, w: 9, h: 1.2,
      fontSize: 12, color: 'text_on_light',
    }, brand));
    contentY += 1.3;
  }

  // Insight — italic at bottom
  if (chapter.insight) {
    const insightY = Math.max(contentY, 4.6);
    reqs.push(...addStyledText(slideId, chapter.insight, {
      prefix: `${slideId}_ins`, x: 0.5, y: insightY, w: 9, h: 0.5,
      fontSize: 10, italic: true, color: 'primary',
    }, brand));
  }

  return reqs;
}

/**
 * Build speaker notes text from a narrative chapter.
 */
function chapterSpeakerNotes(chapter) {
  const parts = [`【${chapter.title}】`];
  // Full paragraphs in notes for presenter reference
  if (chapter.paragraphs) {
    parts.push(chapter.paragraphs.join('\n'));
  }
  if (chapter.so_what) parts.push(`\n要點：${chapter.so_what}`);
  if (chapter.action_link) parts.push(`場域連結：${chapter.action_link}`);
  return parts.join('\n');
}

/**
 * Render a full presentation from narrative.json.
 * Produces: cover → executive summary → chapters → recommendations → closing.
 */
async function renderFromNarrative(narrative, brand, theme, outputConfig) {
  resetIdCounter();

  const brandName = narrative.meta?.brand || outputConfig.brandName || 'Brand';
  const period = narrative.meta?.period || '分析期間';
  const venue = narrative.meta?.venue || '';
  const chapters = narrative.chapters || [];

  // Count total slides: cover + summary + chapters + actions + closing
  const hasRecs = narrative.recommendations?.length > 0;
  const totalSlides = 1 + 1 + chapters.length + (hasRecs ? 1 : 0) + 1;
  console.log(`  Google Slides (narrative): generating ${totalSlides} slides for ${brandName}`);

  // ── 1. Auth + create presentation ──
  const auth = await getGoogleAuth(SCOPES);
  const slidesApi = google.slides({ version: 'v1', auth });

  const reportType = '品牌社群分析報告';
  const folderId = await findOrCreateDriveFolder(auth);
  const title = await generateSequentialTitle(auth, folderId, brandName, reportType);

  const pres = await slidesApi.presentations.create({
    requestBody: {
      title,
      pageSize: {
        width: { magnitude: inches(10), unit: 'EMU' },
        height: { magnitude: inches(5.625), unit: 'EMU' },
      },
    },
  });
  const presentationId = pres.data.presentationId;
  const defaultSlideId = pres.data.slides[0].objectId;
  await moveFileToFolder(auth, presentationId, folderId);
  console.log(`  Presentation ID: ${presentationId} (${title})`);

  // ── 2. Create all slides + delete default ──
  const slideIds = [];
  const createReqs = [];
  for (let i = 0; i < totalSlides; i++) {
    const sid = `slide_${i + 1}`;
    slideIds.push(sid);
    createReqs.push({ createSlide: { objectId: sid, insertionIndex: i } });
  }
  createReqs.push({ deleteObject: { objectId: defaultSlideId } });

  await slidesApi.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: createReqs },
  });
  console.log(`  ${totalSlides} slides created`);

  // ── 3. Build content requests ──
  const allRequests = [];
  const speakerNotesMap = []; // { slideIndex, text }
  let idx = 0;

  // ─── Cover ───
  const coverSid = slideIds[idx];
  const darkBg = resolveColor('dark_bg', brand);
  allRequests.push(setPageBackground(coverSid, darkBg));
  allRequests.push(...addStyledText(coverSid, brandName.toUpperCase(), {
    prefix: 'cov_brand', x: 0.5, y: 1.2, w: 9, h: 1,
    fontSize: 44, bold: true, color: 'primary', align: 'CENTER',
  }, brand));
  allRequests.push(...addStyledText(coverSid, narrative.title || '品牌社群聲量分析報告', {
    prefix: 'cov_title', x: 0.5, y: 2.1, w: 9, h: 0.6,
    fontSize: 20, color: 'white', align: 'CENTER',
  }, brand));
  allRequests.push(...addStyledText(coverSid, `分析期間：${period}`, {
    prefix: 'cov_period', x: 0.5, y: 2.7, w: 9, h: 0.5,
    fontSize: 14, color: 'lightGray', align: 'CENTER',
  }, brand));
  allRequests.push(...addStyledText(coverSid, 'Powered by FonTrends × Journey101', {
    prefix: 'cov_footer', x: 0.5, y: 4.7, w: 9, h: 0.5,
    fontSize: 12, color: 'midGray', align: 'CENTER',
  }, brand));
  speakerNotesMap.push({ slideIndex: idx, text: `【開場白】\n今天要分享的是 ${brandName} 在台灣社群媒體上的品牌聲量分析報告。\n分析期間：${period}。` });
  idx++;

  // ─── Executive Summary ───
  const sumSid = slideIds[idx];
  const lightBg = resolveColor('light_bg', brand);
  allRequests.push(setPageBackground(sumSid, lightBg));
  allRequests.push(...addHeader(sumSid, 'sum', '執行摘要', brand));

  if (narrative.executive_summary) {
    const sentences = narrative.executive_summary.split(/[。！]/).filter(s => s.trim()).slice(0, 3);
    const sumText = sentences.map(s => `▸ ${s.trim()}`).join('\n\n');
    allRequests.push(...addStyledText(sumSid, sumText, {
      prefix: 'sum_body', x: 0.5, y: 1.2, w: 9, h: 3.8,
      fontSize: 13, color: 'text_on_light',
    }, brand));
  }
  speakerNotesMap.push({ slideIndex: idx, text: '【執行摘要】\n這頁是整份報告的精華。' });
  idx++;

  // ─── Chapter slides ───
  for (const chapter of chapters) {
    const chSid = slideIds[idx];
    allRequests.push(...buildChapterSlide(chSid, chapter, brand));
    speakerNotesMap.push({ slideIndex: idx, text: chapterSpeakerNotes(chapter) });
    idx++;
  }

  // ─── Recommendations ───
  if (hasRecs) {
    const recSid = slideIds[idx];
    allRequests.push(setPageBackground(recSid, lightBg));
    allRequests.push(...addHeader(recSid, 'rec', '行動建議', brand));

    const recHeaders = ['優先級', 'WHO', 'WHAT', 'WHEN', 'KPI'];
    const recRows = narrative.recommendations.slice(0, 6).map(r =>
      [r.priority || '', r.who || '', r.what || '', r.when || '', r.kpi || '']
    );
    allRequests.push(...addTable(recSid, 'rec', 0.2, 1.15, 9.6, 2.5, recHeaders, recRows, 'secondary', brand));
    speakerNotesMap.push({ slideIndex: idx, text: '【行動建議】\n每個建議都有明確的負責人、內容、時程和 KPI。' });
    idx++;
  }

  // ─── Closing ───
  const closeSid = slideIds[idx];
  allRequests.push(setPageBackground(closeSid, darkBg));
  allRequests.push(...addStyledText(closeSid, 'Thank You', {
    prefix: 'close_ty', x: 0.5, y: 1.0, w: 9, h: 0.8,
    fontSize: 40, bold: true, color: 'primary', align: 'CENTER',
  }, brand));
  const closingSub = venue ? `${venue} × ${brandName}\n攜手打造精品行銷新高度` : brandName;
  allRequests.push(...addStyledText(closeSid, closingSub, {
    prefix: 'close_sub', x: 0.5, y: 2.0, w: 9, h: 1,
    fontSize: 18, bold: true, color: 'white', align: 'CENTER',
  }, brand));
  allRequests.push(...addStyledText(closeSid, 'FonTrends × Journey101  |  Confidential', {
    prefix: 'close_ft', x: 0.5, y: 5.1, w: 9, h: 0.4,
    fontSize: 10, color: 'midGray', align: 'CENTER',
  }, brand));
  speakerNotesMap.push({ slideIndex: idx, text: '【結語】\n感謝各位的時間。建議下一步安排品牌對口窗口會議。' });

  console.log(`  Total requests: ${allRequests.length}`);

  // ── 4. Execute in batches ──
  const progressFile = outputConfig.outputDir
    ? path.join(outputConfig.outputDir, 'render-progress.json')
    : null;
  await executeBatch(slidesApi, presentationId, allRequests, progressFile);

  // ── 5. Speaker notes ──
  const fullPres = await slidesApi.presentations.get({ presentationId });
  const notesReqs = [];
  for (const { slideIndex, text } of speakerNotesMap) {
    const slide = fullPres.data.slides[slideIndex];
    if (!slide) continue;
    const notesId = slide.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
    if (notesId) {
      notesReqs.push({ insertText: { objectId: notesId, text, insertionIndex: 0 } });
    }
  }
  if (notesReqs.length > 0) {
    await slidesApi.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: notesReqs },
    });
    console.log(`  ${notesReqs.length} speaker notes written`);
  }

  // ── 6. Appendix screenshots (reuse existing logic) ──
  const screenshotsDir = outputConfig?.runPath
    ? path.join(outputConfig.runPath, 'screenshots')
    : null;

  if (screenshotsDir && fs.existsSync(screenshotsDir)) {
    const screenshots = fs.readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort();

    if (screenshots.length > 0) {
      const drive = google.drive({ version: 'v3', auth });
      let insertIdx = totalSlides;

      for (const filename of screenshots) {
        const filePath = path.join(screenshotsDir, filename);
        const pageName = filename
          .replace(/^dashboard-/, '')
          .replace(/\.(png|jpg|jpeg)$/i, '')
          .replace(/_/g, ' ');

        try {
          const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const uploadRes = await drive.files.create({
            requestBody: { name: filename, mimeType },
            media: { mimeType, body: fs.createReadStream(filePath) },
            fields: 'id',
          });
          await drive.permissions.create({
            fileId: uploadRes.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
          });
          const imageUrl = `https://drive.google.com/uc?id=${uploadRes.data.id}`;

          const slideId = `appendix_${insertIdx}`;
          const imgId = uid('apx_img');

          await slidesApi.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: [{ createSlide: { objectId: slideId, insertionIndex: insertIdx } }] },
          });

          const contentReqs = [
            ...addStyledText(slideId, `附錄：${pageName}`, {
              prefix: `apx_t_${insertIdx}`, x: 0.5, y: 0.2, w: 9, h: 0.5,
              fontSize: 16, bold: true, color: 'text_on_light',
            }, brand),
            {
              createImage: {
                objectId: imgId,
                url: imageUrl,
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: { magnitude: inches(8.5), unit: 'EMU' },
                    height: { magnitude: inches(4.5), unit: 'EMU' },
                  },
                  transform: {
                    scaleX: 1, scaleY: 1,
                    translateX: inches(0.75), translateY: inches(0.85),
                    unit: 'EMU',
                  },
                },
              },
            },
          ];

          await slidesApi.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: contentReqs },
          });

          insertIdx++;
          console.log(`  ✅ 附錄截圖: ${pageName}`);
          await new Promise(r => setTimeout(r, 1500));
        } catch (imgErr) {
          console.warn(`  ⚠ 截圖插入失敗 (${pageName}): ${imgErr.message}`);
        }
      }
      console.log(`  Step 6: ${insertIdx - totalSlides} appendix screenshots inserted`);
    }
  }

  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  console.log(`  Done: ${url}`);
  return { url, presentationId };
}

// ══════════════════════════════════════════════════════
// Main render function
// ══════════════════════════════════════════════════════

async function render(pages, brand, theme, outputConfig) {
  // Check for narrative.json — if present, use chapter-by-chapter rendering
  const narrativePath = outputConfig?.runPath
    ? path.join(outputConfig.runPath, 'narrative.json') : null;
  const narrative = narrativePath ? readJSON(narrativePath) : null;

  if (narrative?.chapters) {
    console.log('📖 Using narrative.json for slides');
    return renderFromNarrative(narrative, brand, theme, outputConfig);
  }

  // Legacy: page-based rendering from engine.js intermediate format
  resetIdCounter();

  const brandName = outputConfig.brandName || brand.name || brand.brand || 'Brand';
  console.log(`  Google Slides: generating ${pages.length} pages for ${brandName}`);

  // 1. Authenticate
  const auth = await getGoogleAuth(SCOPES);
  const slidesApi = google.slides({ version: 'v1', auth });

  // 2. Create presentation with sequential naming in Drive folder
  const reportType = '品牌社群分析報告';
  const folderId = await findOrCreateDriveFolder(auth);
  const title = await generateSequentialTitle(auth, folderId, brandName, reportType);

  const pres = await slidesApi.presentations.create({
    requestBody: {
      title,
      pageSize: {
        width: { magnitude: inches(10), unit: 'EMU' },
        height: { magnitude: inches(5.625), unit: 'EMU' },
      },
    },
  });
  const presentationId = pres.data.presentationId;
  const defaultSlideId = pres.data.slides[0].objectId;
  await moveFileToFolder(auth, presentationId, folderId);
  console.log(`  Presentation ID: ${presentationId} (${title})`);

  // 3. Create slides + delete default
  const slideIds = [];
  const createReqs = [];
  for (let i = 0; i < pages.length; i++) {
    const sid = `slide_${i + 1}`;
    slideIds.push(sid);
    createReqs.push({ createSlide: { objectId: sid, insertionIndex: i } });
  }
  createReqs.push({ deleteObject: { objectId: defaultSlideId } });

  await slidesApi.presentations.batchUpdate({
    presentationId,
    requestBody: { requests: createReqs },
  });
  console.log(`  ${pages.length} slides created`);

  // 4. Build all content requests
  const allRequests = [];
  pages.forEach((page, i) => {
    allRequests.push(...renderPage(slideIds[i], page, brand, theme));
  });

  console.log(`  Total requests: ${allRequests.length}`);

  // 5. Execute in batches of 500 (with progress tracking)
  const progressFile = outputConfig.outputDir
    ? path.join(outputConfig.outputDir, 'render-progress.json')
    : null;
  await executeBatch(slidesApi, presentationId, allRequests, progressFile);

  // 6. Add speaker notes (requires separate GET to find notesObjectId per slide)
  await addSpeakerNotes(slidesApi, presentationId, pages);

  // 7. Appendix — Insert Dashboard Screenshots as extra slides
  const screenshotsDir = outputConfig?.runPath
    ? path.join(outputConfig.runPath, 'screenshots')
    : null;

  if (screenshotsDir && fs.existsSync(screenshotsDir)) {
    const screenshots = fs.readdirSync(screenshotsDir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .sort();

    if (screenshots.length > 0) {
      const drive = google.drive({ version: 'v3', auth });
      let insertIdx = pages.length; // after all content slides

      for (const filename of screenshots) {
        const filePath = path.join(screenshotsDir, filename);
        const pageName = filename
          .replace(/^dashboard-/, '')
          .replace(/\.(png|jpg|jpeg)$/i, '')
          .replace(/_/g, ' ');

        try {
          // Upload to Drive and make publicly readable
          const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const uploadRes = await drive.files.create({
            requestBody: { name: filename, mimeType },
            media: { mimeType, body: fs.createReadStream(filePath) },
            fields: 'id',
          });
          await drive.permissions.create({
            fileId: uploadRes.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
          });
          const imageUrl = `https://drive.google.com/uc?id=${uploadRes.data.id}`;

          // Create a new slide for this screenshot
          const slideId = `appendix_${insertIdx}`;
          const titleId = uid('apx_title');
          const imgId = uid('apx_img');

          const appendixReqs = [
            { createSlide: { objectId: slideId, insertionIndex: insertIdx } },
          ];

          await slidesApi.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: appendixReqs },
          });

          // Add title + image
          const contentReqs = [
            // Title text
            ...addStyledText(slideId, `附錄：${pageName}`, {
              prefix: `apx_t_${insertIdx}`, x: 0.5, y: 0.2, w: 9, h: 0.5,
              fontSize: 16, bold: true, color: 'text_on_light',
            }, brand),
            // Screenshot image
            {
              createImage: {
                objectId: imgId,
                url: imageUrl,
                elementProperties: {
                  pageObjectId: slideId,
                  size: {
                    width: { magnitude: inches(8.5), unit: 'EMU' },
                    height: { magnitude: inches(4.5), unit: 'EMU' },
                  },
                  transform: {
                    scaleX: 1, scaleY: 1,
                    translateX: inches(0.75), translateY: inches(0.85),
                    unit: 'EMU',
                  },
                },
              },
            },
          ];

          await slidesApi.presentations.batchUpdate({
            presentationId,
            requestBody: { requests: contentReqs },
          });

          insertIdx++;
          console.log(`  ✅ 附錄截圖: ${pageName}`);
          await new Promise(r => setTimeout(r, 1500)); // rate limit
        } catch (imgErr) {
          console.warn(`  ⚠ 截圖插入失敗 (${pageName}): ${imgErr.message}`);
        }
      }
      console.log(`  Step 7: ${insertIdx - pages.length} appendix screenshots inserted`);
    }
  }

  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  console.log(`  Done: ${url}`);

  return { url, presentationId };
}

// ══════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════

module.exports = { render };
