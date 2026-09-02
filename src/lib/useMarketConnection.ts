'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarketListings } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { getSocket, subscribe } from '@/lib/socket';
import type { MarketChatEntry, MarketListing } from '@/lib/market';

/**
 * The market's live board + common chat (wom-be sockets/market.py).
 *
 * Mirrors useBossfightRoster's shape: a socket room pushes every board
 * change (listing_created / listing_updated / listing_expired) and every
 * chat message, so the client never polls for those; a slow poll is kept
 * underneath as a reconciliation pass in case a push is missed (a dropped
 * frame, a backend restart, a socket that reconnected without rejoining
 * the room). Stops while the tab is hidden.
 *
 * Unlike the bossfight watch, `join_market` needs no token to watch --
 * only chat and posting are gated (server-side). The board is a public
 * browsable space.
 */

/** Slow: the safety net under the push, not the delivery. Short-ish
 *  because a /offer trade only lives 60s, so a missed "expired" push
 *  should still self-correct well within that. */
export const MARKET_POLL_MS = 20_000;

export type MarketConnection = {
  listings: MarketListing[];
  chat: MarketChatEntry[];
  /** (server clock - local clock) in ms, from the last successful fetch --
   *  feed to secondsRemaining() so a skewed local clock can't misjudge a
   *  60-second trade. */
  clockOffsetMs: number;
  /** Force a board refetch (e.g. right after this client posts/accepts). */
  refetch: () => void;
  sendChat: (message: string) => void;
};

function sortByNewest(a: MarketListing, b: MarketListing): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function useMarketConnection(pollMs: number = MARKET_POLL_MS): MarketConnection {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [chat, setChat] = useState<MarketChatEntry[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped by every board push. A poll already in flight when one lands
    // is answering an older question -- applying it would resurrect a card
    // that was just removed. Counted, not timestamped, so two events in
    // one millisecond still order.
    let pushes = 0;

    const tick = async () => {
      const at = pushes;
      try {
        const data = await getMarketListings();
        if (cancelled || pushes !== at) return;
        setClockOffsetMs(new Date(data.server_time).getTime() - Date.now());
        setListings([...data.listings].sort(sortByNewest));
      } catch {
        /* keep whatever we last saw -- a blink of a network error
           shouldn't wipe the board */
      }
      if (!cancelled) timer = setTimeout(run, pollMs);
    };

    const run = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(run, pollMs);
        return;
      }
      void tick();
    };

    refetchRef.current = () => { void tick(); };
    run();

    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    const upsert = (listing: MarketListing) => {
      pushes += 1;
      setListings((prev) => {
        const rest = prev.filter((l) => l.id !== listing.id);
        // Any non-open status drops the card off the board (§1A).
        if (listing.status !== 'open') return rest;
        return [listing, ...rest].sort(sortByNewest);
      });
    };
    const removeById = (id: number) => {
      pushes += 1;
      setListings((prev) => prev.filter((l) => l.id !== id));
    };

    const unsubs = [
      subscribe('listing_created', upsert),
      subscribe('listing_updated', upsert),
      subscribe('listing_expired', (p) => removeById(p.id)),
      subscribe('market_chat_backlog', (p) => setChat(p.messages)),
      subscribe('market_chat_message', (entry) => setChat((prev) => [...prev, entry].slice(-200))),
    ];

    const sock = getSocket();
    const join = () => sock.emit('join_market', { token: getStoredAccountToken() });
    // Re-sent on every reconnect: Socket.IO room membership doesn't survive
    // one, and a silently un-joined client would sit on a frozen board.
    sock.on('connect', join);
    join();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      unsubs.forEach((u) => u());
      sock.off('connect', join);
      sock.emit('leave_market');
    };
  }, [pollMs]);

  const refetch = useCallback(() => refetchRef.current(), []);
  const sendChat = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    getSocket().emit('send_market_message', { token: getStoredAccountToken(), message: trimmed });
  }, []);

  return { listings, chat, clockOffsetMs, refetch, sendChat };
}
