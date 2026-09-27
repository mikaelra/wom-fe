// The Earth screen's clock (docs/MERCHANT_PLAN.md §5.3): what time the
// world is at, green while time runs normally, red and showing the
// timewarped time while someone has turned time back. Pure, so the
// formatting and the choice of instant are tested without React.

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:03 03.10.2028", on the viewer's own clock (local timezone). */
export function formatWorldClock(date: Date): string {
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())} ` +
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  );
}

export interface WorldClockInput {
  /** Is time turned back right now. */
  reverted: boolean;
  /** The instant it is turned back to. */
  revertToDate: string | null;
  /** /merchant/offer's sky_date: set during a revert, and in dev while the
   *  dev clock is moved (wom-be engine/dev_clock.py). */
  skyDate: string | null;
  /** When the merchant poll's answer (and so sky_date) arrived, ms -- the
   *  dev clock runs on from it. null until it first has: the clock is not
   *  shown before then, since whether time is warped isn't known yet. */
  skyDateReceivedAt: number | null;
  /** The viewer's own now, ms. */
  now: number;
}

/**
 * The instant the clock shows, and whether it is timewarped.
 *
 * Timewarped: the timewarped instant, running on like the rest of the
 * world (half an hour into a revert to 12:00 it reads 12:30). Otherwise
 * the world's own now: the dev clock's when one is set, else the viewer's.
 *
 * null -- show no clock at all -- while the poll hasn't answered yet, or
 * if the instant can't be read: never a NaN on screen.
 */
export function worldClockReading({
  reverted, revertToDate, skyDate, skyDateReceivedAt, now,
}: WorldClockInput): { date: Date; warped: boolean } | null {
  if (skyDateReceivedAt === null) return null;
  // sky_date is the world's instant when the poll answered -- timewarped
  // (and running on) during a revert, or the dev clock's -- so the clock
  // runs on from it. A revert without one falls back to its anchor.
  // Never backwards: the clock's own `now` ticks once a second, so it can
  // be a moment older than an answer that has just arrived.
  const runOn = (iso: string) => new Date(new Date(iso).getTime() + Math.max(0, now - skyDateReceivedAt));
  const reading =
    reverted && (skyDate || revertToDate)
      ? { date: skyDate ? runOn(skyDate) : new Date(revertToDate!), warped: true }
      : skyDate
        ? { date: runOn(skyDate), warped: false }
        : { date: new Date(now), warped: false };
  return Number.isNaN(reading.date.getTime()) ? null : reading;
}

/**
 * The timewarped clock's paint: the moment's colours as even, hard-edged
 * horizontal bands down the digits (CSS, drawn through the text) -- purple
 * alone for a full moon, a conjunction's two planets top and bottom, one
 * more band for each more colour. null for a single colour, which is just
 * the text colour.
 */
export function warpBands(colors: readonly string[]): string | null {
  if (colors.length < 2) return null;
  const step = 100 / colors.length;
  const stops = colors.flatMap((c, i) => [`${c} ${(i * step).toFixed(2)}%`, `${c} ${((i + 1) * step).toFixed(2)}%`]);
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

/** How long a timewarp lasts (wom-be domain/merchant.py REVERT_WINDOW). */
export const TIMEWARP_WINDOW_MS = 60 * 60 * 1000;

/** What the clock falls back to when a timewarp has no colours of its own. */
export const WARP_FALLBACK_COLOR = '#f87171';

/** What the colour drains to as the timewarp's hour runs out. */
export const WARP_SPENT_COLOR = '#6b7280';

/** How much of the timewarp's hour is left, 1 -> 0. 1 when its end isn't
 *  known (a backend that doesn't say) -- the colour then simply stays. */
export function warpRemaining(expiresAt: string | null | undefined, now: number): number {
  if (!expiresAt) return 1;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return 1;
  return Math.min(1, Math.max(0, (end - now) / TIMEWARP_WINDOW_MS));
}

/**
 * The timewarped clock's paint, drawn through the digits: the moment's
 * colours (warpBands, one colour, or the red fallback) with grey coming
 * over them from the left as the hour runs out -- half grey after half an
 * hour, all grey at the end. CSS background layers, top first.
 */
export function warpPaint(colors: readonly string[], remaining: number): string {
  const spent = ((1 - Math.min(1, Math.max(0, remaining))) * 100).toFixed(2);
  const grey = `linear-gradient(to right, ${WARP_SPENT_COLOR} 0%, ${WARP_SPENT_COLOR} ${spent}%, transparent ${spent}%, transparent 100%)`;
  const one = colors[0] ?? WARP_FALLBACK_COLOR;
  const color = warpBands(colors) ?? `linear-gradient(${one}, ${one})`;
  return `${grey}, ${color}`;
}
