'use client';

import { Suspense, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';

type ButtonModelProps = {
  url: string;
  pressed: boolean;
  rotation?: [number, number, number];
};

function ButtonModel({ url, pressed, rotation = [0, 0, 0] }: ButtonModelProps) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const baseColors = useRef<Map<string, THREE.Color>>(new Map());

  useEffect(() => {
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const newMats = mats.map((m) => {
          if (!m) return m;
          const clone = m.clone();
          if ('color' in clone && clone.color instanceof THREE.Color) {
            baseColors.current.set(clone.uuid, clone.color.clone());
          }
          return clone;
        });
        obj.material = Array.isArray(obj.material) ? newMats : newMats[0]!;
      }
    });
  }, [cloned]);

  useEffect(() => {
    const factor = pressed ? 0.65 : 1.0;
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if ('color' in m && m.color instanceof THREE.Color) {
            const base = baseColors.current.get(m.uuid);
            if (base) m.color.copy(base).multiplyScalar(factor);
          }
        }
      }
    });
  }, [cloned, pressed]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      const target = pressed ? -0.04 : 0;
      groupRef.current.position.y += (target - groupRef.current.position.y) * 0.25;
    }
  });

  return (
    <group ref={groupRef} rotation={rotation}>
      <Center>
        <primitive object={cloned} />
      </Center>
    </group>
  );
}

type RopedButton3DProps = {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  width?: number;
  height?: number;
  modelRotation?: [number, number, number];
  textClassName?: string;
  ariaLabel?: string;
  children?: ReactNode;
};

export default function RopedButton3D({
  onClick,
  disabled = false,
  loading = false,
  width = 170,
  height = 70,
  modelRotation = [0, 0, 0],
  textClassName = 'text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
  ariaLabel,
  children,
}: RopedButton3DProps) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const pressed = !disabled && (active || hover || loading);

  return (
    <button
      type="button"
      onClick={() => { if (!disabled && !loading) onClick?.(); }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => { setHover(false); setActive(false); }}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className="relative inline-block bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 select-none"
      style={{ width, height }}
    >
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
            <ButtonModel
              url="/models/buttons/roped_button-hd.glb"
              pressed={pressed}
              rotation={modelRotation}
            />
          </Suspense>
        </Canvas>
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={textClassName}>
          {loading ? 'Loading...' : children}
        </span>
      </div>
    </button>
  );
}

useGLTF.preload('/models/buttons/roped_button-hd.glb');
