'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPlayerProfile, getRankedProfile, getWellProfile } from '@/lib/api';
import RankBadge from '@/components/hud/RankBadge';

// Labels/emoji for every key in wom-be's config.WELL_REWARDS, matching the
// emoji already used in that reward's in-game message (engine/rewards.py)
// so this reads as the same reward the player saw during a match. Keyed by
// the raw backend reward string, not the frontend's WellRewardType (that's
// a different, animation-only vocabulary -- see WellRewardEffect.tsx).
const WELL_REWARD_LABELS: Record<string, { label: string; emoji: string }> = {
  '2_gold': { label: '2 Gold', emoji: '📦' },
  '2_hp': { label: '2 Health', emoji: '🤕' },
  '1_hp_1_gold': { label: '1 Health + 1 Gold', emoji: '☘️' },
  '1_atkdmg': { label: '+1 Attack Damage', emoji: '🔫' },
  deny_choice: { label: 'Deny Choice', emoji: '🚫' },
  '2_hp_2_gold': { label: '2 Health + 2 Gold', emoji: '♦️' },
  steal_gold: { label: 'Steal-All', emoji: '🏴‍☠️' },
  instakill: { label: 'Poisoned Dagger', emoji: '🔪' },
  reveal_info: { label: 'Reveal Info', emoji: '🔍' },
};

export default function StatsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tier, setTier] = useState<string | null>(null);
  const [rankedGamesPlayed, setRankedGamesPlayed] = useState(0);
  const [wellWins, setWellWins] = useState(0);
  const [wellRewards, setWellRewards] = useState<{ reward: string; count: number }[]>([]);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);

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

    Promise.all([
      getRankedProfile(name).then((data) => {
        setTier(data.tier);
        setRankedGamesPlayed(data.ranked_games_played);
      }),
      getWellProfile(name).then((data) => {
        setWellWins(data.well_wins);
        setWellRewards(data.rewards);
      }),
      getPlayerProfile(name).then((data) => {
        setAccountCreatedAt(data.created_at);
        setGamesPlayed(data.played_games);
      }),
    ])
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

  const formattedAccountCreatedAt = accountCreatedAt
    ? new Date(accountCreatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

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
          <>
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
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

            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
              <h2 className="text-sm font-semibold text-white/70 mb-2">Overview</h2>
              <p className="text-sm text-white/50">Account created: {formattedAccountCreatedAt}</p>
              <p className="text-sm text-white/50 mt-1">
                Games played: <span className="text-white font-semibold">{gamesPlayed}</span>
              </p>
            </div>

            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-white/70 mb-2">Well</h2>
              <p className="text-sm text-white/50 mb-3">
                {wellWins} well win{wellWins === 1 ? '' : 's'}
              </p>
              {wellRewards.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {wellRewards.map(({ reward, count }) => {
                    const info = WELL_REWARD_LABELS[reward];
                    return (
                      <div
                        key={reward}
                        className="flex flex-col items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-3"
                      >
                        <span className="text-2xl">{info?.emoji ?? '❔'}</span>
                        <p className="text-xs font-semibold text-center">{info?.label ?? reward}</p>
                        {count > 1 && <p className="text-[10px] text-white/50">×{count}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-white/50">You haven&apos;t discovered any Well rewards yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
