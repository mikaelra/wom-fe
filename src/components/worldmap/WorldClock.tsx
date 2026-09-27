'use client';

import { useEffect, useState } from 'react';
import {
  formatWorldClock, warpPaint, warpRemaining, worldClockReading, type WorldClockInput,
} from '@/lib/worldClock';

/**
 * A plain digital clock under the Rules button, on the Earth and city screens:
 * "HH:MM DD.MM.YYYY", green in normal time, and while time is turned back
 * showing the timewarped time in the moment's colours -- purple for a full
 * moon, a conjunction's two planets in horizontal bands (lib/worldClock.ts).
 * Red only when a timewarp has no colours to show. Over the timewarp's hour
 * the colour greys out from the left: half grey at half an hour.
 */
export default function WorldClock({
  warpColors = [],
  revertExpiresAt = null,
  ...props
}: Omit<WorldClockInput, 'now'> & { warpColors?: readonly string[]; revertExpiresAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reading = worldClockReading({ ...props, now });
  // Nothing at all until the time is known -- no placeholder, no NaN.
  if (!reading) return null;
  const { date, warped } = reading;
  // Timewarped: the moment's colours through the digits, greying out from
  // the left as its hour runs out (lib/worldClock.ts warpPaint).
  const paint = warped ? warpPaint(warpColors, warpRemaining(revertExpiresAt, now)) : null;
  return (
    <div
      role="timer"
      aria-label={warped ? 'Timewarped time' : 'Normal time'}
      className={`font-mono text-sm font-bold tracking-wider bg-black/60 rounded px-2 py-1 ${warped ? '' : 'text-green-400'}`}
    >
      {/* The paint is drawn through the digits, so it sits on an inner
          span -- the pill's own dark background stays behind it. */}
      <span
        style={
          paint
            ? { backgroundImage: paint, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
            : undefined
        }
      >
        {formatWorldClock(date)}
      </span>
    </div>
  );
}
