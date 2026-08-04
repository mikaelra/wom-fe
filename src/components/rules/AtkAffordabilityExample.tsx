'use client';

import ResourceCard from '@/components/ResourceCard';

type Scenario = { coins: number; atk: number; caption: string };

const SCENARIOS: Scenario[] = [
  { coins: 4, atk: 2, caption: '4 Coins, ATK 2 — enough to upgrade.' },
  { coins: 1, atk: 2, caption: '1 Coin, ATK 2 — not enough yet.' },
];

function ExamplePair({ coins, atk }: { coins: number; atk: number }) {
  // Same afford/can't-afford treatment as the real ATK card (SceneOverlay's
  // cannotAffordAtk): dimmed + a red diagonal line overlay when coins < atk.
  const canAfford = coins >= atk;
  return (
    <div className="flex gap-2">
      <ResourceCard
        value={coins}
        label="Coins"
        sublabel="💰 Get"
        valueClass="text-yellow-400"
        sublabelClass="text-yellow-400/70"
        disabled
        onClick={() => {}}
        className="bg-black/70 border-yellow-500/50"
      />
      <ResourceCard
        value={atk}
        label="ATK"
        sublabel="⚔ Buy"
        valueClass="text-blue-400"
        sublabelClass="text-blue-400/70"
        disabled
        onClick={() => {}}
        className={`relative overflow-hidden ${canAfford ? '' : 'opacity-60'} bg-black/70 border-blue-500/50`}
        overlay={!canAfford && (
          <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
            <svg className="w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="2" />
            </svg>
          </div>
        )}
      />
    </div>
  );
}

/** Two side-by-side scenarios for the "upgrade ATK costs coins" rules step:
 *  one where the player can afford it, one where they can't -- same visual
 *  treatment (dim + red diagonal line) the real ATK card uses in-game. */
export default function AtkAffordabilityExample() {
  return (
    <div className="flex flex-wrap items-start justify-center gap-6 bg-gray-900 rounded-xl p-4">
      {SCENARIOS.map((s) => (
        <div key={`${s.coins}-${s.atk}`} className="flex flex-col items-center gap-2">
          <ExamplePair coins={s.coins} atk={s.atk} />
          <p className="text-xs text-gray-400 text-center max-w-[9rem]">{s.caption}</p>
        </div>
      ))}
    </div>
  );
}
