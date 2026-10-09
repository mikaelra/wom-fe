'use client';

import { CITIES, type City } from '@/lib/cities';
import { MERCHANT_MARKER_LABEL } from '@/lib/merchant';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import type { MerchantOffer } from '@/lib/api';

// The globe as text (Text mode, src/lib/textMode.ts): what its 3D markers
// lead to, as Tjuvpakk's home page listed it -- the next boss fight, the
// cities, and the merchants in town. The lobby code / Create Lobby controls
// and the top bar are the globe's own (WorldMapOverlay), drawn over this.

const link = {
  color: 'gold',
  fontSize: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
  marginTop: '1rem',
};

export default function TextHome({
  offers,
  onEnterCity,
  onOpenMerchant,
}: {
  offers: MerchantOffer[];
  onEnterCity: (city: City) => void;
  onOpenMerchant: (offer: MerchantOffer) => void;
}) {
  const { secondsUntil, bossfightMins, bossfightSecs } = useBossfightCountdown(true);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-4 pb-40 pt-24">
      {secondsUntil !== null && secondsUntil > 0 && (
        <div className="text-white font-bold text-lg mt-2">
          ⏳ Next boss-fight in: {bossfightMins}m {bossfightSecs}s
        </div>
      )}
      {CITIES.map((city) => (
        <button key={city.id} type="button" onClick={() => onEnterCity(city)} style={link}>
          🏛️ {city.actionLabel ?? city.name} 🏛️
        </button>
      ))}
      {offers.map((offer) => (
        <button
          key={`${offer.offer_id}|${offer.event_key}`}
          type="button"
          onClick={() => onOpenMerchant(offer)}
          style={{ ...link, color: 'violet', fontSize: '20px' }}
        >
          {MERCHANT_MARKER_LABEL}: {offer.merchant_name}
        </button>
      ))}
    </div>
  );
}
