'use client';

import { useEffect, useState } from 'react';
import { getRankedRanks } from '@/lib/api';
import type { RankedRanks } from '@/lib/schemas';
import RankBadge, { tierRank } from '@/components/hud/RankBadge';
import StatsDialog from '@/components/hud/StatsDialog';
import LoadingState from '@/components/loading/LoadingState';

type Ladder = 'ranked' | 'ai';

const TABS: { id: Ladder; label: string }[] = [
  { id: 'ranked', label: 'Ranked' },
  { id: 'ai', label: 'Bot ranked' },
];

/** The stats page's Ranks pop-up: every rank the player has ever been
 *  shown, through all seasons, highest first, with the season it was in
 *  -- in ranked on one tab, and their AI's on the bot-ranked ladder on the
 *  other (GET /ranked/ranks/<name>; Mikael, 2026-10-11). */
export default function RanksOverlay({ playerName, onClose }: { playerName: string; onClose: () => void }) {
  const [ladder, setLadder] = useState<Ladder>('ranked');
  const [data, setData] = useState<RankedRanks | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getRankedRanks(playerName)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load ranks.'));
    return () => {
      cancelled = true;
    };
  }, [playerName]);

  // Highest rank on top, lower ones below (Mikael, 2026-10-11); the same
  // rank in several seasons, the latest first.
  const ranks = [...(data ? (ladder === 'ranked' ? data.ranks : (data.ai_ranks ?? [])) : [])].sort(
    (a, b) => tierRank(b.tier) - tierRank(a.tier) || (b.at ?? '').localeCompare(a.at ?? ''),
  );

  return (
    <StatsDialog id="ranks" title="Ranks" onClose={onClose}>
      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={ladder === t.id}
            onClick={() => setLadder(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              ladder === t.id ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data ? (
        <LoadingState />
      ) : ranks.length === 0 ? (
        <p className="text-white/60 text-sm">No ranks yet.</p>
      ) : (
        <ul className="space-y-2">
          {ranks.map((r) => (
            <li
              key={`${r.season}-${r.tier}`}
              className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-white/70">{r.season}</span>
              <RankBadge tier={r.tier} placement={null} playerName={playerName} />
            </li>
          ))}
        </ul>
      )}
    </StatsDialog>
  );
}
