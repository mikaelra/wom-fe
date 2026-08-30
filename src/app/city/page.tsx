'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import CityOverlay from '@/components/city/CityOverlay';
import AuthGatePopup from '@/components/AuthGatePopup';
import { CITY_CAMERA, CITY_FOV } from '@/components/city/CityScene';
import { findCity } from '@/lib/cities';
import { useEnterRaid } from '@/lib/useEnterRaid';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';

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

  const { enterRaid, loading, gateOpen, closeGate, authFlow } = useEnterRaid();
  // Same countdown the world map used to show under the Athens sword; it now
  // reads under the signpost's Bossfight arm.
  const { raidMins, raidSecs } = useBossfightCountdown(true);
  const bossfightSublabel =
    raidMins == null || raidSecs == null
      ? null
      : raidMins <= 0 && raidSecs <= 0
        ? 'IN PROGRESS'
        : `RAID IN ${raidMins}:${String(raidSecs).padStart(2, '0')}`;

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
        <CityScene onBossfight={enterRaid} bossfightSublabel={bossfightSublabel} />
      </Canvas>
      <CityOverlay city={city} />

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-none">
          <p className="text-white text-2xl font-bold tracking-widest animate-pulse">Loading...</p>
        </div>
      )}

      {gateOpen && (
        <AuthGatePopup
          authFlow={authFlow}
          accent="red"
          title="Enter the Hades Raid"
          blurb="Choose a battle name to face Hades."
          submitLabel="Enter Raid"
          submitLoadingLabel="Entering..."
          onClose={closeGate}
        />
      )}
    </div>
  );
}
