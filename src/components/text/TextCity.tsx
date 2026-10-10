'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { playingLabel } from '@/lib/cityLabels';
import { BACK_COLOR, BOSSFIGHT_COLOR, EARTH_COLOR, MARKET_COLOR, RANKED_COLOR } from '@/components/city/signpostColors';

// The city as text (Text mode, src/lib/textMode.ts): its signposts and
// buildings as Tjuvpakk-style links, the same actions the city page hands
// CityScene, in the signpost's colours. White text over a link says what
// is going on there. RANKED opens its own list -- PLAYERS and BOTS, the fork
// in 3D -- with BACK. The top bar, clock and auth popups are the page's own.

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
}: {
  label: string;
  color: string;
  onClick: () => void;
  info?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-end text-center">
      {info && <div className="text-white text-sm font-semibold whitespace-pre-line">{info}</div>}
      <button type="button" onClick={onClick} style={link(color)}>
        {label}
      </button>
    </div>
  );
}

// Two places to a row, their links level whatever is written over them.
const row = 'grid grid-cols-2 items-end gap-x-10 gap-y-2 mb-8 w-full max-w-sm';

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
      <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center text-white px-4 pt-28 pb-10">
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
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center text-white px-4 pt-28 pb-10">
      <div className={row}>
        {/* A queue being searched, or a match to return to, from either arm. */}
        <Place
          label="RANKED"
          color={RANKED_COLOR}
          onClick={() => setInRanked(true)}
          info={lines(rankedSublabel, botRankedSublabel)}
        />
        <Place
          label="HADES"
          color={BOSSFIGHT_COLOR}
          onClick={onBossfight}
          // The signpost's caption alone: it already counts who is playing
          // or waiting, so the temple's "N playing" would say it twice.
          info={bossfightSublabel}
        />
      </div>
      <div className={row}>
        <Place
          label="MARKET"
          color={MARKET_COLOR}
          onClick={onMarket}
          info={presence.market > 0 ? String(presence.market) : null}
        />
        <Place label="EARTH" color={EARTH_COLOR} onClick={onBackToEarth} />
      </div>
    </div>
  );
}
