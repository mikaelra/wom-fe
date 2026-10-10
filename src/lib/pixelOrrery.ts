import * as Astronomy from 'astronomy-engine';
import { BODY_COLOR } from '@/lib/bodyColors';

// The text Earth page's sky (components/text/PixelOrrery.tsx): the solar
// system as it is right now, drawn small and pixelated with the Earth at the
// centre of the screen. Every planet's trajectory -- the Earth's own too --
// is its orbit round the Sun, so the picture shows the Sun at the centre of
// the solar system, seen from where we stand (Mikael, 2026-10-10). The Moon
// circles the Earth on a small ring of its own.
//
// Positions are heliocentric: ecliptic longitude (the zodiac) and distance
// from the Sun in AU. Distances are squeezed with a square root so Mercury's
// orbit and Saturn's both fit on a phone; the angles are true.

export type OrreryBody = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Earth' | 'Mars' | 'Jupiter' | 'Saturn';

/** The bodies that go round the Sun, innermost first. */
export const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn'] as const;
export type Planet = (typeof PLANETS)[number];

/** Ecliptic longitude in degrees and distance in AU, from the Sun (or, for
 *  the Moon, from the Earth). */
export interface OrbitPoint {
  lon: number;
  dist: number;
}

const SUN_COLOR = 0xffd23f;
const EARTH_COLOR = 0x2563eb;

export function orreryColor(body: OrreryBody): number {
  if (body === 'Sun') return SUN_COLOR;
  if (body === 'Earth') return EARTH_COLOR;
  return BODY_COLOR[body];
}

function point(vec: Astronomy.Vector): OrbitPoint {
  return { lon: Astronomy.Ecliptic(vec).elon, dist: vec.Length() };
}

/** Where a planet is, seen from the Sun. */
export function helioPoint(planet: Planet, date: Date): OrbitPoint {
  return point(Astronomy.HelioVector(Astronomy.Body[planet], Astronomy.MakeTime(date)));
}

/** Where the Moon is, seen from the Earth. */
export function moonPoint(date: Date): OrbitPoint {
  return point(Astronomy.GeoMoon(Astronomy.MakeTime(date)));
}

// One orbit, in days.
const PERIOD_DAYS: Record<Planet, number> = {
  Mercury: 88,
  Venus: 225,
  Earth: 365.25,
  Mars: 687,
  Jupiter: 4333,
  Saturn: 10759,
};
const ORBIT_SAMPLES = 96;
const DAY_MS = 86_400_000;

/** A planet's whole orbit round the Sun: one period's positions, ending now. */
export function orbit(planet: Planet, date: Date): OrbitPoint[] {
  const step = PERIOD_DAYS[planet] / ORBIT_SAMPLES;
  return Array.from({ length: ORBIT_SAMPLES }, (_, i) =>
    helioPoint(planet, new Date(date.getTime() - (ORBIT_SAMPLES - 1 - i) * step * DAY_MS)),
  );
}

const OUTERMOST_AU = 10.1; // Saturn at its farthest from the Sun

/** Distance from the Sun on screen, as a share of the drawing's scale. */
export function radiusShare(dist: number): number {
  return Math.sqrt(dist / OUTERMOST_AU);
}

/** The scale `r` that keeps Saturn's whole orbit on a screen of half-size
 *  `half`, wherever round the Earth the Sun happens to be. */
export function scaleFor(half: number): number {
  return half / (1 + radiusShare(1));
}

/** Screen position of a point round the Sun (sx, sy): 0° longitude to the
 *  right, increasing anticlockwise, as on a star map. */
export function aroundSun(p: OrbitPoint, sx: number, sy: number, r: number): [number, number] {
  const d = radiusShare(p.dist) * r;
  const a = (p.lon * Math.PI) / 180;
  return [Math.round(sx + d * Math.cos(a)), Math.round(sy - d * Math.sin(a))];
}

/** Where the Sun goes on screen, the Earth (now at `earth` round the Sun)
 *  being at the centre (cx, cy). */
export function sunPosition(earth: OrbitPoint, cx: number, cy: number, r: number): [number, number] {
  const [ex, ey] = aroundSun(earth, 0, 0, r);
  return [cx - ex, cy - ey];
}

const MOON_RING = 0.08; // of the scale; a few pixels round the Earth

/** The Moon round the Earth at the centre. */
export function aroundEarth(p: OrbitPoint, cx: number, cy: number, r: number): [number, number] {
  const d = Math.max(3, MOON_RING * r);
  const a = (p.lon * Math.PI) / 180;
  return [Math.round(cx + d * Math.cos(a)), Math.round(cy - d * Math.sin(a))];
}
