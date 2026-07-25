// Pure geometry for the Wheel (docs/MONETIZATION_PLAN.md §3.5). No DOM, no
// canvas -- everything here is unit-testable arithmetic so the maths that
// can be wrong silently (odds fidelity, landing position) lives somewhere
// that isn't rendering.

export type WheelKind = 'normal' | 'special';

export type OddsEntry = { skin: string; weight: number; probability: number };

// Mirrors backend domain/wheels.py's WHEEL_TABLES exactly (§3.3). A stand-in
// until GET /wheel/tables (sub-phase 2a) exists to serve this over HTTP per
// §3.5.12 -- at that point this table is deleted and callers fetch instead.
const WHEEL_WEIGHTS: Record<WheelKind, [skin: string, weight: number][]> = {
  normal: [
    ['frog_blue_v1', 1],
    ['frog_orange_cursed_v1', 1],
    ['frog_pink_v1', 1],
    ['frog_purple_v1', 1],
    ['frog_red_v1', 1],
    ['frog_yellow_v1', 1],
  ],
  special: [
    ['frog_silver_v1', 18_900],
    ['frog_gold_v1', 9_000],
    ['frog_rainbow_v2', 2_000],
    ['frog_bling_v1', 100],
  ],
};

export function oddsTable(kind: WheelKind): OddsEntry[] {
  const rows = WHEEL_WEIGHTS[kind];
  const totalWeight = rows.reduce((sum, [, weight]) => sum + weight, 0);
  return rows.map(([skin, weight]) => ({ skin, weight, probability: weight / totalWeight }));
}

export function wheelKindFromString(kind: string): WheelKind {
  return kind === 'special' ? 'special' : 'normal';
}

const TWO_PI = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// §3.5.2's responsive geometry: the wheel is a fixed apparent curvature, the
// viewport a window onto it. R = 1.25 × W is load-bearing -- it's what
// keeps the visible arc at ~47-64° on every screen size instead of two
// designs for phone and desktop.
export type ViewportGeometry = {
  W: number;
  H: number;
  R: number;
  TOP_INSET: number;
  cx: number;
  cy: number;
  halfArc: number;
  faceDepth: number;
  R_inner: number;
  rimWidth: number;
};

// `minH` defaults to the 200px portrait floor; pass 180 for the
// landscape/short-viewport case (§3.5.2's "Landscape / short viewport"
// layout rule).
export function computeViewportGeometry(W: number, vh: number, minH = 200): ViewportGeometry {
  const H = clamp(0.38 * vh, minH, 460);
  const R = clamp(1.25 * W, 480, 2400);
  const TOP_INSET = 0.18 * H;
  const cx = W / 2;
  const cy = TOP_INSET + R;
  const halfArc = Math.asin(Math.min(1, W / 2 / R));
  const faceDepth = 1.05 * H;
  const R_inner = Math.max(R - faceDepth, 0.25 * R);
  const rimWidth = clamp(0.06 * H, 10, 26);
  return { W, H, R, TOP_INSET, cx, cy, halfArc, faceDepth, R_inner, rimWidth };
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export type Rng = () => number; // uniform in [0, 1)

// Slice angles are radians in wheel-local space, 0 = the slice that started
// the walk, increasing in the direction of travel. A separate `rotation`
// (also radians, unbounded -- see spinDistance) maps wheel-local angle to
// screen position: a slice centred at local angle `a` is under the fixed
// pointer (screen angle 0, top of the arc) when `a + rotation ≡ 0 (mod 2π)`.
export type Slice = {
  skin: string;
  startAngle: number;
  endAngle: number;
};

export type SliceGeometry = {
  slices: Slice[];
  /** Total slice count actually used (post-clamp), for tests/diagnostics. */
  N: number;
};

// Standard largest-remainder (Hamilton) apportionment: integer counts that
// sum to exactly `total` and track `weights`' proportions as closely as
// integers allow. Guarantees every nonzero weight gets at least one slice
// (stealing from the largest bucket rather than leaving a color undrawable)
// -- a 1-in-300 outcome like Bling must still occupy real, clickable area.
function apportion(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((s, w) => s + w, 0);
  const ideal = weights.map((w) => (sumWeights > 0 ? (w / sumWeights) * total : 0));
  const counts = ideal.map(Math.floor);
  let used = counts.reduce((s, c) => s + c, 0);

  const byRemainder = ideal
    .map((v, i) => ({ i, remainder: v - counts[i] }))
    .sort((a, b) => b.remainder - a.remainder);
  let cursor = 0;
  while (used < total && byRemainder.length > 0) {
    counts[byRemainder[cursor % byRemainder.length].i] += 1;
    used += 1;
    cursor += 1;
  }

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0 && weights[i] > 0) {
      const maxI = counts.indexOf(Math.max(...counts));
      counts[maxI] -= 1;
      counts[i] += 1;
    }
  }
  return counts;
}

