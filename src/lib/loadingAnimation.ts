// The World of Mythos loading animation as pure maths -- no DOM, no canvas.
// <LoadingMark> draws whatever this says.
//
// The motion is designed in wom-tools (animation-generation/
// loading_animation.py, the "v13" loop) and exported as plain data into
// loadingAnimationSpec.json -- regenerate that file there rather than editing
// it here, so the frontend always plays exactly what was signed off. This
// module is a port of that script's timeline:
//
//   1. outfold -- the logo (dots and dotted edges removed) copies each spoke
//      and swings the copy round the spoke tip onto the dotted edge's place:
//      a cube. The whole figure spins up and down while it does. Or (v11,
//      startFoldedOut) it starts on the bare hexagon, and a copy of each of
//      those edges swings round the spoke tip into the center instead.
//   2. spin    -- the cube spins about the axis we look along: linear rev up,
//      top speed, linear rev down, ending where it started. A trail of fading
//      copies lags behind it (the "etterslep" from alkymistene's Merkabah),
//      reaching back at most trail.maxDegrees.
//   3. infold  -- the swung lines fold back into the center, spinning up and
//      down again: the start frame again, so the loop is seamless.
//
// v12, the rainbow: red through phases 1 and 3, and through the spin the
// colour runs round rainbow.colors; its trail reaches further back
// (rainbow.trailMaxDegrees).
//
// v13, the wheel: the hue runs once round the colour wheel over the whole
// loop, from red, with the rainbow's bigger trail.
//
// v14: 14a then 14b as one loop -- the center lines alone (no hexagon) each
// send two copies round their tip, one each way, onto the hexagon: the cube,
// which spins; then it spins again and the copies fold back into the center
// lines. The hue goes once round the colour wheel per half, red at each join.
//
// Each showing picks a version by `mix` (the golden mean, newest first).
//
// Coordinates are the spec's: world units, x right / y down, center at 0.

import specJson from './loadingAnimationSpec.json';

export type Point = readonly [number, number];
export type Segment = readonly [x0: number, y0: number, x1: number, y1: number];

/** The versions, newest first: v14, v13 (the wheel), v12 (the rainbow), and
 *  the single-colour v11 (hexagon start) and v10 (center-lines start). */
export const LOADING_KINDS = ['v14', 'wheel', 'rainbow', 'v11', 'v10'] as const;
export type LoadingKind = (typeof LOADING_KINDS)[number];
const SINGLE_COLOUR: readonly LoadingKind[] = ['v11', 'v10'];

type Fold = {
  holdBefore: number;
  duration: number;
  holdAfter: number;
  speed: number;
  /** Degrees the whole figure turns during the fold (spun up, then down). */
  spin: number;
};

export type LoadingAnimationSpec = {
  color: string;
  /** What the game plays it in: one picked at random each time it appears. */
  colors?: string[];
  /** The starts picked from at random the same way: false the logo's center
   *  lines swinging out (v10), true the bare hexagon folding them in (v11). */
  startsFoldedOut?: boolean[];
  /** How often each showing plays each version: by the golden mean, newest
   *  first (each 1/phi of what the newer ones leave). v11 and v10 play in a
   *  colour from `colors`; the wheel and the rainbow from either start. */
  mix?: Partial<Record<LoadingKind, number>>;
  /** v12: the colour runs round `colors` (evenly, in time) through the spin
   *  and is `color` the rest of the loop, with a trail capped at trailMaxDegrees. */
  rainbow?: { colors: string[]; trailMaxDegrees: number };
  /** v13: the hue once round the colour wheel over the loop, from red. */
  wheel?: { trailMaxDegrees: number };
  /** v14: 14a then 14b as one loop (see the top of this file). */
  v14?: { trailMaxDegrees: number };
  /** Set by specFor for v14: its timeline and figure in place of the others'. */
  layout?: 'v14';
  lineRadius: number;
  /** Half-width of the square view, in world units. */
  extent: number;
  center: Point;
  /** Each spoke tip and the hexagon corner its copy swings out to. */
  swing: { tip: Point; corner: Point }[];
  /** The hexagon edges that are always drawn. */
  edges: [Point, Point][];
  outfold: Fold;
  spin: { up: number; top: number; down: number; topSpeed: number; direction: number; speed: number };
  infold: Fold;
  /** maxDegrees caps how far back the trail reaches (v10): under half the
   *  figure's 120 deg symmetry, so the copies never wrap round onto poses
   *  that look like the start. Absent: the trail is time-spaced, as before. */
  trail: { seconds: number; echoes: number; gain: number; maxDegrees?: number };
};

export const LOADING_SPEC = specJson as unknown as LoadingAnimationSpec;

/** The pose at one instant: how far the copies have swung out (0 = logo,
 *  1 = cube) and how far the figure has spun so far in the loop, in degrees
 *  (cumulative across the phases). */
