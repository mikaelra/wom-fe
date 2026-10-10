import * as Astronomy from 'astronomy-engine';
import { BODY_COLOR } from '@/lib/bodyColors';

// The text Earth page's sky (components/text/PixelOrrery.tsx): the Sun, the
// Moon and the planets the globe shows, where they really are as seen from
// Earth, drawn small and pixelated around the Earth at the centre. Each
// trails the path it took over the last year or two -- seen from Earth the
// planets loop back on themselves (retrograde), and the loops swing around
// the Sun: the Sun at the centre of the solar system, shown from where we
// stand.
//
// Directions are ecliptic longitude (the zodiac), distances in AU, squeezed
// onto the screen with a log scale -- Venus at its closest is a quarter of an
// AU away, Saturn ten: drawn to scale, the inner planets would be one pixel.

export type OrreryBody = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn';

export const ORRERY_BODIES: OrreryBody[] = ['Moon', 'Mercury', 'Venus', 'Sun', 'Mars', 'Jupiter', 'Saturn'];

/** Where a body is from Earth: ecliptic longitude in degrees, distance in AU. */
export interface GeoPoint {
  lon: number;
  dist: number;
}

const SUN_COLOR = 0xffd23f;

export function orreryColor(body: OrreryBody): number {
  return body === 'Sun' ? SUN_COLOR : BODY_COLOR[body];
}

export function geoPoint(body: OrreryBody, date: Date): GeoPoint {
  const time = Astronomy.MakeTime(date);
  const vec = body === 'Moon' ? Astronomy.GeoMoon(time) : Astronomy.GeoVector(Astronomy.Body[body], time, true);
  return { lon: Astronomy.Ecliptic(vec).elon, dist: vec.Length() };
}

// How far back each trail reaches, and how often it is sampled: long enough
// for a full loop (Mars needs two years), sparse enough to stay cheap -- the
// whole sky is about 1,500 positions, computed once per page.
const TRAIL: Record<OrreryBody, { days: number; step: number }> = {
  Moon: { days: 27, step: 1 },
  Mercury: { days: 365, step: 2 },
  Venus: { days: 584, step: 3 },
  Sun: { days: 365, step: 4 },
  Mars: { days: 780, step: 4 },
  Jupiter: { days: 730, step: 6 },
  Saturn: { days: 730, step: 8 },
};

const DAY_MS = 86_400_000;

/** The body's path over the trail's span up to `date`, oldest first. */
export function trail(body: OrreryBody, date: Date): GeoPoint[] {
  const { days, step } = TRAIL[body];
  const points: GeoPoint[] = [];
  for (let d = days; d >= 0; d -= step) points.push(geoPoint(body, new Date(date.getTime() - d * DAY_MS)));
  return points;
}

const NEAREST_AU = 0.25; // Venus at its closest
const FARTHEST_AU = 11; // Saturn at its farthest
const MOON_RING = 0.12; // the Moon, on its own small ring round the Earth
const INNER_EDGE = 0.2; // where the planets' log scale starts

/** Distance from the centre, as a share of the drawing's radius (0..1). */
export function radiusShare(body: OrreryBody, dist: number): number {
  if (body === 'Moon') return MOON_RING;
  const t = Math.log(Math.max(dist, NEAREST_AU) / NEAREST_AU) / Math.log(FARTHEST_AU / NEAREST_AU);
  return INNER_EDGE + (1 - INNER_EDGE) * Math.min(1, t);
}

/** A point's pixel position around the centre (cx, cy), radius `r`:
 *  0° longitude to the right, increasing anticlockwise, as on a star map. */
export function toXY(body: OrreryBody, p: GeoPoint, cx: number, cy: number, r: number): [number, number] {
  const share = radiusShare(body, p.dist) * r;
  const a = (p.lon * Math.PI) / 180;
  return [Math.round(cx + share * Math.cos(a)), Math.round(cy - share * Math.sin(a))];
}
