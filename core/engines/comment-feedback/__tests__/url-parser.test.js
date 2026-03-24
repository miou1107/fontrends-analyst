'use strict';

const { parseDocUrl } = require('../url-parser');

describe('parseDocUrl', () => {
  test('parses Google Slides URL', () => {
    const url = 'https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit#slide=id.p';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ', fileType: 'slides' });
  });

  test('parses Google Docs URL', () => {
    const url = 'https://docs.google.com/document/d/1xYzAbCdEfGhIjKlMnOpQrStUvWx/edit';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1xYzAbCdEfGhIjKlMnOpQrStUvWx', fileType: 'docs' });
  });

  test('parses URL without /edit suffix', () => {
    const url = 'https://docs.google.com/presentation/d/1aBcDeFg/';
    const result = parseDocUrl(url);
    expect(result).toEqual({ fileId: '1aBcDeFg', fileType: 'slides' });
  });

  test('throws on invalid URL', () => {
    expect(() => parseDocUrl('https://example.com')).toThrow('Unsupported URL');
  });

  test('throws on empty input', () => {
    expect(() => parseDocUrl('')).toThrow();
  });
});
