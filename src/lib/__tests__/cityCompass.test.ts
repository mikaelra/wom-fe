import { describe, expect, it } from 'vitest';
import {
  COMPASS_MARKS, COMPASS_ALTITUDE_DEG, compassPlacements,
  horizontalHalfFovDeg, edgeOpacity,
} from '@/lib/cityCompass';

const EYE: readonly [number, number, number] = [0, 5.2, 0];
const R = 400;

describe('the marks themselves', () => {
  it('is the 8-point set, and never the 16-point one', () => {
    expect(COMPASS_MARKS).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  });

  it('uses one or two letters only -- no NNE or ESE on the horizon', () => {
    for (const mark of COMPASS_MARKS) {
      expect(mark.length).toBeLessThanOrEqual(2);
    }
  });

  it('spaces them evenly all the way round, starting at north', () => {
    const marks = compassPlacements(EYE, R);
    expect(marks.map((m) => m.azimuth)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('treats N/E/S/W as the cardinals and the rest as ordinals', () => {
    const marks = compassPlacements(EYE, R);
    const cardinals = marks.filter((m) => m.cardinal).map((m) => m.label);
    expect(cardinals).toEqual(['N', 'E', 'S', 'W']);
  });
});

describe('where they sit', () => {
  const marks = compassPlacements(EYE, R);

  it('stands them all at one radius around the viewer', () => {
    for (const m of marks) {
      const d = Math.hypot(m.position[0] - EYE[0], m.position[1] - EYE[1], m.position[2] - EYE[2]);
      expect(d).toBeCloseTo(R, 6);
    }
  });

  it('puts them just above the horizon, not straddling it', () => {
    // At exactly 0 the letters sit on the join between sea and sky and are
    // unreadable against either.
    expect(COMPASS_ALTITUDE_DEG).toBeGreaterThan(0);
    for (const m of marks) {
      const rise = m.position[1] - EYE[1];
      expect(rise).toBeCloseTo(R * Math.sin((COMPASS_ALTITUDE_DEG * Math.PI) / 180), 6);
    }
  });

  it('puts N down -Z and E down +X, the scene compass', () => {
    // lib/citySkyGeometry.ts fixes this once: -Z is north, +X is east, and
    // the default camera looks down -Z. If this flips, every direction in
    // the scene is a lie.
    const north = marks.find((m) => m.label === 'N')!;
    const east = marks.find((m) => m.label === 'E')!;
    expect(north.position[2] - EYE[2]).toBeLessThan(0);
    expect(north.position[0] - EYE[0]).toBeCloseTo(0, 6);
    expect(east.position[0] - EYE[0]).toBeGreaterThan(0);
    expect(east.position[2] - EYE[2]).toBeCloseTo(0, 6);
  });

  it('puts opposite marks on opposite sides of the viewer', () => {
    const at = (l: string) => marks.find((m) => m.label === l)!.position;
    expect(at('S')[2] - EYE[2]).toBeCloseTo(-(at('N')[2] - EYE[2]), 6);
    expect(at('W')[0] - EYE[0]).toBeCloseTo(-(at('E')[0] - EYE[0]), 6);
  });
});

describe('horizontalHalfFovDeg', () => {
  it('equals half the vertical FOV on a square viewport', () => {
    expect(horizontalHalfFovDeg(70, 1)).toBeCloseTo(35, 6);
  });

  it('is far narrower on a phone than on a desktop -- the whole reason it exists', () => {
    const phone = horizontalHalfFovDeg(70, 390 / 844);
    const desktop = horizontalHalfFovDeg(70, 16 / 9);
    expect(phone).toBeCloseTo(17.9, 1);
    expect(desktop).toBeCloseTo(51.2, 1);
    expect(phone).toBeLessThan(desktop);
  });

  it('widens monotonically with the aspect ratio', () => {
    expect(horizontalHalfFovDeg(70, 2)).toBeGreaterThan(horizontalHalfFovDeg(70, 1));
  });
});

describe('edgeOpacity', () => {
  it('shows a mark dead ahead', () => {
    expect(edgeOpacity(0, 30)).toBe(1);
  });

  it('hides one past the edge of frame', () => {
    expect(edgeOpacity(30, 30)).toBe(0);
    expect(edgeOpacity(90, 30)).toBe(0);
  });

  it('fades across the last few degrees rather than popping', () => {
    const mid = edgeOpacity(27, 30, 7);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // Monotonically decreasing as it approaches the edge.
    expect(edgeOpacity(24, 30, 7)).toBeGreaterThan(mid);
  });

  it('still behaves when the fade is wider than the frame', () => {
    // A very narrow FOV must not produce a negative inner edge and invert.
    const o = edgeOpacity(1, 4, 7);
    expect(o).toBeGreaterThanOrEqual(0);
    expect(o).toBeLessThanOrEqual(1);
  });

  it('is nothing for a non-finite angle', () => {
    expect(edgeOpacity(NaN, 30)).toBe(0);
  });
});
