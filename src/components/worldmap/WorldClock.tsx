'use client';

import { useEffect, useState } from 'react';
import { formatWorldClock, warpBands, worldClockReading, type WorldClockInput } from '@/lib/worldClock';

/**
 * A plain digital clock under the Rules button, on the Earth and city screens:
 * "HH:MM DD.MM.YYYY", green in normal time, and while time is turned back
 * showing the timewarped time in the moment's colours -- purple for a full
 * moon, a conjunction's two planets in horizontal bands (lib/worldClock.ts).
 * Red only when a timewarp has no colours to show.
 */
export default function WorldClock({
  warpColors = [],
  ...props
}: Omit<WorldClockInput, 'now'> & { warpColors?: readonly string[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reading = worldClockReading({ ...props, now });
  // Nothing at all until the time is known -- no placeholder, no NaN.
  if (!reading) return null;
  const { date, warped } = reading;
  const bands = warped ? warpBands(warpColors) : null;
  const single = warped && warpColors.length === 1 ? warpColors[0] : null;
  const colorClass = !warped ? 'text-green-400' : bands || single ? '' : 'text-red-400';
  return (
    <div
      role="timer"
      aria-label={warped ? 'Timewarped time' : 'Normal time'}
      className={`font-mono text-sm font-bold tracking-wider bg-black/60 rounded px-2 py-1 ${colorClass}`}
    >
      {/* The bands are painted through the digits, so they sit on an inner
          span -- the pill's own dark background stays behind them. */}
      <span
        style={
          bands
            ? { backgroundImage: bands, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
            : single
              ? { color: single }
              : undefined
        }
      >
        {formatWorldClock(date)}
      </span>
    </div>
  );
}
