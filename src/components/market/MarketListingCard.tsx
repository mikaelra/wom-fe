'use client';

import { useEffect, useState } from 'react';
import MarketItemChip from '@/components/market/MarketItemChip';
import {
  formatRemaining,
  itemKey,
  secondsRemaining,
  type MarketCatalog,
  type MarketListing,
} from '@/lib/market';

/**
 * One trade on the board (wom-be docs/MARKET_PLAN.md §1A.8).
 *
 * Shows the give side, the want side, time remaining (ticking, measured
 * against the server clock), and exactly one action:
 *   - the poster sees **Remove** -- the only way to take a listing down,
 *     server-enforced (wom-be's market_cancel_listing 403s anyone else)
 *   - any other player who owns the requested items sees **Accept trade**
 *
 * There used to also be a client-only "Hide" on every card, own or not --
 * removed entirely (not just relabeled) after it read as "remove someone
 * else's trade" sitting next to the real action, and (being purely local,
 * reset-on-refresh) didn't actually let the poster take their own listing
 * down either -- it satisfied neither the "not theirs to touch" nor the
 * "let me take mine down" half of what a card's second button should do.
 */
export default function MarketListingCard({
  listing,
  catalog,
  clockOffsetMs,
  mine,
  canAccept,
  onAccept,
  onCancel,
}: {
  listing: MarketListing;
  catalog: MarketCatalog | null;
  clockOffsetMs: number;
  mine: boolean;
  canAccept: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [secs, setSecs] = useState(() => secondsRemaining(listing.expires_at, clockOffsetMs));

  useEffect(() => {
    const id = setInterval(
      () => setSecs(secondsRemaining(listing.expires_at, clockOffsetMs)),
      1000,
    );
    return () => clearInterval(id);
  }, [listing.expires_at, clockOffsetMs]);

  const low = secs <= 15 && listing.kind === 'quick';

  return (
    <div className="rounded-xl bg-gray-900/80 border border-white/10 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span className="truncate">{mine ? 'You' : listing.seller_name}</span>
        <span className={low ? 'text-red-400 font-semibold' : ''}>
          {listing.kind === 'long' && <span className="text-amber-400 mr-1" title="Long offer">🪙</span>}
          {formatRemaining(secs)}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-wrap gap-1 justify-start">
          {listing.give.map((it) => (
            <MarketItemChip key={itemKey(it)} item={it} catalog={catalog} />
          ))}
        </div>
        <span className="text-white/40 text-lg" aria-hidden>→</span>
        <div className="flex flex-wrap gap-1 justify-end">
          {listing.want.map((it) => (
            <MarketItemChip key={itemKey(it)} item={it} catalog={catalog} />
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        {mine ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-red-900/60 text-red-200 hover:bg-red-800/60 transition-colors cursor-pointer"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={onAccept}
            disabled={!canAccept || secs === 0}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={canAccept ? 'Accept this trade' : "You don't own the requested items"}
          >
            Accept trade
          </button>
        )}
      </div>
    </div>
  );
}
