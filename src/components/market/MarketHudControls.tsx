'use client';

import { ATHENS_TZ } from '@/lib/cityTime';
import { timewarpColorsFor } from '@/lib/timewarpFx';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import WorldClock from '@/components/worldmap/WorldClock';
import GraphicsQualityButton from '@/components/hud/GraphicsQualityButton';
import MusicToggleButton from '@/components/audio/MusicToggleButton';
import SfxToggleButton from '@/components/audio/SfxToggleButton';

/**
 * What the Earth and city screens put in their top bar, for the market's
 * header (Mikael, 2026-10-17): the clock -- Athens' time, as in the city, and
 * the timewarp when one is on -- the graphics quality, the music and the sound
 * effects. The effects button is gone from Earth and the city, which have none;
 * the market keeps it for the sounds it will get.
 */
export default function MarketHudControls() {
  const { merchant, offers, receivedAt, reverted, revertToDate, revertExpiresAt } = useMerchantOffer();
  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <WorldClock
        reverted={reverted}
        revertToDate={revertToDate ?? null}
        skyDate={merchant?.sky_date ?? null}
        skyDateReceivedAt={receivedAt}
        revertExpiresAt={revertExpiresAt}
        warpColors={timewarpColorsFor(offers.map((o) => o.event))}
        timeZone={ATHENS_TZ}
      />
      <span className="inline-flex items-center gap-2">
        <GraphicsQualityButton />
        <MusicToggleButton />
        <SfxToggleButton />
      </span>
    </div>
  );
}
