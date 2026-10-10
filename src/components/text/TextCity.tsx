'use client';

import { useState } from 'react';
import PixelSignpost, { type SignpostBoard } from '@/components/text/PixelSignpost';
import { inMarketLabel, playingLabel } from '@/lib/cityLabels';
import { BACK_COLOR, BOSSFIGHT_COLOR, EARTH_COLOR, MARKET_COLOR, RANKED_COLOR } from '@/components/city/signpostColors';

// The city as text (Text mode, src/lib/textMode.ts): the 3D city's signpost
// in 8-bit (PixelSignpost) -- RANKED and HADES on the top boards, MARKET and
// EARTH below, each lettered in its arm's colour -- under the city's sky as
// it is right now. White text over a board says what is going on there.
// RANKED turns the boards to PLAYERS and BOTS -- the fork in 3D -- with BACK.
// The top bar, clock and auth popups are the page's own.

/** Lines that are there, one per line; null when none are. */
function lines(...parts: (string | null | undefined)[]): string | null {
  const shown = parts.filter(Boolean);
  return shown.length ? shown.join('\n') : null;
}

export default function TextCity({
  onBossfight,
  bossfightSublabel,
  onRanked,
  rankedLabel,
  rankedSublabel,
  onBotRanked,
  botRankedLabel,
  botRankedSublabel,
  presence,
  onMarket,
  onBackToEarth,
  skyDate,
  lat,
  lng,
}: {
  onBossfight: () => void;
  bossfightSublabel: string | null | undefined;
  onRanked: () => void;
  rankedLabel: string;
  rankedSublabel: string | null | undefined;
  onBotRanked: () => void;
  botRankedLabel: string;
  botRankedSublabel: string | null | undefined;
  presence: { ranked: number; bot_ranked: number; market: number };
  onMarket: () => void;
  onBackToEarth: () => void;
  /** The sky's moment, as the 3D city has it (a timewarp's, or now). */
  skyDate?: Date;
  lat: number;
  lng: number;
}) {
  const [inRanked, setInRanked] = useState(false);

  const boards: SignpostBoard[] = inRanked
    ? [
        {
          label: rankedLabel === 'RANKED' ? 'PLAYERS' : rankedLabel,
          color: RANKED_COLOR,
          side: 'left',
          row: 0,
          onClick: onRanked,
          info: lines(rankedSublabel, playingLabel(presence.ranked)),
        },
        {
          label: botRankedLabel,
          color: RANKED_COLOR,
          side: 'right',
          row: 0,
          onClick: onBotRanked,
          info: lines(botRankedSublabel, playingLabel(presence.bot_ranked)),
        },
        { label: 'BACK', color: BACK_COLOR, side: 'left', row: 1, onClick: () => setInRanked(false) },
      ]
    : [
        {
          label: 'RANKED',
          color: RANKED_COLOR,
          side: 'left',
          row: 0,
          onClick: () => setInRanked(true),
          // A queue being searched, or a match to return to, from either arm.
          info: lines(rankedSublabel, botRankedSublabel),
        },
        {
          label: 'HADES',
          color: BOSSFIGHT_COLOR,
          side: 'right',
          row: 0,
          onClick: onBossfight,
          // The signpost's caption alone: it already counts who is playing
          // or waiting, so the temple's "N playing" would say it twice.
          info: bossfightSublabel,
        },
        {
          label: 'MARKET',
          color: MARKET_COLOR,
          side: 'left',
          row: 1,
          onClick: onMarket,
          info: inMarketLabel(presence.market),
        },
        { label: 'EARTH', color: EARTH_COLOR, side: 'right', row: 1, onClick: onBackToEarth },
      ];

  return <PixelSignpost boards={boards} date={skyDate} lat={lat} lng={lng} />;
}
