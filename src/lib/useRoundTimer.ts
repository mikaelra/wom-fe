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
    const tick = () => {
      const remaining = Math.max(0, Math.floor(endTime - Date.now() / 1000));
      setSecondsLeft(remaining);
    };
    // Compute immediately, not just on the first interval tick -- otherwise
    // a new round's deadline is set but secondsLeft keeps its stale value
    // from the tail end of the *previous* round (often <=5, i.e. red-warn
    // range) for up to a second, making every warn-blink cue (buttons, and
    // now the reminder bubbles) flash briefly at the start of every round.
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [roundEndTime]);

  return secondsLeft;
}
