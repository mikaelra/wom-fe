'use client';

import { useGLTF } from '@react-three/drei';
import SpinningModelViewer from '@/components/SpinningModelViewer';

// Falls back to the Well's gold-reward coin model (see WellRewardEffect.tsx's
// WELL_REWARD_MODELS.gold, already loaded/cached for anyone who's played a
// match with a Well) for any relic without dedicated art of its own.
const COIN_MODEL_URL = '/models/well/rewards/gold-ld.glb';

// Name-keyed, not id-keyed: unlike COIN_RELIC_ID (types/game.ts), a new
// relic's id is whatever the seed migration's autoincrement assigns, not a
// value safe to hardcode across environments (docs/MERCHANT_PLAN.md's
// domain/merchant.py resolves Stone of Vitality's id by name for the same
// reason).
const RELIC_MODEL_URLS: Record<string, string> = {
  'Stone of Vitality': '/models/relics/stone_of_vitality_v1.glb',
};

function relicModelUrl(relicName?: string): string {
  return (relicName && RELIC_MODEL_URLS[relicName]) || COIN_MODEL_URL;
}

// A small, self-contained <Canvas> per card -- relic counts per player are
// low (a handful of distinct bosses at most), so this stays well under
// browsers' concurrent-WebGL-context limits. Revisit with a shared/View-based
// canvas if that stops being true.
export default function RelicCoin({ relicName }: { relicName?: string } = {}) {
  return <SpinningModelViewer url={relicModelUrl(relicName)} targetSize={1.1} spinSpeed={0.8} />;
}

useGLTF.preload(COIN_MODEL_URL);
for (const url of Object.values(RELIC_MODEL_URLS)) useGLTF.preload(url);
