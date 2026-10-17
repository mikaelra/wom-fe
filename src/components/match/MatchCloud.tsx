'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import BlimkinCloud from '@/components/match/BlimkinCloud';
import { useRankedQueueContext } from '@/components/match/RankedQueueProvider';
import { useLobbyStartNotice } from '@/components/match/useLobbyStartNotice';
import { getActiveBotRankedLobby } from '@/lib/api';
import { getStoredAccountToken, setStoredToken } from '@/lib/http';
import { useCountdown } from '@/lib/useCountdown';
import { useToast } from '@/components/Toast';
import { RANKED, SEARCHING, STILL_QUEUING, lobbyStartedCloud, onLobbyPage, rankedCloud, type CloudContent, type Seat } from '@/lib/matchCloud';

// What Blimkin comes out to say, and where (Mikael, 2026-10-17):
//   1. "Do you still want to be in the queue?" after 30 minutes of ranked;
//   2. a bossfight or bot-ranked game you're seated in has started;
//   3. your ranked match: found (who you're up against; tap for the
//      countdown and X/6), then started (Join Game) -- except in the city,
//      where the signpost says it, and on the match's own page;
//   4. on the Earth screen while queued for ranked: "Searching" (black)
//      "Ranked" (red).
// Each cloud stays up until its cross closes it; a closed ranked cloud comes
// back when there's news (found -> started). Mounted once, in the root
// layout, inside <RankedQueueProvider>.

function Lines({ content, onAction }: { content: CloudContent; onAction?: () => void }) {
  return (
    <div>
      {content.lines.map((line) => (
        <p key={line} className="font-semibold">
          {line}
        </p>
      ))}
      {content.action && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction?.();
          }}
          className="mt-2 w-full rounded-full bg-[#111] text-[#fdfdf8] font-bold py-1.5 cursor-pointer hover:bg-black"
        >
          {content.action}
        </button>
      )}
    </div>
  );
}

export default function MatchCloud() {
  const rq = useRankedQueueContext();
  const router = useRouter();
  const pathname = usePathname();
  const { showError } = useToast();
  // The query string without useSearchParams, which would need a Suspense
  // boundary around the whole layout in the static export.
  const [search, setSearch] = useState('');
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);
  const isShown = useCallback((lobbyId: string) => onLobbyPage(pathname, search, lobbyId), [pathname, search]);

  const { notice, dismiss } = useLobbyStartNotice(isShown);

  const match = rq.match;
  const secondsLeft = useCountdown(match && !match.started ? match.deadline : null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [match?.lobbyId]);

  const [dontAsk, setDontAsk] = useState(false);

  // Clouds closed with the cross, by appearance key.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const close = useCallback((key: string) => setClosed((prev) => new Set(prev).add(key)), []);
  // Closed while searching: back with the next queue.
  useEffect(() => {
    if (rq.status === 'searching') return;
    setClosed((prev) => {
      if (!prev.has('searching')) return prev;
      const next = new Set(prev);
      next.delete('searching');
      return next;
    });
  }, [rq.status]);

  // The 30-minute question is asked again after the next 30 minutes.
  useEffect(() => {
    if (rq.asking) return;
    setClosed((prev) => {
      if (!prev.has('still-queuing')) return prev;
      const next = new Set(prev);
      next.delete('still-queuing');
      return next;
    });
  }, [rq.asking]);

  const joinRanked = useCallback(() => {
    rq.joinMatch().catch((err) => showError(err instanceof Error ? err.message : 'Failed to join the match.'));
  }, [rq, showError]);

  const joinSeat = useCallback(
    async (seat: Seat) => {
      dismiss();
      try {
        if (seat.kind === 'bot_ranked') {
          const token = getStoredAccountToken();
          const active = token ? await getActiveBotRankedLobby(token) : null;
          if (active?.lobby_id && active.token) setStoredToken(active.lobby_id, active.token);
        }
        router.push(`/lobby?id=${seat.lobbyId}`);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to join the lobby.');
      }
    },
    [dismiss, router, showError],
  );

  if (rq.asking && !closed.has('still-queuing')) {
    return (
      <BlimkinCloud appearance="still-queuing" label={STILL_QUEUING.question} onClose={() => close('still-queuing')}>
        <p className="font-semibold">{STILL_QUEUING.question}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => rq.answerStillQueuing(true, dontAsk)}
            className="flex-1 rounded-full bg-[#111] text-[#fdfdf8] font-bold py-1.5 cursor-pointer"
          >
            {STILL_QUEUING.yes}
          </button>
          <button
            type="button"
            onClick={() => rq.answerStillQueuing(false, dontAsk)}
            className="flex-1 rounded-full border-2 border-[#111] font-bold py-1 cursor-pointer"
          >
            {STILL_QUEUING.no}
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          {STILL_QUEUING.dontAsk}
        </label>
      </BlimkinCloud>
    );
  }

  if (notice) {
    const content = lobbyStartedCloud(notice.kind);
    return (
      <BlimkinCloud appearance={`seat:${notice.lobbyId}`} label={content.lines[0]} onClose={dismiss}>
        <Lines content={content} onAction={() => void joinSeat(notice)} />
      </BlimkinCloud>
    );
  }

  const inCity = !!pathname?.startsWith('/city');
  const rankedKey = match ? `ranked:${match.lobbyId}:${match.started ? 'started' : 'found'}` : null;
  if (match && rankedKey && !closed.has(rankedKey) && !inCity && !isShown(match.lobbyId)) {
    const content = rankedCloud(match, secondsLeft, expanded);
    return (
      <BlimkinCloud
        appearance={rankedKey}
        label={content.lines.join(' ')}
        onCloudClick={match.started ? joinRanked : () => setExpanded((x) => !x)}
        onClose={() => close(rankedKey)}
      >
        <Lines content={content} onAction={joinRanked} />
      </BlimkinCloud>
    );
  }

  if (rq.status === 'searching' && pathname === '/' && !closed.has('searching')) {
    return (
      // In the middle of the screen, over the Earth (Mikael, 2026-10-17).
      <BlimkinCloud
        appearance="searching"
        label={`${SEARCHING} ${RANKED}`}
        onClose={() => close('searching')}
        placement="center"
      >
        <p className="font-semibold">
          <span className="text-[#111]">{SEARCHING}</span> <span className="text-red-600">{RANKED}</span>
        </p>
      </BlimkinCloud>
    );
  }

  return null;
}
