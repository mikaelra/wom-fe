'use client';

import { CITIES, type City } from '@/lib/cities';
import { MERCHANT_MARKER_LABEL } from '@/lib/merchant';
import PixelOrrery from '@/components/text/PixelOrrery';
import type { MerchantOffer } from '@/lib/api';

// The globe as text (Text mode, src/lib/textMode.ts): what its 3D markers
// lead to, as Tjuvpakk's home page listed it -- the cities and the
// merchants in town -- in the middle of an 8-bit sky (PixelOrrery). (The boss fight's countdown is the city's, over HADES.) The lobby code / Create Lobby controls
// and the top bar are the globe's own (WorldMapOverlay), drawn over this.

// GREECE in its 3D marker label's light blue (worldmap/CityMarker.tsx).
const CITY_COLOR = '#4da6ff';
const MERCHANT_COLOR = '#a855f7';

const link = {
  color: CITY_COLOR,
  fontSize: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
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
    <>
      <PixelOrrery />
      {/* In the middle of the sky, over the Earth. */}
      <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
        <div className="flex flex-col items-center px-6 py-3 pointer-events-auto">
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
              style={{ ...link, color: MERCHANT_COLOR, fontSize: '20px', marginTop: '0.5rem' }}
            >
              {MERCHANT_MARKER_LABEL}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
