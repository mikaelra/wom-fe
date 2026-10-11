'use client';

import { useEffect, useState } from 'react';
import { getRankedRanks } from '@/lib/api';
import type { RankedRanks } from '@/lib/schemas';
import RankBadge from '@/components/hud/RankBadge';
import StatsDialog from '@/components/hud/StatsDialog';
import LoadingState from '@/components/loading/LoadingState';

/** The stats page's Ranks pop-up: every rank the player has ever been
 *  shown in ranked, through all seasons, in the order they first saw them
 *  (GET /ranked/ranks/<name>). */
export default function RanksOverlay({ playerName, onClose }: { playerName: string; onClose: () => void }) {
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

  return (
    <StatsDialog id="ranks" title="Ranks" onClose={onClose}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data ? (
        <LoadingState />
      ) : data.ranks.length === 0 ? (
        <p className="text-white/60 text-sm">No ranks yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.ranks.map((r) => (
            <li
              key={`${r.season}-${r.tier}`}
              className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
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
