'use client';

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
  Principality: 'bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white',
};

const UNRANKED_COLOR = 'bg-gray-700 text-gray-300';

type RankBadgeProps = {
  /** Derived tier string (e.g. "Wizard I"), or null for "never queued" /
   *  "still in placements" (docs/RANK_SYSTEM_PLAN.md §5 -- both display
   *  identically as hidden, by design). */
  tier: string | null;
  className?: string;
};

export default function RankBadge({ tier, className = '' }: RankBadgeProps) {
  const colorClass = tier ? (TIER_COLORS[tier] ?? UNRANKED_COLOR) : UNRANKED_COLOR;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${colorClass} ${className}`}
    >
      {tier ?? 'Unranked'}
    </span>
  );
}
