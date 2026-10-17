'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveBotRankedLobby, getBossfightRoster } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { LOBBY_START_NOTICE_MS, forgetSeat, readSeat, type Seat } from '@/lib/matchCloud';

// A bossfight or bot-ranked lobby the player is seated in, watched while they
// are anywhere else in the app: when its game starts, Blimkin gives a
// 5 second cloud with Join Lobby (Mikael, 2026-10-17). The seat is written
// where the player joins (lib/useEnterBossfight, lib/useBotRankedQueue).
// Both checks are peeks: the bossfight roster is public, and bot ranked's
// /active is asked with peek, so neither ever mints a lobby token.

const WATCH_MS = 3000;

function storedName(): string | null {
  try {
    return localStorage.getItem('playerName');
  } catch {
    return null;
  }
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

/** The seat whose game just started, for LOBBY_START_NOTICE_MS; null
 *  otherwise. `isShown(lobbyId)` says whether the player is looking at that
 *  lobby already (then nothing is announced). */
export function useLobbyStartNotice(isShown: (lobbyId: string) => boolean): {
  notice: Seat | null;
  dismiss: () => void;
} {
  const [notice, setNotice] = useState<Seat | null>(null);
  const isShownRef = useRef(isShown);
  isShownRef.current = isShown;
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (hideRef.current) clearTimeout(hideRef.current);
    setNotice(null);
  }, []);

  useEffect(() => {
    let busy = false;
    const id = setInterval(() => {
      const seat = readSeat();
      if (!seat || busy) return;
      busy = true;
      seatStarted(seat)
        .then((started) => {
          if (started === false) return;
          forgetSeat(seat.lobbyId);
          if (started && !isShownRef.current(seat.lobbyId)) {
            setNotice(seat);
            if (hideRef.current) clearTimeout(hideRef.current);
            hideRef.current = setTimeout(() => setNotice(null), LOBBY_START_NOTICE_MS);
          }
        })
        .catch(() => {
          // Tried again on the next tick.
        })
        .finally(() => {
          busy = false;
        });
    }, WATCH_MS);
    return () => {
      clearInterval(id);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, []);

  return { notice, dismiss };
}
