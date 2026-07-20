'use client';

import { useGLTF } from '@react-three/drei';
import SpinningModelViewer from '@/components/SpinningModelViewer';

// No dedicated relic art exists yet -- reuses the Well's gold-reward coin
// model (see WellRewardEffect.tsx's WELL_REWARD_MODELS.gold), which is
// already loaded/cached for anyone who's played a match with a Well. Every
// relic renders the same coin regardless of power_category for now; a
// per-relic model is future work.
const COIN_MODEL_URL = '/models/well/rewards/gold-ld.glb';

// A small, self-contained <Canvas> per card -- relic counts per player are
// low (a handful of distinct bosses at most), so this stays well under
// browsers' concurrent-WebGL-context limits. Revisit with a shared/View-based
// canvas if that stops being true.
export default function RelicCoin() {
  return <SpinningModelViewer url={COIN_MODEL_URL} targetSize={1.1} spinSpeed={0.8} />;
}

useGLTF.preload(COIN_MODEL_URL);
