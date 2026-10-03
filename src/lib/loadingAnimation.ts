// The World of Mythos loading animation as pure maths -- no DOM, no canvas.
// <LoadingMark> draws whatever this says.
//
// The motion is designed in wom-tools (animation-generation/
// loading_animation.py, the "v10" loop) and exported as plain data into
// loadingAnimationSpec.json -- regenerate that file there rather than editing
// it here, so the frontend always plays exactly what was signed off. This
// module is a port of that script's timeline:
//
//   1. outfold -- the logo (dots and dotted edges removed) copies each spoke
//      and swings the copy round the spoke tip onto the dotted edge's place:
//      a cube. The whole figure spins up and down while it does.
//   2. spin    -- the cube spins about the axis we look along: linear rev up,
//      top speed, linear rev down, ending where it started. A trail of fading
//      copies lags behind it (the "etterslep" from alkymistene's Merkabah),
//      reaching back at most trail.maxDegrees.
//   3. infold  -- the swung lines fold back into the center, spinning up and
//      down again: the start frame again, so the loop is seamless.
//
// Coordinates are the spec's: world units, x right / y down, center at 0.

import specJson from './loadingAnimationSpec.json';

export type Point = readonly [number, number];
export type Segment = readonly [x0: number, y0: number, x1: number, y1: number];

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

/** One of the spec's colours at random -- the colour for one showing of the
 *  animation. The spec's own colour when it lists none. */
export function pickLoadingColor(spec: LoadingAnimationSpec, random: () => number = Math.random): string {
  const colors = spec.colors?.length ? spec.colors : [spec.color];
  return colors[Math.min(colors.length - 1, Math.floor(random() * colors.length))];
}

function rotate(p: Point, pivot: Point, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = p[0] - pivot[0];
  const y = p[1] - pivot[1];
  return [pivot[0] + c * x - s * y, pivot[1] + s * x + c * y];
}

/** The figure's line segments at swing `progress`, spun `spinDegrees`. */
export function segmentsAt(spec: LoadingAnimationSpec, progress: number, spinDegrees: number): Segment[] {
  const { center } = spec;
  const lines: [Point, Point][] = [
    ...spec.swing.map(({ tip }) => [center, tip] as [Point, Point]),
    ...spec.edges,
  ];
  for (const { tip, corner } of spec.swing) {
    // The spoke's copy runs tip -> center; its free end swings round the tip
    // (the shortest way) until it points at the corner.
    const a0 = Math.atan2(center[1] - tip[1], center[0] - tip[0]);
    const a1 = Math.atan2(corner[1] - tip[1], corner[0] - tip[0]);
    const delta = ((((a1 - a0 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    lines.push([tip, rotate(center, tip, delta * progress)]);
  }
  const turn = (spec.spin.direction * spinDegrees * Math.PI) / 180;
  return lines.map(([a, b]) => {
    const [x0, y0] = turn ? rotate(a, center, turn) : a;
    const [x1, y1] = turn ? rotate(b, center, turn) : b;
    return [x0, y0, x1, y1] as const;
  });
}
