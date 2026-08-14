/**
 * Visual-inspection harness for the planetary-aspects system
 * (docs/ASPECTS_PLAN.md §6). Replaces the old DEBUG_FORCED_CONJUNCTIONS /
 * DEBUG_NOW module constants in WorldMap.tsx with a URL-addressable preset
 * registry, so a specific conjunction can be pinned and shared as a link
 * (`/?astro=<id>`) instead of hand-editing a constant and rebuilding.
 *
 * Only `SkyOverride`/`AspectBody` types are imported from ./astrology (type
 * imports, erased at compile time) -- this file has no runtime dependency
 * on astrology.ts, even though astrology.ts's getSky() imports the two
 * functions at the bottom of this file. That's a one-directional runtime
 * dependency (astrology.ts -> here), not a cycle.
 */
import * as Astronomy from 'astronomy-engine';
import type { AspectBody, SkyOverride } from './astrology';

export interface AspectPreset {
  id: string;
  label: string;
  /** What the reviewer should be looking at. */
  note?: string;
  /** Freezes the clock, replacing the old DEBUG_NOW. Omit to use the live clock. */
  date?: Date;
  overrides: SkyOverride[];
}

// Sun-Moon presets need a real new-moon date so the Moon's *rendered*
// terminator (real Phong shading under SunLight, not any phase number)
// agrees with the forced near-Sun position -- see docs/ASPECTS_PLAN.md §6.2.
// Searched forward from a fixed anchor (not `new Date()`) so this preset's
// look is reproducible across sessions rather than drifting with whenever
// the module happens to load.
const NEW_MOON_DATE: Date = Astronomy.SearchMoonPhase(
  0,
  new Astronomy.AstroTime(new Date('2026-01-01T00:00:00Z')),
  40,
)!.date;

// Mercury/Venus are always near the Sun as seen from Earth (inner
// planets), so on NEW_MOON_DATE they -- and whichever of Mars/Jupiter/
// Saturn happen to be nearby that date -- would otherwise clutter the
// Sun-Moon pair these presets exist to isolate. Pushed to near-antipodal
// positions (relative to the Sun's real, unoverridden direction) purely
// for visual clarity; none of these five are within any relevant orb of
// the Sun or Moon at 150°+, so this has zero effect on the sunWeight
// values these presets are meant to demonstrate.
const DECLUTTER_OVERRIDES: SkyOverride[] = [
  { body: 'Mercury', relativeTo: 'Sun', sepDeg: 160 },
  { body: 'Venus', relativeTo: 'Sun', sepDeg: 165 },
  { body: 'Mars', relativeTo: 'Sun', sepDeg: 170 },
  { body: 'Jupiter', relativeTo: 'Sun', sepDeg: 175 },
  { body: 'Saturn', relativeTo: 'Sun', sepDeg: 179 },
];

function sunMoon(id: string, sepDeg: number, sunWeight: string): AspectPreset {
  return {
    id,
    label: `Sun-Moon ${sepDeg}°`,
    note: `sunWeight ≈ ${sunWeight}. Purple tint and aura scale should ramp down monotonically ` +
      `as sepDeg goes 0→6; sun-moon-6 must be visually indistinguishable from no effect at all. ` +
      `The other five bodies are pushed out of view so the Sun-Moon pair isn't lost among them.`,
    date: NEW_MOON_DATE,
    overrides: [{ body: 'Moon', relativeTo: 'Sun', sepDeg }, ...DECLUTTER_OVERRIDES],
  };
}

