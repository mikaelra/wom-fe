'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

/**
 * How often the model is re-measured, seconds.
 *
 * There IS a reason this is polled rather than done once on mount. The
 * whole loop this page exists for is: edit Senate.tsx, Fast Refresh swaps
 * the geometry in, look at the result. Fast Refresh re-renders the edited
 * component but does not re-run an unrelated parent's effects, so a
 * measure-on-mount would leave the dimension readout describing the
 * building as it was before the edit -- wrong exactly when it is being
 * read most carefully. Re-measuring a few dozen primitives at 2.5Hz costs
 * nothing next to that.
 */
const REMEASURE_INTERVAL = 0.4;
/** Below this, a size change is float noise rather than an edit. */
const SIZE_EPSILON = 1e-3;

export interface MeasuredModel {
  width: number;
  height: number;
  depth: number;
}

interface Props {
  modelId: ModellingModelId;
  spin: boolean;
  wireframe: boolean;
  /** Bumped by the page's Refit button to re-frame the camera on demand. */
  refitSignal: number;
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

interface Measurement {
  size: THREE.Vector3;
  centerY: number;
}

export default function ModellingScene({
  modelId, spin, wireframe, refitSignal, onMeasure,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.viewport);

  // The live measurement is held in a ref as well as state: the camera
  // refit needs the CURRENT box at the moment it fires, and reading it from
  // state would make the refit effect depend on the box -- which would yank
  // the camera every time an edit changed the model's size, mid-look.
  const boxRef = useRef<Measurement | null>(null);
  const [box, setBox] = useState<Measurement | null>(null);

  const measure = useCallback((): Measurement | null => {
    if (!groupRef.current) return null;
    const measured = new THREE.Box3().setFromObject(groupRef.current);
    if (measured.isEmpty()) return null;
    return {
      size: measured.getSize(new THREE.Vector3()),
      centerY: measured.getCenter(new THREE.Vector3()).y,
    };
  }, []);

  // Wireframe and shadow flags are pushed onto the meshes by traversing the
  // group instead of being threaded through Senate/Market as props. Those
  // two are the components being sculpted; a sandbox has no business adding
  // parameters to them that the city and the lobby would then carry
  // forever. Re-applied on every measure tick rather than once, because an
  // edit that adds a mesh would otherwise leave the new one solid while
  // everything around it stayed wireframe.
  const applyMaterialFlags = useCallback(() => {
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
  }, [wireframe]);

  /** Stand the camera back off at the framed distance for the current box. */
  const refit = useCallback(() => {
    const current = boxRef.current;
    if (!current) return;
    const { distance } = orbitFraming(current.size, {
      fov: MODELLING_FOV,
      aspect: viewport.aspect,
    });
    camera.position.set(...orbitCameraPosition(distance, current.centerY));
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(0, current.centerY, 0);
      controls.update();
    }
    camera.lookAt(0, current.centerY, 0);
  }, [camera, viewport.aspect]);

  // First measurement before paint, so the opening frame is already framed
  // rather than snapping into place a tick later.
  useLayoutEffect(() => {
    const first = measure();
    if (!first) return;
    boxRef.current = first;
    setBox(first);
    onMeasure?.({ width: first.size.x, height: first.size.y, depth: first.size.z });
    applyMaterialFlags();
    refit();
    // Only on a model change: refit/applyMaterialFlags identities change
    // with the wireframe toggle and the viewport, and re-framing the camera
    // on either would move a view someone had just lined up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  useEffect(() => {
    applyMaterialFlags();
  }, [applyMaterialFlags]);

  // Refit on demand only -- never automatically on a size change. An edit
  // that makes the building taller should show it getting taller, not
  // silently back the camera off to keep it the same size on screen.
  useEffect(() => {
    if (refitSignal > 0) refit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitSignal]);

  const sinceMeasure = useRef(0);
  useFrame((_, delta) => {
    sinceMeasure.current += delta;
    if (sinceMeasure.current < REMEASURE_INTERVAL) return;
    sinceMeasure.current = 0;

    const next = measure();
    if (!next) return;
    const prev = boxRef.current;
    const changed =
      !prev ||
      Math.abs(prev.size.x - next.size.x) > SIZE_EPSILON ||
      Math.abs(prev.size.y - next.size.y) > SIZE_EPSILON ||
      Math.abs(prev.size.z - next.size.z) > SIZE_EPSILON ||
      Math.abs(prev.centerY - next.centerY) > SIZE_EPSILON;
    if (!changed) return;

    boxRef.current = next;
    setBox(next);
    onMeasure?.({ width: next.size.x, height: next.size.y, depth: next.size.z });
    // A hot-swapped mesh arrives with its own fresh material.
    applyMaterialFlags();
  });

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
      <directionalLight
        position={[-gridSize * 0.7, gridSize * 0.4, -gridSize * 0.4]}
        intensity={0.5}
        color="#9fc4ff"
      />

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
