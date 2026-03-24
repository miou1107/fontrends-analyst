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
