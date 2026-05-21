'use client';

import { Suspense, forwardRef, useEffect, useRef, useState, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';
import { getGlobeSpin } from '@/lib/globeSpin';
import { isLowQuality } from '@/lib/deviceQuality';

const LD_IMAGE = '/models/buttons/rope_button-ld.png';

function RopeFrame({ rotation = [0, 0, 0] as [number, number, number] }) {
  const { scene } = useGLTF('/models/buttons/roped_button-hd.glb');
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const spin = getGlobeSpin();
    const targetTilt = -spin * 0.021;
    const rate = 2.5 + Math.abs(spin) * 6;
    const k = 1 - Math.exp(-rate * Math.max(dt, 0));
    groupRef.current.rotation.y += (targetTilt - groupRef.current.rotation.y) * k;
  });
  return (
    <group ref={groupRef}>
      <Center>
        <primitive object={scene} rotation={rotation} />
      </Center>
    </group>
  );
}

type RopedInput3DProps = {
  width?: number;
  height?: number;
  modelRotation?: [number, number, number];
  /** Inset of the inner content area from the canvas edges so it sits inside
   *  the rope frame. CSS padding shorthand. */
  innerPadding?: string;
  children: ReactNode;
};

const RopedInput3D = forwardRef<HTMLDivElement, RopedInput3DProps>(function RopedInput3D(
  { width = 220, height = 70, modelRotation = [0, 0, 0], innerPadding = '14px 70px', children },
  ref,
) {
  const [lowQuality, setLowQuality] = useState(false);
  useEffect(() => { setLowQuality(isLowQuality()); }, []);

  return (
    <div
      ref={ref}
      className="relative inline-block select-none"
      style={{ width, height }}
    >
      {lowQuality ? (
        <img
          src={LD_IMAGE}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ transform: 'scale(2.93, 1.7)' }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none">
          <Canvas
            camera={{ position: [0, 0, 1.067], fov: 35 }}
            gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.9} />
            <directionalLight position={[2, 3, 4]} intensity={1.1} />
            <directionalLight position={[-2, -1, 2]} intensity={0.4} />
            <Suspense fallback={null}>
              <RopeFrame rotation={modelRotation} />
            </Suspense>
          </Canvas>
        </div>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ padding: innerPadding }}
      >
        {children}
      </div>
    </div>
  );
});

export default RopedInput3D;

useGLTF.preload('/models/buttons/roped_button-hd.glb');
