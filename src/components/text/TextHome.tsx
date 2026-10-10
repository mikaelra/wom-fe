'use client';

import { CITIES, type City } from '@/lib/cities';
import { MERCHANT_MARKER_LABEL } from '@/lib/merchant';
import type { MerchantOffer } from '@/lib/api';

// The globe as text (Text mode, src/lib/textMode.ts): what its 3D markers
// lead to, as Tjuvpakk's home page listed it -- the cities and the
// merchants in town. (The boss fight's countdown is the city's, over HADES.) The lobby code / Create Lobby controls
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
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-4 pb-40 pt-24">
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
