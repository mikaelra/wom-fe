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
  /** When that sky_date was received, ms -- the dev clock runs on from it. */
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
 */
export function worldClockReading({
  reverted, revertToDate, skyDate, skyDateReceivedAt, now,
}: WorldClockInput): { date: Date; warped: boolean } {
  if (reverted && revertToDate) return { date: new Date(revertToDate), warped: true };
  if (skyDate && skyDateReceivedAt !== null) {
    return { date: new Date(new Date(skyDate).getTime() + (now - skyDateReceivedAt)), warped: false };
  }
  return { date: new Date(now), warped: false };
}
