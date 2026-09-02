'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import Senate from '@/components/city/Senate';
import Market from '@/components/city/Market';
import { ARENA } from '@/lib/rankedArena';
import {
  gridSizeFor,
  orbitCameraPosition,
  orbitFraming,
  type ModellingModelId,
} from '@/lib/modelling';

/**
 * The /modelling sandbox scene -- one building on a grid, orbited.
 *
 * Deliberately NOT the city scene. The city's camera is pinned to a
 * standing eye and only turns its head (CityScene.tsx: pan and zoom both
 * off); the world map's orbits its subject and drifts round it on its own.
 * This is the second kind, because what you want while sculpting is to walk
 * around the thing.
 *
 * Nothing here is unit-tested (R3F/Three components never are in this
 * repo). Everything that could be wrong arithmetically lives in
 * src/lib/modelling.ts, which is.
 */

/** Narrow, so the building fills the frame without wide-angle bulge. */
export const MODELLING_FOV = 45;

export interface MeasuredModel {
  width: number;
  height: number;
  depth: number;
}

interface Props {
  modelId: ModellingModelId;
  spin: boolean;
  wireframe: boolean;
  /** Reports the model's measured bounding box up to the HUD. */
  onMeasure?: (m: MeasuredModel) => void;
}

function ModelBody({ modelId }: { modelId: ModellingModelId }) {
  switch (modelId) {
    case 'ranked':
      // The arena's own dimensions, not a scaled city Senate -- see
      // lib/rankedArena.ts for why those two can never be the same shape.
      return (
        <Senate
          width={ARENA.width}
          depth={ARENA.depth}
          columnHeight={ARENA.columnHeight}
          columnRadius={ARENA.columnRadius}
          stepHeight={ARENA.stepHeight}
          columnCount={ARENA.columnCount}
          sideColumnCount={ARENA.sideColumnCount}
        />
      );
    case 'market':
      return <Market />;
    case 'senate-city':
      return <Senate />;
  }
}

export default function ModellingScene({ modelId, spin, wireframe, onMeasure }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.viewport);
  const [box, setBox] = useState<{ size: THREE.Vector3; centerY: number } | null>(null);

  // Measure the real geometry rather than reading dimensions off the props:
  // the whole point of this page is that these buildings are about to
  // change shape, and a hard-coded height would quietly mis-frame the first
  // time somebody raises a dome.
  //
  // useLayoutEffect, not useEffect: these are procedural primitives built
  // in the same render pass, so the meshes exist by the time layout effects
  // run, and framing before paint means no visible camera snap.
  useLayoutEffect(() => {
    if (!groupRef.current) return;
    const measured = new THREE.Box3().setFromObject(groupRef.current);
    const size = measured.getSize(new THREE.Vector3());
    const centerY = measured.getCenter(new THREE.Vector3()).y;
    setBox({ size, centerY });
    onMeasure?.({ width: size.x, height: size.y, depth: size.z });
  }, [modelId, onMeasure]);

  // Re-stand the camera whenever the model changes. Only on the model, not
  // on the viewport: re-framing mid-resize would yank the camera out from
  // under someone who had just lined up a view they wanted to look at.
  useEffect(() => {
    if (!box) return;
    const { distance } = orbitFraming(box.size, {
      fov: MODELLING_FOV,
      aspect: viewport.aspect,
    });
    camera.position.set(...orbitCameraPosition(distance, box.centerY));
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, box.centerY, 0);
      controls.update();
    }
    camera.lookAt(0, box.centerY, 0);
    // viewport.aspect intentionally read but not depended on -- see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, camera]);

  // Wireframe and shadow flags are pushed onto the meshes from out here
  // instead of being threaded through Senate/Market as props. Those two are
  // the components being sculpted; a sandbox has no business adding
  // parameters to them that the city and the lobby would then carry
  // forever.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if ('wireframe' in material) {
          (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [modelId, wireframe]);

  const framing = box
    ? orbitFraming(box.size, { fov: MODELLING_FOV, aspect: viewport.aspect })
    : null;
  const gridSize = box ? gridSizeFor(box.size) : 40;

  return (
    <>
      {/* Studio lighting, not the city's. The city's key light is the Sun at
          whatever altitude Athens has it at, which is exactly what you do
          NOT want while judging a silhouette -- half the day it is behind
          the building. A fixed three-point rig instead: a key that casts,
          a cool fill from the opposite side so the shadow side is readable
          rather than black, and a hemisphere for the ambient bounce. */}
      <hemisphereLight args={['#bcd4ff', '#26313f', 1.0]} />
      <directionalLight
        position={[gridSize * 0.6, gridSize * 0.9, gridSize * 0.5]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-gridSize}
        shadow-camera-right={gridSize}
        shadow-camera-top={gridSize}
        shadow-camera-bottom={-gridSize}
        shadow-camera-far={gridSize * 4}
        shadow-bias={-0.0006}
      />
      <directionalLight position={[-gridSize * 0.7, gridSize * 0.4, -gridSize * 0.4]} intensity={0.5} color="#9fc4ff" />

      <group ref={groupRef}>
        <ModelBody modelId={modelId} />
      </group>

      {/* A one-unit grid, so a dimension can be read straight off the floor
          -- the reason this is a grid and not the city's terrain. */}
      <gridHelper args={[gridSize, gridSize, '#4a6b96', '#243247']} />

      {/* Catches the key light's shadow and nothing else, so the grid stays
          visible through it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[gridSize * 2, gridSize * 2]} />
        <shadowMaterial opacity={0.34} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        // Pan stays ON here, unlike every other scene in the app: lining a
        // detail up in the middle of the frame is most of what looking at a
        // model is, and there is no player position to preserve.
        enablePan
        enableZoom
        autoRotate={spin}
        // The world map's drift speed. Slow enough to read as hovering
        // rather than as a turntable.
        autoRotateSpeed={0.4}
        enableDamping
        dampingFactor={0.08}
        minDistance={framing?.minDistance ?? 1}
        maxDistance={framing?.maxDistance ?? 400}
        // Stop just above the floor: orbiting under the grid puts you
        // inside the shadow plane and the model goes black.
        maxPolarAngle={Math.PI * 0.495}
      />
    </>
  );
}
