import { describe, expect, it } from 'vitest';
import { fitFontSize, seedFromText, seededRandom } from '@/lib/signpostCarving';

describe('seededRandom', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('seedFromText', () => {
  it('is stable and label-specific', () => {
    expect(seedFromText('MARKET')).toBe(seedFromText('MARKET'));
    expect(seedFromText('MARKET')).not.toBe(seedFromText('RANKED'));
  });
});

describe('fitFontSize', () => {
  it('is height-bound for a short label', () => {
    expect(fitFontSize(1, 1000, 100)).toBeCloseTo(62);
  });

  it('is width-bound for a long label', () => {
    expect(fitFontSize(10, 500, 100)).toBeCloseTo(43);
  });

  it('falls back to the height bound for an unmeasurable label', () => {
    expect(fitFontSize(0, 500, 100)).toBeCloseTo(62);
  });
});
