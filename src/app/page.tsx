'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Table from '@/components/Table';
import ExplosionEffect from '@/components/ExplosionEffect';
import HomeOverlay from '@/components/home/HomeOverlay';
import WorldMap from '@/components/worldmap/WorldMap';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import type { City } from '@/lib/cities';
import { createGremlinLobby } from '@/lib/api';

// Dynamically import heavy 3D models
const Model = dynamic(() => import('../components/Model'), { ssr: false });
const PlayerV1 = dynamic(() => import('../components/Playerv1'), { ssr: false });

// ---------- Camera animator for the temple scene ----------
interface CameraAnimatorProps {
  targetPosition: [number, number, number] | null;
  lookAtTarget: [number, number, number];
  getTargetPosition: (width: number, height: number) => [number, number, number];
  getFov: (width: number, height: number) => number;
}

function CameraAnimator({ targetPosition, lookAtTarget, getTargetPosition, getFov }: CameraAnimatorProps) {
  const { camera, size } = useThree();
  const currentPosition = useRef<THREE.Vector3>(camera.position.clone());

  useFrame(() => {
    if (targetPosition) {
      const [x, y, z] = getTargetPosition(size.width, size.height);
      const target = new THREE.Vector3(x, y, z);
      currentPosition.current.lerp(target, 0.025);
      camera.position.copy(currentPosition.current);
      camera.lookAt(...lookAtTarget);

      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = getFov(size.width, size.height);
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

// ---------- Scene constants ----------
const TABLE_POSITION: [number, number, number] = [0, 3.15, 0];
const SCENE_CENTER: [number, number, number] = [0, 3.2, 0];
const BASE_FOV = 75;

const PLAYER_POSITIONS: { position: [number, number, number]; rotation: [number, number, number] }[] = [
  { position: [0, 3.2, 1.4], rotation: [0, Math.PI / 2, 0] },
  { position: [0, 3.2, -1.4], rotation: [0, -Math.PI / 2, 0] },
  { position: [1.4, 3.2, 0], rotation: [0, Math.PI, 0] },
  { position: [-1.4, 3.2, 0], rotation: [0, 0, 0] },
];

function getResponsiveFov(width: number, height: number): number {
  const aspect = width / height;
  return aspect > 1.5 ? 82 : aspect > 1 ? 78 : 75;
}
function getCameraTargetPosition(width: number, height: number): [number, number, number] {
  const aspect = width / height;
  const dist = aspect > 1.5 ? 3.2 : 3.5;
  const elevation = aspect > 1 ? 2.2 : 2.5;
  return [0, SCENE_CENTER[1] + elevation, dist];
}

// Memoized players group
const PlayersAtTable = memo(function PlayersAtTable({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <>
      {PLAYER_POSITIONS.map(({ position, rotation }, i) => (
        <PlayerV1
          key={`player-${i}`}
          scale={0.15}
          position={position}
          rotation={rotation}
          isAnimating
        />
      ))}
    </>
  );
});

type Explosion = { id: number; position: [number, number, number] };

// ---------- Temple scene (the existing arena) ----------
interface TempleSceneProps {
  cityColor?: string;
}

function TempleScene({ cityColor }: TempleSceneProps) {
  const [targetPosition] = useState<[number, number, number] | null>(null);
  const [showPlayer] = useState(false);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const explosionIdRef = useRef(0);

  const handleTableClick = () => {
    const id = ++explosionIdRef.current;
    setExplosions((prev) => [
      ...prev,
      { id, position: [TABLE_POSITION[0], TABLE_POSITION[1] + 0.45, TABLE_POSITION[2]] },
    ]);
  };

  const removeExplosion = (id: number) => {
    setExplosions((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <>
      <CameraAnimator
        targetPosition={targetPosition}
        lookAtTarget={SCENE_CENTER}
        getTargetPosition={getCameraTargetPosition}
        getFov={getResponsiveFov}
      />

      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />

      {/* Sky color tinted by city */}
      <color attach="background" args={[cityColor ? adjustSkyColor(cityColor) : '#87ceeb']} />

      <Mountain scale={150} position={[40, -282, 62]} />
      <Model scale={1} position={[0, 3, 0]} />
      <Table position={TABLE_POSITION} scale={1.2} onClick={handleTableClick} />

      <PlayersAtTable show={showPlayer} />

      {explosions.map(({ id, position }) => (
        <ExplosionEffect key={id} position={position} onComplete={() => removeExplosion(id)} />
      ))}

      <OrbitControls
        makeDefault
        autoRotate
        autoRotateSpeed={0.2}
        enablePan={false}
        enableZoom={false}
        maxPolarAngle={Math.PI / 2.1}
      />

      <Environment preset="sunset" />
    </>
  );
}

/** Slightly tint the sky colour based on the city theme colour. */
function adjustSkyColor(hex: string): string {
  try {
    const c = new THREE.Color(hex);
    // Mix 20% city colour into the default sky blue
    const sky = new THREE.Color('#87ceeb');
    sky.lerp(c, 0.15);
    return `#${sky.getHexString()}`;
  } catch {
    return '#87ceeb';
  }
}

// ========== Main page component ==========
export default function Page() {
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const router = useRouter();

  const handleCityClick = useCallback(async (city: City) => {
    if (city.isGremlin) {
      const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      if (!playerName) {
        alert('You must enter a name to fight the Gremlin.');
        return;
      }
      try {
        const data = await createGremlinLobby(playerName);
        router.push(`/gremlin/${data.lobby_id}`);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to enter the forest.');
      }
      return;
    }
    setSelectedCity(city);
  }, [router]);

  const handleBackToMap = useCallback(() => {
    setSelectedCity(null);
  }, []);

  // ---------- World Map view ----------
  if (!selectedCity) {
    return (
      <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
        <WorldMapOverlay />
        <Canvas camera={{ position: [0, 2, 7], fov: 50 }}>
          <WorldMap onCityClick={handleCityClick} />
        </Canvas>
      </div>
    );
  }

  // ---------- City Hub view (existing menu on temple scene) ----------
  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <HomeOverlay city={selectedCity} onBackToMap={handleBackToMap} />
      <Canvas camera={{ position: [33, 26, 33], fov: BASE_FOV }}>
        <TempleScene cityColor={selectedCity.color} />
      </Canvas>
    </div>
  );
}
