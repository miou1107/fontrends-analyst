'use strict';

const { collectResearch } = require('../research-collector');

describe('research-collector (skeleton)', () => {
  test('returns stub structure with brand and competitor', async () => {
    const result = await collectResearch('Louis Vuitton', 'Gucci', '2025-03 ~ 2026-03');
    expect(result.brand).toBe('Louis Vuitton');
    expect(result.competitor).toBe('Gucci');
    expect(result.period).toBe('2025-03 ~ 2026-03');
  });

  test('returns status=stub and empty sources/events', async () => {
    const result = await collectResearch('TestBrand', 'TestComp', '2026-01');
    expect(result.status).toBe('stub');
    expect(result.sources).toEqual([]);
    expect(result.events).toEqual([]);
  });

  test('includes generated_at timestamp', async () => {
    const result = await collectResearch('X', 'Y', 'Z');
    expect(result.generated_at).toBeDefined();
    expect(new Date(result.generated_at).getTime()).not.toBeNaN();
  });

  test('includes message about stub status', async () => {
    const result = await collectResearch('A', 'B', 'C');
    expect(result.message).toContain('skeleton');
  });
});
