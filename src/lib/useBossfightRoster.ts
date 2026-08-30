'use client';

import { useEffect, useState } from 'react';
import { getBossfightRoster, type BossfightRoster } from '@/lib/api';

/**
 * Who is standing in the bossfight, for the city to draw inside its temple.
 *
 * Polled rather than pushed, deliberately. The socket only broadcasts to
 * connections that have joined the lobby with a session token, and joining
 * is exactly what a passer-by must not do -- the whole point of the roster
 * route is that looking costs you nothing. A poll on a slow interval is the
 * honest shape for "glance across the bay every few seconds"; a real-time
 * feed would be a lot of machinery for a figure that walks in once a minute.
 *
 * Stops while the tab is hidden. A city scene left open in a background tab
 * would otherwise poll all day for a picture nobody is looking at.
 */

/** Slow on purpose: people trickle into a bossfight over minutes. */
export const ROSTER_POLL_MS = 12_000;

const EMPTY: BossfightRoster = { lobby_id: null, round: 0, start_time: null, players: [] };

export function useBossfightRoster(pollMs: number = ROSTER_POLL_MS): BossfightRoster {
  const [roster, setRoster] = useState<BossfightRoster>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      // A failed poll leaves the last known roster on screen rather than
      // emptying the temple: a blink of a network error should not look
      // like everyone walked out.
      try {
        const next = await getBossfightRoster();
        if (!cancelled) setRoster(next);
      } catch {
        /* keep whatever we last saw */
      }
      if (!cancelled) timer = setTimeout(run, pollMs);
    };

    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        // Nothing to draw for, so do not ask. The visibility listener below
        // picks the poll straight back up when the tab returns.
        timer = setTimeout(run, pollMs);
        return;
      }
      void tick();
    };

    run();

    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pollMs]);

  return roster;
}
