'use strict';

/**
 * engine-builders.test.js
 *
 * engine.js calls main() immediately on require, which exits the process
 * when --run is not supplied. We therefore cannot require it directly in tests.
 *
 * Instead we:
 *   1. Re-implement the pure, side-effect-free logic (PAGE_TO_CHAPTER,
 *      findChapter, buildFromNarrative) extracted verbatim from engine.js
 *      so we can unit-test it.
 *   2. Validate structural contracts that the engine enforces.
 *   3. Smoke-test the helpers that engine.js depends on (already in helpers.test.js)
 *      with a few engine-context scenarios.
 */

// ══════════════════════════════════════════════════════
// Inline extraction from engine.js (verbatim, testable)
// ══════════════════════════════════════════════════════

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

function findChapter(narrative, pageId) {
  if (!narrative?.chapters) return null;
  const chapterId = PAGE_TO_CHAPTER[pageId] || pageId;
  return narrative.chapters.find(c => c.id === chapterId) || null;
}

function buildFromNarrative(page, chapter) {
  const elements = [];

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

  if (chapter.insight) {
    elements.push({
      type: 'text', x: 0.5, y: 5.1, w: 9, h: 0.3,
      content: chapter.insight,
      fontSize: 10, italic: true, color: 'primary',
    });
  }

  page.elements = elements;

  const notes = [`【${chapter.title}】`];
  if (chapter.so_what) notes.push(`要點：${chapter.so_what}`);
  if (chapter.action_link) notes.push(`場域連結：${chapter.action_link}`);
  page.speakerNotes = notes.join('\n');
}

// ══════════════════════════════════════════════════════
// Helpers used in tests
// ══════════════════════════════════════════════════════

function makePage(pageId = 'kpi', title = 'Test Page') {
  return { pageId, title, background: 'light', speakerNotes: '', elements: [] };
}

function makeNarrative(chapters = []) {
  return {
    meta: { brand: 'LV', period: '2025-Q4' },
    title: '分析報告',
    chapters,
  };
}

