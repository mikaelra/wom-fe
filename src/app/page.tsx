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
const WorldMap = dynamic(() => import('@/components/worldmap/WorldMap'), { ssr: false });
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import type { City } from '@/lib/cities';
import type { RankedLabelInfo } from '@/components/worldmap/CityMarker';
import { getBossfightLobby, getActiveRankedLobby } from '@/lib/api';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { useAuthFlow } from '@/lib/useAuthFlow';
import { useRankedQueue } from '@/lib/useRankedQueue';
import { useCountdown } from '@/lib/useCountdown';
import { setStoredToken } from '@/lib/http';
import { useToast } from '@/components/Toast';

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

      {/* Self-hosted — preset="sunset" fetched this exact file from a CDN at runtime */}
      <Environment files="/hdri/venice_sunset_1k.hdr" />
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
  // Defer Canvas mount by one paint frame so the UI controls render and become
  // interactive before the WebGL context initialises.
  const [sceneReady, setSceneReady] = useState(false);

  // Athens raid login popup state
  const [showAthensPopup, setShowAthensPopup] = useState(false);
  const [athensSceneLoading, setAthensSceneLoading] = useState(false);

  const router = useRouter();
  const { showError } = useToast();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSceneReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Raid countdown shown over Athens on the globe; polls while on the world map
  const { secondsUntil: athensRaidSecondsUntil } = useBossfightCountdown(!selectedCity);

  const enterAthensRaid = useCallback((playerName: string) => {
    setAthensSceneLoading(true);
    getBossfightLobby(playerName)
      .then((data) => router.push(`/lobby/${data.lobby_id}`))
      .catch((err) => {
        setAthensSceneLoading(false);
        showError(err instanceof Error ? err.message : 'Failed to enter raid.');
      });
  }, [router, showError]);

  // ---- Athens raid handlers --------------------------------------------------
  const proceedAthens = useCallback((name: string, email: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', name);
      if (email) localStorage.setItem('playerEmail', email);
    }
    setShowAthensPopup(false);
    enterAthensRaid(name);
  }, [enterAthensRaid]);

  const authFlow = useAuthFlow({
    submitErrorFallback: 'Failed to enter raid.',
    onAuthenticated: proceedAthens,
  });
  // Pulled out so handleCityClick's own useCallback deps stay stable --
  // authFlow itself is a fresh object every render, but .reset is a stable
  // useCallback(..., []) internally.
  const resetAuthFlow = authFlow.reset;

  // ---- Ranked queue handlers (New York sword) --------------------------------
  // Moved here from WorldMapOverlay's "Play Ranked" button -- the queue
  // state/text now lives on the New York marker's label instead, following
  // the same pattern as Athens' raid countdown above.
  const [showRankedPopup, setShowRankedPopup] = useState(false);
  const [rankedLoading, setRankedLoading] = useState(false);
  const rankedQueue = useRankedQueue();

  // A ranked match this player is already in (matched, then left via "Back
  // to Home" -- that only navigates away, it never leaves the lobby
  // server-side, see wom-be's sockets/lobby.py handle_disconnect) or is
  // mid-game in. Checked once per mount, same lifetime as the ranked/well
  // profile fetches on the Stats page.
  const [activeMatch, setActiveMatch] = useState<{
    lobbyId: string;
    deadline: string | null;
    started: boolean;
  } | null>(null);
  const activeMatchSecondsLeft = useCountdown(activeMatch?.started ? null : activeMatch?.deadline);

  useEffect(() => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) return;
    getActiveRankedLobby(name)
      .then((data) => {
        if (!data.lobby_id || !data.token) return;
        setStoredToken(data.lobby_id, data.token);
        setActiveMatch({ lobbyId: data.lobby_id, deadline: data.ranked_countdown_deadline, started: data.started });
      })
      .catch(() => {
        // Best-effort -- worst case the player just sees "Play Ranked"
        // again and the backend's own duplicate-name guard still protects
        // them if they re-queue while actually still in the old match.
      });
  }, []);

  // Animated "." -> ".." -> "..." while queued, so the New York label's
  // "Searching" text reads as active rather than stalled.
  const [searchingDots, setSearchingDots] = useState(1);
  useEffect(() => {
    if (rankedQueue.status !== 'searching') return;
    const id = setInterval(() => setSearchingDots((d) => (d % 3) + 1), 500);
    return () => clearInterval(id);
  }, [rankedQueue.status]);

  const doRanked = useCallback(async (name: string) => {
    setRankedLoading(true);
    try {
      await rankedQueue.startQueue(name);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to join the ranked queue');
    } finally {
      setRankedLoading(false);
    }
  }, [rankedQueue, showError]);

  const proceedRanked = useCallback((name: string, email: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', name);
      if (email) localStorage.setItem('playerEmail', email);
    }
    setShowRankedPopup(false);
    doRanked(name);
  }, [doRanked]);

  const rankedAuthFlow = useAuthFlow({
    submitErrorFallback: 'Failed to join the ranked queue.',
    onAuthenticated: proceedRanked,
  });
  const resetRankedAuthFlow = rankedAuthFlow.reset;

  const handleRankedClick = useCallback(() => {
    if (rankedQueue.status === 'searching') {
      rankedQueue.cancelQueue();
      return;
    }
    if (activeMatch) {
      router.push(`/lobby/${activeMatch.lobbyId}`);
      return;
    }
    if (rankedLoading) return;
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      resetRankedAuthFlow();
      setShowRankedPopup(true);
      return;
    }
    doRanked(name);
  }, [rankedQueue, activeMatch, rankedLoading, router, doRanked, resetRankedAuthFlow]);

  const rankedInfo: RankedLabelInfo = {
    status: rankedQueue.status === 'searching' ? 'searching' : activeMatch ? 'activeMatch' : 'idle',
    searchingDots,
    activeMatchStarted: activeMatch?.started,
    activeMatchSecondsLeft,
  };

  const handleCityClick = useCallback((city: City) => {
    if (city.isVault) {
      router.push('/vault');
      return;
    }
    if (city.isRules) {
      router.push('/rules');
      return;
    }
    // Athens → go straight to the Hades raid
    if (city.name === 'Athens') {
      const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      if (!playerName) {
        resetAuthFlow();
        setShowAthensPopup(true);
        return;
      }
      enterAthensRaid(playerName);
      return;
    }
    // New York → ranked queue instead of the City Hub
    if (city.name === 'New York') {
      handleRankedClick();
      return;
    }
    setSelectedCity(city);
  }, [router, enterAthensRaid, resetAuthFlow, handleRankedClick]);

  const handleBackToMap = useCallback(() => {
    setSelectedCity(null);
  }, []);

  // ---------- World Map view ----------
  if (!selectedCity) {
    return (
      <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden', background: '#070b15' }}>
        <WorldMapOverlay />
        {sceneReady && (
          <Canvas camera={{ position: [0, 3, 10.5], fov: 50 }}>
            <WorldMap
              onCityClick={handleCityClick}
              athensRaidInfo={{ secondsUntil: athensRaidSecondsUntil }}
              rankedInfo={rankedInfo}
            />
          </Canvas>
        )}

        {/* Athens scene loading overlay */}
        {athensSceneLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-none">
            <p className="text-white text-2xl font-bold tracking-widest animate-pulse">Loading...</p>
          </div>
        )}

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
                value={authFlow.name}
                onChange={(e) => authFlow.setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (authFlow.codeMode) authFlow.handleVerifyCode();
                  else if (authFlow.emailMode) authFlow.handleLogin();
                  else authFlow.handleSubmitName();
                }}
                autoFocus
                readOnly={authFlow.emailMode}
                className={`w-full p-2 rounded-md bg-gray-800 border border-red-700/50 text-white placeholder-white/30 focus:outline-none focus:border-red-500 mb-3 ${authFlow.emailMode ? 'opacity-70' : ''}`}
              />
              {authFlow.error && !authFlow.emailMode && (
                <p className="text-red-400 text-sm mb-3">{authFlow.error}</p>
              )}

              {authFlow.emailMode && (
                <>
                  <p className="text-sm text-white/80 mb-2">
                    This name is claimed. Type your email if you have claimed this username.
                  </p>
                  <input
                    type="email"
                    placeholder="email"
                    value={authFlow.email}
                    onChange={(e) => authFlow.setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !authFlow.codeMode) authFlow.handleLogin(); }}
                    autoFocus={!authFlow.codeMode}
                    readOnly={authFlow.codeMode}
                    className={`w-full p-2 rounded-md bg-gray-800 border border-red-700/50 text-white placeholder-white/30 focus:outline-none focus:border-red-500 mb-1 ${authFlow.codeMode ? 'opacity-70' : ''}`}
                  />
                  <p className="text-xs text-white/50 mb-3">email</p>
                  {authFlow.emailError && !authFlow.codeMode && (
                    <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.emailError}</p>
                  )}
                </>
              )}

              {authFlow.codeMode && (
                <>
                  <p className="text-sm text-white/80 mb-2">
                    We sent a 6-digit code to <strong>{authFlow.email}</strong>.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={authFlow.code}
                    onChange={(e) => authFlow.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && authFlow.handleVerifyCode()}
                    autoFocus
                    className="w-full p-2 rounded-md bg-gray-800 border border-red-700/50 text-white placeholder-white/30 tracking-[0.3em] font-mono text-center focus:outline-none focus:border-red-500 mb-3"
                  />
                  {authFlow.codeError && (
                    <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.codeError}</p>
                  )}
                </>
              )}

              <div className="flex gap-3">
                {authFlow.codeMode ? (
                  <>
                    <button
                      type="button"
                      onClick={authFlow.handleVerifyCode}
                      disabled={authFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {authFlow.loading ? 'Verifying...' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      onClick={authFlow.backToEmailStep}
                      disabled={authFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Back
                    </button>
                  </>
                ) : authFlow.emailMode ? (
                  <>
                    <button
                      type="button"
                      onClick={authFlow.handleLogin}
                      disabled={authFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {authFlow.loading ? 'Logging in...' : 'Log in'}
                    </button>
                    <button
                      type="button"
                      onClick={authFlow.reset}
                      disabled={authFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Choose new name
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={authFlow.handleSubmitName}
                      disabled={authFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {authFlow.loading ? 'Entering...' : 'Enter Raid'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAthensPopup(false)}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ranked queue login popup — shown when clicking the New York sword with no stored name */}
        {showRankedPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowRankedPopup(false)}
          >
            <div
              className="bg-gray-900 border border-blue-700/60 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-1 text-blue-400">Play Ranked</h2>
              <p className="text-sm text-white/60 mb-4">Choose a battle name to join the ranked queue.</p>
              <input
                type="text"
                placeholder="Your battle name"
                value={rankedAuthFlow.name}
                onChange={(e) => rankedAuthFlow.setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (rankedAuthFlow.codeMode) rankedAuthFlow.handleVerifyCode();
                  else if (rankedAuthFlow.emailMode) rankedAuthFlow.handleLogin();
                  else rankedAuthFlow.handleSubmitName();
                }}
                autoFocus
                readOnly={rankedAuthFlow.emailMode}
                className={`w-full p-2 rounded-md bg-gray-800 border border-blue-700/50 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 mb-3 ${rankedAuthFlow.emailMode ? 'opacity-70' : ''}`}
              />
              {rankedAuthFlow.error && !rankedAuthFlow.emailMode && (
                <p className="text-red-400 text-sm mb-3">{rankedAuthFlow.error}</p>
              )}

              {rankedAuthFlow.emailMode && (
                <>
                  <p className="text-sm text-white/80 mb-2">
                    This name is claimed. Type your email if you have claimed this username.
                  </p>
                  <input
                    type="email"
                    placeholder="email"
                    value={rankedAuthFlow.email}
                    onChange={(e) => rankedAuthFlow.setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !rankedAuthFlow.codeMode) rankedAuthFlow.handleLogin(); }}
                    autoFocus={!rankedAuthFlow.codeMode}
                    readOnly={rankedAuthFlow.codeMode}
                    className={`w-full p-2 rounded-md bg-gray-800 border border-blue-700/50 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 mb-1 ${rankedAuthFlow.codeMode ? 'opacity-70' : ''}`}
                  />
                  <p className="text-xs text-white/50 mb-3">email</p>
                  {rankedAuthFlow.emailError && !rankedAuthFlow.codeMode && (
                    <p className="text-red-500 text-sm mb-3 font-semibold">{rankedAuthFlow.emailError}</p>
                  )}
                </>
              )}

              {rankedAuthFlow.codeMode && (
                <>
                  <p className="text-sm text-white/80 mb-2">
                    We sent a 6-digit code to <strong>{rankedAuthFlow.email}</strong>.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={rankedAuthFlow.code}
                    onChange={(e) => rankedAuthFlow.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && rankedAuthFlow.handleVerifyCode()}
                    autoFocus
                    className="w-full p-2 rounded-md bg-gray-800 border border-blue-700/50 text-white placeholder-white/30 tracking-[0.3em] font-mono text-center focus:outline-none focus:border-blue-500 mb-3"
                  />
                  {rankedAuthFlow.codeError && (
                    <p className="text-red-500 text-sm mb-3 font-semibold">{rankedAuthFlow.codeError}</p>
                  )}
                </>
              )}

              <div className="flex gap-3">
                {rankedAuthFlow.codeMode ? (
                  <>
                    <button
                      type="button"
                      onClick={rankedAuthFlow.handleVerifyCode}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {rankedAuthFlow.loading ? 'Verifying...' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      onClick={rankedAuthFlow.backToEmailStep}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Back
                    </button>
                  </>
                ) : rankedAuthFlow.emailMode ? (
                  <>
                    <button
                      type="button"
                      onClick={rankedAuthFlow.handleLogin}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {rankedAuthFlow.loading ? 'Logging in...' : 'Log in'}
                    </button>
                    <button
                      type="button"
                      onClick={rankedAuthFlow.reset}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Choose new name
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={rankedAuthFlow.handleSubmitName}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {rankedAuthFlow.loading ? 'Checking...' : 'Continue'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRankedPopup(false)}
                      disabled={rankedAuthFlow.loading}
                      className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ---------- City Hub view (existing menu on temple scene) ----------
  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative' }}>
      <HomeOverlay city={selectedCity} onBackToMap={handleBackToMap} />
      <Canvas camera={{ position: [33, 26, 33], fov: BASE_FOV }}>
        <TempleScene cityColor={selectedCity.color} />
      </Canvas>
    </div>
  );
}
