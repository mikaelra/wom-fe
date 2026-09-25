'use client';

import { useEffect, useState } from 'react';
import { getBossfightRoster, type BossfightRoster } from '@/lib/api';
import { getSocket, subscribe } from '@/lib/socket';

/**
 * Who is standing in the bossfight, for the city to draw inside its temple
 * and to caption the signpost with.
 *
 * PUSHED, over a public read-only socket room (wom-be sockets/city.py).
 * The distinction from the lobby's own socket traffic is the whole point:
 * a watcher holds no session token and is never in the lobby's room, so
 * looking across the bay still costs them nothing. What arrives is exactly
 * what GET /get_bossfight_roster would have returned -- names and cosmetic
 * skins, no tokens, HP, relics or actions.
 *
 * This began as a 12-second poll, which was fine for figures appearing in
 * a doorway and wrong for the caption: it made "3 PLAYERS WAITING" a lie
 * for up to twelve seconds after the fight started, and that flip to
 * "PLAYING" is the moment worth watching.
 *
 * The poll is kept as a slow reconciliation pass rather than deleted. A
 * push can be missed -- a dropped frame, a backend that restarted between
 * broadcasts, a socket that reconnected into a room it has not rejoined
 * yet -- and without it the temple would stay wrong until the next time
 * somebody happened to change something, which in a quiet hour is never.
 * It also carries the very first frame, so the scene is populated whether
 * or not the socket is up.
 *
 * Stops while the tab is hidden. A city scene left open in a background
 * tab would otherwise poll all day for a picture nobody is looking at.
 */

/** Slow: this is the safety net under the push, not the delivery. */
export const ROSTER_POLL_MS = 60_000;

const EMPTY: BossfightRoster = { lobby_id: null, round: 0, start_time: null, players: [] };

export function useBossfightRoster(pollMs: number = ROSTER_POLL_MS): BossfightRoster {
  const [roster, setRoster] = useState<BossfightRoster>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped by every push. A poll that was already in flight when one
    // arrived is answering an older question, and applying it would flip
    // the signpost back to what it said a moment ago -- most visibly
    // right after the round starts, which is the one moment this has to
    // get right. Counted rather than timestamped so two events in the
    // same millisecond still order correctly.
    let pushes = 0;

    const tick = async () => {
      const pushesAtStart = pushes;
      // A failed poll leaves the last known roster on screen rather than
      // emptying the temple: a blink of a network error should not look
      // like everyone walked out.
      try {
        const next = await getBossfightRoster();
        if (!cancelled && pushes === pushesAtStart) setRoster(next);
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

    // The push. The server answers a fresh watcher immediately, so this
    // also fills the temple without waiting on the poll above.
    const unsubRoster = subscribe('bossfight_roster', (next) => {
      if (cancelled) return;
      pushes += 1;
      setRoster(next);
    });

    const sock = getSocket();
    const watch = () => sock.emit('watch_bossfight');
    // Re-sent on every reconnect, not just on mount: Socket.IO room
    // membership does not survive a reconnect, and a silently un-joined
    // watcher would sit on a frozen temple until the slow poll noticed.
    sock.on('connect', watch);
    watch();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubRoster();
      sock.off('connect', watch);
      sock.emit('stop_watching_bossfight');
    };
  }, [pollMs]);

  return roster;
}
