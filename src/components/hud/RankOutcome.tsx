'use client';

import type { RankedResult } from '@/types/game';
import RankBadge from '@/components/hud/RankBadge';

// A ranked game's outcome for the end screen, in 3D and text alike
// (Mikael, 2026-10-12): the rank shown now, whether it went up, down or
// stayed, and how many games in a row you've been at it.

export default function RankOutcome({ result, playerName }: { result: RankedResult | undefined; playerName: string }) {
  if (!result?.tier_after) return null;
  const games = result.games_at_tier ?? 0;
  return (
    <p className="mb-2 flex items-center justify-center gap-2 flex-wrap">
      <RankBadge tier={result.tier_after} playerName={playerName} />
      {/* tier_before is only ever null on the game-10 debut reveal
          (docs/RANK_SYSTEM_PLAN.md §5) -- promoted stays null too then. */}
      {result.tier_before === null && <span className="text-cyan-400 font-semibold">Placement complete!</span>}
      {result.promoted === true && <span className="text-green-400 font-semibold">Ranked up!</span>}
      {result.promoted === false && <span className="text-red-400 font-semibold">Ranked down.</span>}
      {result.tier_before !== null && result.promoted === null && <span className="text-white/60 font-semibold">Same rank</span>}
      {games > 0 && (
        <span className="text-white/60 text-sm">
          {games} {games === 1 ? 'game' : 'games'} at {result.tier_after}
        </span>
      )}
    </p>
  );
}
