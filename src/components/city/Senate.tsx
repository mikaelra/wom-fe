'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { senateColumns } from '@/lib/senateGeometry';

/**
 * The Senate -- procedural placeholder (docs/CITY_SCENE_PLAN.md §9).
 *
 * There is no Senate model yet; §9 lists one as art still to be made. This
 * is a deliberately plain classical portico built from primitives: stepped
 * base, a colonnade, entablature and pediment. Obviously provisional, which
 * is the point -- a stock model would quietly become permanent.
 *
 * Sized to stand beside temple.glb without towering over it. Swap the whole
 * body for a <primitive> once the model exists; the interaction wrapper in
 * CityScene does not care what is inside.
 *
 * **It is hollow.** It used to have a solid cella filling the middle -- a
 * wall behind the front columns so it read as a building rather than a
 * fence. That block is gone and the colonnade now runs the full perimeter,
 * because the Senate is becoming the arena ranked matches are played in and
 * players have to fit inside it and be visible from outside. An open
 * peristyle does both: it is still unmistakably a building from the street,
 * and you can see who is in it.
 */

const COLUMN_COUNT = 6;
/** Along the shorter sides. Fewer, so the long views into the open middle
 *  stay open and the building does not read as a cage. */
const SIDE_COLUMN_COUNT = 4;
const COLUMN_HEIGHT = 4.2;
const COLUMN_RADIUS = 0.32;
const WIDTH = 8.4;
const DEPTH = 5.0;
const STEP_HEIGHT = 0.34;

export default function Senate({
  position = [0, 0, 0],
  color = '#D6D6D6',
}: {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
}) {
  // Built as a ring in lib/senateGeometry.ts rather than four hard-coded
  // rows: placed per-side, every corner gets a column twice, which shows up
  // as z-fighting that flickers as the camera moves. A test holds that.
  const { positions: columns } = useMemo(
    () => senateColumns(WIDTH, DEPTH, COLUMN_RADIUS, COLUMN_COUNT, SIDE_COLUMN_COUNT),
    [],
  );

  // Triangular pediment, extruded across the building's depth.
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-WIDTH / 2, 0);
    s.lineTo(WIDTH / 2, 0);
    s.lineTo(0, 1.5);
    s.lineTo(-WIDTH / 2, 0);
    return new THREE.ExtrudeGeometry(s, { depth: DEPTH * 0.5, bevelEnabled: false });
  }, []);

  const baseTop = STEP_HEIGHT * 3;

  return (
    <group position={position}>
      {/* Stepped base */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, STEP_HEIGHT * i + STEP_HEIGHT / 2, 0]}>
          <boxGeometry args={[WIDTH + 1.2 - i * 0.4, STEP_HEIGHT, DEPTH + 1.2 - i * 0.4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* Peristyle. No cella: the middle is deliberately empty, so a ranked
          match can be played in there and watched from outside. */}
      {columns.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, baseTop + COLUMN_HEIGHT / 2, z]}>
          <cylinderGeometry args={[COLUMN_RADIUS, COLUMN_RADIUS * 1.1, COLUMN_HEIGHT, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}

      {/* Entablature */}
      <mesh position={[0, baseTop + COLUMN_HEIGHT + 0.3, 0]}>
        <boxGeometry args={[WIDTH + 0.4, 0.6, DEPTH + 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Pediment */}
      <mesh geometry={pediment} position={[0, baseTop + COLUMN_HEIGHT + 0.6, -DEPTH * 0.25]}>
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}
