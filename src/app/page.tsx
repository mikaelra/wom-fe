'use client';

import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import WorldMapOverlay from '@/components/worldmap/WorldMapOverlay';
import WorldClock from '@/components/worldmap/WorldClock';
import TimewarpPanel from '@/components/worldmap/TimewarpPanel';
import { timewarpColorsFor } from '@/lib/timewarpFx';
import { useTimewarpFx } from '@/lib/useTimewarpFx';
import { useTimewarpRun } from '@/lib/useTimewarpRun';
import CityLoadingScreen from '@/components/city/CityLoadingScreen';
import type { City } from '@/lib/cities';
import { useMerchantOffer } from '@/lib/useMerchantOffer';
import { MERCHANT_MARKER_LABEL, merchantMarkerColors, merchantSkyBodies } from '@/lib/merchant';
import { getStoredAccountToken } from '@/lib/http';

const PREVIEW_MERCHANT_PREFIX = 'timewarp-preview|';

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
  const {
    offers: merchantOffers,
    merchant,
    receivedAt: merchantReceivedAt,
    reverted,
    revertToDate,
    revertExpiresAt,
    refresh: refreshMerchantOffer,
  } = useMerchantOffer();
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
  // Each stands on the globe under its own sky: the full moon's under the
  // Moon, a conjunction's under its two planets (MerchantMarker moves it
  // there every frame as the sky turns).
  const realMerchantMarkers = useMemo(
    () =>
      merchantOffers.map((o) => ({
        key: merchantKey(o),
        bodies: merchantSkyBodies(o.event),
        ...(({ fill, outline }) => ({ color: fill, outline }))(merchantMarkerColors(o.event)),
        label: MERCHANT_MARKER_LABEL,
      })),
    [merchantOffers],
  );
  const openMerchant = merchantOffers.find((o) => merchantKey(o) === openMerchantKey) ?? null;

  // The timewarp animation (lib/timewarpFx.ts): a `?timewarp` preview, a
  // player arriving with `&play=1` from the inventory, or anyone's
  // timewarp pushed by the server (lib/useTimewarpRun.ts).
  const {
    preview: timewarpPreview,
    run: timewarpRun,
    runId: timewarpRunId,
    playPreview,
    playPreviewEnd,
  } = useTimewarpRun({ onArrival: () => router.replace('/'), refreshMerchantOffer });
  const [skyReady, setSkyReady] = useState(false);

  // A preview shows the merchants of the moment it warps to -- one for each
  // of its events, under the Moon or that conjunction -- rather than
  // today's, which would stand under whatever today has. For looking at
  // only: clicking one opens nothing. A real timewarp needs none of this;
  // the merchant poll brings the new moment's own.
  const merchantMarkers = useMemo(
    () =>
      timewarpPreview && timewarpRun && !timewarpRun.ending
        ? timewarpRun.spec.events.map((e, i) => ({
          key: `${PREVIEW_MERCHANT_PREFIX}${i}`,
          bodies: e.bodies,
          ...(({ fill, outline }) => ({ color: fill, outline }))(
            merchantMarkerColors({ kind: e.kind, key: e.key, bodies: e.bodies, sign: '', at: '' }),
          ),
          label: MERCHANT_MARKER_LABEL,
        }))
        : realMerchantMarkers,
    [timewarpPreview, timewarpRun, realMerchantMarkers],
  );
  const handleMerchantClick = useCallback((key: string) => {
    if (!key.startsWith(PREVIEW_MERCHANT_PREFIX)) setOpenMerchantKey(key);
  }, []);

  // Waits for the whole sky to be up, so the animation has something to
  // act on.
  const { playing: timewarpPlaying, step: timewarpStep } = useTimewarpFx(
    timewarpRun,
    timewarpRunId,
    skyReady,
  );

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
      <WorldMapOverlay
        clock={
          <WorldClock
            reverted={reverted}
            revertToDate={revertToDate ?? null}
            skyDate={merchant?.sky_date ?? null}
            skyDateReceivedAt={merchantReceivedAt}
            revertExpiresAt={revertExpiresAt}
            warpColors={timewarpColorsFor(merchantOffers.map((o) => o.event))}
          />
        }
      />
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
            onMerchantClick={handleMerchantClick}
            // The timewarp's step too: each one moves the sky's instant, and
            // the planets have to be redrawn where it now has them.
            skyRevertKey={timewarpStep ? `${merchant?.sky_date ?? ''}|${timewarpStep}` : merchant?.sky_date ?? null}
            timewarpColors={timewarpPlaying && timewarpRun ? timewarpRun.spec.colors : null}
            onSkyReady={() => setSkyReady(true)}
          />
        </Canvas>
      )}

      {timewarpPreview && <TimewarpPanel onPlay={playPreview} onPlayEnd={playPreviewEnd} />}

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
