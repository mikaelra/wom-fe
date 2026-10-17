'use client';

import { skinColor } from '@/lib/frogSkins';
import {
  PIXEL_ARTIFACT_URL,
  PIXEL_COIN_URL,
  PIXEL_MY_AI_COIN_URL,
  PIXEL_SPECIAL_WHEEL_URL,
  PIXEL_WHEEL_URL,
  pixelImageStyle,
  pixelRelicUrl,
  skinPicture,
} from '@/lib/pixelArt';
import { useTextMode } from '@/lib/textMode';
import { COIN_MODEL_URL } from '@/lib/relics';
import { itemName, type MarketCatalog, type MarketItem } from '@/lib/market';

/**
 * One item on a trade side -- a small labelled swatch. Skins get their
 * pre-rendered thumbnail (same asset the inventory grid uses); relics,
 * wheels, the artifact and AI credits get their own picture too -- the 32x32
 * in Low Definition, the 3D thumbnail otherwise. The coloured dot stays only
 * as the backdrop. Plain sprites (no aura): this is a small mark.
 */
export default function MarketItemChip({
  item,
  catalog,
}: {
  item: MarketItem;
  catalog: Pick<MarketCatalog, 'relics'> | null;
}) {
  const name = itemName(item, catalog);
  const lowDefinition = useTextMode() === true;
  const picture = chipPicture(item, catalog, lowDefinition);
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs">
      <span
        className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white/15"
        style={{ background: item.item_type === 'skin' ? skinColor(item.skin ?? '') : swatch(item) }}
      >
        {picture && (
          // eslint-disable-next-line @next/next/no-img-element -- local static asset
          <img
            src={picture}
            alt=""
            className={`w-full h-full ${item.item_type === 'skin' ? 'object-cover' : 'object-contain'}`}
            style={lowDefinition ? pixelImageStyle : undefined}
          />
        )}
      </span>
      <span className="whitespace-nowrap">
        {name}
        {item.quantity > 1 && <span className="text-white/50"> ×{item.quantity}</span>}
      </span>
    </span>
  );
}

const RELIC_THUMBNAILS: Record<string, string> = {
  Pen: '/models/relics/pen_v1.thumbnail.png',
  Paper: '/models/relics/paper_v2.thumbnail.png',
  'Stone of Vitality': '/models/relics/stone_of_vitality_v2.thumbnail.png',
};
const COIN_THUMBNAIL = COIN_MODEL_URL.replace(/\.glb$/, '.thumbnail.png');
const ARTIFACT_THUMBNAIL = '/skins/items/pergament_v1.thumbnail.png';

function chipPicture(item: MarketItem, catalog: Pick<MarketCatalog, 'relics'> | null, lowDefinition: boolean): string | null {
  switch (item.item_type) {
    case 'skin':
      return skinPicture(item.skin ?? '', lowDefinition);
    case 'wheel': {
      const special = item.wheel_kind === 'special';
      if (lowDefinition) return special ? PIXEL_SPECIAL_WHEEL_URL : PIXEL_WHEEL_URL;
      return special ? '/images/special-wheel.png' : '/images/wheel.png';
    }
    case 'artifact':
      return lowDefinition ? PIXEL_ARTIFACT_URL : ARTIFACT_THUMBNAIL;
    case 'ai_credits':
      return lowDefinition ? PIXEL_MY_AI_COIN_URL : '/images/my-ai-coin.png';
    default: {
      // A relic without a picture of its own is the gold coin, as in the inventory.
      const name = catalog?.relics.find((r) => r.id === item.relic_id)?.name;
      if (lowDefinition) return pixelRelicUrl(name) ?? PIXEL_COIN_URL;
      return (name && RELIC_THUMBNAILS[name]) || COIN_THUMBNAIL;
    }
  }
}

function swatch(item: MarketItem): string {
  if (item.item_type === 'wheel') return item.wheel_kind === 'special' ? '#f5c542' : '#8b9dc3';
  if (item.item_type === 'artifact') return '#e8dcc0';
  return '#c58cff'; // relic
}
