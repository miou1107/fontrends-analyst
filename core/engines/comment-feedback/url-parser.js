'use strict';

const PATTERNS = [
  { regex: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/, fileType: 'slides' },
  { regex: /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/, fileType: 'docs' },
];

function parseDocUrl(url) {
  if (!url) throw new Error('URL is required');
  for (const { regex, fileType } of PATTERNS) {
    const match = url.match(regex);
    if (match) return { fileId: match[1], fileType };
  }
  throw new Error(`Unsupported URL: ${url}`);
}

module.exports = { parseDocUrl };
