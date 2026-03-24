/**
 * pptx.js — pptxgenjs Renderer
 *
 * Renders intermediate page format → .pptx file using pptxgenjs.
 *
 * Pitfalls handled:
 *   - Hex colors WITHOUT # prefix
 *   - Shadow objects use factory (they MUTATE if reused)
 *   - Line breaks via { breakLine: true }, not \n
 *   - Opacity as 0-1 decimal, not percentage
 *   - Layout: LAYOUT_WIDE for 16:9 (10 x 5.625 inches)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveColor, hexNoHash, formatNumber } = require('../helpers');

// ══════════════════════════════════════════════════════
// Dependency Check
// ══════════════════════════════════════════════════════

let PptxGenJS;
try {
  PptxGenJS = require('pptxgenjs');
} catch (e) {
  console.error('❌ pptxgenjs 未安裝。請執行：');
  console.error('   npm install pptxgenjs');
  process.exit(1);
}

// ══════════════════════════════════════════════════════
// Shadow Factory — NEVER reuse shadow objects (pptxgenjs mutates them)
// ══════════════════════════════════════════════════════

function makeShadow(opts = {}) {
  return {
    type: opts.type || 'outer',
    blur: opts.blur ?? 3,
    offset: opts.offset ?? 2,
    color: opts.color || '000000',
    opacity: opts.opacity ?? 0.3,
  };
}

// ══════════════════════════════════════════════════════
// Text Helpers
// ══════════════════════════════════════════════════════

/**
 * Convert a plain string with \n into pptxgenjs text array
 * using { breakLine: true } — never raw \n
 */
function textLines(str, options = {}) {
  if (!str) return [{ text: '', options }];
  const lines = String(str).split('\n');
  const result = [];
  lines.forEach((line, i) => {
    result.push({ text: line, options: { ...options } });
    if (i < lines.length - 1) {
      result.push({ text: '', options: { breakLine: true } });
    }
  });
  return result;
}

/**
 * Map align string to pptxgenjs align value
 */
function mapAlign(align) {
  if (!align) return undefined;
  const map = {
    LEFT: 'left', CENTER: 'center', RIGHT: 'right',
    left: 'left', center: 'center', right: 'right',
  };
  return map[align] || 'left';
}

// ══════════════════════════════════════════════════════
// KPI Card Layout
// ══════════════════════════════════════════════════════

const KPI_GRID = {
  cols: 3,
  rows: 2,
  startX: 0.4,
  startY: 1.2,
  cardW: 2.85,
  cardH: 1.6,
  gapX: 0.25,
  gapY: 0.25,
};

function kpiPosition(index) {
  const col = index % KPI_GRID.cols;
  const row = Math.floor(index / KPI_GRID.cols);
  return {
    x: KPI_GRID.startX + col * (KPI_GRID.cardW + KPI_GRID.gapX),
    y: KPI_GRID.startY + row * (KPI_GRID.cardH + KPI_GRID.gapY),
    w: KPI_GRID.cardW,
    h: KPI_GRID.cardH,
  };
}

// ══════════════════════════════════════════════════════
// Element Renderers
// ══════════════════════════════════════════════════════

function renderText(slide, el, brand) {
  const color = resolveColor(el.color, brand);
  const textOpts = {
    fontSize: el.fontSize || 14,
    bold: el.bold || false,
    italic: el.italic || false,
    color: color,
    align: mapAlign(el.align),
    valign: el.valign || undefined,
  };

  const textArr = textLines(el.content, textOpts);

  slide.addText(textArr, {
    x: el.x, y: el.y, w: el.w, h: el.h,
    // Outer container options (no font props here — they're on each text obj)
  });
}

function renderTable(slide, el, brand) {
  const headerColor = resolveColor(el.headerColor || 'primary', brand);
  const headerTextColor = resolveColor(el.headerTextColor || 'white', brand);
  const borderColor = resolveColor(el.borderColor || 'E0E0E0', brand);

  // Build header row
  const headers = (el.headers || []).map(h => ({
    text: h,
    options: {
      bold: true,
      fontSize: el.fontSize || 10,
      color: headerTextColor,
      fill: { color: headerColor },
      align: 'center',
      border: { type: 'solid', pt: 0.5, color: borderColor },
    },
  }));

  // Build data rows
  const dataRows = (el.rows || []).map((row, rowIdx) =>
    row.map(cell => ({
      text: String(cell ?? ''),
      options: {
        fontSize: el.fontSize || 10,
        color: resolveColor(el.textColor || '333333', brand),
        fill: { color: rowIdx % 2 === 0 ? 'FFFFFF' : 'F5F5F5' },
        align: 'center',
        border: { type: 'solid', pt: 0.5, color: borderColor },
      },
    }))
  );

  const tableData = [headers, ...dataRows];

  slide.addTable(tableData, {
    x: el.x || 0.5,
    y: el.y || 1.2,
    w: el.w || 9,
    colW: el.colWidths || undefined,
    autoPage: false,
  });
}