// Emits each color index `counts[c]` times, shuffled (Fisher-Yates) rather
// than in a fixed pattern -- the wheel should look different each time it's
// built, not always the same arrangement rotated into place. Per-color
// counts (and so the drawn proportions) are unaffected by the shuffle.
function shuffledMultiset(counts: number[], rng: Rng): number[] {
  const multiset: number[] = [];
  counts.forEach((count, colorIndex) => {
    for (let i = 0; i < count; i++) multiset.push(colorIndex);
  });
  for (let i = multiset.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [multiset[i], multiset[j]] = [multiset[j], multiset[i]];
  }
  return multiset;
}

// Deterministic PRNG (mulberry32) -- lets a caller get a *different* shuffle
// each time the wheel is opened while still getting the *same* shuffle
// across re-renders within one session (e.g. a resize recomputing geometry
// shouldn't reshuffle the colors underneath the player), by re-seeding with
// the same value each time `buildSlices` is called.
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSlices(table: OddsEntry[], geom: { R: number; H: number }, rng: Rng = Math.random): SliceGeometry {
  const { R, H } = geom;
  // Doubled (was 0.09*H, clamped [26,46]) so each slice ends up twice as
  // wide -- half as many slices for the same wheel radius, per product
  // feedback.
  const SLICE_PX = clamp(0.18 * H, 52, 92);
  const targetSliceAngle = SLICE_PX / R; // radians -- arc length / radius, no unit conversion needed
  const N = clamp(Math.round(TWO_PI / targetSliceAngle), 24, 210);

  const counts = apportion(N, table.map((t) => t.weight));
  const order = shuffledMultiset(counts, rng);

  // Per-color total angle is exact by construction: colorAngle_c comes
  // straight from the weight ratio (sums to exactly 2π), and each slice
  // within a color is colorAngle_c / count_c -- so the drawn wheel is
  // always true to the odds regardless of how counts got rounded.
  const colorAngle = table.map((t) => TWO_PI * t.probability);
  const sliceAngle = table.map((_, i) => (counts[i] > 0 ? colorAngle[i] / counts[i] : 0));

  const slices: Slice[] = [];
  let angle = 0;
  for (const colorIndex of order) {
    const width = sliceAngle[colorIndex];
    slices.push({ skin: table[colorIndex].skin, startAngle: angle, endAngle: angle + width });
    angle += width;
  }

  return { slices, N };
}

/** Screen angle (radians, 0 = top / pointer, clockwise) a slice sits at for a given wheel `rotation`. */
export function screenAngleOf(slice: Slice, rotation: number): number {
  return mod((slice.startAngle + slice.endAngle) / 2 + rotation, TWO_PI);
}

// The boundary (slice edge / peg) currently nearest the fixed pointer, for
// peg-crossing detection. Deliberately does not assume a uniform slice
// angle (§3.5.3 allows per-color widths) -- it just scans for the nearest
// endAngle to wherever the pointer currently sits in wheel-local space.
export function boundaryIndexAt(slices: Slice[], rotation: number): number {
  const pointerLocalAngle = mod(-rotation, TWO_PI);
  let bestIndex = 0;
  let bestDistance = Infinity;
  slices.forEach((slice, i) => {
    const boundary = mod(slice.endAngle, TWO_PI);
    const raw = Math.abs(boundary - pointerLocalAngle);
    const distance = Math.min(raw, TWO_PI - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  });
  return bestIndex;
}

export type TargetRotation = {
  /** Radians, representative in [0, 2π). */
  rotation: number;
  /** Index into `slices` of the exact slice landed on -- the display layer
   * highlights this one slice, not every slice sharing its color (§9.3:
   * the win is "you landed on this wedge," not "this color is special"). */
  sliceIndex: number;
};

// Picks a wheel rotation that lands the winning color under the pointer:
// uniformly among that color's slices (so repeat wins don't all stop in
// the same place), with jitter so the flapper never rests ambiguously
// balanced on a peg (§3.5.7).
export function pickTargetRotation(slices: Slice[], resultSkin: string, rng: Rng): TargetRotation {
  const candidateIndices = slices.reduce<number[]>((acc, s, i) => {
    if (s.skin === resultSkin) acc.push(i);
    return acc;
  }, []);
  if (candidateIndices.length === 0) {
    throw new Error(`pickTargetRotation: no slice for skin "${resultSkin}"`);
  }
  const sliceIndex = candidateIndices[Math.min(candidateIndices.length - 1, Math.floor(rng() * candidateIndices.length))];
  const chosen = slices[sliceIndex];
  const width = chosen.endAngle - chosen.startAngle;
  const mid = (chosen.startAngle + chosen.endAngle) / 2;
  const jitter = (rng() * 2 - 1) * 0.35 * width;
  return { rotation: mod(-(mid + jitter), TWO_PI), sliceIndex };
}

// D = (target - current) mod 2π + turns * 2π, turns chosen so D covers at
// least `minRevolutions` -- guarantees zero velocity discontinuity at the
// moment STOP ROLL is pressed (the ease-out is a pure function of this D).
export function spinDistance(currentRotation: number, targetRotation: number, minRevolutions = 2.5): number {
  const modPart = mod(targetRotation - currentRotation, TWO_PI);
  const minDistance = minRevolutions * TWO_PI;
  const extraTurns = Math.max(0, Math.ceil((minDistance - modPart) / TWO_PI));
  return modPart + extraTurns * TWO_PI;
}
