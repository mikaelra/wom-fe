'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveRankedLobby, renewRankedQueue } from '@/lib/api';
import { setStoredToken } from '@/lib/http';
import { useRankedQueue } from '@/lib/useRankedQueue';
import { isIosApp } from '@/lib/appleShop';
import { notifyRankedStarted } from '@/lib/matchNotice';
import {
  askDue,
  clearQueue,
  onLobbyPage,
  questionLapsed,
  readDontAsk,
  readQueue,
  renewDue,
  resumable,
  writeDontAsk,
  writeQueue,
  type RankedMatch,
} from '@/lib/matchCloud';

// The ranked queue, held once for the whole app instead of by the city page,
// so it is always with the player (Mikael, 2026-10-17): wherever they go,
// it keeps searching; a match found leaves them where they are (Blimkin's
// cloud, components/match/MatchCloud.tsx, and the city signpost tell them);
// and it survives a reload or a relaunch for as long as wom-be still holds
// the queue entry. Mounted in the root layout.

/** While a match is forming, how often its countdown and headcount are
 *  re-read. A peek: it never mints a lobby token. */
const FORMING_POLL_MS = 2000;
/** Once it has started, only to notice when it is over. */
const STARTED_POLL_MS = 10000;
/** How often the queue's 30-minute question and its renewal are checked. */
const QUEUE_CHECK_MS = 10000;

export interface RankedQueueApi {
  status: 'idle' | 'searching';
  match: RankedMatch | null;
  /** "Do you still want to be in the queue?" is open. */
  asking: boolean;
  startQueue: (name: string) => Promise<void>;
  cancelQueue: () => Promise<void>;
  /** Mint a token for the match and go to it. */
  joinMatch: () => Promise<void>;
  answerStillQueuing: (stay: boolean, dontAskAgain: boolean) => void;
}

const RankedQueueContext = createContext<RankedQueueApi | null>(null);

export function useRankedQueueContext(): RankedQueueApi {
  const value = useContext(RankedQueueContext);
  if (!value) throw new Error('useRankedQueueContext needs <RankedQueueProvider> (app/layout.tsx)');
  return value;
}

function storedName(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
  } catch {
    return null;
  }
}

function matchFrom(
  data: Awaited<ReturnType<typeof getActiveRankedLobby>>,
  prev: RankedMatch | null,
): RankedMatch | null {
  if (!data.lobby_id) return null;
  const same = prev?.lobbyId === data.lobby_id ? prev : null;
  return {
    lobbyId: data.lobby_id,
    players: data.players ?? same?.players ?? [],
    playerCount: data.player_count ?? same?.playerCount ?? 2,
    maxPlayers: data.max_players ?? same?.maxPlayers ?? 6,
    deadline: data.ranked_countdown_deadline,
    started: data.started,
  };
}

