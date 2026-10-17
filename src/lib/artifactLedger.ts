/**
 * Formatting for the artifact discovery ledger.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The gap between two discoveries, as `3d04h12m45s`.
 *
 * Adaptive from the top only: leading units that are zero are dropped, so a
 * gap of twelve minutes reads `12m45s` rather than `00d00h12m45s`. Interior
 * zeros are kept — once days are showing, `05d00h03m02s` has to keep its
 * `00h`, because dropping it would read as five days and three minutes when
 * it is five days and three *hours*-worth of position. The seconds unit is
 * always present, so a sub-second gap reads `0s` rather than empty.
 *
 * Days are not padded: a two-digit pad would silently truncate nothing but
 * would look wrong the moment a gap runs past 99 days, which the ramp makes
 * likely for the early artifacts.
 */
export function formatDiscoveryGap(ms: number): string {
  // Clock skew or out-of-order rows shouldn't render as "-3s".
  const total = Math.max(0, Math.floor(ms));

  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) return `${days}d${pad(hours)}h${pad(minutes)}m${pad(seconds)}s`;
  if (hours > 0) return `${hours}h${pad(minutes)}m${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m${pad(seconds)}s`;
  return `${seconds}s`;
}

/**
 * Milliseconds between two ISO timestamps, or null when either is missing or
 * unparseable — a row with no date simply shows no gap rather than a wrong one.
 */
export function discoveryGapMs(
  previous: string | null | undefined,
  current: string | null | undefined,
): number | null {
  if (!previous || !current) return null;
  const a = new Date(previous).getTime();
  const b = new Date(current).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}
