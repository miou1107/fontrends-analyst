'use strict';

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

function formatFailReply(reason, suggestion) {
  const lines = [`❌ 無法自動處理：${reason}`];
  if (suggestion) lines.push(`建議：${suggestion}`);
  return lines.join('\n');
}

function formatCascadeReply() {
  return '✅ 該元素已被其他留言刪除，此留言無需處理';
}

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

async function resolveComment(auth, fileId, commentId, opts = {}) {
  // 🔥 鐵律 B：AI 不得自動標記已解決，必須 user 明確同意才 resolve。
  if (!opts.userConsent) {
    throw new Error(
      '[comment-responder] resolveComment 需 userConsent:true，' +
      'AI 不得自動標已解決（鐵律 B）。user 驗收後由他們自己手動 resolve。'
    );
  }
  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth });
  await drive.comments.update({
    fileId,
    commentId,
    fields: 'id,resolved',
    requestBody: { resolved: true },
  });
}

async function replyAndResolve(auth, fileId, commentId, replyContent, opts = {}) {
  // 🔥 鐵律 B：預設不可呼叫此函式。必須 user 明確同意。
  if (!opts.userConsent) {
    throw new Error(
      '[comment-responder] replyAndResolve 需 userConsent:true（鐵律 B）。' +
      '預設請只用 replyToComment，由 user 自己標已解決。'
    );
  }
  await replyToComment(auth, fileId, commentId, replyContent);
  await resolveComment(auth, fileId, commentId, opts);
}

function detectLanguage(text) {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  return cjkCount > 0 ? 'zh' : 'en';
}

module.exports = {
  formatReply, formatFailReply, formatCascadeReply,
  replyToComment, resolveComment, replyAndResolve,
  detectLanguage,
};
