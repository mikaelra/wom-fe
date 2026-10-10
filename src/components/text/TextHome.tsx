'use client';

import type { CSSProperties } from 'react';
import { CITIES, type City } from '@/lib/cities';
import { MERCHANT_MARKER_LABEL } from '@/lib/merchant';
import { timewarpColorsFor } from '@/lib/timewarpFx';
import { warpBands } from '@/lib/worldClock';
import PixelOrrery from '@/components/text/PixelOrrery';
import type { MerchantOffer } from '@/lib/api';

// The globe as text (Text mode, src/lib/textMode.ts): what its 3D markers
// lead to, as Tjuvpakk's home page listed it -- the cities and the
// merchants in town -- in the middle of an 8-bit sky (PixelOrrery). (The boss fight's countdown is the city's, over HADES.) The lobby code / Create Lobby controls
// and the top bar are the globe's own (WorldMapOverlay), drawn over this.

// GREECE in its 3D marker label's light blue (worldmap/CityMarker.tsx).
const CITY_COLOR = '#4da6ff';
const MERCHANT_COLOR = '#a855f7';

/** A merchant's lettering in the colours of its event, the way the clock
 *  paints a timewarp (lib/worldClock.ts): one colour for a full moon, a
 *  conjunction's two planets top and bottom through the letters. */
function merchantPaint(event: MerchantOffer['event']): CSSProperties {
  const colors = timewarpColorsFor([event]);
  const bands = warpBands(colors);
  if (bands) return { backgroundImage: bands, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
  return { color: colors[0] ?? MERCHANT_COLOR };
}

const link = {
  color: CITY_COLOR,
  fontSize: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'none',
};

export default function TextHome({
  offers,
  onEnterCity,
  onOpenMerchant,
  skyDate,
  timewarp,
}: {
  offers: MerchantOffer[];
  onEnterCity: (city: City) => void;
  onOpenMerchant: (offer: MerchantOffer) => void;
  /** The sky's moment, while a timewarp runs or the sky is reverted. */
  skyDate?: Date;
  /** A timewarp playing: its glow (0..1) and colours. */
  timewarp?: { glow: number; colors: string[] } | null;
}) {
  return (
    <>
      <PixelOrrery date={skyDate} timewarp={timewarp} />
      {/* In the middle of the sky, over the Earth. */}
      <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
        {/* They leave and come back with the timewarp, as the globe's pins
            do (lib/timewarpFx.ts's marker fade). */}
        <div
          className="flex flex-col items-center px-6 py-3"
          style={{
            opacity: 'var(--timewarp-markers, 1)',
            pointerEvents: 'var(--timewarp-markers-events, auto)' as CSSProperties['pointerEvents'],
          }}
        >
          {CITIES.map((city) => (
            <button key={city.id} type="button" onClick={() => onEnterCity(city)} style={link}>
              {city.actionLabel ?? city.name}
            </button>
          ))}
          {offers.map((offer) => (
            <button
              key={`${offer.offer_id}|${offer.event_key}`}
              type="button"
              onClick={() => onOpenMerchant(offer)}
              style={{ ...link, fontSize: '20px', marginTop: '0.5rem', ...merchantPaint(offer.event) }}
            >
              {MERCHANT_MARKER_LABEL}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
