'use strict';

const INTENT_ORDER = { delete: 0, structure: 1, content: 2, style: 3, question: 4 };

const KEYWORD_RULES = [
  { intent: 'delete', keywords: ['刪掉', '刪除', '移除', '拿掉', 'remove', 'delete'] },
  { intent: 'structure', keywords: ['移到', '搬到', '加一頁', '新增頁', '調換', '順序', 'move', 'reorder'] },
  { intent: 'question', keywords: ['？', '?', '為什麼', '哪裡來', '是不是', 'why', 'how', 'what'] },
  { intent: 'style', keywords: ['字型', '字體', '顏色', '大小', '粗體', '間距', 'pt', 'font', 'color', 'bold', 'size'] },
  { intent: 'content', keywords: ['錯了', '改成', '應該是', '換成', '更新', '修改', 'wrong', 'change', 'update'] },
];

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

  return {
    intent: 'content',
    action: commentText,
    confidence: 0.5,
    targetDescription: elementContext?.text || elementContext?.type || 'unknown',
  };
}

function sortByProcessingOrder(classifiedComments) {
  return [...classifiedComments].sort((a, b) => {
    const orderA = INTENT_ORDER[a.classified?.intent] ?? 99;
    const orderB = INTENT_ORDER[b.classified?.intent] ?? 99;
    return orderA - orderB;
  });
}

function groupByTarget(comments) {
  const groups = new Map();
  for (const c of comments) {
    const key = c.targetID ? (typeof c.targetID === 'object' ? `${c.targetID.start}-${c.targetID.end}` : c.targetID) : `_solo_${c.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return groups;
}

function resolveContradictions(group) {
  if (group.length <= 1) return { winner: null, overridden: [] };

  const byIntent = new Map();
  for (const c of group) {
    const i = c.classified?.intent;
    if (!byIntent.has(i)) byIntent.set(i, []);
    byIntent.get(i).push(c);
  }

  for (const [, items] of byIntent) {
    if (items.length > 1) {
      items.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      return { winner: items[0], overridden: items.slice(1) };
    }
  }

  return { winner: null, overridden: [] };
}

module.exports = { classifyIntent, sortByProcessingOrder, INTENT_ORDER, groupByTarget, resolveContradictions };
