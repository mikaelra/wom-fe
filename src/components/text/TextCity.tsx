'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { playingLabel } from '@/lib/cityLabels';
import { BACK_COLOR, BOSSFIGHT_COLOR, EARTH_COLOR, MARKET_COLOR, RANKED_COLOR } from '@/components/city/signpostColors';
import PixelCity from '@/components/text/PixelCity';
import { CITY_SPOTS, type CitySpot } from '@/lib/pixelCity';

// The city as text (Text mode, src/lib/textMode.ts): its signposts and
// buildings as Tjuvpakk-style links, the same actions the city page hands
// CityScene, in the signpost's colours. White text over a link says what
// is going on there. RANKED opens its own list -- PLAYERS and BOTS, the fork
// in 3D -- with BACK. The top bar, clock and auth popups are the page's own.
//
// Behind it all, an 8-bit city (PixelCity): each link sits on its place --
// RANKED on the Colosseum, HADES on the Temple of Zeus, MARKET on the
// market, EARTH on the harbour -- with the player's frog in the middle.

const link = (color: string): CSSProperties => ({
  color,
  fontSize: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
});

function Place({
  label,
  color,
  onClick,
  info,
  style,
}: {
  label: string;
  color: string;
  onClick: () => void;
  info?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="flex flex-col items-center justify-end text-center bg-black/60 rounded-lg px-2" style={style}>
      {info && <div className="text-white text-sm font-semibold whitespace-pre-line">{info}</div>}
      <button type="button" onClick={onClick} style={link(color)}>
        {label}
      </button>
    </div>
  );
}

// Two places to a row, their links level whatever is written over them.
const row = 'grid grid-cols-2 items-end gap-x-6 gap-y-2 mb-6 w-full max-w-sm';

// How far below its place's centre (in screen pixels) each link sits: just
// under the building lib/pixelCity.ts draws there.
const BELOW: Record<Exclude<CitySpot, 'frog'>, number> = { ranked: 40, hades: 40, market: 24, earth: 30 };

/** A link's position on its place. */
function at(spot: Exclude<CitySpot, 'frog'>): CSSProperties {
  const { x, y } = CITY_SPOTS[spot];
  return {
    position: 'absolute',
    left: `${x * 100}%`,
    top: `calc(${y * 100}% + ${BELOW[spot]}px)`,
    transform: 'translateX(-50%)',
  };
}

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
}) {
  const [inRanked, setInRanked] = useState(false);

  if (inRanked) {
    return (
      <>
        <PixelCity />
        <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center text-white px-4 pt-28 pb-10">
          <div className="flex flex-col items-center bg-black/70 rounded-xl px-4 pt-4 pb-2">
            <div className={row}>
              <Place
                label={rankedLabel === 'RANKED' ? 'PLAYERS' : rankedLabel}
                color={RANKED_COLOR}
                onClick={onRanked}
                info={lines(rankedSublabel, playingLabel(presence.ranked))}
              />
              <Place
                label={botRankedLabel}
                color={RANKED_COLOR}
                onClick={onBotRanked}
                info={lines(botRankedSublabel, playingLabel(presence.bot_ranked))}
              />
            </div>
            <Place label="BACK" color={BACK_COLOR} onClick={() => setInRanked(false)} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PixelCity />
      <div className="absolute inset-0 text-white">
        {/* A queue being searched, or a match to return to, from either arm. */}
        <Place
          label="RANKED"
          color={RANKED_COLOR}
          onClick={() => setInRanked(true)}
          info={lines(rankedSublabel, botRankedSublabel)}
          style={at('ranked')}
        />
        <Place
          label="HADES"
          color={BOSSFIGHT_COLOR}
          onClick={onBossfight}
          // The signpost's caption alone: it already counts who is playing
          // or waiting, so the temple's "N playing" would say it twice.
          info={bossfightSublabel}
          style={at('hades')}
        />
        <Place
          label="MARKET"
          color={MARKET_COLOR}
          onClick={onMarket}
          info={presence.market > 0 ? String(presence.market) : null}
          style={at('market')}
        />
        <Place label="EARTH" color={EARTH_COLOR} onClick={onBackToEarth} style={at('earth')} />
      </div>
    </>
  );
}
