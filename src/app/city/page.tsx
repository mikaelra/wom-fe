'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import CityOverlay from '@/components/city/CityOverlay';
import CityLoadingScreen from '@/components/city/CityLoadingScreen';
import AuthGatePopup from '@/components/AuthGatePopup';
import { CITY_CAMERA, CITY_FOV } from '@/components/city/CityScene';
import { findCity } from '@/lib/cities';
import { resolveCityTime, formatAthensClock } from '@/lib/cityTime';
import { useEnterBossfight } from '@/lib/useEnterBossfight';
import { useEnterRanked } from '@/lib/useEnterRanked';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { useBossfightRoster } from '@/lib/useBossfightRoster';
import { bossfightSignSublabel } from '@/lib/bossfightSign';

const CityScene = dynamic(() => import('@/components/city/CityScene'), { ssr: false });

// A query param rather than /city/[id]: a dynamic path segment cannot be
// statically exported for the native build (docs/MOBILE_AND_STEAM_PLAN.md
// §5.3), which is exactly why /lobby/<id> became /lobby?id=<id>.
// useSearchParams() then needs a Suspense boundary to build at all -- the
// page is 'use client' regardless, so the fallback never actually shows.
export default function CityPage() {
  return (
    <Suspense fallback={null}>
      <CityPageContent />
    </Suspense>
  );
}

function CityPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const city = findCity(searchParams.get('id'));
  // ?t= lets you look at a sky that is not the one currently overhead --
  // "02:00" is 2am Athens tonight (docs/CITY_SCENE_PLAN.md §6.6).
  const { date: skyDate, overridden: skyOverridden } = resolveCityTime(searchParams.get('t'));

  // The loading curtain lifts on the scene's own signal, never on a timer --
  // except as a last resort, below.
  const [sceneReady, setSceneReady] = useState(false);
  const handleReady = useCallback(() => setSceneReady(true), []);
  useEffect(() => {
    // Safety net. A stalled texture must never leave the player staring at a
    // permanent curtain with a working scene hidden behind it; showing a
    // half-dressed Athens is strictly better than showing nothing.
    const id = setTimeout(() => setSceneReady(true), 20000);
    return () => clearTimeout(id);
  }, []);

  const { enterBossfight, loading, gateOpen, closeGate, authFlow } = useEnterBossfight();
  const ranked = useEnterRanked();
  // Same countdown the world map used to show under the Athens sword; it now
  // reads under the signpost's Bossfight arm.
  const { bossfightMins, bossfightSecs } = useBossfightCountdown(true);
  // Who is actually in the temple. Polled here rather than down in
  // CityScene (where it used to live) because the signpost's caption needs
  // it too, and one poll feeding both the sign and the figures inside the
  // building is the only way the two can never disagree.
  const roster = useBossfightRoster();
  const bossfightSublabel = bossfightSignSublabel(roster, bossfightMins, bossfightSecs);

  if (!city) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#070b15] text-white">
        <p className="text-white/70">No such city.</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="bg-black/60 border border-white/20 px-4 py-2 rounded-lg font-semibold cursor-pointer hover:bg-black/80 transition-colors"
        >
          &larr; Back to Earth
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#070b15' }}>
      <Canvas
        camera={{ position: CITY_CAMERA, fov: CITY_FOV }}
        // Same DPR cap as the lobby: rendering at DPR 3 on phones triples
        // the pixel count for no visible gain.
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <CityScene
          date={skyDate}
          realLat={city.realLat}
          realLng={city.realLng}
          onBossfight={enterBossfight}
          bossfightSublabel={bossfightSublabel}
          roster={roster}
          onRanked={ranked.enterRanked}
          rankedLabel={ranked.label}
          rankedSublabel={ranked.sublabel}
          onBackToEarth={() => router.push('/')}
          onMarket={() => router.push('/market')}
          onReady={handleReady}
        />
      </Canvas>
      <CityOverlay skyClock={skyOverridden ? formatAthensClock(skyDate) : null} />

      <CityLoadingScreen
        title={city.actionLabel ?? city.name}
        accent={city.color}
        done={sceneReady}
      />

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-none">
          <p className="text-white text-2xl font-bold tracking-widest animate-pulse">Loading...</p>
        </div>
      )}

      {gateOpen && (
        <AuthGatePopup
          authFlow={authFlow}
          accent="red"
          title="Enter the Hades Bossfight"
          blurb="Choose a battle name to face Hades."
          submitLabel="Enter Bossfight"
          submitLoadingLabel="Entering..."
          onClose={closeGate}
        />
      )}

      {ranked.gateOpen && (
        <AuthGatePopup
          authFlow={ranked.authFlow}
          accent="blue"
          title="Play Ranked"
          blurb="Choose a battle name to join the ranked queue."
          submitLabel="Continue"
          submitLoadingLabel="Checking..."
          onClose={ranked.closeGate}
        />
      )}
    </div>
  );
}