export type Pose = { progress: number; spin: number };

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Seconds the spin phase lasts at true speed. */
export function spinDuration(spec: LoadingAnimationSpec): number {
  const { up, top, down, speed } = spec.spin;
  return (up + top + down) / speed;
}

/** Degrees turned `t` seconds into the spin (linear rev up / rev down). */
export function spinAngle(spec: LoadingAnimationSpec, t: number): number {
  const { up: u, top: m, down: d, topSpeed, speed } = spec.spin;
  const w = topSpeed * speed;
  const up = u / speed;
  const top = m / speed;
  const down = d / speed;
  if (t <= up) return (w * t * t) / (2 * up);
  let angle = (w * up) / 2;
  t -= up;
  if (t <= top) return angle + w * t;
  angle += w * top;
  t = Math.min(t - top, down);
  return angle + w * (t - (t * t) / (2 * down));
}

/** Degrees turned `u` (0..1) through a fold of `total` degrees: speed ramps
 *  linearly up to the midpoint and back down, so it starts and ends still. */
export function foldSpin(u: number, total: number): number {
  return total * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
}

type Step = { seconds: number; pose: (u: number) => Pose };

function steps(spec: LoadingAnimationSpec): Step[] {
  const { outfold: o, infold: i } = spec;
  const spin = spinDuration(spec);
  const a1 = o.spin;
  const a2 = a1 + spinAngle(spec, spin);
  if (spec.layout === 'v14') {
    // 14a: unfold and spin; 14b: spin again (on from 14a's angle) and fold back
    const b2 = a2 + spinAngle(spec, spin);
    return [
      { seconds: o.holdBefore / o.speed, pose: () => ({ progress: 0, spin: 0 }) },
      { seconds: o.duration / o.speed, pose: (u) => ({ progress: smoothstep(u), spin: foldSpin(u, o.spin) }) },
      { seconds: o.holdAfter / o.speed, pose: () => ({ progress: 1, spin: a1 }) },
      { seconds: spin, pose: (u) => ({ progress: 1, spin: a1 + spinAngle(spec, u * spin) }) },
      { seconds: spin, pose: (u) => ({ progress: 1, spin: a2 + spinAngle(spec, u * spin) }) },
      { seconds: i.holdBefore / i.speed, pose: () => ({ progress: 1, spin: b2 }) },
      { seconds: i.duration / i.speed, pose: (u) => ({ progress: 1 - smoothstep(u), spin: b2 + foldSpin(u, i.spin) }) },
      { seconds: i.holdAfter / i.speed, pose: () => ({ progress: 0, spin: b2 + i.spin }) },
    ];
  }
  return [
    { seconds: o.holdBefore / o.speed, pose: () => ({ progress: 0, spin: 0 }) },
    { seconds: o.duration / o.speed, pose: (u) => ({ progress: smoothstep(u), spin: foldSpin(u, o.spin) }) },
    { seconds: o.holdAfter / o.speed, pose: () => ({ progress: 1, spin: a1 }) },
    { seconds: spin, pose: (u) => ({ progress: 1, spin: a1 + spinAngle(spec, u * spin) }) },
    { seconds: i.holdBefore / i.speed, pose: () => ({ progress: 1, spin: a2 }) },
    { seconds: i.duration / i.speed, pose: (u) => ({ progress: 1 - smoothstep(u), spin: a2 + foldSpin(u, i.spin) }) },
    { seconds: i.holdAfter / i.speed, pose: () => ({ progress: 0, spin: a2 + i.spin }) },
  ];
}

function poseIn(all: Step[], t: number): Pose {
  let rest = t;
  for (const step of all) {
    if (rest < step.seconds) return step.pose(rest / step.seconds);
    rest -= step.seconds;
  }
  return all[all.length - 1].pose(1);
}

/** Seconds one loop lasts. */
export function loopDuration(spec: LoadingAnimationSpec): number {
  return steps(spec).reduce((sum, s) => sum + s.seconds, 0);
}

/** The pose `t` seconds into the loop (wraps, so any t >= 0 works). */
export function poseAt(spec: LoadingAnimationSpec, t: number): Pose {
  const loop = loopDuration(spec);
  return poseIn(steps(spec), ((t % loop) + loop) % loop);
}

/** [start, end) seconds of the spin phase in the loop. */
export function spinWindow(spec: LoadingAnimationSpec): [number, number] {
  const start = steps(spec)
    .slice(0, 3)
    .reduce((sum, s) => sum + s.seconds, 0);
  return [start, start + spinDuration(spec)];
}

/** Cumulative spin degrees at loop time `t`. Unlike poseAt this does not
 *  wrap: times before 0 count as 0 (the trail never reaches into the
 *  previous loop) and times past the end as the loop's full turn. */
