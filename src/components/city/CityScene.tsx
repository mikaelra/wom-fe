'use client';

import { Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Temple from '@/components/temple';
import Senate from '@/components/city/Senate';
import CitySky, { useCitySky } from '@/components/city/CitySky';
import Signpost, { type SignpostArm } from '@/components/city/Signpost';
import SkyLabels, { type SkyLabelBody } from '@/components/sky/SkyLabels';
import CompassMarks from '@/components/city/CompassMarks';
import Campfire from '@/components/city/Campfire';
import { GLYPH, labelDetail } from '@/lib/skyLabelText';
import { horizonToScene, SKY_R } from '@/lib/citySkyGeometry';
// Temple left, Senate right, signpost between (§1.1). In lib/ so the
// left/right pairing with the signpost's arms can be tested.
import {
  TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION, CAMPFIRE_POSITION, SEA_LEVEL,
} from '@/lib/cityLayout';
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
 * The sky is the real one over Athens at `date`, ephemeris-placed and
 * lit by where the Sun actually is (CitySky).
 *
 * FRAMING IS PROVISIONAL. Note that temple.glb is NOT origin-on-a-corner as
 * LobbyScene.tsx claims -- it is centred on its origin to within 0.15 units.
 * What makes it awkward is its size: 35.7 x 18.5 x 63.2 units against the
 * Senate's 8.4 x 5.0. See lib/cityLayout.ts, which owns the placements and
 * the measurements behind them.
 */

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

/**
 * Keeps a gaze label at its authored pixel size (docs/CITY_SCENE_PLAN.md §7).
 *
 * FreshHtml scales a label by `distanceFactor / (2 tan(fov/2) * distance)`.
 * Every body here sits at exactly SKY_R from the eye -- they are points on
 * one dome, not objects at different depths -- so a single factor that
 * cancels that denominator gives every label the same size on screen, which
 * is what "the sky names itself" wants. The globe's own 24 is not
 * transferable: there the bodies really are at different distances and the
 * falloff is doing visible work.
 */
const LABEL_DISTANCE_FACTOR = SKY_R * 2 * Math.tan((CITY_FOV * Math.PI) / 360);

// Look limits. Azimuth is deliberately UNCLAMPED -- a full 360 is the point.
const MIN_POLAR = 0.02;               // ~1 deg off the zenith
const MAX_POLAR = Math.PI * 0.86;     // well below the horizon, short of inverting


const BOSSFIGHT_COLOR = '#4da6ff';
const RANKED_COLOR = '#ff6666';
/** Parchment rather than a third saturated hue: the way out is not a third
 *  destination competing with the two fights. */
const BACK_COLOR = '#e8d9a0';

/** Tint applied to a building while it or its arm is hovered. */
const PLAIN = '#D6D6D6';
const LIT_BOSSFIGHT = '#eaf4ff';
const LIT_RANKED = '#ffeaea';

export interface CitySceneProps {
  /** The instant to render the sky at -- now, unless ?t= overrode it. */
  date: Date;
  /** GENUINE coordinates. Never the mirrored globe-texture ones (§6.2). */
  realLat: number;
  realLng: number;
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
  /** Back to the world map. A sign on the post rather than a button over the
   *  scene, so leaving the city is a thing in the world. */
  onBackToEarth: () => void;
  /** Fired once the scene is genuinely on screen, so the loading curtain
   *  knows when to lift. */
  onReady?: () => void;
  /** The temporary red ecliptic band (§6.5). */
  showEcliptic?: boolean;
}

/**
 * Says when the scene is actually on screen, for the loading curtain.
 *
 * Rendered INSIDE the buildings' <Suspense>, so it cannot mount until every
 * model behind that boundary has resolved -- that is the whole point, and it
 * is why this is a component rather than an effect in the parent. Then it
 * waits two drawn frames before reporting: Suspense resolving means the
 * models are parsed, not that the canvas has painted them, and lifting the
 * curtain on that first frame shows a visibly empty scene for a beat.
 */
function SceneReady({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  const fired = useRef(false);

  useFrame(() => {
    if (fired.current) return;
    if (++frames.current < 2) return;
    fired.current = true;
    onReady?.();
  });

  return null;
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
  date,
  realLat,
  realLng,
  onBossfight,
  bossfightSublabel,
  onRanked,
  rankedLabel,
  rankedSublabel,
  onBackToEarth,
  onReady,
  showEcliptic,
}: CitySceneProps) {
  // Same hook CitySky uses, so the lighting below and the sky itself are
  // reading one computation rather than two that could disagree.
  const { placements, sky, nightness } = useCitySky(date, realLat, realLng, EYE);

  // The key light follows the real Sun's compass direction rather than the
  // fixed [100, 20, 100] inherited from the lobby -- with the water's
  // glitter path now laid along the true azimuth, a scene lit from some
  // other quarter reads as an error immediately. Altitude is clamped at the
  // horizon so twilight lights the marble horizontally from the right side
  // instead of from underneath it once the Sun has set.
  const sunLightPosition = useMemo<[number, number, number]>(() => {
    const sun = placements.find((p) => p.body === 'Sun');
    if (!sun) return [100, 20, 100];
    return horizonToScene(
      { altitude: Math.max(sun.horizon.altitude, 0), azimuth: sun.horizon.azimuth },
      300,
      [0, 0, 0],
    );
  }, [placements]);
  // Hovering either an arm or its building lights both -- that pairing is
  // what teaches which building is which without a tutorial.
  const [templeHot, setTempleHot] = useState(false);
  const [senateHot, setSenateHot] = useState(false);

  /**
   * Gaze labels, step 11 (§7.2, §7.4). The world map's component unchanged;
   * only the placements differ.
   *
   * Positions come straight off `useCitySky`'s placements rather than being
   * recomputed here -- recomputing is exactly how a label and the sprite it
   * names would drift apart.
   *
   * The test is `altitude > 0` and NOT the sprite's own `visibility`.
   * Below the horizon is behind the Earth, so there is genuinely nothing
   * there to name. But a planet washed out by daylight is still up there, at
   * a real place in the sky, and knowing where Jupiter is at four in the
   * afternoon is exactly the kind of thing this mechanic is for -- so
   * centring it names it even though the eye cannot pick it out. The Sun has
   * always behaved this way; the planets now match.
   */
  const labelBodies = useMemo<SkyLabelBody[]>(
    () => placements
      .filter((p) => p.horizon.altitude > 0)
      .map((p) => ({
        key: p.body,
        position: new THREE.Vector3(...p.position),
        glyph: GLYPH[p.body],
        name: p.body.toUpperCase(),
        // The body's own aspect colour, so the label and the glow sprite it
        // sits on are the same hue by construction.
        color: p.color,
        // The city has a horizon to measure against, so its detail line
        // opens with where the body actually stands (§7.5).
        detail: labelDetail(sky, p.body, p.horizon),
      })),
    [placements, sky],
  );

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
    {
      // Under the Bossfight arm, shorter and quieter than the two
      // destinations it hangs beneath: the same shape as a real signpost,
      // where the way you came from is the small plank at the bottom.
      side: 'left',
      tier: 1,
      lengthScale: 0.62,
      label: '\u{1F30D} EARTH',
      color: BACK_COLOR,
      onActivate: onBackToEarth,
    },
  ];

  return (
    <>
      <CitySky
        date={date}
        realLat={realLat}
        realLng={realLng}
        eye={EYE}
        seaLevel={SEA_LEVEL}
        showEcliptic={showEcliptic}
      />

      {/* Outside the <Suspense> below: the labels are DOM, not a model, and
          must not wait on a texture to start naming what you look at. */}
      <SkyLabels bodies={labelBodies} distanceFactor={LABEL_DISTANCE_FACTOR} />

      {/* Which way you are facing, written on the horizon itself. Same
          radius and scale as the gaze labels, so the two families of text
          sit at one size. */}
      <CompassMarks eye={EYE} radius={SKY_R} distanceFactor={LABEL_DISTANCE_FACTOR} />

      {/* Scene lighting follows the same nightness the sky does, so the
          marble goes down with the sun instead of staying lit under stars.
          Never to zero: a pitch-black building reads as a rendering failure
          rather than as night, and moonlight is a real thing. */}
      <ambientLight intensity={0.6 - 0.42 * nightness} />
      <directionalLight
        position={sunLightPosition}
        intensity={1.1 - 0.95 * nightness}
      />
      {/* A cool fill that only comes up at night, so the buildings keep an
          edge against the sky once the sun light is gone. */}
      <hemisphereLight args={['#9fb8ff', '#0a1020', 0.35 * nightness]} />

      <Suspense fallback={null}>
        <SceneReady onReady={onReady} />

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

        {/* Between the viewer and the signpost, so it lights the face of the
            arms rather than their backs. Once the Sun sets the scene's key
            light goes with it and the signpost -- the one thing that must
            stay readable -- went dark with it; this is what keeps it lit. */}
        <Campfire position={CAMPFIRE_POSITION} nightness={nightness} />

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
