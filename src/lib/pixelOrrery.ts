import * as Astronomy from 'astronomy-engine';
import { BODY_COLOR } from '@/lib/bodyColors';
import { STAR_CATALOG } from '@/components/worldmap/starCatalog';

// The text Earth page's sky (components/text/PixelOrrery.tsx): the solar
// system as it is right now, drawn small and pixelated with the Earth at the
// centre of the screen and every planet placed round the Sun, so the picture
// shows the Sun at the centre of the solar system, seen from where we stand
// (Mikael, 2026-10-10; the orbit lines were taken out again the same day). The Moon
// circles the Earth on a small ring of its own.
//
// Seen as the 3D globe's camera sees it (components/worldmap/WorldMap.tsx):
// from a little above the ecliptic, turning round the Earth along it, so
// every planet gets its turn in front -- a turntable (Mikael, 2026-10-10).
// Behind it the real bright stars (the globe's own catalogue, no Milky Way)
// turn with it.
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

const SUN_COLOR = 0xffe600; // bright yellow, drawn with a white centre
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

const OUTERMOST_AU = 10.1; // Saturn at its farthest from the Sun

/** Distance from the Sun on screen, as a share of the drawing's scale. */
export function radiusShare(dist: number): number {
  return Math.sqrt(dist / OUTERMOST_AU);
}

// ── The scene: the Earth at the origin, the ecliptic the x-y plane (x
// towards 0° longitude, z its north pole), measured in Saturn-distances --
// Saturn, wherever it is now, is 1 from the Earth.

export type Vec3 = [number, number, number];

const deg = Math.PI / 180;

/** A point round the Sun on the squeezed scale, the Sun at the origin. */
function aroundSunPlane(p: OrbitPoint): [number, number] {
  const d = radiusShare(p.dist);
  return [d * Math.cos(p.lon * deg), d * Math.sin(p.lon * deg)];
}

const MOON_RING = 0.08; // of the Earth-Sun spacing's scale: a few pixels out

/** Every body, from the Earth, in Saturn-distances. */
export function sceneBodies(
  planets: Record<Planet, OrbitPoint>,
  moon: OrbitPoint,
): Record<Exclude<OrreryBody, 'Earth'>, Vec3> {
  const [ex, ey] = aroundSunPlane(planets.Earth);
  const [satX, satY] = aroundSunPlane(planets.Saturn);
  const unit = Math.hypot(satX - ex, satY - ey) || 1;
  const from = (x: number, y: number): Vec3 => [(x - ex) / unit, (y - ey) / unit, 0];
  const at = (p: Planet) => from(...aroundSunPlane(planets[p]));
  return {
    Sun: from(0, 0),
    Mercury: at('Mercury'),
    Venus: at('Venus'),
    Mars: at('Mars'),
    Jupiter: at('Jupiter'),
    Saturn: at('Saturn'),
    Moon: [(MOON_RING * Math.cos(moon.lon * deg)) / unit, (MOON_RING * Math.sin(moon.lon * deg)) / unit, 0],
  };
}

// ── The camera: like the globe's, it looks at the Earth from a little above
// the ecliptic and goes round it, one turn in five minutes (half the
// globe's autoRotateSpeed 0.4; Mikael, 2026-10-10).

/** How far above the ecliptic the camera looks down from. */
export const VIEW_TILT_DEG = 30;
/** One turn round the Earth. */
export const TURN_MS = 300_000;
/** The camera's distance from the Earth, in Saturn-distances: far enough
 *  that the far side isn't squashed to nothing, near enough for depth. */
const CAMERA_DIST = 3;

export interface Camera {
  pos: Vec3;
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
  focal: number;
  cx: number;
  cy: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The camera at `azimuth` (radians round the ecliptic from 0° longitude),
 *  on a screen centred on (cx, cy) of half-size (halfW, halfH): zoomed so
 *  Saturn reaches the side of the screen as it swings past, and the near and
 *  far side of its circle still fit top and bottom. */
export function turntableCamera(azimuth: number, cx: number, cy: number, halfW: number, halfH: number): Camera {
  const t = VIEW_TILT_DEG * deg;
  const [ca, sa, ct, st] = [Math.cos(azimuth), Math.sin(azimuth), Math.cos(t), Math.sin(t)];
  const pos: Vec3 = [CAMERA_DIST * ct * ca, CAMERA_DIST * ct * sa, CAMERA_DIST * st];
  const fwd: Vec3 = [-ct * ca, -ct * sa, -st];
  const right: Vec3 = [-sa, ca, 0];
  const up: Vec3 = [-st * ca, -st * sa, ct];
  const cam = { pos, fwd, right, up, focal: 1, cx, cy };
  // Saturn out to the side: CAMERA_DIST ahead, 1 across.
  const sideways = halfW * CAMERA_DIST;
  // Its circle's nearest and farthest points, top and bottom.
  const reach = Math.max(
    ...[1, -1].map((s) => {
      const d = sub([s * ca, s * sa, 0], pos);
      return Math.abs(dot(d, up) / dot(d, fwd));
    }),
  );
  cam.focal = Math.min(sideways, halfH / reach);
  return cam;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Where the camera starts: opposite the Sun, the Sun behind the Earth, as
 *  the globe's camera starts. */
export function startAzimuth(sun: Vec3): number {
  return Math.atan2(-sun[1], -sun[0]);
}

/** The camera's azimuth `elapsed` ms after it started at `start`. */
export function azimuthAt(start: number, elapsed: number): number {
  return start + (2 * Math.PI * elapsed) / TURN_MS;
}

/** A body on screen: where, and how much nearer than the Earth it is (above
 *  1, nearer; it is drawn bigger). Null behind the camera. */
export function project(cam: Camera, p: Vec3): { x: number; y: number; near: number } | null {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.fwd);
  if (z <= 0.01) return null;
  return {
    x: Math.round(cam.cx + (cam.focal * dot(d, cam.right)) / z),
    y: Math.round(cam.cy - (cam.focal * dot(d, cam.up)) / z),
    near: CAMERA_DIST / z,
  };
}

/** A star (a direction, infinitely far) on screen, or null when it's out
 *  of view. */
export function projectStar(cam: Camera, dir: Vec3, w: number, h: number): [number, number] | null {
  const z = dot(dir, cam.fwd);
  if (z <= 0) return null;
  const x = Math.round(cam.cx + (cam.focal * dot(dir, cam.right)) / z);
  const y = Math.round(cam.cy - (cam.focal * dot(dir, cam.up)) / z);
  return x >= 0 && x < w && y >= 0 && y < h ? [x, y] : null;
}

// ── The stars: the globe's catalogue (right ascension, declination) turned
// to the ecliptic.

const OBLIQUITY = 23.4393 * deg;

export interface SkyStar {
  dir: Vec3;
  mag: number;
}

export function eclipticStar(raHours: number, decDeg: number): Vec3 {
  const ra = raHours * 15 * deg;
  const dec = decDeg * deg;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return [x, y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY), -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY)];
}

export const SKY_STARS: SkyStar[] = STAR_CATALOG.map((s) => ({
  dir: eclipticStar(s.ra[0] + s.ra[1] / 60, s.dec),
  mag: s.mag,
}));
