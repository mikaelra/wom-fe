import { describe, expect, it } from 'vitest';
import {
  CONJUNCTION_COLOR, FULL_MOON_MERCHANT_COLOR, timewarpEventLabels,
  MERCHANT_ITEM_LINES, MERCHANT_MARKER_LABEL, MERCHANT_QUOTES, merchantQuote, merchantModelFor, merchantSkyBodies, meanDirection, skyToGlobeLocal,
  PLANET_COLOR, REVERT_RELIC_NAMES, merchantMarkerColors, PLANET_RADIUS_KM, sphereDrop,
} from '@/lib/merchant';
import { bodyColorHex } from '@/lib/astrology';
import * as THREE from 'three';
import { skyDrift, skyStep, BASE_SKY_STEP } from '@/lib/skyDrift';
import { FULL_MOON_EVENT, MERCURY_JUPITER_EVENT } from '@/lib/__tests__/merchantFixtures';

describe('PLANET_COLOR', () => {
  it('uses the same planet colours the globe draws', () => {
    for (const body of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const) {
      expect(PLANET_COLOR[body]).toBe(bodyColorHex(body));
    }
  });
});

describe('timewarpEventLabels', () => {
  it('is just the kind: Full moon in purple, Conjunction in orange, full moon first', () => {
    expect(timewarpEventLabels([MERCURY_JUPITER_EVENT, FULL_MOON_EVENT])).toEqual([
      { text: 'Full moon', color: FULL_MOON_MERCHANT_COLOR },
      { text: 'Conjunction', color: CONJUNCTION_COLOR },
    ]);
  });

  it('names the new moon in John Dee\'s purple', () => {
    const newMoon = { ...FULL_MOON_EVENT, kind: 'new_moon' };
    expect(timewarpEventLabels([MERCURY_JUPITER_EVENT, newMoon])).toEqual([
      { text: 'New moon', color: FULL_MOON_MERCHANT_COLOR },
      { text: 'Conjunction', color: CONJUNCTION_COLOR },
    ]);
  });

  it('names two conjunctions at one moment once', () => {
    const other = { ...MERCURY_JUPITER_EVENT, key: 'Venus-Mars', bodies: ['Venus', 'Mars'] };
    expect(timewarpEventLabels([MERCURY_JUPITER_EVENT, other])).toEqual([
      { text: 'Conjunction', color: CONJUNCTION_COLOR },
    ]);
  });

  it('is nothing for a quiet moment, or a kind it does not know yet', () => {
    expect(timewarpEventLabels([])).toEqual([]);
    expect(timewarpEventLabels([{ ...MERCURY_JUPITER_EVENT, kind: 'trine' }])).toEqual([]);
  });
});

describe('MERCHANT_MARKER_LABEL', () => {
  it('is just "Merchant", whoever he is', () => {
    expect(MERCHANT_MARKER_LABEL).toBe('Merchant');
  });
});

describe('merchantQuote', () => {
  it('is one of John Dee\'s at the full moon', () => {
    expect(merchantQuote('full_moon', () => 0)).toBe('The All is Mind.');
    expect(merchantQuote('full_moon', () => 0.999)).toBe('Tomatoes is a fruit.');
  });

  it('is one of Hildegard von Bingen\'s at a conjunction', () => {
    expect(merchantQuote('conjunction', () => 0)).toBe('Love is the water which waters the soul of your body.');
    expect(merchantQuote('conjunction', () => 0.5)).toBe('Modern life lacks softness.');
  });

  it('can say every one of their lines', () => {
    for (const kind of ['full_moon', 'conjunction'] as const) {
      const n = MERCHANT_QUOTES[kind].length;
      const said = new Set(Array.from({ length: n }, (_, i) => merchantQuote(kind, () => i / n)));
      expect([...said]).toEqual([...MERCHANT_QUOTES[kind]]);
    }
  });

  it('starts every line with a capital and ends it with punctuation', () => {
    for (const q of [...MERCHANT_QUOTES.full_moon, ...MERCHANT_QUOTES.conjunction]) {
      expect(q).toMatch(/^[A-Z].*[.?!]$/);
    }
  });

  it('stays in range even if random() returns 1', () => {
    expect(merchantQuote('conjunction', () => 1)).toBe('Wisdom is not putting tomatoes in a fruit salad.');
  });
});

describe('REVERT_RELIC_NAMES', () => {
  it('is what each merchant sells', () => {
    expect([...REVERT_RELIC_NAMES]).toEqual(['Stone of Vitality', 'Paper', 'Pen']);
  });
});

describe('John Dee at the new moon', () => {
  const newMoon = { ...FULL_MOON_EVENT, kind: 'new_moon' };

  it('is the same man as at the full moon: model, quotes, colour, and under the Moon', () => {
    expect(merchantModelFor('new_moon')).toBe('merchant_v1');
    expect(MERCHANT_QUOTES.full_moon).toContain(merchantQuote('new_moon', () => 0));
    expect(merchantMarkerColors(newMoon)).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
    expect(merchantSkyBodies(newMoon)).toEqual(['Moon']);
  });

  it('says what the Pen is for under it', () => {
    expect(MERCHANT_ITEM_LINES.Pen).toBe('For writing with');
  });
});

