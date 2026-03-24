'use strict';

function buildPageObjectIdMap(presentation) {
  const map = new Map();
  (presentation.slides || []).forEach((slide, idx) => {
    map.set(slide.objectId, idx);
  });
  return map;
}

function buildDeleteRequests(objectId, _targetType) {
  return [{ deleteObject: { objectId } }];
}

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

function buildContentRequests(objectId, oldText, newText) {
  return [{
    replaceAllText: {
      containsText: { text: oldText, matchCase: true },
      replaceText: newText,
      pageObjectIds: objectId ? [objectId] : undefined,
    },
  }];
}

async function executeSlidesUpdate(auth, presentationId, requests) {
  if (!requests || requests.length === 0) return null;
  const { google } = require('googleapis');
  const slides = google.slides({ version: 'v1', auth });
  return slides.presentations.batchUpdate({
    presentationId,
    requestBody: { requests },
  });
}

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
