'use client';

import { useEffect, useState } from 'react';
import { getSeasonHistory } from '@/lib/api';
import type { SeasonHistoryEntry } from '@/lib/schemas';
import RankBadge from '@/components/hud/RankBadge';

type Ladder = 'human' | 'ai';

/**
 * The "Seasons" button's overlay (docs/RANK_SYSTEM_PLAN.md §12): a
 * player's rank across every season they've had one, current season
 * first. Player/My AI tabs switch between the two ladders client-side --
 * GET /ranked/season_history/<name> already returns both in one response
 * so there's nothing to refetch on tab switch.
 */
export default function SeasonHistoryOverlay({
  playerName,
  onClose,
}: {
  playerName: string;
  onClose: () => void;
}) {
  const [ladder, setLadder] = useState<Ladder>('human');
  const [history, setHistory] = useState<{ human: SeasonHistoryEntry[]; ai: SeasonHistoryEntry[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSeasonHistory(playerName)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load season history.');
      });
    return () => {
      cancelled = true;
    };
  }, [playerName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const entries = history ? history[ladder] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-history-heading"
        className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6 relative text-white max-h-[80vh] flex flex-col"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors text-2xl leading-none cursor-pointer"
        >
          ×
        </button>

        <h2 id="season-history-heading" className="text-lg font-semibold mb-4">
          Seasons
        </h2>

        <div className="flex gap-2 mb-4" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={ladder === 'human'}
            onClick={() => setLadder('human')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              ladder === 'human' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            Player
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ladder === 'ai'}
            onClick={() => setLadder('ai')}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              ladder === 'ai' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            My AI
          </button>
        </div>

        <div className="overflow-y-auto -mx-2 px-2">
          {error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : !history ? (
            <p className="text-white/60 text-sm">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-white/60 text-sm">No ranked seasons yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.season}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                >
                  <span className="text-sm">
                    {entry.season}
                    {entry.current && <span className="text-white/50"> (current)</span>}
                  </span>
                  <RankBadge tier={entry.tier} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
