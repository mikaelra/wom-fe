// The merchants' calendar ahead of time: every full moon, new moon and
// planetary conjunction in a span -- what the iOS app's notifications
// (moonNotifications.ts) are scheduled from, on the device, with no server
// round trip.
//
// A port of the backend's own rules, which decide when a merchant is
// actually there (wom-be engine/moon.py, engine/conjunctions.py,
// domain/merchant.py sky_events_at), kept the same so a notification never
// promises a merchant the globe doesn't show:
//   full moon    the mean synodic month from a reference full moon (the
//                backend's approximation, not the real ephemeris)
//   new moon     astronomy-engine's SearchMoonPhase
//   conjunction  two of the five classical planets at the same geocentric
//                ecliptic longitude, found by a 6-hour scan then refined
// Each is live MERCHANT_WINDOW_MS either side of its exact instant.
// skyCalendar.test.ts pins instants the backend computed.

import * as Astronomy from 'astronomy-engine';

export type SkyEventKind = 'full_moon' | 'new_moon' | 'conjunction';

export interface UpcomingSkyEvent {
  kind: SkyEventKind;
  /** The exact instant -- the backend's period_start. */
  at: Date;
  /** ['Moon'], or a conjunction's two planets, inner first. */
  bodies: string[];
}

/** How long either side of the exact instant a merchant is there
 *  (FULL_MOON_WINDOW, NEW_MOON_WINDOW, CONJUNCTION_WINDOW). */
export const MERCHANT_WINDOW_MS = 24 * 3600 * 1000;

// engine/moon.py _REFERENCE_FULL_MOON and _SYNODIC_MONTH.
const REFERENCE_FULL_MOON = Date.UTC(2026, 8, 26, 16, 49, 32);
const SYNODIC_MONTH_MS = 29.530588853 * 86400 * 1000;

export function fullMoonsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let n = Math.ceil((start.getTime() - REFERENCE_FULL_MOON) / SYNODIC_MONTH_MS);
  for (let t = REFERENCE_FULL_MOON + n * SYNODIC_MONTH_MS; t < end.getTime(); t = REFERENCE_FULL_MOON + ++n * SYNODIC_MONTH_MS) {
    out.push(new Date(t));
  }
  return out;
}

export function newMoonsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let from = start;
  for (;;) {
    const t = Astronomy.SearchMoonPhase(0, from, 32);
    if (!t || t.date >= end) return out;
    out.push(t.date);
    from = new Date(t.date.getTime() + 86400 * 1000);
  }
}

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'] as const;

// engine/conjunctions.py _SCAN_STEP and _CROSSING_MAX_DEG.
const SCAN_STEP_MS = 6 * 3600 * 1000;
const CROSSING_MAX_DEG = 30;

function elon(body: string, t: Astronomy.AstroTime): number {
  return Astronomy.Ecliptic(Astronomy.GeoVector(body as Astronomy.Body, t, true)).elon;
}

/** Signed longitude difference, wrapped to (-180, 180]. */
function separation(a: string, b: string, t: Astronomy.AstroTime): number {
  const d = (((elon(a, t) - elon(b, t)) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export function conjunctionsBetween(start: Date, end: Date): UpcomingSkyEvent[] {
  const found: UpcomingSkyEvent[] = [];
  const steps = Math.floor((end.getTime() - start.getTime()) / SCAN_STEP_MS) + 1;
  const times = Array.from({ length: steps + 1 }, (_, i) => Astronomy.MakeTime(new Date(start.getTime() + i * SCAN_STEP_MS)));
  for (let i = 0; i < PLANETS.length; i++) {
    for (let j = i + 1; j < PLANETS.length; j++) {
      const [a, b] = [PLANETS[i], PLANETS[j]];
      let prev = separation(a, b, times[0]);
      for (let k = 1; k < times.length; k++) {
        const cur = separation(a, b, times[k]);
        if (prev * cur <= 0 && prev !== cur && Math.max(Math.abs(prev), Math.abs(cur)) < CROSSING_MAX_DEG) {
          const hit = Astronomy.Search((t) => separation(a, b, t), times[k - 1], times[k], { dt_tolerance_seconds: 1 });
          if (hit && hit.date >= start && hit.date < end) found.push({ kind: 'conjunction', at: hit.date, bodies: [a, b] });
        }
        prev = cur;
      }
    }
  }
  return found;
}

/** Every merchant-summoning event whose exact instant is in [start, end),
 *  in time order. */
export function skyEventsBetween(start: Date, end: Date): UpcomingSkyEvent[] {
  return [
    ...fullMoonsBetween(start, end).map((at) => ({ kind: 'full_moon' as const, at, bodies: ['Moon'] })),
    ...newMoonsBetween(start, end).map((at) => ({ kind: 'new_moon' as const, at, bodies: ['Moon'] })),
    ...conjunctionsBetween(start, end),
  ].sort((x, y) => x.at.getTime() - y.at.getTime());
}
