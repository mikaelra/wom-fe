'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, memo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Table from '@/components/Table';
import ExplosionEffect from '@/components/ExplosionEffect';
import HomeOverlay from '@/components/home/HomeOverlay';
import WorldMap from '@/components/worldmap/WorldMap';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import type { City } from '@/lib/cities';
import { createGremlinLobby, getRaidLobby, getNextRaidTime } from '@/lib/api';

// Dynamically import heavy 3D models
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
  const [showGremlinPopup, setShowGremlinPopup] = useState(false);
  const [gremlinUsername, setGremlinUsername] = useState('');
  const [gremlinError, setGremlinError] = useState('');
  const [gremlinLoading, setGremlinLoading] = useState(false);

  // Athens raid
  const [showAthensPopup, setShowAthensPopup] = useState(false);
  const [athensUsername, setAthensUsername] = useState('');
  const [athensError, setAthensError] = useState('');
  const [athensLoading, setAthensLoading] = useState(false);

  // Raid countdown shown over Athens on the globe
  const [athensRaidSecondsUntil, setAthensRaidSecondsUntil] = useState<number | null>(null);

  const router = useRouter();

  // Poll next raid time while on the world map
  useEffect(() => {
    if (selectedCity) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    getNextRaidTime()
      .then((json) => {
        if (cancelled) return;
        const nextRT = new Date(json.start_time);
        intervalId = setInterval(() => {
          const diff = Math.floor((nextRT.getTime() - Date.now()) / 1000);
          setAthensRaidSecondsUntil(diff <= 0 ? 0 : diff);
        }, 1000);
      })
      .catch(() => {
        if (!cancelled) setAthensRaidSecondsUntil(null);
      });
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedCity]);

  const enterAthensRaid = useCallback((playerName: string) => {
    getRaidLobby(playerName)
      .then((data) => router.push(`/lobby/${data.lobby_id}`))
      .catch((err) => alert(err instanceof Error ? err.message : 'Failed to enter raid.'));
  }, [router]);

  const handleCityClick = useCallback((city: City) => {
    if (city.isVault) {
      router.push('/vault');
      return;
    }
    if (city.isLeaderboard) {
      router.push('/leaderboards');
      return;
    }
    if (city.isRules) {
      router.push('/rules');
      return;
    }
    if (city.isGremlin) {
      const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      if (!playerName) {
        setGremlinUsername('');
        setGremlinError('');
        setShowGremlinPopup(true);
        return;
      }
      createGremlinLobby(playerName)
        .then((data) => router.push(`/gremlin/${data.lobby_id}`))
        .catch((err) => alert(err instanceof Error ? err.message : 'Failed to enter the forest.'));
      return;
    }
    // Athens → go straight to the Hades raid
    if (city.name === 'Athens') {
      const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      if (!playerName) {
        setAthensUsername('');
        setAthensError('');
        setShowAthensPopup(true);
        return;
      }
      enterAthensRaid(playerName);
      return;
    }
    setSelectedCity(city);
  }, [router, enterAthensRaid]);

  const handleGremlinJoin = useCallback(async () => {
    const trimmed = gremlinUsername.trim();
    if (!trimmed) {
      setGremlinError('Please enter a username.');
      return;
    }
    setGremlinError('');
    setGremlinLoading(true);
    try {
      const data = await createGremlinLobby(trimmed);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', trimmed);
      setShowGremlinPopup(false);
      router.push(`/gremlin/${data.lobby_id}`);
    } catch (err) {
      setGremlinError(err instanceof Error ? err.message : 'Failed to enter the forest.');
    } finally {
      setGremlinLoading(false);
    }
  }, [gremlinUsername, router]);

  const handleAthensJoin = useCallback(async () => {
    const trimmed = athensUsername.trim();
    if (!trimmed) {
      setAthensError('Please enter a username.');
      return;
    }
    setAthensError('');
    setAthensLoading(true);
    try {
      if (typeof window !== 'undefined') localStorage.setItem('playerName', trimmed);
      setShowAthensPopup(false);
      enterAthensRaid(trimmed);
    } catch (err) {
      setAthensError(err instanceof Error ? err.message : 'Failed to enter raid.');
    } finally {
      setAthensLoading(false);
    }
  }, [athensUsername, enterAthensRaid]);

  const handleBackToMap = useCallback(() => {
    setSelectedCity(null);
  }, []);

  // ---------- World Map view ----------
  if (!selectedCity) {
    return (
      <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden' }}>
        <WorldMapOverlay />
        <Canvas camera={{ position: [0, 2, 7], fov: 50 }}>
          <WorldMap
            onCityClick={handleCityClick}
            athensRaidInfo={{ secondsUntil: athensRaidSecondsUntil, bossName: 'Hades' }}
          />
        </Canvas>

        {/* Athens raid login popup */}
        {showAthensPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowAthensPopup(false)}
          >
            <div
              className="bg-gray-900 border border-red-700/60 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-1 text-red-400">Enter the Hades Raid</h2>
              <p className="text-sm text-white/60 mb-4">Choose a battle name to face Hades.</p>
              <input
                type="text"
                placeholder="Your battle name"
                value={athensUsername}
                onChange={(e) => setAthensUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAthensJoin()}
                autoFocus
                className="w-full p-2 rounded-md bg-gray-800 border border-red-700/50 text-white placeholder-white/30 focus:outline-none focus:border-red-500 mb-3"
              />
              {athensError && (
                <p className="text-red-400 text-sm mb-3">{athensError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAthensJoin}
                  disabled={athensLoading}
                  className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {athensLoading ? 'Entering...' : 'Enter Raid'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAthensPopup(false)}
                  className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Gremlin's Lair login popup */}
        {showGremlinPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowGremlinPopup(false)}
          >
            <div
              className="bg-gray-900 border border-green-700/60 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-1 text-green-400">Enter the Gremlin&apos;s Lair</h2>
              <p className="text-sm text-white/60 mb-4">Choose a battle name to join the fight.</p>
              <input
                type="text"
                placeholder="Your battle name"
                value={gremlinUsername}
                onChange={(e) => setGremlinUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGremlinJoin()}
                autoFocus
                className="w-full p-2 rounded-md bg-gray-800 border border-green-700/50 text-white placeholder-white/30 focus:outline-none focus:border-green-500 mb-3"
              />
              {gremlinError && (
                <p className="text-red-400 text-sm mb-3">{gremlinError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleGremlinJoin}
                  disabled={gremlinLoading}
                  className="flex-1 py-2 rounded-lg bg-green-700 hover:bg-green-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {gremlinLoading ? 'Entering...' : 'Join Battle'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGremlinPopup(false)}
                  className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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
