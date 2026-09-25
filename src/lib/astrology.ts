/**
 * Planetary aspects — conjunctions (docs/ASPECTS_PLAN.md, Phase 1).
 *
 * Pure maths, extracted from src/components/worldmap/WorldMap.tsx so it's
 * node-testable (R3F scene components are out of scope for unit testing in
 * this repo -- see vitest.config.ts's coverage comments). A `Sky` snapshot
 * (every body's unit direction at one instant) is the single source of
 * truth: both the aspect maths (this file) and the rendered scene positions
 * (WorldMap.tsx) derive from the same snapshot, so a preset override can
 * never desync them -- the structural flaw DEBUG_FORCED_CONJUNCTIONS had,
 * where the maths and the rendering each kept their own copy of a forced
 * position that had to be hand-kept in sync.
 */
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

const RAD = Math.PI / 180;

// Observer at Earth centre (geocentric) -- same as WorldMap.tsx.
const OBSERVER = new Astronomy.Observer(0, 0, 0);

export type AspectBody = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn';

const ALL_BODIES: AspectBody[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

export const ASTRO_BODY: Record<AspectBody, Astronomy.Body> = {
  Sun: Astronomy.Body.Sun,
  Moon: Astronomy.Body.Moon,
  Mercury: Astronomy.Body.Mercury,
  Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars,
  Jupiter: Astronomy.Body.Jupiter,
  Saturn: Astronomy.Body.Saturn,
};

/** A body being placed a fixed separation from another body's direction --
 *  the generalised form of what DEBUG_FORCED_CONJUNCTIONS used to do by
 *  hand (forcing a position in the render layer only and leaving the maths
 *  layer to separately agree). `sign` is render-only (which side of
 *  `relativeTo` the body sits on); the maths only ever sees the magnitude
 *  of `sepDeg`. Exercised directly by computeSky's own tests; not
 *  currently wired to any UI-facing entry point. */
export interface SkyOverride {
  body: AspectBody;
  relativeTo: AspectBody;
  sepDeg: number;
  sign?: 1 | -1;
}

/** Every body's geocentric unit direction at one instant, plus the scalars
 *  derived from that instant. Positions here are the SINGLE source of
 *  truth: both the aspect maths and the rendered scene positions come from
 *  it, so a preset override can never desync them. */
export interface Sky {
  date: Date;
  dir: Record<AspectBody, THREE.Vector3>;
  mercuryRetrograde: boolean;
  /** Astronomy.Illumination(Moon).phase_fraction */
  moonPhaseFraction: number;
}

export interface BodyAspect {
  /** The body's own presentation colour: base -> solar saturation -> solar
   *  tint. Deliberately never blended toward a conjunct donor -- a body
   *  keeps its own identity; only its aura (below) picks up a nearby
   *  body's colour. Drives the glow shell. */
  color: THREE.Color;
  /** Base -> blended toward donors -> solar saturation -> solar tint. What
   *  a nearby body's presence actually looks like: the soft aura reads as
   *  the conjunct body's colour bleeding in, while the body itself
   *  (`color`, above) stays recognisably its own. */
  auraColor: THREE.Color;
  /** Combined conjunction weight, 0-1, capped. Drives colour mix and light gain. */
  influence: number;
  /** Drives glow-shell and aura opacity. Includes the solar terms. */
  strength: number;
  /** Sun proximity weight, 0-1. Exposed so render code can grow the aura. */
  sunWeight: number;
}

// ── RA/Dec -> THREE.Vector3 (moved from WorldMap.tsx) ──────────────────────

export function raDecToVec3(raHours: number, decDeg: number, radius: number): THREE.Vector3 {
  const ra = raHours * (Math.PI / 12);
  const dec = decDeg * RAD;
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.sin(ra),
  );
}

// Retrograde = geocentric ecliptic longitude moving westward (decreasing)
// over time. Sample two points one hour apart and check the sign of
// Δlongitude, unwrapping the 0/360° seam. Moved from WorldMap.tsx verbatim.
export function isRetrograde(body: Astronomy.Body, date: Date): boolean {
  const t1 = new Astronomy.AstroTime(date);
  const t2 = t1.AddDays(1 / 24);
  const lon1 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t1, true)).elon;
  const lon2 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t2, true)).elon;
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d < 0;
}

// ── Orbs, colours, strength tunables (docs/ASPECTS_PLAN.md §2) ────────────

