'use strict';

const fs = require('fs');
const path = require('path');

function buildCorrectionEntry({ fileId, fileType, commentId, original, correction, rule, category }) {
  return {
    timestamp: new Date().toISOString(),
    fileId,
    fileType,
    commentId,
    original,
    correction,
    rule,
    category,
    approved: true,
    schemaVersion: 2,
  };
}

function appendCorrection(filePath, entry) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
}

function summarizeLearnings(corrections) {
  if (!corrections || corrections.length === 0) return [];
  return corrections.map(c => ({
    category: c.category,
    rule: c.rule,
    fileType: c.fileType,
  }));
}

function upsertFormatRule(mdPath, category, rule) {
  const sectionHeading = `## ${category}`;
  let content = '';
  try {
    content = fs.readFileSync(mdPath, 'utf-8');
  } catch {
    const dir = path.dirname(mdPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    content = `# 格式規則\n\n> 由 Comment Feedback 機制自動維護。\n`;
  }

  if (content.includes(rule)) return;

  if (content.includes(sectionHeading)) {
    const idx = content.indexOf(sectionHeading) + sectionHeading.length;
    const nextLine = content.indexOf('\n', idx);
    content = content.slice(0, nextLine + 1) + `- ${rule}\n` + content.slice(nextLine + 1);
  } else {
    content += `\n${sectionHeading}\n- ${rule}\n`;
  }

  fs.writeFileSync(mdPath, content, 'utf-8');
}

module.exports = { buildCorrectionEntry, appendCorrection, summarizeLearnings, upsertFormatRule };
