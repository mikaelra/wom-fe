import { describe, expect, it } from 'vitest';
import { cityAura, CITY_AURA_MAX_OPACITY } from '@/lib/cityAura';
import { computeAspects, computeSky } from '@/lib/astrology';

describe('cityAura', () => {
  it('draws nothing when no conjunction is working on the body', () => {
    expect(cityAura(10, 2.6, { strength: 0, influence: 0 })).toEqual({ scale: 26, opacity: 0 });
  });

  it("grows and brightens with the conjunction, by the globe's proportions", () => {
    const faint = cityAura(10, 2.6, { strength: 0.02, influence: 0.2 });
    const tight = cityAura(10, 2.6, { strength: 0.06, influence: 0.9 });
    expect(tight.scale).toBeGreaterThan(faint.scale);
    expect(tight.opacity).toBeGreaterThan(faint.opacity);
    // Full influence: the globe's 3 -> 3 + 4 widening, i.e. 7/3 of the base.
    expect(cityAura(10, 2.6, { strength: 0, influence: 1 }).scale).toBeCloseTo(26 * (7 / 3), 9);
  });

  it('never outshines the body: opacity is capped', () => {
    expect(cityAura(10, 2.6, { strength: 5, influence: 1 }).opacity).toBe(CITY_AURA_MAX_OPACITY);
    expect(cityAura(10, 2.6, { strength: -1, influence: 0 }).opacity).toBe(0);
  });

  it('lights up for a real conjunction and stays dark away from one', () => {
    // Mercury and Jupiter on 2028-10-03 (wom-be engine/conjunctions.py).
    const aspects = computeAspects(computeSky(new Date('2028-10-03T12:46:50Z')));
    expect(cityAura(8, 2.6, aspects.Mercury).opacity).toBeGreaterThan(0);
    expect(aspects.Mercury.auraColor.getHex()).not.toBe(aspects.Mercury.color.getHex());
  });
});
