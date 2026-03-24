'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CORRECTIONS_PATH = path.resolve(
  __dirname,
  '../../learned/corrections.jsonl'
);

/**
 * Append a correction entry to corrections.jsonl
 * @param {Object} correction - { source, type, description, old_value, new_value, context }
 * @param {string} [filePath] - path to corrections.jsonl (default: core/learned/corrections.jsonl)
 */
function logCorrection(correction, filePath) {
  const target = filePath || DEFAULT_CORRECTIONS_PATH;

  const entry = {
    timestamp: new Date().toISOString(),
    source: correction.source || '',
    type: correction.type || '',
    description: correction.description || '',
    old_value: correction.old_value !== undefined ? correction.old_value : '',
    new_value: correction.new_value !== undefined ? correction.new_value : '',
    context: correction.context || {},
  };

  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(target, JSON.stringify(entry) + '\n', 'utf-8');
}

module.exports = { logCorrection };
