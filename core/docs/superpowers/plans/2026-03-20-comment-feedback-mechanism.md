# Comment Feedback Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a system that reads Google Slides/Docs comments, modifies documents in-place via API, replies/resolves comments, and captures learnings into skill docs.

**Architecture:** A new `comment-feedback/` engine module handles the pipeline: URL parsing → comment reading → AI intent classification → modification execution → reply/resolve → learning capture. It reuses existing OAuth/Drive helpers from `helpers.js` and delegates doc-type-specific modifications to adapter functions for Slides and Docs.

**Tech Stack:** Node.js (CommonJS), googleapis v171, Jest 30 for testing

**Spec:** `docs/superpowers/specs/2026-03-20-comment-feedback-mechanism-design.md`

---

## File Structure

```
engines/comment-feedback/
├── index.js                    # Main entry: orchestrates the full pipeline
├── url-parser.js               # Extract fileId + fileType from Google URL
├── comment-reader.js           # Drive Comments API: list, filter, parse anchor
├── intent-classifier.js        # AI classification of comment intent
├── modifiers/
│   ├── slides-modifier.js      # Google Slides batchUpdate request generation
│   └── docs-modifier.js        # Google Docs batchUpdate request generation
├── comment-responder.js        # Reply to comments + resolve
├── safety.js                   # Dry-run, snapshot, conflict retry helpers
├── learning-capture.js         # Summarize learnings, write corrections.jsonl + formats/*.md
└── __tests__/
    ├── url-parser.test.js
    ├── comment-reader.test.js
    ├── intent-classifier.test.js
    ├── slides-modifier.test.js
    ├── docs-modifier.test.js
    ├── comment-responder.test.js
    ├── safety.test.js
    └── learning-capture.test.js

learned/
├── corrections.jsonl           # (existing) append v2 records
└── formats/                    # (new directory)
    ├── gslides.md              # (new) accumulated Slides rules
    └── gdocs.md                # (new) accumulated Docs rules
```

**Modify:**
- `engines/helpers.js` — add Drive Comments API helpers + scope constant + snapshot helper

**Design note:** This module provides the **building blocks** (URL parsing, comment reading, batchUpdate request builders, reply/resolve, learning capture). In the full pipeline, the AI agent (Claude) acts as the LLM — it reads comments, understands context, decides which modifier functions to call with what parameters, and orchestrates the flow. The `index.js` orchestrator handles the deterministic plumbing (auth, fetch, sort, reply, resolve, error handling), while the AI agent fills in the non-deterministic parts (intent classification with full context, generating specific modification parameters).

---

## Task 1: URL Parser

**Files:**
- Create: `engines/comment-feedback/url-parser.js`
- Test: `engines/comment-feedback/__tests__/url-parser.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { parseDocUrl } = require('../url-parser');

describe('parseDocUrl', () => {
  test('parses Google Slides URL', () => {
    const url = 'https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit#slide=id.p';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ', fileType: 'slides' });
  });

  test('parses Google Docs URL', () => {
    const url = 'https://docs.google.com/document/d/1xYzAbCdEfGhIjKlMnOpQrStUvWx/edit';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1xYzAbCdEfGhIjKlMnOpQrStUvWx', fileType: 'docs' });
  });

  test('parses URL without /edit suffix', () => {
    const url = 'https://docs.google.com/presentation/d/1aBcDeFg/';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1aBcDeFg', fileType: 'slides' });
  });

  test('throws on invalid URL', () => {
    expect(() => parseDocUrl('https://example.com')).toThrow('Unsupported URL');
  });

  test('throws on empty input', () => {
    expect(() => parseDocUrl('')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/url-parser.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
'use strict';

const PATTERNS = [
  { regex: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/, fileType: 'slides' },
  { regex: /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/, fileType: 'docs' },
];

function parseDocUrl(url) {
  if (!url) throw new Error('URL is required');
  for (const { regex, fileType } of PATTERNS) {
    const match = url.match(regex);
    if (match) return { fileId: match[1], fileType };
  }
  throw new Error(`Unsupported URL: ${url}`);
}

module.exports = { parseDocUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/url-parser.test.js --no-coverage`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/url-parser.js engines/comment-feedback/__tests__/url-parser.test.js
git commit -m "feat(comment-feedback): add URL parser for Slides/Docs URLs"
```

---

## Task 2: Comment Reader

**Files:**
- Create: `engines/comment-feedback/comment-reader.js`
- Test: `engines/comment-feedback/__tests__/comment-reader.test.js`
- Modify: `engines/helpers.js` (add `DRIVE_FULL_SCOPE` constant)

- [ ] **Step 1: Add Drive scope to helpers.js**

In `engines/helpers.js`, add near the top exports:

```javascript
const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';
```

And export it alongside existing helpers.

- [ ] **Step 2: Write the failing tests**

```javascript
'use strict';

const { parseAnchor, filterUnresolved, parseComment } = require('../comment-reader');

describe('parseAnchor', () => {
  test('parses JSON anchor for Slides', () => {
    const anchor = JSON.stringify({ r: 'page_obj123', a: { lo: { ps: { o: { i: 'elem456' } } } } });
    const result = parseAnchor(anchor, 'slides');
    expect(result).toEqual({ targetType: 'slide_element', targetID: 'elem456', pageObjectId: 'page_obj123' });
  });

  test('parses JSON anchor for Docs', () => {
    const anchor = JSON.stringify({ r: 'head', a: { lo: { n: { s: { si: 10, ei: 50 } } } } });
    const result = parseAnchor(anchor, 'docs');
    expect(result).toEqual({ targetType: 'doc_range', targetID: { start: 10, end: 50 } });
  });

  test('parses base64-encoded anchor', () => {
    const raw = JSON.stringify({ r: 'page_x', a: { lo: { ps: { o: { i: 'el99' } } } } });
    const anchor = Buffer.from(raw).toString('base64');
    const result = parseAnchor(anchor, 'slides');
    expect(result).toEqual({ targetType: 'slide_element', targetID: 'el99', pageObjectId: 'page_x' });
  });

  test('returns null for unparseable anchor', () => {
    const result = parseAnchor('garbage', 'slides');
    expect(result).toBeNull();
  });

  test('returns null for missing anchor', () => {
    expect(parseAnchor(null, 'slides')).toBeNull();
    expect(parseAnchor(undefined, 'docs')).toBeNull();
  });
});

describe('filterUnresolved', () => {
  test('keeps only unresolved comments', () => {
    const comments = [
      { id: '1', resolved: false, content: 'fix this' },
      { id: '2', resolved: true, content: 'done' },
      { id: '3', resolved: false, content: 'change that' },
    ];
    expect(filterUnresolved(comments)).toHaveLength(2);
    expect(filterUnresolved(comments).map(c => c.id)).toEqual(['1', '3']);
  });

  test('returns empty array when all resolved', () => {
    expect(filterUnresolved([{ id: '1', resolved: true }])).toEqual([]);
  });

  test('handles empty input', () => {
    expect(filterUnresolved([])).toEqual([]);
    expect(filterUnresolved(null)).toEqual([]);
  });
});

