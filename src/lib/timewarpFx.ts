// The timewarp animation on the globe (docs/MERCHANT_PLAN.md): the sky
// spins up, runs through time from now to the moment time is warped to --
// every planet travelling its real path there -- and settles, while clouds
// and electricity in the timewarp's colours wrap the globe.
//
// Pure: parsing what to play, the colours, and where in the animation a
// moment is. components/worldmap/TimewarpFx.tsx draws it and
// lib/useTimewarpFx.ts drives it.

import { FULL_MOON_MERCHANT_COLOR, PLANET_COLOR } from '@/lib/merchant';

/** How long the whole animation runs. */
export const TIMEWARP_DURATION_MS = 6000;
/** Spin up until here, then run through time... */
export const SPIN_UP_MS = 1000;
/** ...until here, then settle. */
export const SCRUB_END_MS = 4500;
/** How much faster than normal the sky turns at full spin. */
export const MAX_SKY_BOOST = 90;

/** Where a preview warps to when not told: Mercury and Jupiter meeting on
 *  the full moon of 2028-10-03 (wom-be engine/conjunctions.py). */
export const DEFAULT_PREVIEW_TO = '2028-10-03T12:00:00Z';

export const TIMEWARP_PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

export interface TimewarpSpec {
  /** One colour per part, never blended: the full moon's purple, and a
   *  conjunction's two planets' own colours. */
  colors: string[];
  /** The moment time warps to. */
  to: Date;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * What a `?timewarp` asks for. `value` is the parameter itself: "" or
 * "full_moon" for the full moon, "Mars-Jupiter" for a conjunction, both
 * comma-separated for a moment that had both. null when there is no
 * `?timewarp` at all.
 */
export function parseTimewarp(value: string | null, to: string | null): TimewarpSpec | null {
  if (value === null) return null;
  const colors: string[] = [];
  const add = (c: string) => { if (!colors.includes(c)) colors.push(c); };
  for (const part of value.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part === 'full_moon') {
      add(FULL_MOON_MERCHANT_COLOR);
      continue;
    }
    const [a, b] = part.split('-');
    if (a && b && a !== b && PLANET_COLOR[a] !== undefined && PLANET_COLOR[b] !== undefined) {
      add(hex(PLANET_COLOR[a]));
      add(hex(PLANET_COLOR[b]));
    }
  }
  if (colors.length === 0) add(FULL_MOON_MERCHANT_COLOR);
  const parsed = to ? new Date(to) : null;
  return {
    colors,
    to: parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(DEFAULT_PREVIEW_TO),
  };
}

/** The `?timewarp` value for the events a timewarp brought back -- what the
 *  inventory sends the player home with. */
export function timewarpParamFor(events: readonly { kind: string; key: string }[]): string {
  const parts: string[] = [];
  if (events.some((e) => e.kind === 'full_moon')) parts.push('full_moon');
  for (const e of events) if (e.kind === 'conjunction' && e.key) parts.push(e.key);
  return parts.join(',') || 'full_moon';
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export interface TimewarpFrame {
  /** 0..1: how fast the sky spins, as a share of MAX_SKY_BOOST. */
  spin: number;
  /** 0..1: how far through time from `from` to `to` the sky has run. */
  scrub: number;
  /** 0..1: how strong the clouds and electricity are. */
  glow: number;
  done: boolean;
}

/** Where the animation is `elapsed` ms in. */
export function timewarpFrame(elapsed: number): TimewarpFrame {
  const end = TIMEWARP_DURATION_MS;
  const spin = elapsed < SPIN_UP_MS
    ? smooth(elapsed / SPIN_UP_MS)
    : elapsed < SCRUB_END_MS
      ? 1
      : 1 - smooth((elapsed - SCRUB_END_MS) / (end - SCRUB_END_MS));
  const scrub = smooth((elapsed - SPIN_UP_MS) / (SCRUB_END_MS - SPIN_UP_MS));
  const glow = elapsed < 700 ? smooth(elapsed / 700) : 1 - smooth((elapsed - (end - 1200)) / 1200);
  return { spin, scrub, glow, done: elapsed >= end };
}

/** The sky's instant `scrub` of the way from `from` to `to`. */
export function scrubDate(from: Date, to: Date, scrub: number): Date {
  return new Date(from.getTime() + (to.getTime() - from.getTime()) * scrub);
}

/** What the drawing reads each frame while an animation runs. */
export const timewarpFxState: { glow: number; spin: number; colors: string[] } = {
  glow: 0,
  spin: 0,
  colors: [FULL_MOON_MERCHANT_COLOR],
};
