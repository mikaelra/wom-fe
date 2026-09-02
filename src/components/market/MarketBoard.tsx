'use client';

import { useState } from 'react';
import MarketListingCard from '@/components/market/MarketListingCard';
import { listingIsMine, type MarketCatalog, type MarketListing } from '@/lib/market';

/**
 * The live board -- every open trade (wom-be docs/MARKET_PLAN.md §1A.8).
 * "Remove" hides a card from *this viewer's* board only, client-side, no
 * server state (§1A.1 step 5) -- just clutter control.
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
  const [removed, setRemoved] = useState<Set<number>>(new Set());

  const visible = listings.filter((l) => !removed.has(l.id));

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/40 text-sm">
        No open trades right now. Type <code className="text-white/60">/offer</code> in the
        chat to post one.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((listing) => (
        <MarketListingCard
          key={listing.id}
          listing={listing}
          catalog={catalog}
          clockOffsetMs={clockOffsetMs}
          mine={listingIsMine(listing, myPlayerId)}
          canAccept={canAccept(listing)}
          onAccept={() => onAccept(listing)}
          onCancel={() => onCancel(listing)}
          onRemove={() => setRemoved((prev) => new Set(prev).add(listing.id))}
        />
      ))}
    </div>
  );
}
