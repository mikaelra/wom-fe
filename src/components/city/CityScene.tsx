'use client';

import { Suspense } from 'react';
import { OrbitControls } from '@react-three/drei';
import Mountain from '@/components/mountain';
import Temple from '@/components/temple';
import SeaAndSky from '@/components/lobby/SeaAndSky';

/**
 * The Athens city scene (docs/CITY_SCENE_PLAN.md §5) -- skeleton.
 *
 * Deliberately the INVERSE of the world map's camera. On the globe you orbit
 * around the Earth looking inward, with the planets ringing it. Here you are
 * pinned to one spot on that Earth and turn on the spot, looking outward --
 * full 360 degrees of horizon, all the way up to the zenith. Same sky, other
 * side of it.
 *
 * How that is achieved: OrbitControls always orbits a camera around a target,
 * so to rotate in place the camera sits essentially ON its own target (a
 * hair's breadth away, EYE_RADIUS below). This is the standard three.js
 * panorama-viewer arrangement -- orbiting at a radius of a centimetre is
 * indistinguishable from turning your head, and it means the well-tested
 * OrbitControls damping and touch handling come along for free rather than
 * hand-rolling a look controller. Pan and zoom are off: both would slide the
 * viewer off the spot they are pinned to.
 *
 * No real sky yet (step 7 swaps SeaAndSky for the ephemeris-driven one), no
 * signpost and no interaction yet (step 6).
 *
 * FRAMING IS PROVISIONAL -- nobody has looked at this scene yet, and
 * temple.glb's origin sits on one of its corner columns rather than its
 * centre (LobbyScene.tsx notes the same at its own <Temple>), so it does not
 * sit where its coordinates suggest. Expect to tune the constants below.
 */

// Shared with LobbyScene so the two scenes agree on world scale.
const SEA_LEVEL = 2;
const SUN_POSITION: [number, number, number] = [100, 20, 100];

/** Where the player stands. Eye height above SEA_LEVEL, at the origin. */
export const EYE: [number, number, number] = [0, SEA_LEVEL + 3.2, 0];
/** How far the camera sits from the pin. Small enough to read as rotating in
 *  place, large enough to keep OrbitControls' maths well-conditioned. */
const EYE_RADIUS = 0.01;
/** Start pose: offset along +Z of the pin, so the default view looks toward
 *  -Z -- which is where the signpost and buildings are placed below. */
export const CITY_CAMERA: [number, number, number] = [EYE[0], EYE[1], EYE[2] + EYE_RADIUS];
/** Wider than the lobby's 75: standing among buildings and looking up wants
 *  more sky in frame than a table-top scene does. */
export const CITY_FOV = 70;

// Look limits. Azimuth is deliberately UNCLAMPED -- the whole point is a full
// 360. Polar runs from just shy of straight up to just past the horizon, so
// the ground stays visible without letting the view tip fully upside down.
const MIN_POLAR = 0.02;               // ~1 deg off the zenith
const MAX_POLAR = Math.PI * 0.86;     // well below the horizon, short of inverting

/** Scene layout, all forward of the pin (-Z) so the default view holds them.
 *  Temple left, Senate right (docs/CITY_SCENE_PLAN.md §1.1) -- the Senate
 *  has no model yet, so only its neighbour stands today. */
export const TEMPLE_POSITION: [number, number, number] = [-13, 0, -20];
export const SENATE_POSITION: [number, number, number] = [13, 0, -20];

export default function CityScene() {
  return (
    <>
      {/* Placeholder ground/sky. Step 7 replaces this with a sky driven by
          skyLocal's nightness, so Athens is dark when Athens is dark. Both
          the dome and the sea plane already read correctly through 360. */}
      <SeaAndSky seaLevel={SEA_LEVEL} sunPosition={SUN_POSITION} />

      <ambientLight intensity={0.6} />
      <directionalLight position={SUN_POSITION} intensity={1.1} />

      <Suspense fallback={null}>
        {/* Scenery for now. Step 6 makes this the Bossfight target, paired
            with the signpost's left arm. */}
        <Temple scale={1} position={TEMPLE_POSITION} />
        {/* A landmark to turn toward, so a full rotation is not three
            quarters of empty horizon while the buildings are still missing. */}
        <Mountain scale={150} position={[40, -282, 62]} />
      </Suspense>

      <OrbitControls
        makeDefault
        target={EYE}
        // Both off: either would move the viewer off the spot they are
        // pinned to, which is the one thing this camera must not do.
        enablePan={false}
        enableZoom={false}
        autoRotate={false}
        // Negative so dragging feels like turning your head rather than
        // spinning an object in front of you -- the same sign three.js's own
        // panorama example uses. Purely a feel choice; flip if it reads wrong.
        rotateSpeed={-0.35}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={MIN_POLAR}
        maxPolarAngle={MAX_POLAR}
      />
    </>
  );
}
