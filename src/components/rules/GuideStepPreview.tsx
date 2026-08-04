'use client';

import ActionImageButton from '@/components/lobby/ActionImageButton';
import AtkAffordabilityExample from '@/components/rules/AtkAffordabilityExample';
import ResourceCard from '@/components/ResourceCard';
import type { GuideHighlights, GuideTarget } from '@/lib/guideHighlights';
import type { GuideStep } from '@/lib/guideSteps';

type GuideStepPreviewProps = {
  step: GuideStep;
};

// Real button art + colors, exactly as used in-game (PlayerAvatars.tsx /
// SceneOverlay.tsx) -- not a screenshot, so this can never fall out of sync
// with what a player actually sees on their own buttons.
const ACTION_PREVIEW: Record<'attack' | 'well' | 'defend', { src: string; alt: string; glowColor: string }> = {
  attack: { src: '/images/buttons/attack-ld.png', alt: 'Attack', glowColor: 'rgba(239,68,68,0.7)' },
  well: { src: '/images/buttons/well-ld.png', alt: 'The Well', glowColor: 'rgba(167,139,250,0.7)' },
  defend: { src: '/images/buttons/defend-ld.png', alt: 'Defend', glowColor: 'rgba(59,130,246,0.7)' },
};

const RESOURCE_PREVIEW: Record<'hp' | 'coins' | 'atk', {
  value: number; label: string; sublabel: string; valueClass: string; sublabelClass: string; border: string;
}> = {
  hp: { value: 5, label: 'HP', sublabel: '❤ Get', valueClass: 'text-red-400', sublabelClass: 'text-red-400/70', border: 'border-red-500/50' },
  coins: { value: 3, label: 'Coins', sublabel: '💰 Get', valueClass: 'text-yellow-400', sublabelClass: 'text-yellow-400/70', border: 'border-yellow-500/50' },
  atk: { value: 2, label: 'ATK', sublabel: '⚔ Buy', valueClass: 'text-blue-400', sublabelClass: 'text-blue-400/70', border: 'border-blue-500/50' },
};

const ACTION_ORDER: GuideTarget[] = ['attack', 'well', 'defend'];
const RESOURCE_ORDER: GuideTarget[] = ['hp', 'coins', 'atk'];

export default function GuideStepPreview({ step }: GuideStepPreviewProps) {
  if (step.example === 'atkAffordability') return <AtkAffordabilityExample />;

  const merged: GuideHighlights = { ...step.highlights, ...step.altHighlights };
  const targets = Object.keys(merged) as GuideTarget[];
  if (targets.length === 0) return null;

  const actions = ACTION_ORDER.filter((t) => targets.includes(t));
  const resources = RESOURCE_ORDER.filter((t) => targets.includes(t));

  return (
    <div className="flex flex-col items-center gap-3 bg-gray-900 rounded-xl p-4">
      {/* Actions and resources are two different kinds of thing (a main
          action vs. a resource action), so they always get their own row --
          never wrapped together onto the same line, where e.g. Defend
          sitting next to the HP card could read as one confused group. */}
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actions.map((t) => {
            const a = ACTION_PREVIEW[t as 'attack' | 'well' | 'defend'];
            return <ActionImageButton key={t} src={a.src} alt={a.alt} glowColor={a.glowColor} width={110} selected />;
          })}
        </div>
      )}
      {resources.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {resources.map((t) => {
            const r = RESOURCE_PREVIEW[t as 'hp' | 'coins' | 'atk'];
            return (
              <ResourceCard
                key={t}
                value={r.value}
                label={r.label}
                sublabel={r.sublabel}
                valueClass={r.valueClass}
                sublabelClass={r.sublabelClass}
                disabled
                onClick={() => {}}
                className={`bg-black/70 ${r.border}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
