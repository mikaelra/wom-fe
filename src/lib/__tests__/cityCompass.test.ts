import { describe, expect, it } from 'vitest';
import { COMPASS_MARKS, COMPASS_ALTITUDE_DEG, compassPlacements } from '@/lib/cityCompass';
import { focusOpacity, FOCUS_OUTER_DEG } from '@/lib/gazeFocus';

const EYE: readonly [number, number, number] = [0, 5.2, 0];
const R = 400;
const marks = compassPlacements(EYE, R);
const at = (label: string) => marks.find((m) => m.label === label)!;

describe('the marks themselves', () => {
  it('is the 8-point ring minus north, quarter points spelled out', () => {
    expect(marks.map((m) => m.label)).toEqual(['NE', 'EAST', 'SE', 'SOUTH', 'SW', 'WEST', 'NW']);
  });

  it('omits NORTH, which stood permanently on top of the signpost', () => {
    // SIGNPOST_POSITION is straight down -Z, and -Z is north, so the north
    // mark and the one object that most needs reading occupied the same
    // patch of sky. The direction is not lost -- it is the one the signpost
    // is standing in -- and NW and NE still bracket it.
    expect(marks.some((m) => m.label === 'NORTH')).toBe(false);
    expect(marks.some((m) => m.azimuth === 0)).toBe(false);
  });

  it('never abbreviates to three letters -- no NNE or ESE on the horizon', () => {
    // The 16-point compass belongs in a gaze label's numeric readout, not on
    // a skyline. An ordinal is exactly two letters or it does not belong.
    for (const mark of marks.filter((m) => !m.cardinal)) {
      expect(mark.label).toMatch(/^[NESW]{2}$/);
    }
  });

  it('writes the quarter points in full, not as single letters', () => {
    expect(marks.filter((m) => m.cardinal).map((m) => m.label))
      .toEqual(['EAST', 'SOUTH', 'WEST']);
  });

  it('keeps every remaining mark on its true 45-degree bearing', () => {
    // Each mark carries its own azimuth rather than deriving it from an
    // array index, so dropping north cannot silently rotate the rest. This
    // is the assertion that would have caught that.
    expect(marks.map((m) => m.azimuth)).toEqual([45, 90, 135, 180, 225, 270, 315]);
  });

  it('agrees with the exported definitions', () => {
    expect(marks.map((m) => m.label)).toEqual(COMPASS_MARKS.map((m) => m.label));
  });
});

describe('where they sit', () => {
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
      expect(m.position[1] - EYE[1])
        .toBeCloseTo(R * Math.sin((COMPASS_ALTITUDE_DEG * Math.PI) / 180), 6);
    }
  });

  it('puts EAST down +X and SOUTH down +Z, the scene compass', () => {
    // lib/citySkyGeometry.ts fixes this once: -Z is north, +X is east, and
    // the default camera looks down -Z. If this flips, every direction in
    // the scene is a lie.
    expect(at('EAST').position[0] - EYE[0]).toBeGreaterThan(0);
    expect(at('EAST').position[2] - EYE[2]).toBeCloseTo(0, 6);
    expect(at('SOUTH').position[2] - EYE[2]).toBeGreaterThan(0);
    expect(at('SOUTH').position[0] - EYE[0]).toBeCloseTo(0, 6);
  });

  it('puts opposite marks on opposite sides of the viewer', () => {
    expect(at('WEST').position[0] - EYE[0]).toBeCloseTo(-(at('EAST').position[0] - EYE[0]), 6);
    expect(at('NW').position[0] - EYE[0]).toBeCloseTo(-(at('NE').position[0] - EYE[0]), 6);
    expect(at('NW').position[2] - EYE[2]).toBeCloseTo(at('NE').position[2] - EYE[2], 6);
  });
});

describe('how they appear', () => {
  it('shows only the one you are looking at', () => {
    // The marks are 45 degrees apart and the gaze fade is gone by
    // FOCUS_OUTER_DEG, so centring one cannot bring up its neighbour. This
    // is the whole fix for "too many captions on a desktop": the frame edge
    // is ~51 degrees of half-angle there, which held three or four at once.
    expect(FOCUS_OUTER_DEG).toBeLessThan(45 / 2);
    expect(focusOpacity(0)).toBe(1);
    expect(focusOpacity(45)).toBe(0);
  });
});