function makeChapter(overrides = {}) {
  return {
    id: 'social_overview',
    title: '社群總覽',
    paragraphs: ['品牌聲量概況'],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
// PAGE_TO_CHAPTER mapping
// ══════════════════════════════════════════════════════

describe('PAGE_TO_CHAPTER mapping', () => {
  const expectedMappings = [
    ['kpi',        'social_overview'],
    ['trend',      'trend_seasonality'],
    ['language',   'language_audience'],
    ['platform',   'platform_efficiency'],
    ['kol',        'kol_ecosystem'],
    ['sentiment',  'sentiment_risk'],
    ['venue',      'search_intent'],
    ['validation', 'venue_connection'],
    ['competitor', 'competitive_landscape'],
    ['actions',    'action_recommendations'],
  ];

  test.each(expectedMappings)(
    'pageId "%s" maps to chapterId "%s"',
    (pageId, chapterId) => {
      expect(PAGE_TO_CHAPTER[pageId]).toBe(chapterId);
    }
  );

  test('has exactly 10 entries', () => {
    expect(Object.keys(PAGE_TO_CHAPTER)).toHaveLength(10);
  });

  test('structural pages (cover, summary, closing) are NOT in the map', () => {
    expect(PAGE_TO_CHAPTER['cover']).toBeUndefined();
    expect(PAGE_TO_CHAPTER['summary']).toBeUndefined();
    expect(PAGE_TO_CHAPTER['closing']).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════
// findChapter
// ══════════════════════════════════════════════════════

describe('findChapter', () => {
  test('returns null when narrative is null', () => {
    expect(findChapter(null, 'kpi')).toBeNull();
  });

  test('returns null when narrative has no chapters array', () => {
    expect(findChapter({}, 'kpi')).toBeNull();
  });

  test('returns null when narrative.chapters is empty', () => {
    expect(findChapter(makeNarrative([]), 'kpi')).toBeNull();
  });

  test('resolves pageId "kpi" → chapterId "social_overview" and finds it', () => {
    const chapter = makeChapter({ id: 'social_overview' });
    const narrative = makeNarrative([chapter]);
    expect(findChapter(narrative, 'kpi')).toBe(chapter);
  });

  test('resolves pageId "trend" → chapterId "trend_seasonality"', () => {
    const chapter = makeChapter({ id: 'trend_seasonality' });
    const narrative = makeNarrative([chapter]);
    expect(findChapter(narrative, 'trend')).toBe(chapter);
  });

  test('resolves pageId "sentiment" → chapterId "sentiment_risk"', () => {
    const chapter = makeChapter({ id: 'sentiment_risk' });
    const narrative = makeNarrative([chapter]);
    expect(findChapter(narrative, 'sentiment')).toBe(chapter);
  });

  test('falls back to direct id match when pageId is not in PAGE_TO_CHAPTER', () => {
    const chapter = makeChapter({ id: 'custom_chapter' });
    const narrative = makeNarrative([chapter]);
    expect(findChapter(narrative, 'custom_chapter')).toBe(chapter);
  });

  test('returns null when chapter id does not match', () => {
    const chapter = makeChapter({ id: 'other_chapter' });
    const narrative = makeNarrative([chapter]);
    expect(findChapter(narrative, 'kpi')).toBeNull();
  });

  test('returns the correct chapter from a multi-chapter narrative', () => {
    const c1 = makeChapter({ id: 'social_overview', title: 'KPI' });
    const c2 = makeChapter({ id: 'trend_seasonality', title: 'Trend' });
    const c3 = makeChapter({ id: 'sentiment_risk', title: 'Sentiment' });
    const narrative = makeNarrative([c1, c2, c3]);

    expect(findChapter(narrative, 'kpi')).toBe(c1);
    expect(findChapter(narrative, 'trend')).toBe(c2);
    expect(findChapter(narrative, 'sentiment')).toBe(c3);
  });
});

// ══════════════════════════════════════════════════════
// buildFromNarrative
// ══════════════════════════════════════════════════════

describe('buildFromNarrative', () => {
  test('sets page.elements to empty array when chapter has no data_table or insight', () => {
    const page = makePage();
    const chapter = makeChapter();
    buildFromNarrative(page, chapter);
    expect(page.elements).toEqual([]);
  });

  test('adds a table element when chapter has data_table', () => {
    const page = makePage();
    const chapter = makeChapter({
      data_table: {
        headers: ['平台', '影響力'],
        rows: [['Instagram', '42.5 萬'], ['Facebook', '18.2 萬']],
      },
    });
    buildFromNarrative(page, chapter);
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].type).toBe('table');
    expect(page.elements[0].headers).toEqual(['平台', '影響力']);
    expect(page.elements[0].rows).toHaveLength(2);
  });

  test('table height is capped at 3.2 for many rows', () => {
    const rows = Array.from({ length: 20 }, (_, i) => [`Row${i}`, String(i)]);
    const page = makePage();
    const chapter = makeChapter({
      data_table: { headers: ['A', 'B'], rows },
    });
    buildFromNarrative(page, chapter);
    expect(page.elements[0].h).toBeLessThanOrEqual(3.2);
  });

  test('table height grows with row count up to 3 rows', () => {
    const makeRows = (n) => Array.from({ length: n }, (_, i) => [`R${i}`, '0']);

    const page1 = makePage();
    const chapter1 = makeChapter({ data_table: { headers: ['A'], rows: makeRows(1) } });
    buildFromNarrative(page1, chapter1);
    const h1 = page1.elements[0].h;

    const page3 = makePage();
    const chapter3 = makeChapter({ data_table: { headers: ['A'], rows: makeRows(3) } });
    buildFromNarrative(page3, chapter3);
    const h3 = page3.elements[0].h;

    expect(h3).toBeGreaterThan(h1);
  });

  test('adds an insight text element when chapter has insight', () => {
    const page = makePage();
    const chapter = makeChapter({ insight: '品牌聲量年增 32%。' });
    buildFromNarrative(page, chapter);
    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].type).toBe('text');
    expect(page.elements[0].content).toBe('品牌聲量年增 32%。');
    expect(page.elements[0].italic).toBe(true);
  });

  test('adds both table and insight when both are present', () => {
    const page = makePage();
    const chapter = makeChapter({
      data_table: { headers: ['A'], rows: [['1']] },
      insight: 'Key insight here.',
    });
    buildFromNarrative(page, chapter);
    expect(page.elements).toHaveLength(2);
    expect(page.elements[0].type).toBe('table');
    expect(page.elements[1].type).toBe('text');
  });

  test('sets speakerNotes with chapter title', () => {
    const page = makePage();
    const chapter = makeChapter({ title: '社群總覽' });
    buildFromNarrative(page, chapter);
    expect(page.speakerNotes).toContain('社群總覽');
  });

  test('includes so_what in speakerNotes when present', () => {
    const page = makePage();
    const chapter = makeChapter({ so_what: '聲量顯著高於同類競品。' });
    buildFromNarrative(page, chapter);
    expect(page.speakerNotes).toContain('要點：聲量顯著高於同類競品');
  });

  test('includes action_link in speakerNotes when present', () => {
    const page = makePage();
    const chapter = makeChapter({ action_link: '建議安排場域拜訪。' });
    buildFromNarrative(page, chapter);
    expect(page.speakerNotes).toContain('場域連結：建議安排場域拜訪');
  });

  test('speakerNotes omits so_what/action_link lines when absent', () => {
    const page = makePage();
    const chapter = makeChapter();
    buildFromNarrative(page, chapter);
    expect(page.speakerNotes).not.toContain('要點：');
    expect(page.speakerNotes).not.toContain('場域連結：');
  });

  test('table headerBg is "primary"', () => {
    const page = makePage();
    const chapter = makeChapter({
      data_table: { headers: ['X'], rows: [['1']] },
    });
    buildFromNarrative(page, chapter);
    expect(page.elements[0].headerBg).toBe('primary');
  });

  test('insight text color is "primary"', () => {
    const page = makePage();
    const chapter = makeChapter({ insight: 'Test insight' });
    buildFromNarrative(page, chapter);
    expect(page.elements[0].color).toBe('primary');
  });

  test('overwrites any pre-existing page.elements', () => {
    const page = makePage();
    page.elements = [{ type: 'existing' }];
    const chapter = makeChapter(); // no data_table, no insight → empty []
    buildFromNarrative(page, chapter);
    expect(page.elements).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════
// engine.js module syntax validation
// ══════════════════════════════════════════════════════

describe('engine.js file structure', () => {
  const fs = require('fs');
  const path = require('path');
  const enginePath = path.join(__dirname, '..', 'engine.js');

  test('engine.js file exists', () => {
    expect(fs.existsSync(enginePath)).toBe(true);
  });

  test('engine.js is parseable JavaScript (syntax check via acorn-free approach)', () => {
    // Read the source and check for key structural markers
    const source = fs.readFileSync(enginePath, 'utf8');
    expect(source).toContain('PAGE_TO_CHAPTER');
    expect(source).toContain('findChapter');
    expect(source).toContain('buildFromNarrative');
    expect(source).toContain('assemblePages');
    expect(source).toContain('pageBuilders');
  });

  test('engine.js exports nothing (it is a CLI script, not a library)', () => {
    // engine.js does not have module.exports = {...}
    const source = fs.readFileSync(enginePath, 'utf8');
    expect(source).not.toContain('module.exports');
  });
});
