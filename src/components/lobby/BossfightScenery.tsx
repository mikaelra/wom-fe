'use client';

import { useMemo } from 'react';
import CitySky, { useCitySky } from '@/components/city/CitySky';
import Terrain from '@/components/city/Terrain';
import { templeFloorOffsetFor } from '@/lib/cityTerrain';
import { horizonToScene } from '@/lib/citySkyGeometry';
import { LAND_LEVEL, SEA_LEVEL, EYE_HEIGHT } from '@/lib/cityLayout';
import { PLAYER_Y } from '@/lib/sceneConstants';
import { findCity } from '@/lib/cities';

/**
 * The bossfight is fought in the city you walked in from.
 *
 * A boss lobby now stands under the same sky, on the same island and in the
 * same light as the city scene, instead of the lobby's generic sea and its
 * fixed [100, 20, 100] sun. You leave Athens through the temple door and
 * arrive somewhere that looks like where you left.
 *
 * Everything here is the city's own components, unchanged -- CitySky and
 * Terrain -- rather than a second implementation of them. The only thing
 * this file really decides is how the two scenes' floors are made to agree,
 * and what light hangs over the table.
 */

/** Where the sky is centred. The dome is 400 units out, so the difference
 *  between this and the lobby camera's actual seat is irrelevant. */
const EYE: [number, number, number] = [0, LAND_LEVEL + EYE_HEIGHT, 0];

/**
 * Where the island sits relative to the table.
 *
 * NOT under the players' feet: they stand on the temple's FLOOR, which in
 * the city is 7.27 units above open ground. Aligning the terrain to their
 * feet instead put the ground inside the building. Matching the city's own
 * floor-above-base relationship drops the island to the temple's base, where
 * it belongs -- so you look out between the columns and down onto it, as you
 * would from inside the temple in the city. The sea comes with it.
 */
/**
 * temple.glb's own footprint, which the island has to be flat across.
 *
 * The city knows the temple stands at TEMPLE_POSITION and gives it a
 * clearing there; here it stands at the ORIGIN, where the city only has the
 * viewer's 16-unit one. The model reaches 31.6 units down its long axis, so
 * without this hills rise to 4.8 against a floor at 3.2 -- ground growing up
 * inside the building. 38 is its half-diagonal rounded up, the same figure
 * the city's own temple pad uses for the same model.
 */
const TEMPLE_CLEAR_RADIUS = 38;

const GROUND_OFFSET = templeFloorOffsetFor(PLAYER_Y);

/**
 * The lamp over the table.
 *
 * The city hangs a BLUE light inside the temple, which works from across the
 * bay where it is picking a silhouette out of the dark. In here that same
 * light would be standing among the players -- the temple's floor is the
 * table -- and it would put a blue cast on every frog in the lobby. So the
 * hall light is a warm near-white instead: it reads as the same kind of
 * light without repainting the skins.
 *
 * Never fully out. The sun is doing most of the work by day, but a boss
 * fight at 3am should not be lit by starlight alone.
 */
const HALL_LIGHT_COLOR = '#ffe3bc';
const HALL_LIGHT_PEAK = 90;
const HALL_LIGHT_FLOOR = 0.4;

export default function BossfightScenery() {
  // Frozen at mount, like the city's own sky (§6.6): a date rebuilt every
  // render would bust useCitySky's memo and recompute the ephemeris on every
  // state_update.
  const date = useMemo(() => new Date(), []);
  const city = findCity('athens');

  const { placements, nightness } = useCitySky(
    date,
    city?.realLat ?? 0,
    city?.realLng ?? 0,
    EYE,
  );

  // Same key light as the city: the real Sun's compass direction, clamped at
  // the horizon so twilight lights the hall sideways rather than from
  // underneath it once the Sun has set.
  const sunLightPosition = useMemo<[number, number, number]>(() => {
    const sun = placements.find((p) => p.body === 'Sun');
    if (!sun) return [100, 20, 100];
    return horizonToScene(
      { altitude: Math.max(sun.horizon.altitude, 0), azimuth: sun.horizon.azimuth },
      300,
      [0, 0, 0],
    );
  }, [placements]);

  if (!city) return null;

  return (
    <>
      <group position={[0, GROUND_OFFSET, 0]}>
        <CitySky
          date={date}
          realLat={city.realLat}
          realLng={city.realLng}
          eye={EYE}
          seaLevel={SEA_LEVEL}
        />
        <Terrain nightness={nightness} clearRadius={TEMPLE_CLEAR_RADIUS} />
      </group>

      <ambientLight intensity={0.6 - 0.42 * nightness} />
      <directionalLight position={sunLightPosition} intensity={1.1 - 0.95 * nightness} />
      <hemisphereLight args={['#9fb8ff', '#0a1020', 0.35 * nightness]} />

      <pointLight
        position={[0, PLAYER_Y + 3.2, 0]}
        color={HALL_LIGHT_COLOR}
        intensity={HALL_LIGHT_PEAK * (HALL_LIGHT_FLOOR + (1 - HALL_LIGHT_FLOOR) * nightness)}
        distance={60}
        decay={1.6}
      />
    </>
  );
}
