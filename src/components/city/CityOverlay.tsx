'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RulesModal from '@/components/lobby/RulesModal';
import type { City } from '@/lib/cities';

/**
 * DOM chrome over the city scene (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Deliberately NOT create/join lobby -- those stay on the world map
 * (locked decision 3). The full profile/user menu still lives inside
 * WorldMapOverlay and is extracted separately; this carries Rules and the
 * way back for now.
 */
export default function CityOverlay({ city }: { city: City }) {
  const router = useRouter();
  const [showRules, setShowRules] = useState(false);

  return (
    <>
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/80 transition-colors"
        >
          <span className="text-lg leading-none">&larr;</span> Back to Earth
        </button>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="bg-black/60 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/80 transition-colors"
        >
          Rules
        </button>
      </div>

      {/* City identity. The globe marker is labelled by country (GREECE from
          step 6); the scene is the city itself. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
        <h1 className="text-3xl font-extrabold tracking-wide drop-shadow-lg" style={{ color: city.color }}>
          {city.name}
        </h1>
        <p className="text-sm text-white/70 mt-1 drop-shadow">
          {city.tag} &mdash; {city.country}
        </p>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  );
}