// Orb: exact conjunction (0°) is max influence; beyond this many degrees a
// body has zero effect. Each body uses its OWN orb when it is the
// *receiver* -- Jupiter feels Saturn out to 4°, Saturn feels Jupiter only
// out to 3°, so a pair lights up asymmetrically (docs/ASPECTS_PLAN.md §1.2).
// Moon's orb (10°) is unchanged from before this module existed.
export const ORB: Record<AspectBody, number> = {
  Moon: 10,
  Mercury: 8,
  Venus: 7,
  Mars: 5,
  Jupiter: 4,
  Saturn: 3,
  Sun: 6, // amplification orb only -- the Sun never donates colour (§1.4)
};

// The falloff is a power curve, not linear: `weight = 1 - (sep/orb)^exp`
// with an exponent < 1 stays close to full strength for longer near 0°
// before dropping off toward the orb edge (a straight line drops
// immediately and evenly instead). That's what makes moderate separations
// -- a few degrees, which realistically happen far more often than an
// exact conjunction -- read as meaningfully close instead of mostly washed
// out. Unchanged from the Moon-only version of this maths.
const FALLOFF_EXP = 0.62;

export function conjunctionWeight(sepDeg: number, orbDeg: number): number {
  return Math.max(0, 1 - Math.pow(sepDeg / orbDeg, FALLOFF_EXP));
}

// What a body *gives* to whatever it conjoins. Colours match each planet's
// existing *Light/*Body tint. Mercury's non-retrograde value differs from
// its BASE_COLOR below (0xFFBC03 vs 0xDB9504) -- do not merge the two
// tables, they're deliberately distinct (docs/ASPECTS_PLAN.md §2.3).
const DONOR_COLOR: Record<Exclude<AspectBody, 'Sun'>, number> = {
  Moon: 0xcfe3ff,
  Mercury: 0xFFBC03,
  Venus: 0xAB9D00,
  Mars: 0xFF0000,
  Jupiter: 0x008296,
  Saturn: 0xA16300,
};

// What a body shows with no aspect active -- must be the exact literal each
// *Body component uses today so the zero-aspect invariant holds bit-for-bit.
const BASE_COLOR: Record<Exclude<AspectBody, 'Sun'>, number> = {
  Moon: 0xcfe3ff,
  Mercury: 0xDB9504,
  Venus: 0xAB9D00,
  Mars: 0xFF0000,
  Jupiter: 0x008296,
  Saturn: 0xA16300,
};

// Mercury's retrograde flip applies to both its donor and base colours.
const MERCURY_RETRO_COLOR = 0xCE70FF;

function donorColorHex(body: Exclude<AspectBody, 'Sun'>, mercuryRetrograde: boolean): number {
  return body === 'Mercury' && mercuryRetrograde ? MERCURY_RETRO_COLOR : DONOR_COLOR[body];
}

function baseColorHex(body: Exclude<AspectBody, 'Sun'>, mercuryRetrograde: boolean): number {
  return body === 'Mercury' && mercuryRetrograde ? MERCURY_RETRO_COLOR : BASE_COLOR[body];
}

// Per-body, optional: only the Moon has one today. Kept separate from the
// generic Sun amplification below so it can be extended to other bodies, or
// dropped, without touching that maths.
//
// Originally reused MERCURY_RETRO_COLOR (0xCE70FF) rather than inventing a
// second purple, but that pale lavender read as "way too light" at a real
// 0° Sun-Moon conjunction during visual review -- deliberately its own,
// noticeably darker purple now (same hue family, ~30 points lower
// lightness), since the two serve different jobs: Mercury retrograde is a
// small, crisp hue signal on a bright textured sphere, this is a wash
// meant to visibly darken the Moon's presentation near the Sun.
const MOON_SOLAR_TINT = 0x8A2BE2;
const SOLAR_TINT: Partial<Record<AspectBody, number>> = { Moon: MOON_SOLAR_TINT };
const SOLAR_TINT_MAX = 0.85;

// STRENGTH_BASE must be 0 for every planet -- that's what preserves the
// zero-aspect invariant for them (no aspect => strength stays exactly 0,
// same as today's fixed 0.4-opacity shells having no strength concept at
// all). STRENGTH_BOOST doesn't need to be 0 for that invariant (it's
// multiplied by influence, which is already 0 with nothing in range) --
// it's what determines how strong a real conjunction reads once one is
// active. The Moon's values are its existing baseline/boost, unchanged.
// Planets' boost raised from an initial 0.15 after visual review: even a
// solid ~0.5-0.7 influence conjunction (e.g. Mercury/Jupiter at ~1.3°,
// live) was landing at strength ~0.08-0.10, an aura opacity too faint to
// read as "the other planet's colour" rather than "nothing happening".
const STRENGTH_BASE: Record<AspectBody, number> = {
  Moon: 0.05, Mercury: 0, Venus: 0, Mars: 0, Jupiter: 0, Saturn: 0, Sun: 0,
};
const STRENGTH_BOOST: Record<AspectBody, number> = {
  Moon: 0.30, Mercury: 0.2, Venus: 0.2, Mars: 0.2, Jupiter: 0.2, Saturn: 0.2, Sun: 0,
};

