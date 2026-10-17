'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { WELL_REWARD_MODELS, WELL_REWARD_SCALE, WELL_REWARD_ROTATION } from '@/components/lobby/WellRewardEffect';

useGLTF.preload(WELL_REWARD_MODELS.gold);

// Floats in front of a player who's equipped Hades' Coin for the upcoming
// match (PlayerAvatars.tsx's showEquippedCoin) -- same gold-ld.glb model the
// Well's coin reward uses, just at rest instead of mid-flight, static (not
// spinning) and 2.5x the reward's own landed scale so it reads clearly as
// its own persistent cue rather than a shrunk copy of the reward animation.
// Renders as a child of the parent's own group (PlayerWithName's outer
// <group>) so it inherits the player's world position/rotation, same as
// DenyModelButton.
const EQUIPPED_COIN_POSITION: [number, number, number] = [0, -0.05, 0.55];
const EQUIPPED_COIN_SCALE = WELL_REWARD_SCALE.gold * 2.5;

export default function EquippedCoinModel() {
  const { scene } = useGLTF(WELL_REWARD_MODELS.gold);
  const sceneClone = useMemo(() => scene.clone(), [scene]);

  return (
    <group position={EQUIPPED_COIN_POSITION}>
      <primitive
        object={sceneClone}
        scale={EQUIPPED_COIN_SCALE}
        rotation={WELL_REWARD_ROTATION.gold}
      />
    </group>
  );
}
