'use client';

import { skinColor, skinThumbnailUrl } from '@/lib/frogSkins';
import { itemName, type MarketCatalog, type MarketItem } from '@/lib/market';

/**
 * One item on a trade side -- a small labelled swatch. Skins get their
 * pre-rendered thumbnail (same asset the inventory grid uses); relics and
 * wheels get a coloured dot until there is art for them (§9).
 */
export default function MarketItemChip({
  item,
  catalog,
}: {
  item: MarketItem;
  catalog: Pick<MarketCatalog, 'relics'> | null;
}) {
  const name = itemName(item, catalog);
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs">
      <span
        className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white/15"
        style={{ background: item.item_type === 'skin' ? skinColor(item.skin ?? '') : swatch(item) }}
      >
        {item.item_type === 'skin' && (
          // eslint-disable-next-line @next/next/no-img-element -- local static asset
          <img src={skinThumbnailUrl(item.skin ?? '')} alt="" className="w-full h-full object-cover" />
        )}
      </span>
      <span className="whitespace-nowrap">
        {name}
        {item.quantity > 1 && <span className="text-white/50"> ×{item.quantity}</span>}
      </span>
    </span>
  );
}

function swatch(item: MarketItem): string {
  if (item.item_type === 'wheel') return item.wheel_kind === 'special' ? '#f5c542' : '#8b9dc3';
  return '#c58cff'; // relic
}
