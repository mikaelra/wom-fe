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
 * Its dimensions are props, with the city's own as the defaults. The lobby
 * builds a much larger version of the SAME building to play ranked matches
 * in, and it has to be a different size rather than a scaled copy: uniform
 * scaling would take the step height and column thickness up with it, and
 * more importantly the lobby camera sits 3.7-6.4 units back depending on
 * aspect and player count, so the arena has to be deep enough to put that
 * camera INSIDE the colonnade. Scaled to that depth, everything else is
 * cartoonishly thick. Swap the whole body for a <primitive> once the model
 * exists; neither caller cares what is inside.
 *
 * **It is hollow.** It used to have a solid cella filling the middle -- a
 * wall behind the front columns so it read as a building rather than a
 * fence. That block is gone and the colonnade now runs the full perimeter,
 * because the Senate is becoming the arena ranked matches are played in and
 * players have to fit inside it and be visible from outside. An open
 * peristyle does both: it is still unmistakably a building from the street,
 * and you can see who is in it.
 */

export interface SenateProps {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
  width?: number;
  depth?: number;
  columnHeight?: number;
  columnRadius?: number;
  stepHeight?: number;
  /** Columns along the long faces. */
  columnCount?: number;
  /** Along the shorter sides. Fewer, so the long views into the open middle
   *  stay open and the building does not read as a cage. */
  sideColumnCount?: number;
}

export default function Senate({
  position = [0, 0, 0],
  color = '#D6D6D6',
  width = 8.4,
  depth = 5.0,
  columnHeight = 4.2,
  columnRadius = 0.32,
  stepHeight = 0.34,
  columnCount = 6,
  sideColumnCount = 4,
}: SenateProps) {
  const WIDTH = width;
  const DEPTH = depth;
  const COLUMN_HEIGHT = columnHeight;
  const COLUMN_RADIUS = columnRadius;
  const STEP_HEIGHT = stepHeight;

  // Built as a ring in lib/senateGeometry.ts rather than four hard-coded
  // rows: placed per-side, every corner gets a column twice, which shows up
  // as z-fighting that flickers as the camera moves. A test holds that.
  const { positions: columns } = useMemo(
    () => senateColumns(WIDTH, DEPTH, COLUMN_RADIUS, columnCount, sideColumnCount),
    [WIDTH, DEPTH, COLUMN_RADIUS, columnCount, sideColumnCount],
  );

  // Triangular pediment, extruded across the building's depth.
  const pediment = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-WIDTH / 2, 0);
    s.lineTo(WIDTH / 2, 0);
    s.lineTo(0, 1.5);
    s.lineTo(-WIDTH / 2, 0);
    return new THREE.ExtrudeGeometry(s, { depth: DEPTH * 0.5, bevelEnabled: false });
  }, [WIDTH, DEPTH]);

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
