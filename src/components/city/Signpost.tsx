'use client';

import { useState } from 'react';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { useClickNotDrag } from '@/lib/useClickNotDrag';
import {
  ARM_HEIGHT,
  ARM_LENGTH,
  ARM_TIER_DROP,
  ARM_Y,
  CarvedPlank,
  CarvedPost,
  POST_RADIUS,
} from '@/components/city/CarvedSignpost';

/**
 * The signposts in the city (docs/CITY_SCENE_PLAN.md §5.2): the one at the
 * centre and the ranked fork.
 *
 * The wood is CarvedSignpost.tsx -- sculpted on /modelling, the
 * destination's name burnt into each plank and painted in its colour. What
 * lives here is the wiring over it: which way each arm points, hovering
 * and clicking it, and the live line under a destination (a countdown, a
 * queue state), which hangs over its sign in white light.
 *
 * Each arm points at the building it sends you to, and hovering one lights
 * both -- that pairing is what teaches the mapping without a tutorial.
 */

/** Where the live white text sits: just over the top edge of its plank. */
const SUBLABEL_Y = ARM_HEIGHT / 2 + 0.12;

export interface SignpostArm {
  /** Which way it points, and therefore which building it pairs with. */
  side: 'left' | 'right';
  /** How far down the post this arm hangs, in tiers: 0 is the top row, 1 is
   *  a full drop below it, and fractions sit between (0.5 is halfway). Lets
   *  arms interleave down the post instead of stacking two to a row. */
  tier?: number;
  /** Fraction of the full arm length. A secondary sign is shorter, so the
   *  post still reads as two big destinations and one small aside. */
  lengthScale?: number;
  /** The destination, e.g. "HADES" -- burnt into the plank. */
  label: string;
  /** Live state under the label -- a countdown, a queue status. `\n`-joined
   *  for two lines (e.g. a headcount over its countdown); each renders in
   *  its own line below the label. */
  sublabel?: string | null;
  /** The paint in the burnt label, and the colour the sign glows. */
  color: string;
  onActivate: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

function Arm({ arm }: { arm: SignpostArm }) {
  const [hovered, setHovered] = useState(false);
  const tier = arm.tier ?? 0;
  const dir = arm.side === 'left' ? -1 : 1;
  const length = ARM_LENGTH * (arm.lengthScale ?? 1);

  const click = useClickNotDrag(arm.onActivate);

  const setHover = (v: boolean) => {
    setHovered(v);
    arm.onHoverChange?.(v);
    document.body.style.cursor = v ? 'pointer' : 'auto';
  };

  return (
    <group
      position={[0, ARM_Y - tier * ARM_TIER_DROP, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
      onPointerDown={(e) => { e.stopPropagation(); click.onPointerDown(e); }}
      onPointerUp={(e) => { e.stopPropagation(); click.onPointerUp(e); }}
      onPointerLeave={click.onPointerLeave}
    >
      <CarvedPlank
        side={arm.side}
        label={arm.label}
        color={arm.color}
        lengthScale={arm.lengthScale}
        hovered={hovered}
      />

      {arm.sublabel && (
        <FreshHtml
          position={[dir * (POST_RADIUS + length / 2), SUBLABEL_Y, 0]}
          center
          distanceFactor={14}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {/* Lifted by its own height, so the text's bottom edge -- not its
              middle -- sits on the plank: a two-line sublabel grows upward
              off its sign instead of down across the burnt name. */}
          <div style={{ textAlign: 'center', whiteSpace: 'nowrap', transform: 'translateY(-50%)' }}>
            {arm.sublabel.split('\n').map((line, i) => (
              <div
                key={i}
                style={{
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                  // White light rather than a dark drop shadow: it shines
                  // over its sign the way the paint glows in the wood.
                  textShadow:
                    '0 0 4px rgba(255,255,255,0.9), 0 0 12px rgba(255,255,255,0.55), 0 0 26px rgba(255,255,255,0.35)',
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </FreshHtml>
      )}
    </group>
  );
}

export default function Signpost({
  position,
  rotationY = 0,
  arms,
}: {
  position: [number, number, number];
  /** Yaw of the whole post about its own axis, radians. The arms turn with
   *  it, so a turned post points its arms at buildings that are not on the
   *  scene's x-axis (the ranked fork, at 45 between the two Senates). */
  rotationY?: number;
  arms: SignpostArm[];
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <CarvedPost />
      {arms.map((arm) => (
        <Arm key={`${arm.side}-${arm.tier ?? 0}`} arm={arm} />
      ))}
    </group>
  );
}
