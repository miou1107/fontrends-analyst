'use strict';

const DRY_RUN_THRESHOLD = 5;

function shouldDryRun(requestCount, threshold = DRY_RUN_THRESHOLD) {
  return requestCount > threshold;
}

function formatDryRunReport(items) {
  const lines = ['📋 Dry-run: 以下修改待確認：', ''];
  for (const item of items) {
    lines.push(`- [${item.intent}] Comment ${item.commentId}: ${item.action}`);
  }
  lines.push('', '確認執行？(yes/no)');
  return lines.join('\n');
}

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

async function wrapWithRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err.code !== 409 || attempt >= maxRetries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

module.exports = { shouldDryRun, formatDryRunReport, createSnapshot, wrapWithRetry, DRY_RUN_THRESHOLD };
