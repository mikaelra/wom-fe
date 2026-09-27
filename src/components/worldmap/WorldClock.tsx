'use client';

import { useEffect, useState } from 'react';
import { formatWorldClock, worldClockReading, type WorldClockInput } from '@/lib/worldClock';

/**
 * A plain digital clock under the Rules button on the Earth screen:
 * "HH:MM DD.MM.YYYY", green in normal time, red showing the timewarped
 * instant while time is turned back (lib/worldClock.ts).
 */
export default function WorldClock(props: Omit<WorldClockInput, 'now'>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { date, warped } = worldClockReading({ ...props, now });
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
