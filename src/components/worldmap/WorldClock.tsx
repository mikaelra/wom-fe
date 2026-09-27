'use client';

import { useEffect, useState } from 'react';
import { formatWorldClock, worldClockReading, type WorldClockInput } from '@/lib/worldClock';

/**
 * A plain digital clock under the Rules button, on the Earth and city screens:
 * "HH:MM DD.MM.YYYY", green in normal time, red showing the timewarped
 * instant while time is turned back (lib/worldClock.ts).
 */
export default function WorldClock(props: Omit<WorldClockInput, 'now'>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reading = worldClockReading({ ...props, now });
  // Nothing at all until the time is known -- no placeholder, no NaN.
  if (!reading) return null;
  const { date, warped } = reading;
  return (
    <div
      role="timer"
      aria-label={warped ? 'Timewarped time' : 'Normal time'}
      className={`font-mono text-sm font-bold tracking-wider bg-black/60 rounded px-2 py-1 ${
        warped ? 'text-red-400' : 'text-green-400'
      }`}
    >
      {formatWorldClock(date)}
    </div>
  );
}
