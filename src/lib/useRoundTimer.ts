import { useEffect, useState } from 'react';

/** Seconds until `roundEndTime`, ticking every second; null when there is
 *  no active deadline. */
export function useRoundTimer(roundEndTime: string | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!roundEndTime) {
      setSecondsLeft(null);
      return;
    }
    const endTime = new Date(roundEndTime).getTime() / 1000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(endTime - Date.now() / 1000));
      setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [roundEndTime]);

  return secondsLeft;
}
