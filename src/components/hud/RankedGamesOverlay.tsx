'use client';

import { useEffect, useState } from 'react';
import { getRankedGames } from '@/lib/api';
import type { RankedGames } from '@/lib/schemas';
import { GAMES_PER_PAGE } from '@/lib/paging';
import GameHistoryTable from '@/components/history/GameHistoryTable';
import StatsDialog from '@/components/hud/StatsDialog';
import LoadingState from '@/components/loading/LoadingState';

/** The stats page's Games pop-up: this season's ranked games, a page at a
 *  time (GET /ranked/games/<name>). */
export default function RankedGamesOverlay({ playerName, onClose }: { playerName: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RankedGames | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getRankedGames(playerName, page, GAMES_PER_PAGE)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load games.'));
    return () => {
      cancelled = true;
    };
  }, [playerName, page]);

  return (
    <StatsDialog id="ranked-games" title="Games" wide onClose={onClose}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data ? (
        <LoadingState />
      ) : data.total === 0 ? (
        <p className="text-white/60 text-sm">No ranked games this season yet.</p>
      ) : (
        <GameHistoryTable
          rows={data.games.map((g) => ({
            id: g.game_id,
            placement: g.placement,
            rank: g.rank,
            opponents: g.opponents.map((o) => o.name).join(', '),
            at: g.at,
          }))}
          total={data.total}
          page={data.page}
          perPage={data.per_page}
          onPage={setPage}
        />
      )}
    </StatsDialog>
  );
}
