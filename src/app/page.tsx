'use client';

import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import CityLoadingScreen from '@/components/city/CityLoadingScreen';
import type { City } from '@/lib/cities';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import { merchantEventColor, merchantEventLatLng, merchantMarkerLabel } from '@/lib/merchant';
import { getStoredAccountToken } from '@/lib/http';

const WorldMap = dynamic(() => import('@/components/worldmap/WorldMap'), { ssr: false });
const MerchantScene = dynamic(() => import('@/components/merchant/MerchantScene'), { ssr: false });

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

  // docs/MERCHANT_PLAN.md -- the merchants. One marker per merchant in
  // town: a full moon and a conjunction at once are two.
  const { offers: merchantOffers, merchant, refresh: refreshMerchantOffer } = useMerchantOffer();
  // Which merchant's scene is open, by `offer_id|event_key` -- a key rather
  // than the offer object, so the scene follows the latest poll (a
  // purchase flips already_bought_this_period) instead of a stale copy.
  const [openMerchantKey, setOpenMerchantKey] = useState<string | null>(null);
  // Markers draw for every merchant in town (`active`), regardless of
  // whether this player has already bought from it -- the merchant stays
  // visible and clickable either way; only the offer itself (inside
  // MerchantScene) goes unavailable. Filtering on `available` instead
  // would make a marker vanish for anyone who's already traded, which is
  // the actual bug this was fixed from (traced live 2026-09-25).
  const merchantKey = (o: { offer_id: number; event_key: string }) => `${o.offer_id}|${o.event_key}`;
  const merchantMarkers = useMemo(
    () =>
      merchantOffers.map((o) => ({
        key: merchantKey(o),
        ...merchantEventLatLng(o.period_start, o.event_key),
        color: merchantEventColor(o.event),
        label: merchantMarkerLabel(o.merchant_name),
      })),
    [merchantOffers],
  );
  const openMerchant = merchantOffers.find((o) => merchantKey(o) === openMerchantKey) ?? null;

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
        <Canvas
          camera={{ position: [0, 3, 10.5], fov: 50 }}
          // Same containment as the city's canvas, for the same reason: the
          // city markers' labels are DOM appended here by FreshHtml, carrying
          // a z-index off drei's default range (up to 16777271). Without a
          // stacking context on this container those values escape into the
          // page's root context and beat the top bar's own z-20 -- so a
          // marker label struck through the user menu's text. <WorldMapOverlay/>
          // sitting EARLIER in the DOM than this canvas is not what saves it;
          // its z-20 against this container's auto is.
          style={{ isolation: 'isolate' }}
        >
          <WorldMap
            onCityClick={handleCityClick}
            merchantMarkers={merchantMarkers}
            onMerchantClick={setOpenMerchantKey}
            skyRevertKey={merchant?.sky_date ?? null}
          />
        </Canvas>
      )}

      {enteringCity && (
        <CityLoadingScreen
          title={enteringCity.actionLabel ?? enteringCity.name}
          accent={enteringCity.color}
        />
      )}

      {openMerchant && (
        <MerchantScene
          offer={openMerchant}
          token={getStoredAccountToken()}
          onClose={() => setOpenMerchantKey(null)}
          onPurchased={refreshMerchantOffer}
        />
      )}
    </div>
  );
}