export function spinAt(spec: LoadingAnimationSpec, t: number): number {
  return poseIn(steps(spec), Math.max(t, 0)).spin;
}

/** Strength of each trail copy: copy 0 (the sharp figure) at 1, the rest
 *  fading linearly with age -- alkymistene's (1 - i/count) * gain * 8/count. */
export function echoWeights(spec: LoadingAnimationSpec): number[] {
  const count = Math.max(1, Math.round(spec.trail.echoes));
  const tail = count > 1 ? (spec.trail.gain * 8) / count : 0;
  return Array.from({ length: count }, (_, i) => (i === 0 ? 1 : (1 - i / count) * tail));
}

export type Echo = { spin: number; weight: number };

/** The copies to draw at loop time `t` (wrapped into one loop): the sharp
 *  figure first, then every trail copy whose angle differs from it. With
 *  trail.maxDegrees the copies are spaced evenly in angle over what the
 *  figure turned in the last trail.seconds, capped at maxDegrees; without
 *  it copy i shows the spin from i * trail / (count - 1) seconds ago. When
 *  nothing has moved for a trail's length this is just the sharp figure. */
export function echoesAt(spec: LoadingAnimationSpec, t: number): Echo[] {
  const loop = loopDuration(spec);
  const now = ((t % loop) + loop) % loop;
  const weights = echoWeights(spec);
  const last = weights.length - 1;
  const sharp = spinAt(spec, now);
  const max = spec.trail.maxDegrees;
  const swept = max === undefined ? 0 : Math.max(-max, Math.min(max, sharp - spinAt(spec, now - spec.trail.seconds)));
  const lag = last > 0 ? spec.trail.seconds / last : 0;
  const out: Echo[] = [{ spin: sharp, weight: 1 }];
  for (let i = 1; i < weights.length; i++) {
    const past = max === undefined ? spinAt(spec, now - i * lag) : sharp - (swept * i) / last;
    if (Math.abs(past - sharp) > 1e-9) out.push({ spin: past, weight: weights[i] });
  }
  return out;
}

/** The time in [t - trail.seconds, t] the figure had turned `degrees` (an
 *  echo's angle; spin only ever grows within a loop, so bisect). */
export function timeOfSpin(spec: LoadingAnimationSpec, degrees: number, t: number): number {
  let lo = Math.max(t - spec.trail.seconds, 0);
  let hi = t;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (spinAt(spec, mid) < degrees) lo = mid;
    else hi = mid;
  }
  return hi;
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The rainbow's colour at loop time `t` (wraps): spec.color outside the
 *  spin, running round rainbow.colors through it. */
export function rainbowColorAt(spec: LoadingAnimationSpec, t: number): string {
  const loop = loopDuration(spec);
  const now = ((t % loop) + loop) % loop;
  const [start, end] = spinWindow(spec);
  const stops = spec.rainbow?.colors ?? [];
  if (stops.length < 2 || !(start < now && now < end)) return spec.color;
  const x = ((now - start) / (end - start)) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const a = channels(stops[i]);
  const b = channels(stops[i + 1]);
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * (x - i)));
  return `rgb(${mix.join(', ')})`;
}

/** The wheel's colour at loop time `t` (wraps): the hue once round the
 *  colour wheel over the loop, from red, at full saturation and brightness. */
