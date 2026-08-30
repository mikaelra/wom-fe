'use client';

import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import CityLoadingScreen from '@/components/city/CityLoadingScreen';
import type { City } from '@/lib/cities';

const WorldMap = dynamic(() => import('@/components/worldmap/WorldMap'), { ssr: false });

/**
 * The world map — the game's home screen (docs/CITY_SCENE_PLAN.md §4.4).
 *
 * This file used to carry a second scene as well: a "City Hub" of
 * `HomeOverlay` over a `TempleScene`, reached by `setSelectedCity`. §0.1
 * recorded that the branch was already unreachable when the plan was
 * written, because every city in `CITIES` returned early before reaching it,
 * and step 12 is where it finally goes. With it went `TempleScene`,
 * `CameraAnimator`, `adjustSkyColor`, the players-at-a-table group and the
 * table/explosion demo — roughly 150 lines that nothing could reach.
 *
 * A city is now simply a place you travel to.
 */
export default function Page() {
  const router = useRouter();

  // Defer Canvas mount by one paint frame so the UI controls render and
  // become interactive before the WebGL context initialises.
  const [sceneReady, setSceneReady] = useState(false);

  // Set once the city route has been asked for but this page is still
  // mounted. Never cleared: the only way out is the navigation itself, and
  // clearing it would flash the globe back for a frame.
  const [enteringCity, setEnteringCity] = useState<City | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setSceneReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleCityClick = useCallback((city: City) => {
    if (city.isVault) {
      router.push('/vault');
      return;
    }
    if (city.isRules) {
      router.push('/rules');
      return;
    }
    // Every other city is a place, and a place is the city scene. Note there
    // is deliberately no `city.name === 'Athens'` check any more: §4.2's
    // whole point is that the marker is data-driven, and a name comparison
    // here would be the same smell one layer up. A city the scene cannot
    // resolve shows its own "No such city", which is a visible failure
    // rather than a click that silently does nothing.
    //
    // Curtain first, THEN navigate: the route change and the city chunk's
    // download both happen while this page is still on screen, so without it
    // a tap on the sword looks like it did nothing at all.
    setEnteringCity(city);
    router.push(`/city?id=${city.id}`);
  }, [router]);

  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', overflow: 'hidden', background: '#070b15' }}>
      <WorldMapOverlay />
      {sceneReady && (
        <Canvas camera={{ position: [0, 3, 10.5], fov: 50 }}>
          <WorldMap onCityClick={handleCityClick} />
        </Canvas>
      )}

      {enteringCity && (
        <CityLoadingScreen
          title={enteringCity.actionLabel ?? enteringCity.name}
          subtitle={`The real sky over ${enteringCity.country}`}
          accent={enteringCity.color}
        />
      )}
    </div>
  );
}
