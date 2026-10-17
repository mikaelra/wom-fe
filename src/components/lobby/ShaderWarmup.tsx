'use client';

import { Suspense, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import DenyModelButton from '@/components/lobby/DenyModelButton';
import { DENY_RING_GEOMETRY_ARGS, DENY_RING_MATERIAL } from '@/components/lobby/DenyRingEffect';
import { LostSoulMesh } from '@/components/lobby/PlayerAvatars';

// Gets the battle's late-arriving pieces onto the GPU before they're needed
// (Mikael, 2026-10-12): the deny prompt and its falling rings stuttered the
// first time a deny came up, on every device, and a bossfight's lost souls
// hitched on Steam when they first appeared. Their models are fetched ahead
// of time already, but a material's shader is only compiled -- and its
// textures uploaded -- the first time it's drawn, mid-game.
//
// So, once in the waiting lobby: mount them, tiny, at the table's centre,
// compile the scene and let them draw a few frames, then hide them. They
// stay mounted (hidden): unmounting would let three.js free the compiled
// programs again, and the hitch would come back.

const WARM_FRAMES = 3;
const TINY = 0.0001;

function Warm({ onWarm }: { onWarm: () => void }) {
  const { gl, scene, camera } = useThree();
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 1) gl.compile(scene, camera);
    if (frames.current === WARM_FRAMES) onWarm();
  });
  return null;
}

export default function ShaderWarmup({ lostSouls }: { lostSouls: boolean }) {
  const group = useRef<THREE.Group>(null);
  return (
    <group ref={group} scale={TINY}>
      <Suspense fallback={null}>
        <DenyModelButton />
        <mesh>
          <torusGeometry args={DENY_RING_GEOMETRY_ARGS} />
          <meshStandardMaterial {...DENY_RING_MATERIAL} opacity={0.01} />
        </mesh>
        {lostSouls && <LostSoulMesh />}
        {/* Inside the Suspense: only counts frames once the models are in. */}
        <Warm
          onWarm={() => {
            if (group.current) group.current.visible = false;
          }}
        />
      </Suspense>
    </group>
  );
}
