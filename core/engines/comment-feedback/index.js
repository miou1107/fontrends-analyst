'use strict';

const path = require('path');
const { parseDocUrl } = require('./url-parser');
const { fetchComments } = require('./comment-reader');
const { classifyIntent, sortByProcessingOrder, groupByTarget, resolveContradictions } = require('./intent-classifier');
const { formatReply, formatFailReply, formatCascadeReply, replyAndResolve, replyToComment, detectLanguage } = require('./comment-responder');
const { buildDeleteRequests, buildStyleRequests, buildContentRequests, executeSlidesUpdate, getPresentation, buildPageObjectIdMap } = require('./modifiers/slides-modifier');
const { buildDocDeleteRequests, buildDocStyleRequests, buildDocContentRequests, sortRequestsDescending, executeDocsUpdate, getDocument } = require('./modifiers/docs-modifier');
const { buildCorrectionEntry, appendCorrection, upsertFormatRule } = require('./learning-capture');
const { shouldDryRun, formatDryRunReport, createSnapshot, wrapWithRetry } = require('./safety');
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

  // 5. Group by target + resolve contradictions
  const groups = groupByTarget(classified);
  const resolvedComments = [];
  const overriddenIds = new Set();
  for (const [, group] of groups) {
    const { winner, overridden } = resolveContradictions(group);
    if (overridden.length > 0) {
      for (const o of overridden) overriddenIds.add(o.id);
    }
    resolvedComments.push(...group);
  }

  // 6. Sort by processing order (excluding overridden)
  const sorted = sortByProcessingOrder(
    resolvedComments.filter(c => !overriddenIds.has(c.id))
  );

  // Reply to overridden comments
  for (const id of overriddenIds) {
    const c = resolvedComments.find(x => x.id === id);
    if (c) {
      try {
        await replyAndResolve(auth, fileId, c.id,
          detectLanguage(c.content) === 'zh'
            ? '✅ 此留言已被同元素的較新留言覆蓋，以最新留言為準。'
            : '✅ This comment was superseded by a newer comment on the same element.');
      } catch { /* ignore */ }
    }
  }

  // 7. Snapshot before modifications
  const snapshotId = await createSnapshot(auth, fileId);

  // 8. Dry-run check
  if (options.dryRun || shouldDryRun(sorted.length)) {
    const report = formatDryRunReport(sorted.map(c => ({
      commentId: c.id,
      intent: c.classified.intent,
      action: c.classified.action,
    })));
    return { processed: 0, failed: 0, dryRun: true, report, snapshotId };
  }

  // 9. Process each comment
  const processed = [];
  const failed = [];
  const deletedTargets = new Set();

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

      // Check for cascade (target already deleted)
      if (comment.targetID && deletedTargets.has(
        typeof comment.targetID === 'object' ? JSON.stringify(comment.targetID) : comment.targetID
      )) {
        await replyAndResolve(auth, fileId, comment.id, formatCascadeReply());
        processed.push({ id: comment.id, intent, status: 'cascade' });
        continue;
      }

      if (intent === 'question') {
        // Reply but don't resolve
        const lang = detectLanguage(comment.content);
        await replyToComment(auth, fileId, comment.id,
          lang === 'zh' ? '此問題需要人工回覆。' : 'This question requires a manual response.');
        processed.push({ id: comment.id, intent, status: 'question_replied' });
        continue;
      }

      // Execute modification with retry (delete only in skeleton; style/content via AI agent)
      let requests = [];
      if (intent === 'delete' && comment.targetID) {
        if (fileType === 'slides') {
          requests = buildDeleteRequests(
            typeof comment.targetID === 'object' ? comment.targetID : comment.targetID, 'element');
        } else {
          requests = buildDocDeleteRequests(comment.targetID);
        }
      }

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
        const key = typeof comment.targetID === 'object' ? JSON.stringify(comment.targetID) : comment.targetID;
        deletedTargets.add(key);
      }

      // Reply + resolve
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
    snapshotId,
    learnings: [],
    message: `✅ ${processed.length}/${sorted.length} 則已處理` +
      (failed.length > 0 ? `，❌ ${failed.length} 則需手動處理` : ''),
  };
}

module.exports = { processCommentFeedback, CORRECTIONS_PATH, FORMATS_DIR };
