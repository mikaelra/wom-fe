'use client';

import { useEffect, useState } from 'react';
import { getSocket, subscribe } from '@/lib/socket';
import type { CityPresence } from '@/lib/schemas';

/**
 * How many people are in each of the city's three buildings right now --
 * the boss-fight temple, the ranked arena, the market (wom-be
 * sockets/city.py's `city_presence`).
 *
 * Pushed over the same kind of public, token-less watch room the bossfight
 * roster uses, but a much smaller payload (three ints) on a slower tick, so
 * this is its own subscription rather than riding the roster's. The server
 * answers a fresh watcher immediately and only rebroadcasts when a count
 * moves, so there is no poll fallback here -- a missed push just means a
 * stale sign for one tick, which for ambient signage is invisible.
 *
 * Stops when the component unmounts (leaving the city).
 */

const EMPTY: CityPresence = { bossfight: 0, ranked: 0, market: 0 };

export function useCityPresence(): CityPresence {
  const [presence, setPresence] = useState<CityPresence>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const unsub = subscribe('city_presence', (next) => {
      if (!cancelled) setPresence(next);
    });

    const sock = getSocket();
    const watch = () => sock.emit('watch_city_presence');
    // Re-sent on every reconnect: Socket.IO room membership doesn't survive
    // one, and a silently un-joined client would sit on a frozen sign.
    sock.on('connect', watch);
    watch();

    return () => {
      cancelled = true;
      unsub();
      sock.off('connect', watch);
      sock.emit('stop_watching_city_presence');
    };
  }, []);

  return presence;
}
