'use client';

import { useEffect, useState } from 'react';
import LoadingMark from '@/components/loading/LoadingMark';
import { getRankedProfile } from '@/lib/api';

// Text+color chip -- no icon art exists yet (public/images/ has nothing
// rank-related), a fine v1 per docs/RANK_SYSTEM_PLAN.md §11's framing of
// exact visuals as tunable. Colors ladder from cool/low to warm/high,
// keyed by the exact tier strings wom-be's config.py RANKED_TIERS uses
// (pulled from there directly, not re-derived) so a mismatch is visibly
// obvious rather than silently falling back.
const TIER_COLORS: Record<string, string> = {
  'Troll I': 'bg-stone-600 text-stone-100',
  'Troll II': 'bg-stone-600 text-stone-100',
  'Troll III': 'bg-stone-500 text-stone-100',
  'Djinn I': 'bg-sky-700 text-sky-100',
  'Djinn II': 'bg-sky-600 text-sky-100',
  'Djinn III': 'bg-sky-500 text-sky-100',
  Warlock: 'bg-purple-700 text-purple-100',
  'Wizard I': 'bg-indigo-600 text-indigo-100',
  'Wizard II': 'bg-indigo-500 text-indigo-100',
  'Demi-God': 'bg-amber-600 text-amber-100',
  God: 'bg-amber-500 text-amber-950',
};

const UNRANKED_COLOR = 'bg-gray-700 text-gray-300';

const PRINCIPALITY = 'Principality';
/** The loading mark's figure (logo -> cube -> logo, src/lib/loadingAnimation.ts)
 *  played in one colour: gold, on the purple aura of the Steam capsule title. */
const PRINCIPALITY_GOLD = '#f5c542';

type RankBadgeProps = {
  /** Derived tier string (e.g. "Wizard I"), or null for "never queued" /
   *  "still in placements" (docs/RANK_SYSTEM_PLAN.md §5 -- both display
   *  identically as hidden, by design). */
  tier: string | null;
  /** Principality's leaderboard number ("#42", §5). Leave undefined and pass
   *  `playerName` to have the badge look it up itself. */
  placement?: number | null;
  /** Whose live placement to fetch when `placement` isn't given. */
  playerName?: string;
  /** 'lg': the reveal shown when a match takes a player into Principality. */
  size?: 'sm' | 'lg';
  className?: string;
};

export default function RankBadge({ tier, placement, playerName, size = 'sm', className = '' }: RankBadgeProps) {
  if (tier === PRINCIPALITY) {
    return <PrincipalityBadge placement={placement} playerName={playerName} size={size} className={className} />;
  }
  const colorClass = tier ? (TIER_COLORS[tier] ?? UNRANKED_COLOR) : UNRANKED_COLOR;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${colorClass} ${className}`}
    >
      {tier ?? 'Unranked'}
    </span>
  );
}

function PrincipalityBadge({
  placement: placementProp,
  playerName,
  size,
  className,
}: Omit<RankBadgeProps, 'tier'>) {
  const [fetched, setFetched] = useState<number | null>(null);
  useEffect(() => {
    if (placementProp !== undefined || !playerName) return;
    let cancelled = false;
    getRankedProfile(playerName)
      .then((data) => {
        if (!cancelled) setFetched(data.principality_rank ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [placementProp, playerName]);
  const placement = placementProp ?? fetched;
  const label = placement ? `${PRINCIPALITY} #${placement}` : PRINCIPALITY;

  if (size === 'lg') {
    return (
      <span className={`inline-flex flex-col items-center gap-1 ${className}`}>
        <LoadingMark size={112} color={PRINCIPALITY_GOLD} label={label} className="drop-shadow-[0_0_18px_rgba(168,85,247,0.85)]" />
        <span className="text-xs uppercase tracking-[0.3em] text-amber-200/80">{PRINCIPALITY}</span>
        {placement && (
          <span className="text-4xl font-bold text-amber-300 drop-shadow-[0_0_12px_rgba(168,85,247,0.9)]">
            #{placement}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      aria-label={label}
      className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap bg-black/70 border border-amber-400/70 text-amber-200 shadow-[0_0_10px_rgba(168,85,247,0.75)] ${className}`}
    >
      <LoadingMark size={20} color={PRINCIPALITY_GOLD} label="" />
      <span>{PRINCIPALITY}</span>
      {placement && <span className="text-amber-300 font-bold">#{placement}</span>}
    </span>
  );
}