describe('merchantMarkerColors', () => {
  const conj = (a: string, b: string) => ({ kind: 'conjunction', key: `${a}-${b}`, bodies: [a, b], sign: 'Leo', at: 'x' });

  it('fills with the bigger planet and rings with the other, whichever is named first', () => {
    expect(merchantMarkerColors(conj('Mars', 'Jupiter'))).toEqual({ fill: '#008296', outline: '#ff0000' });
    expect(merchantMarkerColors(conj('Jupiter', 'Mars'))).toEqual({ fill: '#008296', outline: '#ff0000' });
    expect(merchantMarkerColors(conj('Mercury', 'Venus'))).toEqual({ fill: '#ab9d00', outline: '#db9504' });
  });

  it('ranks the planets by size: Jupiter, Saturn, Venus, Mars, Mercury', () => {
    const bySize = Object.keys(PLANET_RADIUS_KM).sort((a, b) => PLANET_RADIUS_KM[b] - PLANET_RADIUS_KM[a]);
    expect(bySize).toEqual(['Jupiter', 'Saturn', 'Venus', 'Mars', 'Mercury']);
    expect(merchantMarkerColors(conj('Venus', 'Saturn')).fill).toBe('#a16300');
  });

  it('keeps the full moon purple with no planet outline', () => {
    expect(merchantMarkerColors(FULL_MOON_EVENT)).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
    expect(merchantMarkerColors(null)).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
  });

  it('falls back to the purple for a body it does not know', () => {
    expect(merchantMarkerColors(conj('Mars', 'Pluto'))).toEqual({ fill: FULL_MOON_MERCHANT_COLOR, outline: null });
  });
});

describe('sphereDrop', () => {
  it('is zero at the touching point and grows toward the edge', () => {
    expect(sphereDrop(2.5, 0)).toBe(0);
    expect(sphereDrop(2.5, 0.66)).toBeCloseTo(2.5 - Math.sqrt(2.5 ** 2 - 0.66 ** 2), 12);
    expect(sphereDrop(2.5, -0.66)).toBe(sphereDrop(2.5, 0.66));
  });

  it('bottoms out at the sphere radius rather than going NaN past it', () => {
    expect(sphereDrop(2.5, 10)).toBe(2.5);
  });
});

describe('where a merchant stands on the globe', () => {
  it('stands under the Moon for the full moon, and under its two planets for a conjunction', () => {
    expect(merchantSkyBodies(FULL_MOON_EVENT)).toEqual(['Moon']);
    expect(merchantSkyBodies(MERCURY_JUPITER_EVENT)).toEqual(['Mercury', 'Jupiter']);
    expect(merchantSkyBodies(null)).toEqual(['Moon']);
  });

  it('takes the direction between two conjunct planets', () => {
    const a = new THREE.Vector3(1, 0.1, 0).normalize();
    const b = new THREE.Vector3(1, -0.1, 0.05).normalize();
    const mid = meanDirection([[a.x, a.y, a.z], [b.x, b.y, b.z]]);
    expect(Math.hypot(...mid)).toBeCloseTo(1, 12);
    const m = new THREE.Vector3(...mid);
    expect(m.angleTo(a)).toBeCloseTo(m.angleTo(b), 9);
    expect(meanDirection([])).toEqual([0, 0, 0]);
  });

  it('turns a sky direction into the globe\'s frame exactly as the two groups are turned', () => {
    // A body at `dir` in a sky group turned `sky` about Y is, in world
    // space, dir rotated by sky. The globe group is turned `globe`, so the
    // point under it, in the globe's own frame, must map back to that same
    // world direction when rotated by `globe`.
    const dir = new THREE.Vector3(0.3, 0.5, -0.8).normalize();
    for (const [sky, globe] of [[0, 0], [-1.2, 2.9], [0.7, -0.4], [-12.3, 5.1]]) {
      const local = new THREE.Vector3(...skyToGlobeLocal([dir.x, dir.y, dir.z], sky, globe));
      const world = local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), globe);
      const expected = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sky);
      expect(world.distanceTo(expected)).toBeLessThan(1e-12);
    }
  });

  it('starts the shared sky turn at zero, at its normal step', () => {
    expect(skyDrift.angle).toBe(0);
    expect(skyStep()).toBe(BASE_SKY_STEP);
  });

  it('turns faster by the boost a timewarp gives it', () => {
    skyDrift.boost = 9;
    try {
      expect(skyStep()).toBeCloseTo(BASE_SKY_STEP * 10, 12);
    } finally {
      skyDrift.boost = 0;
    }
  });
});

describe('merchantModelFor', () => {
  it('is the old Merchant at the full moon and the Lady Merchant at a conjunction', () => {
    expect(merchantModelFor('full_moon')).toBe('merchant_v1');
    expect(merchantModelFor('conjunction')).toBe('lady_merchant_v1');
  });
});