function renderKpiCard(slide, el, brand) {
  const pos = el.x !== undefined
    ? { x: el.x, y: el.y, w: el.w || 2.85, h: el.h || 1.6 }
    : kpiPosition(el.index ?? 0);

  const accentColor = resolveColor(el.accentColor || 'primary', brand);
  const bgColor = resolveColor(el.bgColor || '2A2A2A', brand);

  // Background rect — fresh shadow each time
  slide.addShape('rect', {
    x: pos.x, y: pos.y, w: pos.w, h: pos.h,
    fill: { color: bgColor },
    rectRadius: 0.1,
    shadow: makeShadow(),
  });

  // Accent bar at top
  slide.addShape('rect', {
    x: pos.x, y: pos.y, w: pos.w, h: 0.06,
    fill: { color: accentColor },
  });

  // Value text
  slide.addText(String(el.value ?? 'N/A'), {
    x: pos.x, y: pos.y + 0.3, w: pos.w, h: 0.7,
    fontSize: 28,
    bold: true,
    color: accentColor,
    align: 'center',
    valign: 'middle',
  });

  // Label text
  slide.addText(String(el.label ?? ''), {
    x: pos.x, y: pos.y + 1.0, w: pos.w, h: 0.4,
    fontSize: 11,
    color: resolveColor('lightGray', brand) || 'AAAAAA',
    align: 'center',
    valign: 'top',
  });
}

function renderBarChart(slide, el, brand) {
  const bars = el.bars || el.data || [];
  if (!bars.length) return;

  const chartX = el.x || 0.5;
  const chartY = el.y || 1.4;
  const chartW = el.w || 9;
  const chartH = el.h || 3.5;
  const barCount = bars.length;
  const barGap = 0.15;
  const barW = Math.min((chartW - barGap * (barCount + 1)) / barCount, 1.2);
  const totalBarArea = barW * barCount + barGap * (barCount - 1);
  const offsetX = chartX + (chartW - totalBarArea) / 2;

  // Find max value for scaling
  const maxVal = Math.max(...bars.map(b => b.value || 0), 1);

  bars.forEach((bar, i) => {
    const barH = (bar.value / maxVal) * (chartH - 0.8);
    const bx = offsetX + i * (barW + barGap);
    const by = chartY + chartH - barH - 0.4;
    const barColor = resolveColor(bar.color || el.barColor || 'primary', brand);

    // Bar rect — fresh shadow each time
    slide.addShape('rect', {
      x: bx, y: by, w: barW, h: barH,
      fill: { color: barColor },
      rectRadius: 0.04,
      shadow: makeShadow({ blur: 2, offset: 1, opacity: 0.2 }),
    });

    // Value label above bar
    slide.addText(String(bar.label_value || formatNumber(bar.value) || ''), {
      x: bx, y: by - 0.35, w: barW, h: 0.3,
      fontSize: 9,
      bold: true,
      color: resolveColor('white', brand) || 'FFFFFF',
      align: 'center',
    });

    // Category label below bar
    slide.addText(String(bar.label || bar.name || ''), {
      x: bx - 0.1, y: chartY + chartH - 0.35, w: barW + 0.2, h: 0.3,
      fontSize: 8,
      color: resolveColor('lightGray', brand) || 'AAAAAA',
      align: 'center',
    });
  });
}

function renderRect(slide, el, brand) {
  const fillColor = resolveColor(el.color || el.fill || '333333', brand);
  const opts = {
    x: el.x, y: el.y, w: el.w, h: el.h,
    fill: { color: fillColor },
  };
  if (el.rectRadius) opts.rectRadius = el.rectRadius;
  if (el.shadow) opts.shadow = makeShadow(el.shadow);
  if (el.line) {
    opts.line = {
      color: resolveColor(el.line.color || 'FFFFFF', brand),
      width: el.line.width || 1,
    };
  }
  slide.addShape('rect', opts);
}

// ══════════════════════════════════════════════════════
// Main Render Function
// ══════════════════════════════════════════════════════

async function render(pages, brand, theme, outputConfig) {
  const pptx = new PptxGenJS();

  // 16:9 widescreen layout
  pptx.layout = 'LAYOUT_WIDE';

  // Metadata
  pptx.title = `${outputConfig.brandName || 'Brand'} Report`;
  pptx.author = 'FonTrends × Journey101';
  pptx.company = 'Stage101';

  // Default background from theme
  const defaultBg = resolveColor(
    (theme && theme.background) || '1A1A1A',
    brand
  );

  // Element dispatcher
  const elementRenderers = {
    text: renderText,
    table: renderTable,
    kpi_card: renderKpiCard,
    bar_chart: renderBarChart,
    rect: renderRect,
  };

  // Build each slide
  pages.forEach((page, pageIdx) => {
    const slide = pptx.addSlide();

    // Background color
    const pageBg = page.background
      ? resolveColor(page.background, brand)
      : defaultBg;
    slide.background = { fill: pageBg };

    // Render elements
    (page.elements || []).forEach(el => {
      const handler = elementRenderers[el.type];
      if (handler) {
        handler(slide, el, brand);
      } else {
        console.warn(`⚠ 未知 element type: ${el.type}（page ${pageIdx}）`);
      }
    });

    // Speaker notes
    if (page.speakerNotes) {
      slide.addNotes(page.speakerNotes);
    }
  });

  // ── Output ──────────────────────────────────────────

  const outputDir = outputConfig.outputDir || path.join(os.homedir(), 'Desktop');
  const fileName = `${outputConfig.brandName || 'Brand'}_Report.pptx`;

  // Ensure output dir exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, fileName);
  await pptx.writeFile({ fileName: outputPath });
  console.log(`✅ PPTX 已產生：${outputPath}`);

  // Copy to ~/Desktop as well (if outputDir is not already Desktop)
  const desktopPath = path.join(os.homedir(), 'Desktop', fileName);
  if (path.resolve(outputPath) !== path.resolve(desktopPath)) {
    try {
      fs.copyFileSync(outputPath, desktopPath);
      console.log(`📋 已複製至：${desktopPath}`);
    } catch (err) {
      console.warn(`⚠ 無法複製到桌面：${err.message}`);
    }
  }

  return { file: outputPath };
}

// ══════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════

module.exports = { render };
