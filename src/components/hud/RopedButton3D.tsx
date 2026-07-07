'use client';

import { Suspense, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';
import { getGlobeSpin } from '@/lib/globeSpin';
import { isLowQuality } from '@/lib/deviceQuality';

const DEFAULT_MODEL = '/models/buttons/roped_button-hd.glb';
const DEFAULT_IMAGE = '/models/buttons/rope_button-ld.png';

type ButtonModelProps = {
  url: string;
  pressed: boolean;
  rotation?: [number, number, number];
  scale?: number;
};

function ButtonModel({ url, pressed, rotation = [0, 0, 0], scale = 1 }: ButtonModelProps) {
  const { scene } = useGLTF(url, '/draco/');
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
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const target = pressed ? -0.04 : 0;
    groupRef.current.position.y += (target - groupRef.current.position.y) * 0.25;

    const spin = getGlobeSpin();
    const targetTilt = -spin * 0.021;
    // Snap rate scales with spin magnitude — faster spin → faster catch-up
    // and faster return to neutral.
    const rate = 2.5 + Math.abs(spin) * 6;
    const k = 1 - Math.exp(-rate * Math.max(dt, 0));
    groupRef.current.rotation.y += (targetTilt - groupRef.current.rotation.y) * k;
  });

  return (
    <group ref={groupRef} rotation={rotation}>
      <Center>
        <primitive object={cloned} scale={scale} />
      </Center>
    </group>
  );
}

type RopedButton3DProps = {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Render the model in its darkened/pressed state regardless of pointer
   *  interaction. Used to indicate a sticky selection (e.g. action chosen
   *  for the current round). */
  selected?: boolean;
  width?: number;
  height?: number;
  modelRotation?: [number, number, number];
  /** Uniform scale applied to the GLB model (corrects models authored at a
   *  different base scale than the default rope button). */
  modelScale?: number;
  textClassName?: string;
  ariaLabel?: string;
  /** GLB model URL rendered on high-quality devices. */
  modelUrl?: string;
  /** PNG fallback rendered on low-quality devices. */
  imageUrl?: string;
  children?: ReactNode;
};

export default function RopedButton3D({
  onClick,
  disabled = false,
  loading = false,
  selected = false,
  width = 170,
  height = 70,
  modelRotation = [0, 0, 0],
  modelScale = 1,
  textClassName = 'text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
  ariaLabel,
  modelUrl = DEFAULT_MODEL,
  imageUrl = DEFAULT_IMAGE,
  children,
}: RopedButton3DProps) {
  const [active, setActive] = useState(false);
  const [lowQuality, setLowQuality] = useState(false);
  useEffect(() => { setLowQuality(isLowQuality()); }, []);
  // Darken only on actual press or sticky selection — never on hover. A
  // hover-driven visual change makes touch browsers absorb the first tap as
  // a synthetic hover (no click) and leaves the button stuck looking pressed.
  const pressed = !disabled && (active || loading || selected);

  return (
    <button
      type="button"
      onClick={() => { if (!disabled && !loading) onClick?.(); }}
      onPointerLeave={() => setActive(false)}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className="relative inline-block bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 select-none"
      style={{ width, height }}
    >
      {lowQuality ? (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter,transform] duration-150"
          style={{
            filter: pressed ? 'brightness(0.65)' : 'brightness(1)',
            transform: pressed ? 'translateY(2px) scale(2.2)' : 'translateY(0) scale(2.2)',
          }}
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
              <ButtonModel
                url={modelUrl}
                pressed={pressed}
                rotation={modelRotation}
                scale={modelScale}
              />
            </Suspense>
          </Canvas>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={textClassName}>
          {loading ? 'Loading...' : children}
        </span>
      </div>
    </button>
  );
}

useGLTF.preload(DEFAULT_MODEL, '/draco/');
