'use client';

import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { FreshHtml } from '@/components/hud/FreshHtml';
import { useClickNotDrag } from '@/lib/useClickNotDrag';

/**
 * The signpost at the centre of the city (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * Procedural geometry, deliberately: §9 lists a carved signpost as art that
 * has to be made, and a box-and-cylinder stand-in that is obviously
 * provisional is better than a stock model that quietly becomes permanent.
 * Swap the meshes for a GLB without touching the arm/label/interaction
 * wiring above them.
 *
 * Each arm points at the building it sends you to, and hovering one lights
 * both -- that pairing is what teaches the mapping without a tutorial.
 */

const POST_HEIGHT = 5.2;
const POST_RADIUS = 0.16;
const ARM_LENGTH = 3.0;
const ARM_HEIGHT = 0.62;
const ARM_THICK = 0.16;
/** Arms hang just below the top so the post reads as a post, not a cross. */
const ARM_Y = POST_HEIGHT - 0.9;
/** How far one full tier hangs below the one above it. Enough that the lower
 *  sign's label clears the upper arm's plank, and no more -- only about
 *  three units of this post stand above the water.
 *
 *  Tiers are fractional, so an arm can sit between two others: the ranked
 *  arm rides at 0.5, halfway down between Bossfight and Earth on the far
 *  side. With both destinations on one row their labels ran into each other
 *  across the post -- each is nowrap and carries a sublabel, so they are far
 *  wider than the 3.3 units between the two arms' centres. */
const ARM_TIER_DROP = 1.25;

const WOOD = '#6b4f2a';
const WOOD_HOVER = '#8a6836';

export interface SignpostArm {
  /** Which way it points, and therefore which building it pairs with. */
  side: 'left' | 'right';
  /** How far down the post this arm hangs, in tiers: 0 is the top row, 1 is
   *  a full drop below it, and fractions sit between (0.5 is halfway). Lets
   *  arms interleave down the post instead of stacking two to a row. */
  tier?: number;
  /** A quieter aside rather than a destination -- smaller text. Kept apart
   *  from `tier` on purpose: how far down the post a sign hangs and how
   *  loudly it speaks are different questions, and an arm can be lower than
   *  another without being lesser than it. */
  secondary?: boolean;
  /** Fraction of the full arm length. A secondary sign is shorter, so the
   *  post still reads as two big destinations and one small aside. */
  lengthScale?: number;
  /** The destination, e.g. "BOSSFIGHT". */
  label: string;
  /** Live state under the label -- a countdown, a queue status. */
  sublabel?: string | null;
  /** Accent for the label text. */
  color: string;
  onActivate: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

function Arm({ arm }: { arm: SignpostArm }) {
  const [hovered, setHovered] = useState(false);
  const dir = arm.side === 'left' ? -1 : 1;
  const tier = arm.tier ?? 0;
  const length = ARM_LENGTH * (arm.lengthScale ?? 1);
  // Offset so the arm grows outward from the post rather than through it.
  const x = dir * (length / 2 + POST_RADIUS);
  // Anything below the top row rides closer to its own plank: at the main
  // row's offset it would run up into the arm above.
  const labelY = tier === 0 ? ARM_HEIGHT * 1.4 : ARM_HEIGHT * 0.85;

  const click = useClickNotDrag(arm.onActivate);

  const setHover = (v: boolean) => {
    setHovered(v);
    arm.onHoverChange?.(v);
    document.body.style.cursor = v ? 'pointer' : 'auto';
  };

  // The pointed tip, built once: a flat triangle capping the outer end.
  const tip = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, ARM_HEIGHT / 2);
    shape.lineTo(0, -ARM_HEIGHT / 2);
    shape.lineTo(ARM_HEIGHT * 0.8, 0);
    shape.lineTo(0, ARM_HEIGHT / 2);
    return new THREE.ExtrudeGeometry(shape, { depth: ARM_THICK, bevelEnabled: false });
  }, []);

  return (
    <group
      position={[0, ARM_Y - tier * ARM_TIER_DROP, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
      onPointerDown={(e) => { e.stopPropagation(); click.onPointerDown(e); }}
      onPointerUp={(e) => { e.stopPropagation(); click.onPointerUp(e); }}
      onPointerLeave={click.onPointerLeave}
    >
      <mesh position={[x, 0, 0]}>
        <boxGeometry args={[length, ARM_HEIGHT, ARM_THICK]} />
        <meshStandardMaterial color={hovered ? WOOD_HOVER : WOOD} />
      </mesh>
      <mesh
        geometry={tip}
        position={[dir * (length + POST_RADIUS), 0, -ARM_THICK / 2]}
        rotation={[0, 0, arm.side === 'left' ? Math.PI : 0]}
      >
        <meshStandardMaterial color={hovered ? WOOD_HOVER : WOOD} />
      </mesh>

      <FreshHtml
        position={[x, labelY, 0]}
        center
        distanceFactor={14}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div
            style={{
              color: arm.color,
              fontSize: (arm.secondary ? 19 : 26) + (hovered ? 4 : 0),
              fontWeight: 900,
              letterSpacing: '0.06em',
              WebkitTextStroke: '1px rgba(0,0,0,0.55)',
              textShadow: '0 0 10px rgba(0,0,0,0.7)',
              transition: 'font-size 0.15s',
            }}
          >
            {arm.side === 'left' ? '◀ ' : ''}{arm.label}{arm.side === 'right' ? ' ▶' : ''}
          </div>
          {arm.sublabel && (
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, textShadow: '0 0 8px rgba(0,0,0,0.8)' }}>
              {arm.sublabel}
            </div>
          )}
        </div>
      </FreshHtml>
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
      <mesh position={[0, POST_HEIGHT / 2, 0]}>
        <cylinderGeometry args={[POST_RADIUS, POST_RADIUS * 1.3, POST_HEIGHT, 10]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      {arms.map((arm) => (
        <Arm key={`${arm.side}-${arm.tier ?? 0}`} arm={arm} />
      ))}
    </group>
  );
}
