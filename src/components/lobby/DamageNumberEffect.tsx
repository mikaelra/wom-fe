'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';

// drei's Text forwards a ref typed `any` (troika-three-text ships no type
// declarations at all) -- this is the minimal shape this component actually
// mutates per-frame, typed locally rather than pulling in the untyped
// package or widening to `any` throughout.
interface TroikaTextRef {
  fillOpacity: number;
  strokeOpacity: number;
}

// Floating combat number: a red "-X" on a real hit, a blue "0" on a
// successful block. Shown to both sides of an exchange -- the attacker sees
// it over their target, the target sees it over themselves -- spawned at
// the sword's real impact moment (LobbyScene's SwordEffect onStrike
// callback), the same moment the HP-card shake and hit-flash fire, so it
// lands exactly on the hit rather than some independently-timed estimate.
// Not shown for instakills, which already have their own distinct burst.
//
// Static, not a rising/drifting popup: appears at full opacity right on the
// hit, holds, fades out over the tail end, then removes itself. The
// "thickness" is a same-colour stroke, not a contrasting outline -- reads
// as bold text rather than a black-bordered sticker.

export const DAMAGE_NUMBER_DURATION = 0.8; // seconds
const FADE_START = 0.6; // fraction of DAMAGE_NUMBER_DURATION where fade begins

export type DamageNumberColor = 'red' | 'blue';

const COLOR_HEX: Record<DamageNumberColor, string> = {
  red: '#b91c1c',
  blue: '#4fa8ff',
};

export type DamageNumberEffectProps = {
  /** World-space position to spawn at -- LobbyScene offsets this above the
   *  character's head before passing it in. */
  position: [number, number, number];
  text: string;
  color: DamageNumberColor;
  onDone?: () => void;
};

export default function DamageNumberEffect({ position, text, color, onDone }: DamageNumberEffectProps) {
  const textRef = useRef<TroikaTextRef>(null);
  const startRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useFrame(() => {
    if (startRef.current === null) startRef.current = performance.now() / 1000;
    const t = performance.now() / 1000 - startRef.current;
    const p = Math.min(1, t / DAMAGE_NUMBER_DURATION);

    if (textRef.current) {
      const fade = p < FADE_START ? 1 : 1 - (p - FADE_START) / (1 - FADE_START);
      textRef.current.fillOpacity = fade;
      textRef.current.strokeOpacity = fade;
    }

    if (t >= DAMAGE_NUMBER_DURATION && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <Billboard position={position}>
      <Text
        ref={textRef}
        fontSize={0.32}
        fontWeight="bold"
        color={COLOR_HEX[color]}
        anchorX="center"
        anchorY="middle"
        strokeWidth={0.02}
        strokeColor={COLOR_HEX[color]}
        depthOffset={-1}
        renderOrder={30}
      >
        {text}
      </Text>
    </Billboard>
  );
}
