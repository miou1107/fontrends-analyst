'use strict';

function buildDocDeleteRequests(range) {
  return [{
    deleteContentRange: {
      range: { startIndex: range.start, endIndex: range.end, segmentId: '' },
    },
  }];
}

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

function sortRequestsDescending(items) {
  return [...items].sort((a, b) => b.range.start - a.range.start);
}

async function executeDocsUpdate(auth, documentId, requests) {
  if (!requests || requests.length === 0) return null;
  const { google } = require('googleapis');
  const docs = google.docs({ version: 'v1', auth });
  return docs.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
}

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