export function wheelColorAt(spec: LoadingAnimationSpec, t: number): string {
  const loop = loopDuration(spec);
  const h = ((((t % loop) + loop) % loop) / loop) * 6;
  const f = (n: number) => {
    const k = (n + h) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `rgb(${f(5)}, ${f(3)}, ${f(1)})`;
}

/** v14's colour at loop time `t` (wraps): the hue once round the colour
 *  wheel through 14a and again through 14b, red at each join. */
export function v14ColorAt(spec: LoadingAnimationSpec, t: number): string {
  const loop = loopDuration(spec);
  const now = ((t % loop) + loop) % loop;
  const half = steps(spec)
    .slice(0, 4)
    .reduce((sum, s) => sum + s.seconds, 0);
  const u = now < half ? now / half : (now - half) / (loop - half);
  return wheelColorAt(spec, u * loop);
}

/** The colours of echoesAt(spec, t)'s copies when the colour runs with time
 *  (`colorAt`, the rainbow's or the wheel's): each the colour the figure had
 *  when it was there, the sharp figure now's. */
export function echoColors(
  spec: LoadingAnimationSpec,
  t: number,
  echoes: Echo[],
  colorAt: (spec: LoadingAnimationSpec, t: number) => string,
): string[] {
  const loop = loopDuration(spec);
  const now = ((t % loop) + loop) % loop;
  return echoes.map((echo, i) => colorAt(spec, i === 0 ? now : timeOfSpin(spec, echo.spin, now)));
}

/** The spec as `kind` plays it: the rainbow and the wheel with their own
 *  (bigger) trail cap in place of the six's. */
export function specFor(spec: LoadingAnimationSpec, kind: LoadingKind): LoadingAnimationSpec {
  const own = SINGLE_COLOUR.includes(kind) ? undefined : spec[kind as 'v14' | 'wheel' | 'rainbow'];
  if (!own) return spec;
  return {
    ...spec,
    trail: { ...spec.trail, maxDegrees: own.trailMaxDegrees },
    ...(kind === 'v14' ? { layout: 'v14' as const } : {}),
  };
}

const pick = <T,>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

/** One of the spec's colours at random -- the colour for one showing of the
 *  animation. The spec's own colour when it lists none. */
export function pickLoadingColor(spec: LoadingAnimationSpec, random: () => number = Math.random): string {
  return pick(spec.colors?.length ? spec.colors : [spec.color], random);
}

/** One of the spec's starts at random (see startsFoldedOut); the logo's
 *  center lines when it lists none. */
export function pickLoadingStart(spec: LoadingAnimationSpec, random: () => number = Math.random): boolean {
  return pick(spec.startsFoldedOut?.length ? spec.startsFoldedOut : [false], random);
}

function rotate(p: Point, pivot: Point, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = p[0] - pivot[0];
  const y = p[1] - pivot[1];
  return [pivot[0] + c * x - s * y, pivot[1] + s * x + c * y];
}

/** The figure's line segments at swing `progress`, spun `spinDegrees`.
 *  `startFoldedOut` is v11's start: the hexagon's swung edges are always
 *  drawn and the copies swing from them into the center, rather than the
 *  center lines always drawn and the copies swinging out of them. */
export function segmentsAt(
  spec: LoadingAnimationSpec,
  progress: number,
  spinDegrees: number,
  startFoldedOut = false,
): Segment[] {
  const { center } = spec;
  const turn = (spec.spin.direction * spinDegrees * Math.PI) / 180;
  const spun = (lines: [Point, Point][]): Segment[] =>
    lines.map(([a, b]) => {
      const [x0, y0] = turn ? rotate(a, center, turn) : a;
      const [x1, y1] = turn ? rotate(b, center, turn) : b;
      return [x0, y0, x1, y1] as const;
    });
  if (spec.layout === 'v14') {
    // each spoke and two copies swinging round its tip, from the center, one
    // to each hexagon corner beside it (each edge runs from a tip)
    return spun(
      spec.swing.flatMap(({ tip, corner }, k) => [
        [center, tip] as [Point, Point],
        [tip, swungFrom(tip, center, corner, progress)] as [Point, Point],
        [tip, swungFrom(tip, center, spec.edges[k][1], progress)] as [Point, Point],
      ]),
    );
  }
  const lines: [Point, Point][] = [
    ...spec.swing.map(({ tip, corner }) => (startFoldedOut ? [tip, corner] : [center, tip]) as [Point, Point]),
    ...spec.edges,
  ];
  for (const { tip, corner } of spec.swing) {
    // The spoke's copy runs tip -> center; its free end swings round the tip
    // (the shortest way) until it points at the corner -- or from the corner
    // to the center, for startFoldedOut.
    const [from, to] = startFoldedOut ? [corner, center] : [center, corner];
    lines.push([tip, swungFrom(tip, from, to, progress)]);
  }
  return spun(lines);
}

/** `from` swung round `tip` toward `to` (the shortest way), `progress` of the way. */
function swungFrom(tip: Point, from: Point, to: Point, progress: number): [number, number] {
  const a0 = Math.atan2(from[1] - tip[1], from[0] - tip[0]);
  const a1 = Math.atan2(to[1] - tip[1], to[0] - tip[0]);
  const delta = ((((a1 - a0 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return rotate(from, tip, delta * progress);
}

/** One showing of the animation: which version, in what colour (v11/v10),
 *  from which start. */
export type LoadingVariant = { kind: LoadingKind; color: string; startFoldedOut: boolean };

/** The variant for one showing: the version by spec.mix (the oldest when it
 *  has none), a colour from the spec's for v11/v10, and its start -- v11's
 *  the hexagon, v10's the center lines, the others' either. */
export function pickLoadingVariant(spec: LoadingAnimationSpec, random: () => number = Math.random): LoadingVariant {
  let kind: LoadingKind = 'v10';
  if (spec.mix) {
    let r = random();
    for (const k of LOADING_KINDS) {
      const share = spec.mix[k] ?? 0;
      if (r < share) {
        kind = k;
        break;
      }
      r -= share;
    }
  }
  const single = SINGLE_COLOUR.includes(kind);
  const color = single ? pickLoadingColor(spec, random) : spec.color;
  const startFoldedOut = single ? kind === 'v11' : pickLoadingStart(spec, random);
  return { kind, color, startFoldedOut };
}
