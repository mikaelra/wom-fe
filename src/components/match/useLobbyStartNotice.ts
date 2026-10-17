'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveBotRankedLobby, getBossfightRoster } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { forgetBotQueue, forgetSeat, readBotQueue, readSeat, rememberSeat, type Seat } from '@/lib/matchCloud';

// A bossfight or bot-ranked lobby the player is seated in, watched while they
// are anywhere else in the app: when its game starts, Blimkin brings a cloud
// with Join Lobby that stays up until it's closed (Mikael, 2026-10-17). The seat is written
// where the player joins (lib/useEnterBossfight, lib/useBotRankedQueue).
// Both checks are peeks: the bossfight roster is public, and bot ranked's
// /active is asked with peek, so neither ever mints a lobby token.
//
// Queued for bot ranked and walked off the city (whose hook hears the
// match-found push), the match is found here instead: the queue is
// remembered (lib/matchCloud's rememberBotQueue) and asked after.

const WATCH_MS = 3000;

function storedName(): string | null {
  try {
    return localStorage.getItem('playerName');
  } catch {
    return null;
  }
}

/** Queued for bot ranked: has a match been found meanwhile? Then it's a
 *  seat like any other. */
async function seatFromBotQueue(): Promise<Seat | null> {
  if (!readBotQueue()) return null;
  const token = getStoredAccountToken();
  if (!token) {
    forgetBotQueue();
    return null;
  }
  const active = await getActiveBotRankedLobby(token, { peek: true });
  if (!active.lobby_id) return null;
  forgetBotQueue();
  rememberSeat('bot_ranked', active.lobby_id);
  return readSeat();
}

/** Whether that seat's game has started (true), is still to start (false),
 *  or the seat is no longer the player's (null). */
async function seatStarted(seat: Seat): Promise<boolean | null> {
  if (seat.kind === 'bossfight') {
    const roster = await getBossfightRoster();
    if (roster.lobby_id !== seat.lobbyId) return null;
    const name = storedName();
    if (!roster.players.some((p) => p.name === name && !p.spectator)) return null;
    return roster.round > 0;
  }
  const token = getStoredAccountToken();
  if (!token) return null;
  const active = await getActiveBotRankedLobby(token, { peek: true });
  if (active.lobby_id !== seat.lobbyId) return null;
  return active.started;
}

/** The seat whose game started, until dismissed; null otherwise.
 *  `isShown(lobbyId)` says whether the player is looking at that lobby
 *  already (then nothing is announced). */
export function useLobbyStartNotice(isShown: (lobbyId: string) => boolean): {
  notice: Seat | null;
  dismiss: () => void;
} {
  const [notice, setNotice] = useState<Seat | null>(null);
  const isShownRef = useRef(isShown);
  isShownRef.current = isShown;
  const dismiss = useCallback(() => setNotice(null), []);

  useEffect(() => {
    let busy = false;
    const id = setInterval(() => {
      if (busy) return;
      const known = readSeat();
      if (!known && !readBotQueue()) return;
      busy = true;
      (known ? Promise.resolve(known) : seatFromBotQueue())
        .then(async (seat) => {
          if (!seat) return;
          const started = await seatStarted(seat);
          if (started === false) return;
          forgetSeat(seat.lobbyId);
          if (started && !isShownRef.current(seat.lobbyId)) setNotice(seat);
        })
        .catch(() => {
          // Tried again on the next tick.
        })
        .finally(() => {
          busy = false;
        });
    }, WATCH_MS);
    return () => clearInterval(id);
  }, []);

  return { notice, dismiss };
}