export default function RankedQueueProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [match, setMatch] = useState<RankedMatch | null>(null);
  const [asking, setAsking] = useState(false);
  /** The lobby whose start has been announced (or was already under way
   *  when the app learned of it), so the phone is told once. */
  const announcedRef = useRef<string | null>(null);

  const onMatch = useCallback((lobbyId: string) => {
    clearQueue();
    setAsking(false);
    setMatch((prev) =>
      prev?.lobbyId === lobbyId
        ? prev
        : { lobbyId, players: [], playerCount: 2, maxPlayers: 6, deadline: null, started: false },
    );
  }, []);

  const queue = useRankedQueue({ onMatch });
  const { startQueue: queueStart, cancelQueue: queueCancel, status } = queue;

  const startQueue = useCallback(
    async (name: string) => {
      const now = Date.now();
      writeQueue({ name, queuedAt: now, heardAt: now });
      try {
        await queueStart(name);
      } catch (err) {
        clearQueue();
        throw err;
      }
      // At once, so wom-be counts this queue as one that leaves when the
      // app goes away (RANKED_QUEUE_AWAY_SECONDS), not after half an hour.
      renewRankedQueue(name).catch(() => undefined);
    },
    [queueStart],
  );

  const cancelQueue = useCallback(async () => {
    clearQueue();
    setAsking(false);
    await queueCancel();
  }, [queueCancel]);

  // Pick up where the last page or launch left off: a match first (queueing
  // again while already seated would put the name in both), then the queue.
  // Once per app start.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const name = storedName();
    if (!name) return;
    getActiveRankedLobby(name, { peek: true })
      .then((data) => {
        const found = matchFrom(data, null);
        if (found) {
          if (found.started) announcedRef.current = found.lobbyId;
          clearQueue();
          setMatch(found);
          return;
        }
        const q = readQueue();
        if (q && q.name === name && resumable(q, Date.now())) {
          if (q.askedAt !== undefined) setAsking(true);
          queueStart(name).catch(() => clearQueue());
        } else if (q) {
          clearQueue();
        }
      })
      .catch(() => {
        // Best-effort: the player can always queue again.
      });
  }, [queueStart]);

  // Keep the found match current: its countdown, headcount and start, and
  // drop it once it's over.
  const lobbyId = match?.lobbyId;
  const started = match?.started ?? false;
  useEffect(() => {
    if (!lobbyId) return;
    const name = storedName();
    if (!name) return;
    let cancelled = false;
    const tick = () => {
      getActiveRankedLobby(name, { peek: true })
        .then((data) => {
          if (cancelled) return;
          setMatch((prev) => (data.lobby_id === lobbyId ? matchFrom(data, prev) : null));
        })
        .catch(() => {
          // The next tick tries again.
        });
    };
    tick();
    const id = setInterval(tick, started ? STARTED_POLL_MS : FORMING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lobbyId, started]);

  // Tell the phone the game has started, unless the player is looking at it.
  useEffect(() => {
    if (!lobbyId || !started || announcedRef.current === lobbyId) return;
    announcedRef.current = lobbyId;
    if (!isIosApp() || onLobbyPage(window.location.pathname, window.location.search, lobbyId)) return;
    notifyRankedStarted().catch(() => undefined);
  }, [lobbyId, started]);

  // While searching and the app is showing: ask after 30 minutes, and keep
  // wom-be's entry alive. Away for 2 minutes -- in the background, closed,
  // phone locked -- and the server drops it (Mikael, 2026-10-17), so the
  // app stops checking in while hidden, and on coming back lets go of a
  // queue the server no longer has.
  useEffect(() => {
    if (status !== 'searching') return;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const q = readQueue();
      if (!q) return;
      const now = Date.now();
      if (!resumable(q, now) || questionLapsed(q, now)) {
        void cancelQueue();
        return;
      }
      if (askDue(q, now, readDontAsk())) {
        writeQueue({ ...q, askedAt: now });
        setAsking(true);
      }
      if (renewDue(q, now)) {
        renewRankedQueue(q.name)
          .then(({ status: renewed }) => {
            if (renewed === 'not_queued') {
              void cancelQueue();
              return;
            }
            const latest = readQueue();
            if (latest) writeQueue({ ...latest, heardAt: Date.now() });
          })
          .catch(() => {
            // Tried again on the next check.
          });
      }
    };
    const id = setInterval(check, QUEUE_CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [status, cancelQueue]);

  const answerStillQueuing = useCallback(
    (stay: boolean, dontAskAgain: boolean) => {
      if (dontAskAgain) writeDontAsk();
      setAsking(false);
      if (!stay) {
        void cancelQueue();
        return;
      }
      const q = readQueue();
      if (!q) return;
      const now = Date.now();
      writeQueue({ name: q.name, queuedAt: now, heardAt: q.heardAt });
      // A "Yes" after the queue has already lapsed starts it again.
      renewRankedQueue(q.name)
        .then(() => {
          const latest = readQueue();
          if (latest) writeQueue({ ...latest, heardAt: Date.now() });
        })
        .catch(() => undefined);
    },
    [cancelQueue],
  );

  const joinMatch = useCallback(async () => {
    const name = storedName();
    if (!name || !lobbyId) return;
    const data = await getActiveRankedLobby(name);
    if (data.lobby_id && data.token) {
      setStoredToken(data.lobby_id, data.token);
      router.push(`/lobby?id=${data.lobby_id}`);
    } else {
      setMatch(null);
    }
  }, [lobbyId, router]);

  const value = useMemo<RankedQueueApi>(
    () => ({ status, match, asking, startQueue, cancelQueue, joinMatch, answerStillQueuing }),
    [status, match, asking, startQueue, cancelQueue, joinMatch, answerStillQueuing],
  );

  return <RankedQueueContext.Provider value={value}>{children}</RankedQueueContext.Provider>;
}
