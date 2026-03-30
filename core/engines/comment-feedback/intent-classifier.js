'use strict';

const INTENT_ORDER = { delete: 0, new_report: 1, structure: 2, enrich: 3, content: 4, style: 5, question: 6 };

const KEYWORD_RULES = [
  // 需要產出新報告的意圖
  { intent: 'new_report', keywords: ['換成', '改成英文', '英文版', '換品牌', '改時間範圍', '最近', '改成最近', '換語言', 'english version'] },
  // 刪除
  { intent: 'delete', keywords: ['刪掉', '刪除', '移除', '拿掉', 'remove', 'delete'] },
  // 結構變更
  { intent: 'structure', keywords: ['移到', '搬到', '加一章', '加一頁', '新增頁', '調換', '順序', 'move', 'reorder'] },
  // 內容加深/補充（籠統性的品質提升要求）
  { intent: 'enrich', keywords: ['更具體', '更有深度', '多一點', '加深', '補充', '怪怪的', '不夠', '太淺', '重寫', '截圖', '圖表', '趨勢圖', '多分析'] },
  // 問題
  { intent: 'question', keywords: ['？', '?', '為什麼', '哪裡來', '是不是', 'why', 'how', 'what'] },
  // 樣式
  { intent: 'style', keywords: ['字型', '字體', '顏色', '大小', '粗體', '間距', 'pt', 'font', 'color', 'bold', 'size'] },
  // 明確的內容修正
  { intent: 'content', keywords: ['錯了', '改成', '應該是', '更新', '修改', 'wrong', 'change', 'update'] },
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
