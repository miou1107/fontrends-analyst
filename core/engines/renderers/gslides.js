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
        const fs = require('fs');
        const progress = { presentationId, completedRequests: i + batch.length, totalRequests: allRequests.length, batchNum, totalBatches, updatedAt: new Date().toISOString() };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }
    } catch (err) {
      console.error(`  ❌ Batch ${batchNum} failed: ${err.message}`);
      if (progressFile) {
        const fs = require('fs');
        const progress = { presentationId, completedRequests: i, totalRequests: allRequests.length, failedAtBatch: batchNum, error: err.message, updatedAt: new Date().toISOString() };
        fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      }
      throw err;
    }
  }
}

// ══════════════════════════════════════════════════════
// Main render function
// ══════════════════════════════════════════════════════

async function render(pages, brand, theme, outputConfig) {
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
  const fs = require('fs');
  const path = require('path');
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
