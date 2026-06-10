'use client';

import { Sky } from '@react-three/drei';
import * as THREE from 'three';

type Props = {
  /** Y height of the sea plane — set roughly at the temple/player base. */
  seaLevel?: number;
  /** Direction of the sun; also drives the sky gradient + horizon glow. */
  sunPosition?: [number, number, number];
  /** Water tint. */
  seaColor?: THREE.ColorRepresentation;
};

// A simple sky dome (drei <Sky>) + a large flat sea plane. Where the sea plane
// meets the sky dome in the distance reads as the sea horizon, and the sun in
// the sky gives the scene a bright outdoor feel.
export default function SeaAndSky({
  seaLevel = -1,
  sunPosition = [100, 20, 100],
  seaColor = '#3b7fb5',
}: Props) {
  return (
    <>
      <Sky
        distance={4500}
        sunPosition={sunPosition}
        turbidity={6}
        rayleigh={2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* Sea — a huge horizontal plane. Lies flat (rotated -90° on X) so it
          stretches out to the horizon in every direction. */}
      <mesh
        position={[0, seaLevel, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial
          color={seaColor}
          roughness={0.35}
          metalness={0.45}
        />
      </mesh>
    </>
  );
}
