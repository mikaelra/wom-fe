'use client';

import MarketListingCard from '@/components/market/MarketListingCard';
import { listingIsMine, type MarketCatalog, type MarketListing } from '@/lib/market';

/**
 * The live board -- every open trade (wom-be docs/MARKET_PLAN.md §1A.8).
 *
 * Used to also carry a client-only "Hide" (a local Set of dismissed ids,
 * reset on refresh) shown on every card including ones you don't own --
 * removed entirely per feedback: it read as "remove someone else's trade"
 * sitting next to the poster's own action, and didn't even give the poster
 * a durable way to take their own listing down (it reappeared on refresh,
 * since it was never anything but local component state). The poster's
 * `onCancel` below is the one real removal path now, server-enforced.
 */
export default function MarketBoard({
  listings,
  catalog,
  clockOffsetMs,
  myPlayerId,
  canAccept,
  onAccept,
  onCancel,
}: {
  listings: MarketListing[];
  catalog: MarketCatalog | null;
  clockOffsetMs: number;
  myPlayerId: number | null;
  canAccept: (listing: MarketListing) => boolean;
  onAccept: (listing: MarketListing) => void;
  onCancel: (listing: MarketListing) => void;
}) {
  if (listings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/40 text-sm">
        No open trades right now. Type <code className="text-white/60">/offer</code> in the
        chat to post one.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <MarketListingCard
          key={listing.id}
          listing={listing}
          catalog={catalog}
          clockOffsetMs={clockOffsetMs}
          mine={listingIsMine(listing, myPlayerId)}
          canAccept={canAccept(listing)}
          onAccept={() => onAccept(listing)}
          onCancel={() => onCancel(listing)}
        />
      ))}
    </div>
  );
}
