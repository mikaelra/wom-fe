'use client';

import type { CSSProperties, ReactNode } from 'react';
import { inMarketLabel, playingLabel } from '@/components/city/BuildingSign';

// The city as text (Text mode, src/lib/textMode.ts): its signposts and
// buildings as Tjuvpakk-style links, each with the caption and "N playing"
// sign it carries in 3D. Same labels and the same actions the city page
// hands CityScene; the top bar, clock and auth popups are the page's own.

const link = (color: string): CSSProperties => ({
  color,
  fontSize: '24px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textDecoration: 'underline',
});

function Place({ label, color, onClick, children }: { label: string; color: string; onClick: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center mt-6 text-center">
      <button type="button" onClick={onClick} style={link(color)}>
        {label}
      </button>
      <div className="text-white/80 text-sm font-semibold whitespace-pre-line">{children}</div>
    </div>
  );
}

export default function TextCity({
  onBossfight,
  bossfightSublabel,
  bossfightPlaying,
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
  /** Humans in the boss fight right now. */
  bossfightPlaying: number;
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
  return (
    <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center text-white px-4 pt-28 pb-10">
      <Place label="HADES" color="crimson" onClick={onBossfight}>
        {[bossfightSublabel, playingLabel(bossfightPlaying)].filter(Boolean).join('\n')}
      </Place>
      {/* In 3D, RANKED leads to a fork: PLAYERS (ranked) and BOTS. */}
      <Place label={rankedLabel === 'RANKED' ? 'PLAYERS' : rankedLabel} color="deepskyblue" onClick={onRanked}>
        {[rankedSublabel, playingLabel(presence.ranked)].filter(Boolean).join('\n')}
      </Place>
      <Place label={botRankedLabel} color="lightgreen" onClick={onBotRanked}>
        {[botRankedSublabel, playingLabel(presence.bot_ranked)].filter(Boolean).join('\n')}
      </Place>
      <Place label="MARKET" color="gold" onClick={onMarket}>
        {inMarketLabel(presence.market)}
      </Place>
      <Place label="EARTH" color="white" onClick={onBackToEarth} />
    </div>
  );
}
