'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  terrainHeight, islandPlacements, LAND_LEVEL, LAND_RADIUS, RELIEF_HEIGHT,
} from '@/lib/cityTerrain';
import { SEA_LEVEL } from '@/lib/cityLayout';

/**
 * The ground, and the islands beyond it (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * The surface itself is `lib/cityTerrain.ts` -- this only samples it onto a
 * grid. Keeping the shape out of the component is what lets a test assert
 * that the ground is level under every building and under water past the
 * shore, neither of which is checkable from here.
 *
 * Vertex colours rather than a texture: sand at the waterline, dry grass on
 * the plateau, pale limestone on the tops. Three bands blended by height is
 * enough to read as a Greek island at this distance, and it costs one
 * attribute instead of an asset to load.
 */

const GRID = 150;
const SPAN = LAND_RADIUS * 2;

const SAND = new THREE.Color('#c8b78d');
const SCRUB = new THREE.Color('#7d8358');
const ROCK = new THREE.Color('#b9b2a4');

const _c = new THREE.Color();

function Ground({ clearRadius }: { clearRadius: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SPAN, SPAN, GRID, GRID);
    // Lay it flat before displacing, so the heights below are world Y and
    // the sampling matches the maths module's own x/z convention exactly.
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = terrainHeight(x, z, clearRadius);
      pos.setY(i, y);

      // Height above the waterline decides the band. Anything at or under
      // the sea is sand, so the beach reads as a beach rather than as grass
      // that happens to be wet.
      const above = y - SEA_LEVEL;
      _c.copy(SAND)
        .lerp(SCRUB, THREE.MathUtils.smoothstep(above, 0.35, 1.8))
        .lerp(ROCK, THREE.MathUtils.smoothstep(above, LAND_LEVEL - SEA_LEVEL + RELIEF_HEIGHT * 0.55, LAND_LEVEL - SEA_LEVEL + RELIEF_HEIGHT));
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [clearRadius]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}

/**
 * Islands on the horizon.
 *
 * Unlit on purpose. At 1.5km the only thing that reads is the silhouette,
 * and a lit material would either go black the moment the Sun set (losing
 * the horizon entirely) or need its own light rig to avoid it. A colour
 * carried from haze-blue down to near-black by `nightness` is both cheaper
 * and more controllable, and it matches how the sea's own colour is handled.
 */
function Islands({ nightness }: { nightness: number }) {
  const islands = useMemo(() => islandPlacements(), []);
  const color = useMemo(
    () => new THREE.Color('#8fa6bd').lerp(new THREE.Color('#070d18'), nightness),
    [nightness],
  );

  return (
    <>
      {islands.map((island, i) => (
        <mesh
          key={i}
          position={island.position}
          rotation={[0, island.rotation, 0]}
          scale={island.scale}
        >
          {/* Low-poly and flat-shaded: a distant island is a ridgeline, and
              a smooth dome would read as a bubble. */}
          <sphereGeometry args={[1, 14, 7]} />
          <meshBasicMaterial color={color} fog={false} />
        </mesh>
      ))}
    </>
  );
}

export default function Terrain({
  nightness,
  /** Flatten this radius around the origin as well as the city's own pads --
   *  for a caller standing a building there that the city does not know
   *  about. See padFlatness. */
  clearRadius = 0,
}: {
  nightness: number;
  clearRadius?: number;
}) {
  return (
    <>
      <Ground clearRadius={clearRadius} />
      <Islands nightness={nightness} />
    </>
  );
}