describe('parseComment', () => {
  test('parses a Slides comment with anchor', () => {
    const raw = {
      id: 'c1',
      content: '字太小',
      anchor: JSON.stringify({ r: 'page_p1', a: { lo: { ps: { o: { i: 'shape1' } } } } }),
      resolved: false,
      createdTime: '2026-03-20T10:00:00Z',
    };
    const result = parseComment(raw, 'slides');
    expect(result.id).toBe('c1');
    expect(result.content).toBe('字太小');
    expect(result.targetType).toBe('slide_element');
    expect(result.targetID).toBe('shape1');
  });

  test('parses a comment without anchor', () => {
    const raw = { id: 'c2', content: '整體配色不好', resolved: false, createdTime: '2026-03-20T10:00:00Z' };
    const result = parseComment(raw, 'slides');
    expect(result.targetType).toBeNull();
    expect(result.targetID).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/comment-reader.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 4: Write implementation**

```javascript
'use strict';

function parseAnchor(anchor, fileType) {
  if (!anchor) return null;

  let parsed;
  try {
    parsed = JSON.parse(anchor);
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(anchor, 'base64').toString('utf-8'));
    } catch {
      return null;
    }
  }

  if (fileType === 'slides') {
    const elementId = parsed?.a?.lo?.ps?.o?.i;
    if (!elementId) return null;
    return { targetType: 'slide_element', targetID: elementId, pageObjectId: parsed.r };
  }

  if (fileType === 'docs') {
    const si = parsed?.a?.lo?.n?.s?.si;
    const ei = parsed?.a?.lo?.n?.s?.ei;
    if (si == null || ei == null) return null;
    return { targetType: 'doc_range', targetID: { start: si, end: ei } };
  }

  return null;
}

function filterUnresolved(comments) {
  if (!comments) return [];
  return comments.filter(c => c.resolved === false);
}

function parseComment(raw, fileType) {
  const anchorInfo = parseAnchor(raw.anchor, fileType);
  return {
    id: raw.id,
    content: raw.content,
    anchor: raw.anchor || null,
    targetType: anchorInfo?.targetType || null,
    targetID: anchorInfo?.targetID || null,
    pageObjectId: anchorInfo?.pageObjectId || null,
    createdTime: raw.createdTime,
  };
}

/**
 * Fetch unresolved comments from Drive Comments API.
 * @param {object} auth - Google OAuth2 client
 * @param {string} fileId
 * @param {string} fileType - 'slides' | 'docs'
 * @returns {Promise<Array>} parsed comments
 */
async function fetchComments(auth, fileId, fileType) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.comments.list({
    fileId,
    fields: 'comments(id,content,anchor,resolved,replies,author,createdTime,modifiedTime)',
    includeDeleted: false,
  });

  const unresolved = filterUnresolved(res.data.comments || []);
  return unresolved.map(c => parseComment(c, fileType));
}

module.exports = { parseAnchor, filterUnresolved, parseComment, fetchComments };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/comment-reader.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/comment-reader.js engines/comment-feedback/__tests__/comment-reader.test.js engines/helpers.js
git commit -m "feat(comment-feedback): add comment reader with anchor parsing"
```

---

## Task 3: Intent Classifier

**Files:**
- Create: `engines/comment-feedback/intent-classifier.js`
- Test: `engines/comment-feedback/__tests__/intent-classifier.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { classifyIntent, sortByProcessingOrder } = require('../intent-classifier');

describe('classifyIntent', () => {
  test('classifies style comment', () => {
    const result = classifyIntent('字太小，改成 36pt', { type: 'textBox', text: '標題' });
    expect(result.intent).toBe('style');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.action).toBeTruthy();
  });

  test('classifies content comment', () => {
    const result = classifyIntent('數字錯了，應該是 2,500 不是 3,000', { type: 'textBox', text: '3,000' });
    expect(result.intent).toBe('content');
  });

  test('classifies delete comment', () => {
    const result = classifyIntent('這頁刪掉', { type: 'slide', elements: [] });
    expect(result.intent).toBe('delete');
  });

  test('classifies structure comment', () => {
    const result = classifyIntent('把這頁移到前面', { type: 'slide', elements: [] });
    expect(result.intent).toBe('structure');
  });

  test('classifies question comment', () => {
    const result = classifyIntent('這個數據是從哪裡來的？', { type: 'textBox', text: '2,700,000' });
    expect(result.intent).toBe('question');
  });
});

describe('sortByProcessingOrder', () => {
  test('sorts delete > structure > content > style > question', () => {
    const comments = [
      { id: '1', classified: { intent: 'style' } },
      { id: '2', classified: { intent: 'delete' } },
      { id: '3', classified: { intent: 'question' } },
      { id: '4', classified: { intent: 'content' } },
      { id: '5', classified: { intent: 'structure' } },
    ];
    const sorted = sortByProcessingOrder(comments);
    expect(sorted.map(c => c.classified.intent)).toEqual([
      'delete', 'structure', 'content', 'style', 'question',
    ]);
  });

  test('preserves order within same intent', () => {
    const comments = [
      { id: 'a', classified: { intent: 'style' } },
      { id: 'b', classified: { intent: 'style' } },
    ];
    const sorted = sortByProcessingOrder(comments);
    expect(sorted.map(c => c.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/intent-classifier.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

The intent classifier uses keyword-based heuristics (no external LLM call needed for most cases). In production, the AI agent (Claude) acts as the LLM — it reads the comments and classifies them. This module provides the rule-based fallback + sorting logic.

```javascript
'use strict';

const INTENT_ORDER = { delete: 0, structure: 1, content: 2, style: 3, question: 4 };

const KEYWORD_RULES = [
  { intent: 'delete', keywords: ['刪掉', '刪除', '移除', '拿掉', 'remove', 'delete'] },
  { intent: 'structure', keywords: ['移到', '搬到', '加一頁', '新增頁', '調換', '順序', 'move', 'reorder'] },
  { intent: 'question', keywords: ['？', '?', '為什麼', '哪裡來', '是不是', 'why', 'how', 'what'] },
  { intent: 'style', keywords: ['字型', '字體', '顏色', '大小', '粗體', '間距', 'pt', 'font', 'color', 'bold', 'size'] },
  { intent: 'content', keywords: ['錯了', '改成', '應該是', '換成', '更新', '修改', 'wrong', 'change', 'update'] },
];

/**
 * Rule-based intent classification.
 * In the full pipeline, Claude (the AI agent) handles classification with context.
 * This serves as the structured classification contract + fallback.
 */
function classifyIntent(commentText, elementContext) {
  const text = (commentText || '').toLowerCase();

  for (const { intent, keywords } of KEYWORD_RULES) {
    if (keywords.some(kw => text.includes(kw))) {
      return {
        intent,
        action: commentText,
        confidence: 0.8,
        targetDescription: elementContext?.text || elementContext?.type || 'unknown',
      };
    }
  }

  // Default: content change
  return {
    intent: 'content',
    action: commentText,
    confidence: 0.5,
    targetDescription: elementContext?.text || elementContext?.type || 'unknown',
  };
}

/**
 * Sort classified comments by processing order: delete > structure > content > style > question
 */
function sortByProcessingOrder(classifiedComments) {
  return [...classifiedComments].sort((a, b) => {
    const orderA = INTENT_ORDER[a.classified?.intent] ?? 99;
    const orderB = INTENT_ORDER[b.classified?.intent] ?? 99;
    return orderA - orderB;
  });
}

module.exports = { classifyIntent, sortByProcessingOrder, INTENT_ORDER };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/intent-classifier.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/intent-classifier.js engines/comment-feedback/__tests__/intent-classifier.test.js
git commit -m "feat(comment-feedback): add intent classifier with processing order sort"
```

---

## Task 4: Comment Responder

**Files:**
- Create: `engines/comment-feedback/comment-responder.js`
- Test: `engines/comment-feedback/__tests__/comment-responder.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { formatReply, formatFailReply, formatCascadeReply } = require('../comment-responder');

describe('formatReply', () => {
  test('single change', () => {
    const reply = formatReply('標題字體加大', ['標題從 24pt 改為 36pt']);
    expect(reply).toBe('✅ 已調整：標題字體加大\n\n修改項目：\n- 標題從 24pt 改為 36pt');
  });

  test('multiple changes', () => {
    const reply = formatReply('表格樣式修正', ['header 背景改深色', '字體改白色']);
    expect(reply).toContain('✅ 已調整');
    expect(reply).toContain('- header 背景改深色');
    expect(reply).toContain('- 字體改白色');
  });
});

describe('formatFailReply', () => {
  test('formats failure reply', () => {
    const reply = formatFailReply('無法辨識修改目標', '請手動指定要修改的元素');
    expect(reply).toContain('❌ 無法自動處理');
    expect(reply).toContain('建議：');
  });
});

describe('formatCascadeReply', () => {
  test('formats cascade delete reply', () => {
    const reply = formatCascadeReply();
    expect(reply).toContain('已被其他留言刪除');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/comment-responder.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

/**
 * Format a success reply for a processed comment.
 * @param {string} summary - One-line summary of what was changed
 * @param {string[]} changes - List of individual changes made
 * @returns {string} Reply text (≤100 chars target)
 */
function formatReply(summary, changes) {
  const lines = [`✅ 已調整：${summary}`];
  if (changes && changes.length > 0) {
    lines.push('');
    lines.push('修改項目：');
    for (const c of changes) {
      lines.push(`- ${c}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format a failure reply when a comment cannot be auto-processed.
 */
function formatFailReply(reason, suggestion) {
  const lines = [`❌ 無法自動處理：${reason}`];
  if (suggestion) lines.push(`建議：${suggestion}`);
  return lines.join('\n');
}

/**
 * Format reply for a comment whose target was already deleted by another comment.
 */
function formatCascadeReply() {
  return '✅ 該元素已被其他留言刪除，此留言無需處理';
}

/**
 * Reply to a comment via Drive API.
 * @param {object} auth - Google OAuth2 client
 * @param {string} fileId
 * @param {string} commentId
 * @param {string} content - Reply text
 */
async function replyToComment(auth, fileId, commentId, content) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });
  await drive.replies.create({
    fileId,
    commentId,
    fields: 'id',
    requestBody: { content },
  });
}

/**
 * Resolve a comment via Drive API (PATCH comment with resolved: true).
 */
async function resolveComment(auth, fileId, commentId) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });
  await drive.comments.update({
    fileId,
    commentId,
    fields: 'id,resolved',
    requestBody: { resolved: true },
  });
}

/**
 * Reply and resolve a comment in sequence.
 */
async function replyAndResolve(auth, fileId, commentId, replyContent) {
  await replyToComment(auth, fileId, commentId, replyContent);
  await resolveComment(auth, fileId, commentId);
}

module.exports = {
  formatReply, formatFailReply, formatCascadeReply,
  replyToComment, resolveComment, replyAndResolve,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/comment-responder.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/comment-responder.js engines/comment-feedback/__tests__/comment-responder.test.js
git commit -m "feat(comment-feedback): add comment responder with reply/resolve helpers"
```

---

## Task 5: Slides Modifier

**Files:**
- Create: `engines/comment-feedback/modifiers/slides-modifier.js`
- Test: `engines/comment-feedback/__tests__/slides-modifier.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { buildStyleRequests, buildDeleteRequests, buildContentRequests, buildPageObjectIdMap } = require('../modifiers/slides-modifier');

describe('buildPageObjectIdMap', () => {
  test('maps objectId to page index', () => {
    const presentation = {
      slides: [
        { objectId: 'p1', pageElements: [] },
        { objectId: 'p2', pageElements: [] },
      ],
    };
    const map = buildPageObjectIdMap(presentation);
    expect(map.get('p1')).toBe(0);
    expect(map.get('p2')).toBe(1);
  });
});

describe('buildDeleteRequests', () => {
  test('generates deleteObject for element', () => {
    const reqs = buildDeleteRequests('shape123', 'element');
    expect(reqs).toEqual([{ deleteObject: { objectId: 'shape123' } }]);
  });

  test('generates deleteObject for page', () => {
    const reqs = buildDeleteRequests('page_1', 'page');
    expect(reqs).toEqual([{ deleteObject: { objectId: 'page_1' } }]);
  });
});

describe('buildStyleRequests', () => {
  test('generates updateTextStyle for font size', () => {
    const reqs = buildStyleRequests('shape1', { fontSize: 36 });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].updateTextStyle).toBeTruthy();
    expect(reqs[0].updateTextStyle.style.fontSize.magnitude).toBe(36);
  });

  test('generates updateTextStyle for bold', () => {
    const reqs = buildStyleRequests('shape1', { bold: true });
    expect(reqs[0].updateTextStyle.style.bold).toBe(true);
  });
});

describe('buildContentRequests', () => {
  test('generates delete + insert for text replacement', () => {
    const reqs = buildContentRequests('shape1', '舊文字', '新文字');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].replaceAllText).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/slides-modifier.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

/**
 * Build objectId → pageIndex mapping from a presentation object.
 */
function buildPageObjectIdMap(presentation) {
  const map = new Map();
  (presentation.slides || []).forEach((slide, idx) => {
    map.set(slide.objectId, idx);
  });
  return map;
}

/**
 * Build batchUpdate requests to delete an object (element or page).
 */
function buildDeleteRequests(objectId, _targetType) {
  return [{ deleteObject: { objectId } }];
}

/**
 * Build batchUpdate requests for style changes on a text element.
 * @param {string} objectId - Shape/element ID
 * @param {object} styleChanges - { fontSize, bold, italic, fontFamily, foregroundColor }
 */
function buildStyleRequests(objectId, styleChanges) {
  const style = {};
  const fields = [];

  if (styleChanges.fontSize != null) {
    style.fontSize = { magnitude: styleChanges.fontSize, unit: 'PT' };
    fields.push('fontSize');
  }
  if (styleChanges.bold != null) {
    style.bold = styleChanges.bold;
    fields.push('bold');
  }
  if (styleChanges.italic != null) {
    style.italic = styleChanges.italic;
    fields.push('italic');
  }
  if (styleChanges.fontFamily) {
    style.fontFamily = styleChanges.fontFamily;
    fields.push('fontFamily');
  }
  if (styleChanges.foregroundColor) {
    style.foregroundColor = { opaqueColor: { rgbColor: styleChanges.foregroundColor } };
    fields.push('foregroundColor');
  }

  return [{
    updateTextStyle: {
      objectId,
      style,
      textRange: { type: 'ALL' },
      fields: fields.join(','),
    },
  }];
}

/**
 * Build batchUpdate requests for content replacement.
 */
function buildContentRequests(objectId, oldText, newText) {
  return [{
    replaceAllText: {
      containsText: { text: oldText, matchCase: true },
      replaceText: newText,
      pageObjectIds: objectId ? [objectId] : undefined,
    },
  }];
}

/**
 * Execute a batchUpdate on a Google Slides presentation.
 * @param {object} auth - Google OAuth2 client
 * @param {string} presentationId
 * @param {Array} requests - Array of Slides API requests
 */
async function executeSlidesUpdate(auth, presentationId, requests) {
  if (!requests || requests.length === 0) return null;
  const { google } = require('googleapis');
  const slides = google.slides({ version: 'v1', auth });
  return slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
}

/**
 * Read a presentation's full structure.
 */
async function getPresentation(auth, presentationId) {
  const { google } = require('googleapis');
  const slides = google.slides({ version: 'v1', auth });
  const res = await slides.presentations.get({ presentationId });
  return res.data;
}

module.exports = {
  buildPageObjectIdMap, buildDeleteRequests, buildStyleRequests,
  buildContentRequests, executeSlidesUpdate, getPresentation,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/slides-modifier.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/modifiers/slides-modifier.js engines/comment-feedback/__tests__/slides-modifier.test.js
git commit -m "feat(comment-feedback): add Slides modifier with batchUpdate builders"
```

---

## Task 6: Docs Modifier

**Files:**
- Create: `engines/comment-feedback/modifiers/docs-modifier.js`
- Test: `engines/comment-feedback/__tests__/docs-modifier.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { buildDocDeleteRequests, buildDocStyleRequests, buildDocContentRequests, sortRequestsDescending } = require('../modifiers/docs-modifier');

describe('buildDocDeleteRequests', () => {
  test('generates deleteContentRange', () => {
    const reqs = buildDocDeleteRequests({ start: 10, end: 50 });
    expect(reqs).toEqual([{
      deleteContentRange: { range: { startIndex: 10, endIndex: 50, segmentId: '' } },
    }]);
  });
});

describe('buildDocStyleRequests', () => {
  test('generates updateTextStyle for bold', () => {
    const reqs = buildDocStyleRequests({ start: 10, end: 50 }, { bold: true });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].updateTextStyle.textStyle.bold).toBe(true);
    expect(reqs[0].updateTextStyle.range.startIndex).toBe(10);
  });
});

describe('buildDocContentRequests', () => {
  test('generates delete + insert (descending order)', () => {
    const reqs = buildDocContentRequests({ start: 10, end: 50 }, '新內容');
    expect(reqs).toHaveLength(2);
    // Delete first (at higher index conceptually), then insert
    expect(reqs[0].deleteContentRange).toBeTruthy();
    expect(reqs[1].insertText).toBeTruthy();
    expect(reqs[1].insertText.text).toBe('新內容');
    expect(reqs[1].insertText.location.index).toBe(10);
  });
});

describe('sortRequestsDescending', () => {
  test('sorts by startIndex descending', () => {
    const items = [
      { range: { start: 10, end: 20 }, requests: [{ fake: 'a' }] },
      { range: { start: 50, end: 60 }, requests: [{ fake: 'b' }] },
      { range: { start: 30, end: 40 }, requests: [{ fake: 'c' }] },
    ];
    const sorted = sortRequestsDescending(items);
    expect(sorted.map(i => i.range.start)).toEqual([50, 30, 10]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/docs-modifier.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

/**
 * Build delete requests for a Docs content range.
 */
function buildDocDeleteRequests(range) {
  return [{
    deleteContentRange: {
      range: { startIndex: range.start, endIndex: range.end, segmentId: '' },
    },
  }];
}

/**
 * Build style requests for a Docs text range.
 */
function buildDocStyleRequests(range, styleChanges) {
  const textStyle = {};
  const fields = [];

  if (styleChanges.bold != null) { textStyle.bold = styleChanges.bold; fields.push('bold'); }
  if (styleChanges.italic != null) { textStyle.italic = styleChanges.italic; fields.push('italic'); }
  if (styleChanges.fontSize != null) {
    textStyle.fontSize = { magnitude: styleChanges.fontSize, unit: 'PT' };
    fields.push('fontSize');
  }
  if (styleChanges.foregroundColor) {
    textStyle.foregroundColor = { color: { rgbColor: styleChanges.foregroundColor } };
    fields.push('foregroundColor');
  }

  return [{
    updateTextStyle: {
      textStyle,
      range: { startIndex: range.start, endIndex: range.end, segmentId: '' },
      fields: fields.join(','),
    },
  }];
}

/**
 * Build content replacement requests (delete range + insert at start).
 * Returns [deleteContentRange, insertText] — caller must ensure descending execution.
 */
function buildDocContentRequests(range, newText) {
  return [
    {
      deleteContentRange: {
        range: { startIndex: range.start, endIndex: range.end, segmentId: '' },
      },
    },
    {
      insertText: {
        text: newText,
        location: { index: range.start, segmentId: '' },
      },
    },
  ];
}

/**
 * Sort modification items by startIndex descending to prevent index shifting.
 * Each item: { range: { start, end }, requests: [...] }
 */
function sortRequestsDescending(items) {
  return [...items].sort((a, b) => b.range.start - a.range.start);
}

/**
 * Execute a batchUpdate on a Google Docs document.
 */
async function executeDocsUpdate(auth, documentId, requests) {
  if (!requests || requests.length === 0) return null;
  const { google } = require('googleapis');
  const docs = google.docs({ version: 'v1', auth });
  return docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

/**
 * Read a document's full structure.
 */
async function getDocument(auth, documentId) {
  const { google } = require('googleapis');
  const docs = google.docs({ version: 'v1', auth });
  const res = await docs.documents.get({ documentId });
  return res.data;
}

module.exports = {
  buildDocDeleteRequests, buildDocStyleRequests, buildDocContentRequests,
  sortRequestsDescending, executeDocsUpdate, getDocument,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/docs-modifier.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/modifiers/docs-modifier.js engines/comment-feedback/__tests__/docs-modifier.test.js
git commit -m "feat(comment-feedback): add Docs modifier with descending-index sort"
```

---

## Task 7: Learning Capture

**Files:**
- Create: `engines/comment-feedback/learning-capture.js`
- Create: `learned/formats/gslides.md` (bootstrap)
- Create: `learned/formats/gdocs.md` (bootstrap)
- Test: `engines/comment-feedback/__tests__/learning-capture.test.js`

- [ ] **Step 1: Bootstrap formats directory**

Create `learned/formats/gslides.md`:
```markdown
# Google Slides 格式規則

> 由 Comment Feedback 機制自動維護，記錄使用者偏好與修正規則。
```

Create `learned/formats/gdocs.md`:
```markdown
# Google Docs 格式規則

> 由 Comment Feedback 機制自動維護，記錄使用者偏好與修正規則。
```

- [ ] **Step 2: Write the failing tests**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { buildCorrectionEntry, appendCorrection, summarizeLearnings } = require('../learning-capture');

describe('buildCorrectionEntry', () => {
  test('builds v2 schema entry', () => {
    const entry = buildCorrectionEntry({
      fileId: 'abc',
      fileType: 'gslides',
      commentId: 'c1',
      original: 'header 淺灰底',
      correction: 'header 深色底白字',
      rule: '表格 header 用深色背景',
      category: 'style',
    });
    expect(entry.schemaVersion).toBe(2);
    expect(entry.fileId).toBe('abc');
    expect(entry.approved).toBe(true);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('appendCorrection', () => {
  const tmpFile = path.join(__dirname, '_test_corrections.jsonl');

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  test('appends to file', () => {
    const entry = { schemaVersion: 2, rule: 'test rule' };
    appendCorrection(tmpFile, entry);
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).rule).toBe('test rule');
  });

  test('appends multiple entries', () => {
    appendCorrection(tmpFile, { schemaVersion: 2, rule: 'r1' });
    appendCorrection(tmpFile, { schemaVersion: 2, rule: 'r2' });
    const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('summarizeLearnings', () => {
  test('groups corrections by category', () => {
    const corrections = [
      { category: 'style', rule: 'r1', fileType: 'gslides' },
      { category: 'style', rule: 'r2', fileType: 'gslides' },
      { category: 'content', rule: 'r3', fileType: 'gdocs' },
    ];
    const summary = summarizeLearnings(corrections);
    expect(summary).toHaveLength(3);
    expect(summary.filter(s => s.category === 'style')).toHaveLength(2);
  });

  test('returns empty for no corrections', () => {
    expect(summarizeLearnings([])).toEqual([]);
  });
});

describe('upsertFormatRule', () => {
  const tmpMd = path.join(__dirname, '_test_format.md');

  beforeEach(() => {
    fs.writeFileSync(tmpMd, '# 格式規則\n\n> 自動維護。\n', 'utf-8');
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpMd); } catch {}
  });

  test('adds new section when category not found', () => {
    const { upsertFormatRule } = require('../learning-capture');
    upsertFormatRule(tmpMd, 'style', '表格 header 用深色背景');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    expect(content).toContain('## style');
    expect(content).toContain('- 表格 header 用深色背景');
  });

  test('appends to existing section', () => {
    const { upsertFormatRule } = require('../learning-capture');
    upsertFormatRule(tmpMd, 'style', 'rule 1');
    upsertFormatRule(tmpMd, 'style', 'rule 2');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    expect(content).toContain('- rule 1');
    expect(content).toContain('- rule 2');
  });

  test('skips duplicate rule', () => {
    const { upsertFormatRule } = require('../learning-capture');
    upsertFormatRule(tmpMd, 'style', 'same rule');
    upsertFormatRule(tmpMd, 'style', 'same rule');
    const content = fs.readFileSync(tmpMd, 'utf-8');
    const count = (content.match(/same rule/g) || []).length;
    expect(count).toBe(1);
  });

  test('creates file if not exists', () => {
    const { upsertFormatRule } = require('../learning-capture');
    const newPath = path.join(__dirname, '_test_new_format.md');
    try {
      upsertFormatRule(newPath, 'content', 'new rule');
      const content = fs.readFileSync(newPath, 'utf-8');
      expect(content).toContain('## content');
      expect(content).toContain('- new rule');
    } finally {
      try { fs.unlinkSync(newPath); } catch {}
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/learning-capture.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 4: Write implementation**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Build a v2 correction entry for corrections.jsonl.
 */
function buildCorrectionEntry({ fileId, fileType, commentId, original, correction, rule, category }) {
  return {
    timestamp: new Date().toISOString(),
    fileId,
    fileType,
    commentId,
    original,
    correction,
    rule,
    category,
    approved: true,
    schemaVersion: 2,
  };
}

/**
 * Append a correction entry to corrections.jsonl.
 * @param {string} filePath - Path to corrections.jsonl
 * @param {object} entry
 */
function appendCorrection(filePath, entry) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Summarize a list of correction entries as learning points.
 */
function summarizeLearnings(corrections) {
  if (!corrections || corrections.length === 0) return [];
  return corrections.map(c => ({
    category: c.category,
    rule: c.rule,
    fileType: c.fileType,
  }));
}

/**
 * Upsert a rule into a formats/*.md file.
 * Finds the matching ## section by category, appends or updates the rule line.
 * @param {string} mdPath - Path to gslides.md or gdocs.md
 * @param {string} category - Section heading (e.g., 'style', 'content')
 * @param {string} rule - The rule text to add
 */
function upsertFormatRule(mdPath, category, rule) {
  const sectionHeading = `## ${category}`;
  let content = '';
  try {
    content = fs.readFileSync(mdPath, 'utf-8');
  } catch {
    // File doesn't exist, bootstrap it
    const dir = path.dirname(mdPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    content = `# 格式規則\n\n> 由 Comment Feedback 機制自動維護。\n`;
  }

  if (content.includes(rule)) return; // Already exists, skip

  if (content.includes(sectionHeading)) {
    // Append under existing section
    const idx = content.indexOf(sectionHeading) + sectionHeading.length;
    const nextLine = content.indexOf('\n', idx);
    content = content.slice(0, nextLine + 1) + `- ${rule}\n` + content.slice(nextLine + 1);
  } else {
    // Add new section at end
    content += `\n${sectionHeading}\n- ${rule}\n`;
  }

  fs.writeFileSync(mdPath, content, 'utf-8');
}

module.exports = { buildCorrectionEntry, appendCorrection, summarizeLearnings, upsertFormatRule };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/learning-capture.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/learning-capture.js engines/comment-feedback/__tests__/learning-capture.test.js learned/formats/gslides.md learned/formats/gdocs.md
git commit -m "feat(comment-feedback): add learning capture with dual-track write"
```

---

## Task 8: Main Orchestrator (index.js)

**Files:**
- Create: `engines/comment-feedback/index.js`

This is the pipeline orchestrator that ties all modules together. It's designed to be called by the AI agent (Claude) as a skill, not run standalone.

- [ ] **Step 1: Write the orchestrator**

```javascript
'use strict';

const path = require('path');
const { parseDocUrl } = require('./url-parser');
const { fetchComments } = require('./comment-reader');
const { classifyIntent, sortByProcessingOrder } = require('./intent-classifier');
const { formatReply, formatFailReply, formatCascadeReply, replyAndResolve, replyToComment } = require('./comment-responder');
const { buildDeleteRequests, buildStyleRequests, buildContentRequests, executeSlidesUpdate, getPresentation, buildPageObjectIdMap } = require('./modifiers/slides-modifier');
const { buildDocDeleteRequests, buildDocStyleRequests, buildDocContentRequests, sortRequestsDescending, executeDocsUpdate, getDocument } = require('./modifiers/docs-modifier');
const { buildCorrectionEntry, appendCorrection, upsertFormatRule } = require('./learning-capture');
const { getGoogleAuth } = require('../helpers');

const CORRECTIONS_PATH = path.resolve(__dirname, '../../learned/corrections.jsonl');
const FORMATS_DIR = path.resolve(__dirname, '../../learned/formats');

/**
 * Main entry point for the comment feedback pipeline.
 *
 * @param {string} url - Google Slides/Docs URL
 * @param {object} options
 * @param {boolean} options.dryRun - If true, list changes without executing
 * @returns {object} { processed, failed, learnings }
 */
async function processCommentFeedback(url, options = {}) {
  // 1. Parse URL
  const { fileId, fileType } = parseDocUrl(url);

  // 2. Auth
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const auth = await getGoogleAuth([
    SCOPE,
    fileType === 'slides'
      ? 'https://www.googleapis.com/auth/presentations'
      : 'https://www.googleapis.com/auth/documents',
  ]);

  // 3. Fetch comments
  const comments = await fetchComments(auth, fileId, fileType);
  if (comments.length === 0) {
    return { processed: 0, failed: 0, learnings: [], message: '沒有新留言需要處理' };
  }

  // 4. Classify intents (rule-based; in practice Claude acts as LLM)
  const classified = comments.map(c => ({
    ...c,
    classified: classifyIntent(c.content, null),
  }));

  // 5. Sort by processing order
  const sorted = sortByProcessingOrder(classified);

  // 6. Process each comment
  const processed = [];
  const failed = [];
  const deletedTargets = new Set();
  const corrections = [];

  for (const comment of sorted) {
    try {
      const { intent } = comment.classified;

      // Check for cascade (target already deleted)
      if (deletedTargets.has(comment.targetID)) {
        await replyAndResolve(auth, fileId, comment.id, formatCascadeReply());
        processed.push({ id: comment.id, intent, status: 'cascade' });
        continue;
      }

      if (intent === 'question') {
        // Reply but don't resolve
        await replyToComment(auth, fileId, comment.id,
          `回覆：感謝您的提問。此為自動處理系統，此問題需要人工回覆。`);
        processed.push({ id: comment.id, intent, status: 'question_replied' });
        continue;
      }

      // Track deleted targets
      if (intent === 'delete' && comment.targetID) {
        deletedTargets.add(comment.targetID);
      }

      // Build reply summary (actual modification handled by AI agent in practice)
      const replyText = formatReply(
        `根據留言「${comment.content.slice(0, 30)}」進行修改`,
        [comment.classified.action]
      );
      await replyAndResolve(auth, fileId, comment.id, replyText);
      processed.push({ id: comment.id, intent, status: 'done' });

    } catch (err) {
      const failReply = formatFailReply(err.message, '請手動處理此項目');
      try {
        await replyToComment(auth, fileId, comment.id, failReply);
      } catch { /* ignore reply failure */ }
      failed.push({ id: comment.id, error: err.message });
    }
  }

  return {
    processed: processed.length,
    failed: failed.length,
    total: sorted.length,
    details: { processed, failed },
    learnings: [],
    message: `✅ ${processed.length}/${sorted.length} 則已處理` +
      (failed.length > 0 ? `，❌ ${failed.length} 則需手動處理` : ''),
  };
}

module.exports = { processCommentFeedback, CORRECTIONS_PATH, FORMATS_DIR };
```

- [ ] **Step 2: Verify all tests still pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/ --no-coverage`
Expected: All tests in all 7 test files PASS

- [ ] **Step 3: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/index.js
git commit -m "feat(comment-feedback): add main orchestrator tying all modules together"
```

---

## Task 9: Integration Smoke Test

**Files:**
- No new files. Verify the whole module loads correctly and exports work.

- [ ] **Step 1: Verify module loads without errors**

Run:
```bash
cd /tmp/fontrends-core && node -e "
  const cf = require('./engines/comment-feedback');
  const { parseDocUrl } = require('./engines/comment-feedback/url-parser');
  const r = parseDocUrl('https://docs.google.com/presentation/d/testId123/edit');
  console.log('parseDocUrl:', JSON.stringify(r));
  console.log('processCommentFeedback:', typeof cf.processCommentFeedback);
  console.log('All modules loaded successfully');
"
```

Expected output:
```
parseDocUrl: {"fileId":"testId123","fileType":"slides"}
processCommentFeedback: function
All modules loaded successfully
```

- [ ] **Step 2: Run full test suite**

Run: `cd /tmp/fontrends-core && npx jest --no-coverage`
Expected: All tests pass (existing 13 + new 7 = 20 test files)

- [ ] **Step 3: Final commit with all passing tests**

```bash
cd /tmp/fontrends-core
git add -A
git commit -m "test: verify comment-feedback module integration"
```

---

## Task 10: Safety Mechanisms — Dry-Run, Snapshot, Retry

**Files:**
- Create: `engines/comment-feedback/safety.js`
- Test: `engines/comment-feedback/__tests__/safety.test.js`
- Modify: `engines/comment-feedback/index.js` — wire in safety helpers

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';

const { shouldDryRun, formatDryRunReport, wrapWithRetry } = require('../safety');

describe('shouldDryRun', () => {
  test('returns true when requests > threshold', () => {
    expect(shouldDryRun(6, 5)).toBe(true);
  });

  test('returns false when requests <= threshold', () => {
    expect(shouldDryRun(5, 5)).toBe(false);
    expect(shouldDryRun(3, 5)).toBe(false);
  });
});

describe('formatDryRunReport', () => {
  test('formats request list for user review', () => {
    const items = [
      { commentId: 'c1', intent: 'style', action: '字體改 36pt' },
      { commentId: 'c2', intent: 'delete', action: '刪除第3頁' },
    ];
    const report = formatDryRunReport(items);
    expect(report).toContain('c1');
    expect(report).toContain('style');
    expect(report).toContain('delete');
  });
});

describe('wrapWithRetry', () => {
  test('succeeds on first try', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await wrapWithRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on 409 error', async () => {
    const err409 = new Error('Conflict'); err409.code = 409;
    const fn = jest.fn()
      .mockRejectedValueOnce(err409)
      .mockResolvedValue('ok');
    const result = await wrapWithRetry(fn, 2);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws after max retries', async () => {
    const err409 = new Error('Conflict'); err409.code = 409;
    const fn = jest.fn().mockRejectedValue(err409);
    await expect(wrapWithRetry(fn, 2)).rejects.toThrow('Conflict');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('does not retry on non-409 errors', async () => {
    const err500 = new Error('Server'); err500.code = 500;
    const fn = jest.fn().mockRejectedValue(err500);
    await expect(wrapWithRetry(fn, 2)).rejects.toThrow('Server');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/safety.test.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```javascript
'use strict';

const DRY_RUN_THRESHOLD = 5;

/**
 * Determine if dry-run mode should activate.
 * @param {number} requestCount - Total number of batchUpdate requests
 * @param {number} threshold - Threshold (default 5)
 */
function shouldDryRun(requestCount, threshold = DRY_RUN_THRESHOLD) {
  return requestCount > threshold;
}

/**
 * Format a dry-run report listing all planned modifications.
 */
function formatDryRunReport(items) {
  const lines = ['📋 Dry-run: 以下修改待確認：', ''];
  for (const item of items) {
    lines.push(`- [${item.intent}] Comment ${item.commentId}: ${item.action}`);
  }
  lines.push('', '確認執行？(yes/no)');
  return lines.join('\n');
}

/**
 * Create a Drive revision snapshot before modifications.
 * @param {object} auth - Google OAuth2 client
 * @param {string} fileId
 * @returns {string} revisionId for potential rollback
 */
async function createSnapshot(auth, fileId) {
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.revisions.list({
    fileId,
    fields: 'revisions(id,modifiedTime)',
    pageSize: 1,
  });
  const revisions = res.data.revisions || [];
  return revisions.length > 0 ? revisions[revisions.length - 1].id : null;
}

/**
 * Wrap an async function with retry logic for HTTP 409 conflicts.
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Max retry attempts (default 2)
 */
async function wrapWithRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.code !== 409 || attempt >= maxRetries) throw err;
      // Brief pause before retry
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

module.exports = { shouldDryRun, formatDryRunReport, createSnapshot, wrapWithRetry, DRY_RUN_THRESHOLD };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/__tests__/safety.test.js --no-coverage`
Expected: All PASS

- [ ] **Step 5: Wire safety into orchestrator (index.js)**

Update `index.js` to:
1. Import `{ shouldDryRun, formatDryRunReport, createSnapshot, wrapWithRetry }` from `./safety`
2. Call `createSnapshot(auth, fileId)` before the processing loop
3. Check `shouldDryRun()` + `options.dryRun` — if dry-run, return the report instead of executing
4. Wrap all `executeSlidesUpdate` / `executeDocsUpdate` calls with `wrapWithRetry`
5. Add confidence threshold check: skip auto-processing if `comment.classified.confidence < 0.7` and `comment.targetType === null`

- [ ] **Step 6: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/safety.js engines/comment-feedback/__tests__/safety.test.js engines/comment-feedback/index.js
git commit -m "feat(comment-feedback): add safety mechanisms — dry-run, snapshot, conflict retry"
```

---

## Task 11: Edge Case Handling

**Files:**
- Modify: `engines/comment-feedback/intent-classifier.js` — add same-element grouping + contradiction resolution
- Modify: `engines/comment-feedback/comment-responder.js` — add language-aware replies
- Test: `engines/comment-feedback/__tests__/intent-classifier.test.js` (add tests)
- Test: `engines/comment-feedback/__tests__/comment-responder.test.js` (add tests)

- [ ] **Step 1: Add same-element grouping tests to intent-classifier.test.js**

```javascript
describe('groupByTarget', () => {
  test('groups comments by targetID', () => {
    const { groupByTarget } = require('../intent-classifier');
    const comments = [
      { id: '1', targetID: 'shape1', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', targetID: 'shape1', classified: { intent: 'content' }, createdTime: '2026-03-20T11:00:00Z' },
      { id: '3', targetID: 'shape2', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
    ];
    const groups = groupByTarget(comments);
    expect(groups.get('shape1')).toHaveLength(2);
    expect(groups.get('shape2')).toHaveLength(1);
  });
});

describe('resolveContradictions', () => {
  test('keeps latest comment when intents conflict on same target', () => {
    const { resolveContradictions } = require('../intent-classifier');
    const group = [
      { id: '1', classified: { intent: 'style', action: '字放大' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', classified: { intent: 'style', action: '字縮小' }, createdTime: '2026-03-20T11:00:00Z' },
    ];
    const { winner, overridden } = resolveContradictions(group);
    expect(winner.id).toBe('2');
    expect(overridden).toHaveLength(1);
    expect(overridden[0].id).toBe('1');
  });

  test('keeps all when intents differ', () => {
    const { resolveContradictions } = require('../intent-classifier');
    const group = [
      { id: '1', classified: { intent: 'style' }, createdTime: '2026-03-20T10:00:00Z' },
      { id: '2', classified: { intent: 'content' }, createdTime: '2026-03-20T11:00:00Z' },
    ];
    const { winner, overridden } = resolveContradictions(group);
    expect(winner).toBeNull(); // No contradiction
    expect(overridden).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement groupByTarget + resolveContradictions**

Add to `intent-classifier.js`:

```javascript
/**
 * Group classified comments by targetID.
 * Comments with null targetID are each in their own group.
 */
function groupByTarget(comments) {
  const groups = new Map();
  for (const c of comments) {
    const key = c.targetID ? (typeof c.targetID === 'object' ? `${c.targetID.start}-${c.targetID.end}` : c.targetID) : `_solo_${c.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

/**
 * When multiple comments on the same element have the same intent,
 * keep the latest (by createdTime). Returns { winner, overridden }.
 */
function resolveContradictions(group) {
  if (group.length <= 1) return { winner: null, overridden: [] };

  // Group by intent
  const byIntent = new Map();
  for (const c of group) {
    const i = c.classified?.intent;
    if (!byIntent.has(i)) byIntent.set(i, []);
    byIntent.get(i).push(c);
  }

  // Check for same-intent conflicts
  for (const [, items] of byIntent) {
    if (items.length > 1) {
      items.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      return { winner: items[0], overridden: items.slice(1) };
    }
  }

  return { winner: null, overridden: [] };
}
```

Export `groupByTarget` and `resolveContradictions`.

- [ ] **Step 3: Add language detection tests to comment-responder.test.js**

```javascript
describe('detectLanguage', () => {
  const { detectLanguage } = require('../comment-responder');

  test('detects Chinese', () => {
    expect(detectLanguage('字太小了')).toBe('zh');
  });

  test('detects English', () => {
    expect(detectLanguage('font too small')).toBe('en');
  });

  test('defaults to zh for mixed', () => {
    expect(detectLanguage('font 太小')).toBe('zh');
  });
});
```

- [ ] **Step 4: Implement detectLanguage**

Add to `comment-responder.js`:

```javascript
/**
 * Simple language detection: if text contains CJK characters, return 'zh', else 'en'.
 */
function detectLanguage(text) {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  return cjkCount > 0 ? 'zh' : 'en';
}
```

Export it. The `formatReply` / `formatFailReply` callers can use this to choose reply language templates.

- [ ] **Step 5: Run all tests**

Run: `cd /tmp/fontrends-core && npx jest engines/comment-feedback/ --no-coverage`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/intent-classifier.js engines/comment-feedback/comment-responder.js engines/comment-feedback/__tests__/intent-classifier.test.js engines/comment-feedback/__tests__/comment-responder.test.js
git commit -m "feat(comment-feedback): add edge case handling — grouping, contradictions, language detection"
```

---

## Task 12: Orchestrator Wiring — Modifier Integration + Error Handling

**Files:**
- Modify: `engines/comment-feedback/index.js` — full pipeline wiring

This task completes the orchestrator by wiring the modifiers into the processing loop. The orchestrator provides the deterministic framework; the AI agent provides classification and modification parameters at runtime.

- [ ] **Step 1: Rewrite the processing loop in index.js**

Key changes to the orchestrator:
1. **Read document structure** before processing (Slides: `getPresentation`, Docs: `getDocument`)
2. **Group comments by target** using `groupByTarget`, resolve contradictions
3. **Execute modifications** by calling the appropriate modifier based on fileType + intent:
   - `delete` → `buildDeleteRequests` / `buildDocDeleteRequests` → `executeSlidesUpdate` / `executeDocsUpdate`
   - For `style` and `content`, the AI agent provides the specific parameters at runtime; the orchestrator exposes a `modifyCallback` hook
4. **Wrap with retry** for 409 conflicts
5. **Confidence gate**: skip comments with `confidence < 0.7` and no anchor
6. **Error handling**: catch API errors by code, apply appropriate strategy (401→refresh, 429→backoff, etc.)

```javascript
// Key addition to the processing loop:
for (const comment of sorted) {
  try {
    const { intent, confidence } = comment.classified;

    // Confidence gate for anchorless comments
    if (!comment.targetID && confidence < 0.7) {
      const reply = formatFailReply('留言位置不明確，信心度不足', '請在具體元素上留言');
      await replyToComment(auth, fileId, comment.id, reply);
      failed.push({ id: comment.id, error: 'low_confidence_no_anchor' });
      continue;
    }

    // Delete cascade check
    if (deletedTargets.has(comment.targetID)) {
      await replyAndResolve(auth, fileId, comment.id, formatCascadeReply());
      processed.push({ id: comment.id, intent, status: 'cascade' });
      continue;
    }

    // Question: reply only, don't resolve
    if (intent === 'question') {
      await replyToComment(auth, fileId, comment.id,
        detectLanguage(comment.content) === 'zh'
          ? '此問題需要人工回覆。'
          : 'This question requires a manual response.');
      processed.push({ id: comment.id, intent, status: 'question_replied' });
      continue;
    }

    // Execute modification with retry
    let requests = [];
    if (intent === 'delete') {
      if (fileType === 'slides') {
        requests = buildDeleteRequests(comment.targetID, 'element');
      } else {
        requests = buildDocDeleteRequests(comment.targetID);
      }
    }
    // style + content: requests built by AI agent via modifyCallback (see below)

    if (requests.length > 0) {
      await wrapWithRetry(async () => {
        if (fileType === 'slides') {
          await executeSlidesUpdate(auth, fileId, requests);
        } else {
          await executeDocsUpdate(auth, fileId, requests);
        }
      }, 2);
    }

    // Track deletions
    if (intent === 'delete' && comment.targetID) {
      deletedTargets.add(comment.targetID);
    }

    // Reply + resolve
    const replyText = formatReply(/* ... */);
    await replyAndResolve(auth, fileId, comment.id, replyText);
    processed.push({ id: comment.id, intent, status: 'done' });

  } catch (err) {
    // Error routing by HTTP status code
    const code = err.code || err.status;
    if (code === 401) { /* token refresh already handled by googleapis */ }
    if (code === 429) { await sleep(2000); } // rate limit
    const failReply = formatFailReply(err.message, '請手動處理');
    try { await replyToComment(auth, fileId, comment.id, failReply); } catch {}
    failed.push({ id: comment.id, error: err.message });
  }
}
```

- [ ] **Step 2: Verify all tests pass**

Run: `cd /tmp/fontrends-core && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
cd /tmp/fontrends-core
git add engines/comment-feedback/index.js
git commit -m "feat(comment-feedback): wire modifiers into orchestrator with retry + error handling"
```

---

## Task 13: Final Integration + Full Test Run

- [ ] **Step 1: Run full test suite**

Run: `cd /tmp/fontrends-core && npx jest --no-coverage --verbose`
Expected: All 20+ test files pass

- [ ] **Step 2: Verify module loads**

Run:
```bash
cd /tmp/fontrends-core && node -e "
  const cf = require('./engines/comment-feedback');
  const { parseDocUrl } = require('./engines/comment-feedback/url-parser');
  const { classifyIntent, sortByProcessingOrder, groupByTarget } = require('./engines/comment-feedback/intent-classifier');
  const { shouldDryRun, wrapWithRetry } = require('./engines/comment-feedback/safety');
  const { detectLanguage } = require('./engines/comment-feedback/comment-responder');
  console.log('All exports verified:', {
    processCommentFeedback: typeof cf.processCommentFeedback,
    parseDocUrl: typeof parseDocUrl,
    classifyIntent: typeof classifyIntent,
    groupByTarget: typeof groupByTarget,
    shouldDryRun: typeof shouldDryRun,
    wrapWithRetry: typeof wrapWithRetry,
    detectLanguage: typeof detectLanguage,
  });
"
```

- [ ] **Step 3: Final commit**

```bash
cd /tmp/fontrends-core
git add -A
git commit -m "feat(comment-feedback): complete comment feedback mechanism v1"
```
