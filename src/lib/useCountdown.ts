import { useEffect, useState } from 'react';

/**
 * Ticks a local countdown (whole seconds) from an already-known deadline,
 * re-deriving whenever the deadline itself changes -- unlike
 * useBossfightCountdown, this doesn't fetch the deadline itself, since the
 * caller already has it live from a server push (e.g. LobbyState's
 * ranked_countdown_deadline, docs/RANK_SYSTEM_PLAN.md §6, which can move
 * earlier mid-wait once the collapse rule kicks in -- this hook picking up
 * a changed `deadlineIso` is what makes that reflected in the UI).
 */
export function useCountdown(deadlineIso: string | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineIso) {
      setSecondsLeft(null);
      return;
    }
    const deadline = new Date(deadlineIso).getTime();
    const tick = () => {
      const diff = Math.floor((deadline - Date.now()) / 1000);
      setSecondsLeft(diff <= 0 ? 0 : diff);
    };
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [deadlineIso]);

  return secondsLeft;
}
