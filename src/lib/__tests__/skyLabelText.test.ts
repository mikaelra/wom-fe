import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLYPH, conjunctionNote, horizonNote, labelDetail } from '@/lib/skyLabelText';
import { ORB, type AspectBody, type Sky } from '@/lib/astrology';

const RAD = Math.PI / 180;
const BODIES: AspectBody[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

/** A direction in the XZ plane at `deg`. Two of these are separated by
 *  exactly the difference of their angles, which is what lets a test place a
 *  conjunction at a stated separation without any trigonometry of its own. */
function dirAt(deg: number): THREE.Vector3 {
  const t = deg * RAD;
  return new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
}

/** Baseline positions 40 deg apart -- comfortably outside every orb, so any
 *  conjunction a test sees is one the test asked for. */
const BASELINE: Record<AspectBody, number> = {
  Sun: 0, Moon: 40, Mercury: 80, Venus: 120, Mars: 160, Jupiter: 200, Saturn: 240,
};

function buildSky(
  at: Partial<Record<AspectBody, number>> = {},
  opts: { mercuryRetrograde?: boolean; moonPhaseFraction?: number } = {},
): Sky {
  const dir = {} as Record<AspectBody, THREE.Vector3>;
  for (const b of BODIES) dir[b] = dirAt(at[b] ?? BASELINE[b]);
  return {
    date: new Date('2026-01-01T00:00:00Z'),
    dir,
    mercuryRetrograde: opts.mercuryRetrograde ?? false,
    moonPhaseFraction: opts.moonPhaseFraction ?? 0.5,
  };
}

describe('GLYPH', () => {
  it('names every body the aspect maths knows about', () => {
    for (const b of BODIES) expect(GLYPH[b]).toBeTruthy();
    expect(Object.keys(GLYPH)).toHaveLength(BODIES.length);
  });
});

describe('horizonNote', () => {
  it('reads as altitude then compass point', () => {
    expect(horizonNote({ altitude: 23.6, azimuth: 112 })).toBe('24° ESE');
  });

  it('wraps azimuth back around to north', () => {
    expect(horizonNote({ altitude: 10, azimuth: 350 })).toBe('10° N');
    expect(horizonNote({ altitude: 10, azimuth: -10 })).toBe('10° N');
  });

  it('stays total below the horizon, where the city never shows it', () => {
    expect(horizonNote({ altitude: -4.4, azimuth: 180 })).toBe('-4° S');
  });
});

describe('conjunctionNote', () => {
  it('names the other body, its glyph and the separation', () => {
    const sky = buildSky({ Mars: BASELINE.Venus + 4 });
    expect(conjunctionNote(sky, 'Mars')).toBe(`☌ ${GLYPH.Venus} 4.0°`);
    expect(conjunctionNote(sky, 'Venus')).toBe(`☌ ${GLYPH.Mars} 4.0°`);
  });

  it('respects each body\'s OWN orb, so a pair can report asymmetrically', () => {
    // 5 deg apart: inside the Moon's 10 deg orb, outside Saturn's 3 deg one.
    // The asymmetry is deliberate (docs/ASPECTS_PLAN.md §1.2) and it is the
    // subject's orb, not the pair's, that decides.
    const sky = buildSky({ Saturn: BASELINE.Moon + 5 });
    expect(ORB.Moon).toBeGreaterThan(5);
    expect(ORB.Saturn).toBeLessThan(5);
    expect(conjunctionNote(sky, 'Moon')).toBe(`☌ ${GLYPH.Saturn} 5.0°`);
    expect(conjunctionNote(sky, 'Saturn')).toBeNull();
  });

  it('reports the NEAREST body inside the orb, not merely the first', () => {
    const sky = buildSky({ Jupiter: BASELINE.Venus + 2, Mars: BASELINE.Venus + 4 });
    expect(conjunctionNote(sky, 'Venus')).toBe(`☌ ${GLYPH.Jupiter} 2.0°`);
  });

  it('says nothing when the nearest body is outside the orb', () => {
    const sky = buildSky({ Mars: BASELINE.Jupiter + 6 });  // Mars' orb is 5
    expect(conjunctionNote(sky, 'Mars')).toBeNull();
  });

  it('leaves the Sun out of it entirely, in both directions', () => {
    // The Sun neither donates nor receives colour (ASPECTS_PLAN §1.4), so a
    // body sitting 2 deg off it announces nothing and neither does the Sun.
    const sky = buildSky({ Mars: 2 });
    expect(conjunctionNote(sky, 'Mars')).toBeNull();
    expect(conjunctionNote(sky, 'Sun')).toBeNull();
  });
});

describe('labelDetail', () => {
  it('is null when there is nothing to say -- no empty second line', () => {
    expect(labelDetail(buildSky(), 'Jupiter')).toBeNull();
  });

  it('opens with where the body stands when a horizon is supplied', () => {
    const detail = labelDetail(buildSky(), 'Jupiter', { altitude: 31.2, azimuth: 205 });
    expect(detail).toBe('31° SSW');
  });

  it('omits the horizon on the world map, which has no single observer', () => {
    const sky = buildSky({}, { mercuryRetrograde: true });
    expect(labelDetail(sky, 'Mercury')).toBe('RETROGRADE');
  });

  it('joins several notes in reading order: place, then state, then aspect', () => {
    const sky = buildSky({ Mercury: BASELINE.Venus + 3 }, { mercuryRetrograde: true });
    expect(labelDetail(sky, 'Mercury', { altitude: 12, azimuth: 90 }))
      .toBe(`12° E  ·  RETROGRADE  ·  ☌ ${GLYPH.Venus} 3.0°`);
  });

  it('gives the Moon its illuminated fraction', () => {
    const sky = buildSky({}, { moonPhaseFraction: 0.675 });
    expect(labelDetail(sky, 'Moon')).toBe('68% LIT');
  });

  it('marks Mercury retrograde only when it is', () => {
    expect(labelDetail(buildSky(), 'Mercury')).toBeNull();
  });
});