// Sun amplification (docs/ASPECTS_PLAN.md §4.3).
const SUN_SATURATION_GAIN = 0.6;
const SUN_STRENGTH_GAIN = 1.2;
// Additive, NOT phase-scaled -- see the long comment on computeAspects
// below for why a multiplicative-only term would render every sun-moon-*
// preset as an identical black frame. Raised from an initial 0.075 after
// visual review: at that value a close Sun-Moon conjunction's purple tint
// was real in the data but unreadable next to the Sun's own much brighter
// sprite/glow -- both the tight glow shell and (more visibly) the aura
// needed more opacity to actually read against that competing brightness.
const SUN_CORONA_FLOOR = 0.2;

/** Multiply a colour's HSL saturation by `factor`, clamped to [0,1]. A
 *  no-op on a fully desaturated colour. */
function saturateBy(color: THREE.Color, factor: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.s = Math.min(1, Math.max(0, hsl.s * factor));
  return color.setHSL(hsl.h, hsl.s, hsl.l);
}

// ── Sky snapshot ────────────────────────────────────────────────────────

// SkyOverride placement: rotate dir[relativeTo] by sepDeg*sign around an
// axis perpendicular to it. This is exact -- the angle between the
// original and rotated vectors equals the rotation angle by construction,
// unlike a fixed-magnitude tangential offset (whose angular size depends
// on distance from the origin). Falls back to a different reference axis
// if the source direction sits almost exactly at the pole, where up x dir
// would be ~zero-length. Ported from WorldMap.tsx's old
// debugConjunctionPos, generalised to unit vectors (no bodyR scale).
function rotateByDeg(dir: THREE.Vector3, sepDeg: number): THREE.Vector3 {
  const up = Math.abs(dir.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axis = dir.clone().cross(up).normalize();
  return dir.clone().applyAxisAngle(axis, sepDeg * RAD);
}

/** Builds the real sky at `date`, then applies `overrides` (if any) on top.
 *  Overrides are resolved in array order; a `relativeTo` must already be
 *  resolved -- either a body this preset never touches (its real position),
 *  or an earlier override in the same list. A forward or circular
 *  reference throws rather than silently placing a body wrong. */
export function computeSky(date: Date, overrides?: SkyOverride[]): Sky {
  const time = new Astronomy.AstroTime(date);
  const dir = {} as Record<AspectBody, THREE.Vector3>;
  for (const body of ALL_BODIES) {
    const eq = Astronomy.Equator(ASTRO_BODY[body], time, OBSERVER, false, true);
    dir[body] = raDecToVec3(eq.ra, eq.dec, 1);
  }

  if (overrides && overrides.length > 0) {
    const willBeOverridden = new Set(overrides.map((o) => o.body));
    const applied = new Set<AspectBody>();
    for (const o of overrides) {
      if (willBeOverridden.has(o.relativeTo) && !applied.has(o.relativeTo)) {
        throw new Error(
          `SkyOverride for ${o.body} references ${o.relativeTo}, which is overridden later ` +
          `(or references itself) -- reorder so relativeTo resolves first.`,
        );
      }
      dir[o.body] = rotateByDeg(dir[o.relativeTo], o.sepDeg * (o.sign ?? 1));
      applied.add(o.body);
    }
  }

  const mercuryRetrograde = isRetrograde(Astronomy.Body.Mercury, date);
  const moonPhaseFraction = Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction;

  return { date, dir, mercuryRetrograde, moonPhaseFraction };
}

/** Separation between two bodies as placed in `sky` -- reads the resolved
 *  snapshot, so a preset override is automatically reflected without a
 *  second place to keep in sync. */
export function separationDeg(sky: Sky, a: AspectBody, b: AspectBody): number {
  return sky.dir[a].angleTo(sky.dir[b]) / RAD;
}

// Lazily-initialised module singleton, mirroring the old per-component
// `useMemo(() => debugNow(), [])` pattern but computed once for the
// session -- deliberately session-length, not per-frame or per-component,
// so the sky doesn't visibly drift mid-session as real time passes.
let cached: Sky | null = null;
export function getSky(): Sky {
  if (!cached) cached = computeSky(new Date());
  return cached;
}

/** Test-only: clears the getSky() singleton so a fresh call recomputes
 *  from the current clock. Production code never needs this -- the
 *  singleton is deliberately session-length. */
export function _resetSkyCache(): void {
  cached = null;
}

// ── Aspects ─────────────────────────────────────────────────────────────

const RECEIVABLE_BODIES: Exclude<AspectBody, 'Sun'>[] = [
  'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn',
];

/** For every body (including the Sun), the aspect it's currently under.
 *
 * Conjunctions are mutual: every non-Sun body can both donate colour to,
 * and receive colour from, every other non-Sun body -- each using its OWN
 * orb as the receiver (docs/ASPECTS_PLAN.md §1.1-2). The Sun donates no
 * colour and receives nothing (§1.4): its entry is inert (influence 0,
 * strength 0, its own placeholder colour), and it is excluded as a donor
 * to every other body. Instead the Sun amplifies whatever colour a nearby
 * body already has -- saturation boost, an optional per-body solar tint,
 * and an aura amplification with an additive "corona floor" term.
 *
 * The corona floor must be additive and OUTSIDE the phase-fraction scaling
 * below, not multiplicative: a body within the Sun's 6° orb is, for the
 * Moon, by definition a new moon (phase_fraction is ~0 across that whole
 * range). Multiplying the solar term by that near-zero phase fraction
 * would make every close Sun-Moon conjunction render as an identical black
 * frame -- the additive floor is what makes the effect visible at all, a
 * deliberate departure from "new moon = no moonlight" (read it as the
 * corona of an eclipse, per docs/ASPECTS_PLAN.md §4.3).
 */
export function computeAspects(sky: Sky): Record<AspectBody, BodyAspect> {
  const result = {} as Record<AspectBody, BodyAspect>;

  for (const receiver of RECEIVABLE_BODIES) {
    // influence still sums every donor in range (several simultaneous
    // conjunctions really should read as stronger overall), but the aura's
    // *colour* takes only the single strongest donor's true colour --
    // averaging multiple donors together (teal + amber, say) produced a
    // muddy, desaturated grey-brown that read as "nothing happening"
    // rather than "conjunct with that planet" (found during visual
    // review). A real simultaneous multi-donor conjunction is rare enough
    // that showing the dominant one is the right simplification.
    let weightSum = 0;
    let maxWeight = 0;
    let dominantDonorHex: number | null = null;
    for (const donor of RECEIVABLE_BODIES) {
      if (donor === receiver) continue;
      const sep = separationDeg(sky, receiver, donor);
      const weight = conjunctionWeight(sep, ORB[receiver]);
      if (weight <= 0) continue;
      weightSum += weight;
      if (weight > maxWeight) {
        maxWeight = weight;
        dominantDonorHex = donorColorHex(donor, sky.mercuryRetrograde);
      }
    }

    const influence = Math.min(1, weightSum);

    // `color` is the body's own identity -- deliberately never takes a
    // donor's colour at all. `auraColor` is the dominant donor's true
    // colour outright (not blended toward it) once one is in range; the
    // aura sprite is what actually shows a conjunct body's colour, while
    // the body/shell (`color`) stays recognisably itself. Both then get
    // the same Sun amplification below.
    const color = new THREE.Color(baseColorHex(receiver, sky.mercuryRetrograde));
    const auraColor = dominantDonorHex !== null ? new THREE.Color(dominantDonorHex) : color.clone();

    const raw = STRENGTH_BASE[receiver] + STRENGTH_BOOST[receiver] * influence;
    let strength = raw * (receiver === 'Moon' ? sky.moonPhaseFraction : 1);

    const sunWeight = conjunctionWeight(separationDeg(sky, receiver, 'Sun'), ORB.Sun);
    saturateBy(color, 1 + SUN_SATURATION_GAIN * sunWeight);
    saturateBy(auraColor, 1 + SUN_SATURATION_GAIN * sunWeight);
    const tint = SOLAR_TINT[receiver];
    if (tint !== undefined) {
      const tintColor = new THREE.Color(tint);
      color.lerp(tintColor, SOLAR_TINT_MAX * sunWeight);
      auraColor.lerp(tintColor, SOLAR_TINT_MAX * sunWeight);
    }
    strength = strength * (1 + SUN_STRENGTH_GAIN * sunWeight) + SUN_CORONA_FLOOR * sunWeight;

    result[receiver] = { color, auraColor, influence, strength, sunWeight };
  }

  // The Sun as receiver: inert. Nothing about SunBody/SunLight changes in
  // this pass -- the placeholder colour matches SunBody's own core tint
  // (0xfff7c2) purely so it's a sensible value, but nothing reads it.
  result.Sun = {
    color: new THREE.Color(0xfff7c2),
    auraColor: new THREE.Color(0xfff7c2),
    influence: 0,
    strength: 0,
    sunWeight: 0,
  };

  return result;
}
