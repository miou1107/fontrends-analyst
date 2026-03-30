'use strict';

function formatReply(summary, changes, { includeProfilePrompt = false } = {}) {
  const lines = [`✅ 已調整：${summary}`];
  if (changes && changes.length > 0) {
    lines.push('');
    lines.push('修改項目：');
    for (const c of changes) {
      lines.push(`- ${c}`);
    }
  }
  if (includeProfilePrompt) {
    lines.push('');
    lines.push('💾 如果希望未來都這樣處理，請回覆 yes');
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

async function replyAndResolve(auth, fileId, commentId, replyContent) {
  await replyToComment(auth, fileId, commentId, replyContent);
  await resolveComment(auth, fileId, commentId);
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
