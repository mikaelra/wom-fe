'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import CityOverlay from '@/components/city/CityOverlay';
import { CITY_CAMERA, CITY_FOV } from '@/components/city/CityScene';
import { findCity } from '@/lib/cities';

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
        <CityScene />
      </Canvas>
      <CityOverlay city={city} />
    </div>
  );
}
