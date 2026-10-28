import {describe, expect, it} from 'vitest';
import {generateShowcaseData} from './demo-data';

describe('generateShowcaseData', () => {
  const today = new Date('2026-10-29T12:00:00Z');
  const data = generateShowcaseData(today);

  it('is deterministic and hand-enterable in size', () => {
    expect(data).toHaveLength(24);
    expect(generateShowcaseData(today)).toEqual(data);
  });

  it('has valid required fields and a single unit', () => {
    for (const d of data) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.value).toBe('number');
      expect(d.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.unit).toBe('views');
    }
  });

  it('contains the deliberate edge cases', () => {
    expect(data.some((d) => d.status === undefined)).toBe(true);
    expect(data.some((d) => d.target === undefined)).toBe(true);
    expect(data.some((d) => d.category === undefined)).toBe(true);
    expect(data.some((d) => d.status === 'Active')).toBe(true);
  });
});
