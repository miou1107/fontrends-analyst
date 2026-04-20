'use strict';

// Intent Classifier — L3 Engine
// 所有規則 / 關鍵字 / 門檻從 knowledge snapshot 讀取。
// 詳見 openspec/specs/knowledge-layer/spec.md

function classifyIntent(commentText, elementContext, snapshot) {
  assertSnapshot(snapshot);

  const text = (commentText || '').toLowerCase();
  const intents = snapshot.get('keywords.intents');
  const confidenceHigh = snapshot.get('thresholds.intent_classification.confidence_high');
  const confidenceLow = snapshot.get('thresholds.intent_classification.confidence_low');
  const classificationOrder = snapshot.get('thresholds.intent_classification.classification_order');

  // 依 classification_order 檢查，命中即回（保持和舊 code 完全相同的優先序）
  for (const intent of classificationOrder) {
    const keywords = intents[intent]?.keywords || [];
    if (keywords.some(kw => text.includes(kw))) {
      return {
        intent,
        action: commentText,
        confidence: confidenceHigh,
        targetDescription: elementContext?.text || elementContext?.type || 'unknown',
      };
    }
  }

  return {
    intent: 'content',
    action: commentText,
    confidence: confidenceLow,
    targetDescription: elementContext?.text || elementContext?.type || 'unknown',
  };
}

function sortByProcessingOrder(classifiedComments, snapshot) {
  assertSnapshot(snapshot);
  const order = snapshot.get('thresholds.intent_classification.processing_order');
  return [...classifiedComments].sort((a, b) => {
    const orderA = order[a.classified?.intent] ?? 99;
    const orderB = order[b.classified?.intent] ?? 99;
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

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.get !== 'function') {
    throw new Error('[intent-classifier] snapshot required — engines must receive knowledge snapshot from loader');
  }
}

module.exports = { classifyIntent, sortByProcessingOrder, groupByTarget, resolveContradictions };
