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

/** The pins (Greece, the merchants) leave this fast at the start... */
export const MARKERS_OUT_MS = 400;
/** ...and come back this slowly at the end -- by which time the merchants
 *  may well be different ones: those of the moment warped to. */
export const MARKERS_IN_MS = 1500;

/** Where a preview warps to when not told: Mercury and Jupiter meeting on
 *  the full moon of 2028-10-03 (wom-be engine/conjunctions.py). */
export const DEFAULT_PREVIEW_TO = '2028-10-03T12:00:00Z';

export const TIMEWARP_PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

/**
 * Real moments to test the animation against, each with every event the
 * backend (wom-be engine/conjunctions.py, domain/merchant.py
 * sky_events_at) finds live then -- so a moment with several conjunctions,
 * or one on a full moon, plays in all of its colours. One for each pair of
 * planets (Jupiter and Saturn next meet in 2040), plus the moments with
 * more than one event.
 */
export const TIMEWARP_TEST_MOMENTS: readonly { label: string; to: string; value: string }[] = [
  { label: 'Full moon (2026-10-26)', to: '2026-10-26T05:00:00Z', value: 'full_moon' },
  { label: 'Mercury–Venus (2026-10-07)', to: '2026-10-07T00:05:52Z', value: 'Mercury-Venus' },
  { label: 'Mars–Jupiter (2026-11-16)', to: '2026-11-16T06:21:58Z', value: 'Mars-Jupiter' },
  { label: 'Mercury–Saturn (2027-04-19)', to: '2027-04-19T13:01:48Z', value: 'Mercury-Saturn' },
  { label: 'Venus–Saturn (2027-05-07)', to: '2027-05-07T18:44:27Z', value: 'Venus-Saturn' },
  { label: 'Mercury–Jupiter (2027-08-19)', to: '2027-08-19T22:46:49Z', value: 'Mercury-Jupiter' },
  { label: 'Venus–Jupiter (2027-08-26)', to: '2027-08-26T02:59:29Z', value: 'Venus-Jupiter' },
  { label: 'Venus–Mars (2027-11-25)', to: '2027-11-25T01:35:13Z', value: 'Venus-Mars' },
  { label: 'Mercury–Mars (2028-01-08)', to: '2028-01-08T20:55:40Z', value: 'Mercury-Mars' },
  { label: 'Mars–Saturn (2028-04-30)', to: '2028-04-30T22:35:53Z', value: 'Mars-Saturn' },
  { label: 'Jupiter–Saturn (2040-10-31)', to: '2040-10-31T11:54:11Z', value: 'Jupiter-Saturn' },
  {
    label: 'Three conjunctions (2026-04-20)',
    to: '2026-04-20T11:20:17Z',
    value: 'Mars-Saturn,Mercury-Saturn,Mercury-Mars',
  },
  { label: 'Full moon + Mercury–Jupiter (2028-10-03)', to: '2028-10-03T12:46:50Z', value: 'full_moon,Mercury-Jupiter' },
  { label: 'Full moon + Mercury–Venus (2030-12-10)', to: '2030-12-10T00:09:13Z', value: 'full_moon,Mercury-Venus' },
];

export interface TimewarpSpec {
  /** One colour per part, never blended: the full moon's purple, and a
   *  conjunction's two planets' own colours. */
  colors: string[];
  /** The moment time warps to. */
  to: Date;
  /** The events it names, in order: what a preview puts a merchant for
   *  on the globe at the end, standing under its Moon or conjunction. */
  events: { kind: 'full_moon' | 'conjunction'; key: string; bodies: string[] }[];
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
  const events: TimewarpSpec['events'] = [];
  const add = (c: string) => { if (!colors.includes(c)) colors.push(c); };
  for (const part of value.split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part === 'full_moon') {
      add(FULL_MOON_MERCHANT_COLOR);
      if (!events.some((e) => e.kind === 'full_moon')) events.push({ kind: 'full_moon', key: '', bodies: ['Moon'] });
      continue;
    }
    const [a, b] = part.split('-');
    if (a && b && a !== b && PLANET_COLOR[a] !== undefined && PLANET_COLOR[b] !== undefined) {
      add(hex(PLANET_COLOR[a]));
      add(hex(PLANET_COLOR[b]));
      if (!events.some((e) => e.key === part)) events.push({ kind: 'conjunction', key: part, bodies: [a, b] });
    }
  }
  if (colors.length === 0) {
    add(FULL_MOON_MERCHANT_COLOR);
    events.push({ kind: 'full_moon', key: '', bodies: ['Moon'] });
  }
  const parsed = to ? new Date(to) : null;
  return {
    colors,
    events,
    to: parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(DEFAULT_PREVIEW_TO),
  };
}

/** A moment's timewarp colours from its events -- every colour, each once
 *  (the full moon's purple, each conjunction's two planets). Empty when
 *  there are no events to colour it by. */
export function timewarpColorsFor(
  events: readonly ({ kind: string; key: string } | null | undefined)[],
): string[] {
  const real = events.filter((e): e is { kind: string; key: string } => !!e);
  if (real.length === 0) return [];
  return parseTimewarp(timewarpParamFor(real), null)!.colors;
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
  /** 0..1: how visible the pins on the globe are. */
  markers: number;
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
  const markers = elapsed < end - MARKERS_IN_MS
    ? 1 - smooth(elapsed / MARKERS_OUT_MS)
    : smooth((elapsed - (end - MARKERS_IN_MS)) / MARKERS_IN_MS);
  return { spin, scrub, glow, markers, done: elapsed >= end };
}

/** The sky's instant `scrub` of the way from `from` to `to`. */
export function scrubDate(from: Date, to: Date, scrub: number): Date {
  return new Date(from.getTime() + (to.getTime() - from.getTime()) * scrub);
}

/** What the drawing reads each frame while an animation runs. */
export const timewarpFxState: { glow: number; spin: number; markers: number; colors: string[] } = {
  glow: 0,
  spin: 0,
  markers: 1,
  colors: [FULL_MOON_MERCHANT_COLOR],
};

/** The CSS variables the pins' DOM labels read their fade from -- the
 *  labels are HTML over the canvas, out of reach of the 3D fade. */
export const MARKER_OPACITY_VAR = '--timewarp-markers';
export const MARKER_EVENTS_VAR = '--timewarp-markers-events';

/** Fade the pins' labels to `markers` (1 clears it back to normal). */
export function applyMarkerLabelFade(markers: number, root: HTMLElement = document.documentElement): void {
  if (markers >= 1) {
    root.style.removeProperty(MARKER_OPACITY_VAR);
    root.style.removeProperty(MARKER_EVENTS_VAR);
    return;
  }
  root.style.setProperty(MARKER_OPACITY_VAR, String(Math.max(0, markers)));
  // Invisible labels must not take clicks.
  root.style.setProperty(MARKER_EVENTS_VAR, markers < 0.2 ? 'none' : 'auto');
}
