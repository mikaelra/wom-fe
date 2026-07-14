import { useEffect, useState } from 'react';
import { getNextBossfightTime } from '@/lib/api';

export interface BossfightCountdown {
  /** Total seconds until the next scheduled boss fight. */
  secondsUntil: number | null;
  /** `secondsUntil` split into whole minutes... */
  raidMins: number | null;
  /** ...and the remaining seconds. */
  raidSecs: number | null;
}

/**
 * Fetches the next scheduled boss-fight time once (while `enabled`) and
 * ticks a countdown from it every second. `enabled` lets each caller
 * supply its own gating condition (e.g. "only while alive," "only when
 * no city is selected," "only once mounted") without this hook knowing
 * about any of them.
 */
export function useBossfightCountdown(enabled: boolean): BossfightCountdown {
  const [secondsUntil, setSecondsUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    getNextBossfightTime()
      .then((json) => {
        if (cancelled) return;
        const nextRT = new Date(json.start_time);
        intervalId = setInterval(() => {
          const diff = Math.floor((nextRT.getTime() - Date.now()) / 1000);
          setSecondsUntil(diff <= 0 ? 0 : diff);
        }, 1000);
      })
      .catch(() => {
        if (!cancelled) setSecondsUntil(null);
      });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled]);

  const raidMins = secondsUntil == null ? null : Math.floor(secondsUntil / 60);
  const raidSecs = secondsUntil == null ? null : Math.floor(secondsUntil % 60);

  return { secondsUntil, raidMins, raidSecs };
}
