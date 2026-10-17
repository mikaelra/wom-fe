'use client';

import type { RankedResult } from '@/types/game';
import RankBadge from '@/components/hud/RankBadge';

// A ranked game's outcome for the end screen, in 3D and text alike
// (Mikael, 2026-10-12, reworked 2026-10-17): the rank shown now; "Ranked
// up!" with the rank it came from; how many games in a row you've been at
// it. No word when the rank stayed the same. Still in placement: the
// unranked emblem and how many games until a rank.

export default function RankOutcome({ result, playerName }: { result: RankedResult | undefined; playerName: string }) {
  if (!result) return null;
  if (!result.tier_after) {
    const left = result.games_until_rank ?? 0;
    if (left <= 0) return null;
    return (
      <p className="mb-2 flex items-center justify-center gap-2 flex-wrap">
        <RankBadge tier={null} />
        <span className="text-white/60 text-sm">
          {left} {left === 1 ? 'game' : 'games'} until a rank
        </span>
      </p>
    );
  }
  const games = result.games_at_tier ?? 0;
  return (
    <p className="mb-2 flex items-center justify-center gap-2 flex-wrap">
      <RankBadge tier={result.tier_after} playerName={playerName} />
      {/* tier_before is only ever null on the game-10 debut reveal
          (docs/RANK_SYSTEM_PLAN.md §5) -- promoted stays null too then. */}
      {result.tier_before === null && <span className="text-cyan-400 font-semibold">Placement complete!</span>}
      {result.promoted === true && (
        <>
          <span className="text-green-400 font-semibold">Ranked up!</span>
          {result.tier_before && <RankBadge tier={result.tier_before} className="opacity-60" />}
        </>
      )}
      {result.promoted === false && <span className="text-red-400 font-semibold">Ranked down.</span>}
      {games > 0 && (
        <span className="text-white/60 text-sm">
          {games} {games === 1 ? 'game' : 'games'} at {result.tier_after}
        </span>
      )}
    </p>
  );
}
