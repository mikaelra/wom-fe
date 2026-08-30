/**
 * Which instant the city scene renders (docs/CITY_SCENE_PLAN.md §6.6).
 *
 * Defaults to now, so "night in Greece means night in the scene" is literal.
 * A `?t=` on the URL overrides it, which is how you look at a sky that is not
 * the one currently overhead -- a 2am starfield in the middle of the working
 * day, a solstice, a conjunction you want to see. Deliberately a URL
 * parameter rather than a constant: no code change is needed to go back to
 * real time, and a particular sky can be shared as a link.
 *
 * Pure and timezone-correct via Intl, so it is testable without a renderer
 * and does not hardcode an offset that breaks twice a year.
 */

export const ATHENS_TZ = 'Europe/Athens';

/**
 * How far `tz` is ahead of UTC, in minutes, at a given instant.
 *
 * Formats the instant in the zone, reads the resulting wall clock back as if
 * it were UTC, and takes the difference. This is the standard way to get a
 * zone offset without shipping a timezone database, and it follows DST --
 * Athens is UTC+2 in winter and UTC+3 in summer.
 */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Some environments render midnight as hour 24 under hour12:false.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant at which Athens' wall clock reads the given local time. */
export function athensWallClock(
  year: number, month: number, day: number, hour: number, minute: number,
): Date {
  // Treat the wall clock as UTC, then step back by the zone's offset. The
  // offset has to be sampled at the corrected instant, not the guess, or a
  // time near a DST boundary lands an hour out -- so sample twice and keep
  // the second answer when they disagree.
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstPass = new Date(guess - tzOffsetMinutes(ATHENS_TZ, new Date(guess)) * 60000);
  const settled = new Date(guess - tzOffsetMinutes(ATHENS_TZ, firstPass) * 60000);
  return settled;
}

/** Today's calendar date in Athens, for the bare `HH:MM` form below. */
export function athensToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATHENS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [year, month, day] = dtf.format(now).split('-').map(Number);
  return { year, month, day };
}

export interface CityTime {
  date: Date;
  /** True when `?t=` supplied it, so the UI can say the sky is not live. */
  overridden: boolean;
}

const HH_MM = /^(\d{1,2}):(\d{2})$/;
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})$/;

/**
 * Resolve `?t=` into an instant. Three accepted forms, all read as ATHENS
 * local time unless they carry their own offset:
 *
 *   02:00                      -> 2am Athens, today
 *   2026-12-21T02:00           -> 2am Athens, that date
 *   2026-12-21T02:00:00+02:00  -> exactly that instant
 *
 * Anything unparseable falls back to now rather than throwing: a bad link
 * should show the real sky, not a broken page.
 */
export function resolveCityTime(param: string | null | undefined, now: Date = new Date()): CityTime {
  const raw = param?.trim();
  if (!raw) return { date: now, overridden: false };

  const hhmm = HH_MM.exec(raw);
  if (hhmm) {
    const hour = Number(hhmm[1]);
    const minute = Number(hhmm[2]);
    if (hour > 23 || minute > 59) return { date: now, overridden: false };
    const { year, month, day } = athensToday(now);
    return { date: athensWallClock(year, month, day, hour, minute), overridden: true };
  }

  const local = LOCAL_ISO.exec(raw);
  if (local) {
    const [, y, mo, d, h, mi] = local;
    if (Number(h) > 23 || Number(mi) > 59) return { date: now, overridden: false };
    return {
      date: athensWallClock(Number(y), Number(mo), Number(d), Number(h), Number(mi)),
      overridden: true,
    };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return { date: parsed, overridden: true };

  return { date: now, overridden: false };
}

/**
 * An instant as a `?t=` value: Athens local `YYYY-MM-DDTHH:MM`.
 *
 * The inverse of `resolveCityTime`'s second form, so the scene's own time
 * controls can step forward an hour and hand the result straight back to the
 * URL. Carries the date as well as the clock deliberately -- stepping past
 * midnight with the bare `HH:MM` form would silently jump back to today.
 */
export function formatAthensParam(at: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATHENS_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  // Some environments render midnight as hour 24 under hour12:false.
  const hour = String(Number(parts.hour) % 24).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** Athens wall-clock time of an instant, for showing what is being viewed. */
export function formatAthensClock(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ATHENS_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(at);
}
