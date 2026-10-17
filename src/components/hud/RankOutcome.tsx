'use client';

import { useEffect, useState } from 'react';
import type { RankedResult } from '@/types/game';
import RankBadge from '@/components/hud/RankBadge';

// A ranked game's outcome for the end screen, in 3D and text alike
// (Mikael, 2026-10-12, reworked 2026-10-17): the rank shown now; on a rank
// up the old rank's badge turns into the new one and "Ranked up!" lands
// with it; how many games in a row you've been at it. No word when the
// rank stayed the same. Still in placement: the unranked emblem and how
// many games until a rank.

/** How long the old rank shows before it turns into the new one. */
export const RANK_UP_HOLD_MS = 900;
/** The turn itself. */
const TURN_MS = 600;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The old rank's badge, then the new one rising out of it with a glow. */
function RankUp({ from, to, playerName }: { from: string; to: string; playerName: string }) {
  const [phase, setPhase] = useState<'old' | 'turning' | 'new'>(() => (prefersReducedMotion() ? 'new' : 'old'));
  useEffect(() => {
    if (phase !== 'old') return;
    const turn = setTimeout(() => setPhase('turning'), RANK_UP_HOLD_MS);
    const done = setTimeout(() => setPhase('new'), RANK_UP_HOLD_MS + TURN_MS);
    return () => {
      clearTimeout(turn);
      clearTimeout(done);
    };
    // Once per outcome shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arrived = phase !== 'old';
  return (
    <>
      <span className="relative inline-grid place-items-center" aria-label={`Ranked up from ${from} to ${to}`}>
        {phase !== 'new' && (
          <span
            aria-hidden={arrived}
            className="[grid-area:1/1]"
            style={{
              transition: `transform ${TURN_MS}ms ease-in, opacity ${TURN_MS}ms ease-in, filter ${TURN_MS}ms ease-in`,
              transform: arrived ? 'scale(0.6) rotateX(90deg)' : 'scale(1)',
              opacity: arrived ? 0 : 1,
              filter: arrived ? 'blur(2px)' : 'none',
            }}
          >
            <RankBadge tier={from} />
          </span>
        )}
        <span
          className="[grid-area:1/1]"
          style={{
            transition: `transform ${TURN_MS}ms cubic-bezier(.2,.9,.3,1.4), opacity ${TURN_MS}ms ease-out, filter ${TURN_MS * 2}ms ease-out`,
            transform: arrived ? 'scale(1)' : 'scale(1.6)',
            opacity: arrived ? 1 : 0,
            filter: phase === 'turning' ? 'drop-shadow(0 0 10px rgba(134,239,172,0.95))' : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
          }}
        >
          <RankBadge tier={to} playerName={playerName} />
        </span>
      </span>
      <span
        className="text-green-400 font-semibold"
        style={{ transition: `opacity ${TURN_MS}ms ease-out`, opacity: arrived ? 1 : 0 }}
      >
        Ranked up!
      </span>
    </>
  );
}

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
  const rankedUp = result.promoted === true && !!result.tier_before;
  return (
    <p className="mb-2 flex items-center justify-center gap-2 flex-wrap">
      {rankedUp ? (
        <RankUp from={result.tier_before!} to={result.tier_after} playerName={playerName} />
      ) : (
        <RankBadge tier={result.tier_after} playerName={playerName} />
      )}
      {/* tier_before is only ever null on the game-10 debut reveal
          (docs/RANK_SYSTEM_PLAN.md §5) -- promoted stays null too then. */}
      {result.tier_before === null && <span className="text-cyan-400 font-semibold">Placement complete!</span>}
      {result.promoted === false && <span className="text-red-400 font-semibold">Ranked down.</span>}
      {games > 0 && (
        <span className="text-white/60 text-sm">
          {games} {games === 1 ? 'game' : 'games'} at {result.tier_after}
        </span>
      )}
    </p>
  );
}
