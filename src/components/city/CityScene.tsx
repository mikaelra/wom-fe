'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { OrbitControls } from '@react-three/drei';
import Mountain from '@/components/mountain';
import Temple from '@/components/temple';
import Senate from '@/components/city/Senate';
import SeaAndSky from '@/components/lobby/SeaAndSky';
import Signpost, { type SignpostArm } from '@/components/city/Signpost';
import { useClickNotDrag } from '@/lib/useClickNotDrag';

/**
 * The Athens city scene (docs/CITY_SCENE_PLAN.md §5).
 *
 * Deliberately the INVERSE of the world map's camera. On the globe you orbit
 * around the Earth looking inward, with the planets ringing it. Here you are
 * pinned to one spot on that Earth and turn on the spot, looking outward --
 * a full 360 of horizon, all the way up to the zenith. Same sky, other side
 * of it.
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
 * No real sky yet -- step 10 swaps SeaAndSky for the ephemeris-driven one.
 *
 * FRAMING IS PROVISIONAL. temple.glb's origin sits on one of its corner
 * columns rather than its centre (LobbyScene.tsx notes the same at its own
 * <Temple>), so it does not sit where its coordinates suggest.
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
 *  -Z -- where the signpost and both buildings stand. */
export const CITY_CAMERA: [number, number, number] = [EYE[0], EYE[1], EYE[2] + EYE_RADIUS];
/** Wider than the lobby's 75: standing among buildings and looking up wants
 *  more sky in frame than a table-top scene does. */
export const CITY_FOV = 70;

// Look limits. Azimuth is deliberately UNCLAMPED -- a full 360 is the point.
const MIN_POLAR = 0.02;               // ~1 deg off the zenith
const MAX_POLAR = Math.PI * 0.86;     // well below the horizon, short of inverting

/** Temple left, Senate right (§1.1). Both forward of the pin so the default
 *  view holds them, flanking the signpost between. */
export const TEMPLE_POSITION: [number, number, number] = [-15, 0, -22];
export const SENATE_POSITION: [number, number, number] = [15, 0, -22];
export const SIGNPOST_POSITION: [number, number, number] = [0, 0, -11];

const BOSSFIGHT_COLOR = '#4da6ff';
const RANKED_COLOR = '#ff6666';

/** Tint applied to a building while it or its arm is hovered. */
const PLAIN = '#D6D6D6';
const LIT_BOSSFIGHT = '#eaf4ff';
const LIT_RANKED = '#ffeaea';

export interface CitySceneProps {
  /** Enter the Hades bossfight. The Temple and the signpost's left arm both
   *  call this, so the building is a second, larger target for one action
   *  rather than a separate code path. */
  onBossfight: () => void;
  bossfightSublabel?: string | null;
  /** Join, cancel, or return to a ranked match -- the Senate and the right
   *  arm, same arrangement. */
  onRanked: () => void;
  rankedLabel: string;
  rankedSublabel?: string | null;
}

/** Wraps a building in the tap-not-drag interaction and hover reporting, so
 *  the Temple and the Senate share one implementation. */
function BuildingTarget({
  position,
  onActivate,
  onHoverChange,
  children,
}: {
  position: [number, number, number];
  onActivate: () => void;
  onHoverChange: (hovered: boolean) => void;
  children: ReactNode;
}) {
  const click = useClickNotDrag(onActivate);
  return (
    <group
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); onHoverChange(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { onHoverChange(false); document.body.style.cursor = 'auto'; }}
      onPointerDown={(e) => { e.stopPropagation(); click.onPointerDown(e); }}
      onPointerUp={(e) => { e.stopPropagation(); click.onPointerUp(e); }}
      onPointerLeave={click.onPointerLeave}
    >
      {children}
    </group>
  );
}

export default function CityScene({
  onBossfight,
  bossfightSublabel,
  onRanked,
  rankedLabel,
  rankedSublabel,
}: CitySceneProps) {
  // Hovering either an arm or its building lights both -- that pairing is
  // what teaches which building is which without a tutorial.
  const [templeHot, setTempleHot] = useState(false);
  const [senateHot, setSenateHot] = useState(false);

  const arms: SignpostArm[] = [
    {
      side: 'left',
      label: 'BOSSFIGHT',
      sublabel: bossfightSublabel,
      color: BOSSFIGHT_COLOR,
      onActivate: onBossfight,
      onHoverChange: setTempleHot,
    },
    {
      side: 'right',
      label: rankedLabel,
      sublabel: rankedSublabel,
      color: RANKED_COLOR,
      onActivate: onRanked,
      onHoverChange: setSenateHot,
    },
  ];

  return (
    <>
      {/* Placeholder ground/sky. Step 10 replaces this with a sky driven by
          skyLocal's nightness, so Athens is dark when Athens is dark. Both
          the dome and the sea plane already read correctly through 360. */}
      <SeaAndSky seaLevel={SEA_LEVEL} sunPosition={SUN_POSITION} />

      <ambientLight intensity={0.6} />
      <directionalLight position={SUN_POSITION} intensity={1.1} />

      <Suspense fallback={null}>
        <BuildingTarget
          position={TEMPLE_POSITION}
          onActivate={onBossfight}
          onHoverChange={setTempleHot}
        >
          {/* Tinting the whole model is the cheapest honest highlight until
              the art pass gives the buildings their own materials (§9). */}
          <Temple scale={1} position={[0, 0, 0]} color={templeHot ? LIT_BOSSFIGHT : PLAIN} />
        </BuildingTarget>

        <BuildingTarget
          position={SENATE_POSITION}
          onActivate={onRanked}
          onHoverChange={setSenateHot}
        >
          <Senate color={senateHot ? LIT_RANKED : PLAIN} />
        </BuildingTarget>

        <Signpost position={SIGNPOST_POSITION} arms={arms} />

        {/* A landmark to turn toward, so a full rotation is not three
            quarters of empty horizon. */}
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
