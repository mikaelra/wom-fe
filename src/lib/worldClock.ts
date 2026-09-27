// The Earth screen's clock (docs/MERCHANT_PLAN.md §5.3): what time the
// world is at, green while time runs normally, red and showing the
// timewarped instant while someone has turned time back. Pure, so the
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
 * Timewarped: the instant time is turned back to -- the sky is held there,
 * so the clock is too. Otherwise the world's own now: the dev clock's when
 * one is set (running on from when it was read), else the viewer's.
 *
 * null -- show no clock at all -- while the poll hasn't answered yet, or
 * if the instant can't be read: never a NaN on screen.
 */
export function worldClockReading({
  reverted, revertToDate, skyDate, skyDateReceivedAt, now,
}: WorldClockInput): { date: Date; warped: boolean } | null {
  if (skyDateReceivedAt === null) return null;
  const reading =
    reverted && revertToDate
      ? { date: new Date(revertToDate), warped: true }
      : skyDate
        ? { date: new Date(new Date(skyDate).getTime() + (now - skyDateReceivedAt)), warped: false }
        : { date: new Date(now), warped: false };
  return Number.isNaN(reading.date.getTime()) ? null : reading;
}
