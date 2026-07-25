'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getRankedProfile } from '@/lib/api';
import RankBadge from '@/components/hud/RankBadge';

export default function StatsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tier, setTier] = useState<string | null>(null);
  const [rankedGamesPlayed, setRankedGamesPlayed] = useState(0);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const name = localStorage.getItem('playerName') || '';
    setPlayerName(name);

    if (!name) {
      setLoading(false);
      setLoadError('You need a battle name before you have any stats to show.');
      return;
    }

    getRankedProfile(name)
      .then((data) => {
        setTier(data.tier);
        setRankedGamesPlayed(data.ranked_games_played);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load stats.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (!mounted) return null;

  // Games 1-10 are placements: rank stays hidden until the debut at game
  // 10 (docs/RANK_SYSTEM_PLAN.md §5) -- same display rule the badge and
  // post-game summary already follow, so this reads identically whether
  // the player has never queued or is still mid-placement.
  const gamesRemaining = 10 - rankedGamesPlayed;
  const placementMessage =
    rankedGamesPlayed === 0
      ? 'Play 10 matches to get your rank.'
      : `Play ${gamesRemaining} more match${gamesRemaining === 1 ? '' : 'es'} to get your rank.`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Stats</h1>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/20 transition-colors cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>

        {loading ? (
          <p className="text-white/70">Loading…</p>
        ) : loadError ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-red-400 mb-3">{loadError}</p>
            <Link
              href="/login"
              className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
            >
              Go to log in
            </Link>
          </div>
        ) : (
          <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <p className="text-sm text-white/50 mb-3">{playerName}</p>
            <h2 className="text-sm font-semibold text-white/70 mb-2">Ranked</h2>
            {tier ? (
              <RankBadge tier={tier} className="text-base px-3 py-1" />
            ) : (
              <>
                <RankBadge tier={null} className="text-base px-3 py-1" />
                <p className="text-sm text-white/50 mt-3">{placementMessage}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