// The 17 presets required by docs/ASPECTS_PLAN.md §6.2: 1 live + 6 planet
// pairs + 7 Sun-Moon + 3 Moon-regression (checked against master's old
// DEBUG_FORCED_CONJUNCTIONS behaviour, which never pinned a date).
const PRESETS: AspectPreset[] = [
  {
    id: 'live',
    label: 'Live sky',
    note: 'No overrides, real sky, live clock. The zero-aspect regression check.',
    overrides: [],
  },
  {
    id: 'mars-venus-1',
    label: 'Mars & Venus, 1° apart',
    note: 'Mars 0.631 tinted Venus (0xAB9D00); Venus 0.701 tinted Mars (0xFF0000).',
    overrides: [{ body: 'Mars', relativeTo: 'Venus', sepDeg: 1 }],
  },
  {
    id: 'jupiter-saturn-1',
    label: 'Jupiter & Saturn, 1° apart',
    note: 'Jupiter 0.577, Saturn 0.494 -- visibly asymmetric (different orbs), the clearest demo of §1.2.',
    overrides: [{ body: 'Saturn', relativeTo: 'Jupiter', sepDeg: 1 }],
  },
  {
    id: 'venus-saturn-2',
    label: 'Venus & Saturn, 2° apart',
    note: 'Venus 0.540, Saturn 0.222 -- the strongest asymmetry in the set (orb 7° vs 3°).',
    overrides: [{ body: 'Saturn', relativeTo: 'Venus', sepDeg: 2 }],
  },
  {
    id: 'venus-mercury-4',
    label: 'Venus & Mercury, 4° apart',
    note: 'Venus 0.293, Mercury 0.349 -- the weak/subtle end of the range.',
    overrides: [{ body: 'Mercury', relativeTo: 'Venus', sepDeg: 4 }],
  },
  {
    id: 'venus-mercury-1',
    label: 'Venus & Mercury, 1° apart',
    note: 'Venus 0.701, Mercury 0.725.',
    overrides: [{ body: 'Mercury', relativeTo: 'Venus', sepDeg: 1 }],
  },
  {
    id: 'venus-mercury-0',
    label: 'Venus & Mercury, exact conjunction',
    note: 'Both 1.000 -- full colour swap, max aura. Mercury (r=38) occludes Venus (r=40); expected, see §5.4.',
    overrides: [{ body: 'Mercury', relativeTo: 'Venus', sepDeg: 0 }],
  },
  sunMoon('sun-moon-0', 0, '1.000'),
  sunMoon('sun-moon-1', 1, '0.671'),
  sunMoon('sun-moon-2', 2, '0.494'),
  sunMoon('sun-moon-3', 3, '0.349'),
  sunMoon('sun-moon-4', 4, '0.222'),
  sunMoon('sun-moon-5', 5, '0.107'),
  sunMoon('sun-moon-6', 6, '0.000'),
  {
    id: 'moon-venus-0',
    label: '[Regression] Moon & Venus, exact conjunction',
    note: 'Must look exactly as it does on master with the equivalent DEBUG_FORCED_CONJUNCTIONS entry.',
    overrides: [{ body: 'Venus', relativeTo: 'Moon', sepDeg: 0 }],
  },
  {
    id: 'moon-venus-3',
    label: '[Regression] Moon & Venus, 3° apart',
    note: 'Must look exactly as it does on master with the equivalent DEBUG_FORCED_CONJUNCTIONS entry.',
    overrides: [{ body: 'Venus', relativeTo: 'Moon', sepDeg: 3 }],
  },
  {
    id: 'moon-saturn-0',
    label: '[Regression] Moon & Saturn, exact conjunction',
    note: 'Must look exactly as it does on master with the equivalent DEBUG_FORCED_CONJUNCTIONS entry.',
    overrides: [{ body: 'Saturn', relativeTo: 'Moon', sepDeg: 0 }],
  },
];

export function allPresets(): AspectPreset[] {
  return PRESETS;
}

/** Undefined for an unknown/missing id -- callers fall back to the live sky. */
export function resolvePreset(id: string | null | undefined): AspectPreset | undefined {
  if (!id) return undefined;
  return PRESETS.find((p) => p.id === id);
}

function currentPresetId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('astro') ?? undefined;
}

export function presetDate(): Date | undefined {
  return resolvePreset(currentPresetId())?.date;
}

export function presetOverrides(): SkyOverride[] | undefined {
  return resolvePreset(currentPresetId())?.overrides;
}

// Re-exported so /dev/aspects and anything else listing presets doesn't
// need to know about AspectBody's origin module.
export type { AspectBody };
