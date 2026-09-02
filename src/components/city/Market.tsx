'use client';

import * as THREE from 'three';

/**
 * The Market -- procedural placeholder (wom-be docs/MARKET_PLAN.md §3.2 /
 * §9, docs/CITY_SCENE_PLAN.md §9).
 *
 * There is no market model yet; §9 lists one as art still to be made. This
 * is a deliberately plain agora stall-row built from primitives: a stepped
 * stone plinth, four timber posts carrying a flat awning, a low stone
 * counter along the front, and a couple of crates. Obviously provisional --
 * same tier of effort as Senate.tsx's placeholder, and the point is that a
 * stock model would quietly become permanent. Swap the whole body for a
 * <primitive> once the model exists; the parent's tint/hover wiring above
 * it does not care what is inside.
 *
 * `color` tints the stonework the same way Temple/Senate are tinted on
 * hover. The awning keeps its own cloth colour -- a green that matches
 * MARKET_COLOR on the signpost's right arm, so the building says from a
 * distance what it sends you to, the way the temple's blue and the
 * Senate's red do.
 */

const AWNING_COLOR = '#5fd88a';
const TIMBER = '#6b4f2a';

export interface MarketProps {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
  width?: number;
  depth?: number;
}

export default function Market({
  position = [0, 0, 0],
  color = '#D6D6D6',
  width = 7.5,
  depth = 4.2,
}: MarketProps) {
  const STEP_H = 0.3;
  const baseTop = STEP_H * 2;
  const postH = 3.4;
  const postR = 0.13;
  // Posts sit just inside each corner of the plinth.
  const px = width / 2 - 0.6;
  const pz = depth / 2 - 0.5;
  const posts: [number, number][] = [
    [-px, -pz], [px, -pz], [-px, pz], [px, pz],
  ];

  return (
    <group position={position}>
      {/* Stepped stone plinth */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[0, STEP_H * i + STEP_H / 2, 0]}>
          <boxGeometry args={[width + 1 - i * 0.4, STEP_H, depth + 1 - i * 0.4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* Timber posts */}
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, baseTop + postH / 2, z]}>
          <cylinderGeometry args={[postR, postR * 1.15, postH, 8]} />
          <meshStandardMaterial color={TIMBER} />
        </mesh>
      ))}

      {/* Flat awning, pitched very slightly toward the front (−Z, the city
          centre) so it reads as a roof rather than a table. */}
      <mesh
        position={[0, baseTop + postH + 0.12, 0]}
        rotation={[-0.08, 0, 0]}
      >
        <boxGeometry args={[width + 1.2, 0.16, depth + 1.0]} />
        <meshStandardMaterial color={AWNING_COLOR} side={THREE.DoubleSide} />
      </mesh>

      {/* A low stone counter along the front edge -- the side facing the
          signpost and campfire (−Z). */}
      <mesh position={[0, baseTop + 0.55, -depth / 2 + 0.35]}>
        <boxGeometry args={[width - 0.4, 1.1, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Crates stacked at one end */}
      {([
        [width / 2 - 1.0, baseTop + 0.45, depth / 2 - 1.0, 0.9],
        [width / 2 - 1.4, baseTop + 0.35, depth / 2 - 1.7, 0.7],
        [width / 2 - 1.1, baseTop + 1.15, depth / 2 - 1.1, 0.7],
      ] as const).map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, i * 0.4, 0]}>
          <boxGeometry args={[s, s, s]} />
          <meshStandardMaterial color={TIMBER} />
        </mesh>
      ))}

      {/* A green glow under the awning, echoing the Senate's oculus light --
          lights the counter and says "market" from across the island once
          the sun is down. */}
      <pointLight
        position={[0, baseTop + postH - 0.4, 0]}
        color={AWNING_COLOR}
        intensity={26}
        distance={22}
        decay={1.6}
      />
    </group>
  );
}
