'use client';

import { Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Mountain from '@/components/mountain';
import Temple from '@/components/temple';
import Senate from '@/components/city/Senate';
import Market from '@/components/city/Market';
import CitySky, { useCitySky } from '@/components/city/CitySky';
import Signpost, { type SignpostArm } from '@/components/city/Signpost';
import SkyLabels, { type SkyLabelBody } from '@/components/sky/SkyLabels';
import CompassMarks from '@/components/city/CompassMarks';
import Campfire from '@/components/city/Campfire';
import { GLYPH, labelDetail } from '@/lib/skyLabelText';
import { sunIsDown } from '@/lib/skyLocal';
import { horizonToScene, SKY_R } from '@/lib/citySkyGeometry';
// Temple left, Senate right, signpost between (§1.1). In lib/ so the
// left/right pairing with the signpost's arms can be tested.
import {
  TEMPLE_POSITION, SENATE_POSITION, SIGNPOST_POSITION, CAMPFIRE_POSITION, MARKET_POSITION,
  SENATE_BOT_POSITION, RANKED_FORK_SIGNPOST_POSITION,
  SEA_LEVEL, LAND_LEVEL, EYE_HEIGHT,
} from '@/lib/cityLayout';
import Terrain from '@/components/city/Terrain';
import TempleTableau from '@/components/city/TempleTableau';
import BuildingSign, { playingLabel, inMarketLabel } from '@/components/city/BuildingSign';
import { TEMPLE_TABLEAU_LIFT } from '@/lib/templeTableau';
import type { BossfightRoster } from '@/lib/api';
import type { CityPresence } from '@/lib/schemas';
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

/** Where the player stands: eye height above the GROUND, at the origin. Was
 *  measured from the sea until there was ground to stand on. */
export const EYE: [number, number, number] = [0, LAND_LEVEL + EYE_HEIGHT, 0];
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
/** Green, matching Market.tsx's awning: the right arm and the building it
 *  pairs with read as one colour from a distance, like the temple/Senate. */
const MARKET_COLOR = '#5fd88a';
const LIT_MARKET = '#eafff2';
/** Parchment rather than a third saturated hue: the way out is not a third
 *  destination competing with the two fights. */
const BACK_COLOR = '#e8d9a0';

/**
 * The light Hades keeps burning (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * Blue, matching BOSSFIGHT_COLOR above: the signpost's bossfight arm has
 * always been blue, so the building that arm points at now says the same
 * thing from across the bay. (It was purple for one pass; the scene already
 * had a colour for this and it was not that.)
 *
 * A point light standing on the temple's own floor, so at night it throws
 * the near columns forward and leaves the far ones dark -- which is what
 * actually gives a building its shape. A uniform wash would only tell you
 * the temple is purple, not where it is.
 *
 * Rides `nightness`, so it contributes nothing while the Sun is up and comes
 * on as the sky goes over. Intensity is in candela like the campfire's, and
 * has to carry much further: the temple's columns stand 15 to 30 units from
 * its centre where the fire lights a signpost 3 units away, and physical
 * falloff means that costs roughly two orders of magnitude.
 */
const TEMPLE_GLOW_COLOR = '#4da6ff';
const TEMPLE_GLOW_PEAK = 400;
const TEMPLE_GLOW_DISTANCE = 130;
const TEMPLE_GLOW_DECAY = 1.5;
/** How far the marble itself is pulled toward that purple after dark. The
 *  light gives the shape; this only makes sure the hue reads even on the
 *  faces it does not reach. */
const TEMPLE_NIGHT_TINT = '#0e2440';
const TEMPLE_TINT_STRENGTH = 0.45;

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
  /** Who is standing in the bossfight, for the tableau inside the temple.
   *  Passed in rather than polled here: the page needs the same roster for
   *  the signpost's caption, and two polls could show a caption that does
   *  not match the figures in the building. */
  roster: BossfightRoster;
  /** Enter the human ranked queue -- the RL RANKED arm of the fork
   *  signpost, which the city's primary RANKED arm pans the camera to. */
  onRanked: () => void;
  /** Enter a bot-ranked practice game against your trained AI
   *  (docs/MY_AI.md §4) -- the BOT RANKED arm of the fork signpost. */
  onBotRanked: () => void;
  rankedLabel: string;
  rankedSublabel?: string | null;
  /** Back to the world map. A sign on the post rather than a button over the
   *  scene, so leaving the city is a thing in the world. */
  onBackToEarth: () => void;
  /** Open the player-to-player trading post (wom-be docs/MARKET_PLAN.md).
   *  The Market building and the signpost's fourth arm both call this. */
  onMarket: () => void;
  /** Live occupancy of the three buildings (wom-be `city_presence`), for
   *  the "N playing" / "N in market" signs floating over them. */
  presence: CityPresence;
  /** Fired once the scene is genuinely on screen, so the loading curtain
   *  knows when to lift. */
  onReady?: () => void;
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
/**
 * Turns the pinned camera to face a world point, once, over ~1 second
 * (docs/CITY_SCENE_PLAN.md §5.2b -- "a one-time guided camera pivot").
 *
 * OrbitControls orbits the camera around EYE, so "look at P" means putting
 * the camera on the far side of EYE from P. We convert (P - EYE) into the
 * orbit's own azimuth/polar and ease the controls' current angles toward
 * them; the user can still drag away at any point.
 */
function RankedFocusRig({ target }: { target: readonly [number, number, number] }) {
  const controls = useThree((s) => s.controls) as
    | { getAzimuthalAngle: () => number; getPolarAngle: () => number;
        setAzimuthalAngle: (a: number) => void; setPolarAngle: (a: number) => void;
        update: () => void }
    | null;
  const goal = useMemo(() => {
    const dir = new THREE.Vector3(target[0] - EYE[0], target[1] - EYE[1], target[2] - EYE[2]).normalize();
    // Camera offset from the target sits opposite the look direction.
    const off = dir.clone().multiplyScalar(-1);
    const polar = THREE.MathUtils.clamp(Math.acos(off.y), MIN_POLAR, MAX_POLAR);
    const azimuth = Math.atan2(off.x, off.z);
    return { polar, azimuth };
  }, [target]);
  const done = useRef(false);

  useFrame((_, delta) => {
    if (!controls || done.current) return;
    const t = 1 - Math.pow(0.001, delta); // frame-rate-independent ease, ~1s to close
    const az = controls.getAzimuthalAngle();
    let dAz = goal.azimuth - az;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz)); // shortest way round
    const pol = controls.getPolarAngle();
    controls.setAzimuthalAngle(az + dAz * t);
    controls.setPolarAngle(pol + (goal.polar - pol) * t);
    controls.update();
    if (Math.abs(dAz) < 0.01 && Math.abs(goal.polar - pol) < 0.01) done.current = true;
  });
  return null;
}

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
  roster,
  onRanked,
  onBotRanked,
  rankedLabel,
  rankedSublabel,
  onBackToEarth,
  onMarket,
  presence,
  onReady,
}: CitySceneProps) {
  // The city's primary RANKED arm doesn't queue -- it turns the camera to
  // the fork signpost between the two Senates, where you pick RL RANKED or
  // BOT RANKED (docs/CITY_SCENE_PLAN.md §5.2b).
  const [rankedFocus, setRankedFocus] = useState(false);
  const focusRanked = () => setRankedFocus(true);
  // Same hook CitySky uses, so the lighting below and the sky itself are
  // reading one computation rather than two that could disagree.
  const { placements, sky, nightness, sunAltitude } = useCitySky(date, realLat, realLng, EYE);


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
  const [marketHot, setMarketHot] = useState(false);

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

  // Marble by day, and after dark the underworld's own colour -- but only
  // the hue: the shape still comes from the light inside it.
  const templeColor = useMemo(() => {
    const base = new THREE.Color(templeHot ? LIT_BOSSFIGHT : PLAIN);
    base.lerp(new THREE.Color(TEMPLE_NIGHT_TINT), nightness * TEMPLE_TINT_STRENGTH);
    return `#${base.getHexString()}`;
  }, [templeHot, nightness]);

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
      // Halfway down between the two arms on the far side, rather than
      // level with Bossfight. Sharing the top row put both destinations'
      // labels at one height, and each is a nowrap name over a sublabel --
      // far wider than the gap between the two arms, so BOSSFIGHT and the
      // ranked label ran into each other across the post. Dropping this one
      // to the midpoint interleaves the three signs down the post instead
      // of stacking two of them on one line.
      //
      // Still a full-length, full-size destination arm: it hangs lower than
      // Bossfight without being lesser than it.
      side: 'right',
      tier: 0.5,
      label: rankedLabel,
      sublabel: rankedSublabel,
      color: RANKED_COLOR,
      onActivate: focusRanked,
      onHoverChange: setSenateHot,
    },
    {
      // A third full-size destination, hanging below RANKED on the right the
      // way EARTH hangs below BOSSFIGHT on the left. Full size (no
      // `secondary`/`lengthScale`): it is a destination, not an aside.
      // Half a tier below EARTH's row rather than level with it -- EARTH is
      // the small "way back" plank at the bottom left and MARKET reading at
      // the same height looked like its pair. right-1.5 can't collide with
      // RANKED's right-0.5 key.
      side: 'right',
      tier: 1.5,
      label: 'MARKET',
      color: MARKET_COLOR,
      onActivate: onMarket,
      onHoverChange: setMarketHot,
    },
    {
      // Under the Bossfight arm, a full-size destination like the others --
      // the way back to the world map is no lesser a place to go.
      side: 'left',
      tier: 1,
      label: '\u{1F30D} EARTH',
      color: BACK_COLOR,
      onActivate: onBackToEarth,
    },
  ];

  return (
    <>
      <CitySky date={date} realLat={realLat} realLng={realLng} eye={EYE} seaLevel={SEA_LEVEL} />

      {/* Outside the <Suspense> below: the labels are DOM, not a model, and
          must not wait on a texture to start naming what you look at. */}
      <SkyLabels bodies={labelBodies} distanceFactor={LABEL_DISTANCE_FACTOR} />

      {/* Which way you are facing, written on the horizon itself. Same
          radius and scale as the gaze labels, so the two families of text
          sit at one size. */}
      <CompassMarks eye={EYE} radius={SKY_R} distanceFactor={LABEL_DISTANCE_FACTOR} />

      {/* Building signs. Outside the <Suspense> for the same reason the sky
          labels are: they're DOM, not models, and must not wait on a
          texture. distanceFactor 14 matches the signpost arms so every
          floating word in the scene reads at one size. The Y offsets are
          provisional -- roughly a storey above each roofline. */}
      <BuildingSign
        position={[TEMPLE_POSITION[0], TEMPLE_POSITION[1] + 15, TEMPLE_POSITION[2]]}
        distanceFactor={14}
        occupancy={playingLabel(roster.players.filter((p) => !p.bot).length)}
      />
      <BuildingSign
        position={[SENATE_POSITION[0], SENATE_POSITION[1] + 12, SENATE_POSITION[2]]}
        distanceFactor={14}
        occupancy={playingLabel(presence.ranked)}
      />
      <BuildingSign
        position={[MARKET_POSITION[0], MARKET_POSITION[1] + 9, MARKET_POSITION[2]]}
        distanceFactor={14}
        name="MARKET"
        nameColor={MARKET_COLOR}
        occupancy={inMarketLabel(presence.market)}
      />

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

      {/* The island, and the islands beyond it. Outside the Suspense below:
          it loads no assets, and the ground appearing a beat after the
          buildings would look worse than either arriving alone. */}
      <Terrain nightness={nightness} />

      <Suspense fallback={null}>
        <SceneReady onReady={onReady} />

        <BuildingTarget
          position={TEMPLE_POSITION}
          onActivate={onBossfight}
          onHoverChange={setTempleHot}
        >
          {/* Tinting the whole model is the cheapest honest highlight until
              the art pass gives the buildings their own materials (§9). */}
          <Temple scale={1} position={[0, 0, 0]} color={templeColor} />
        </BuildingTarget>

        {/* The bossfight that is actually running, staged inside the temple.
            Outside the BuildingTarget above: the figures are scenery, and
            wrapping them in the click handler would make a player model a
            second, differently-shaped hit target for "enter the bossfight". */}
        <TempleTableau players={roster.players} active={roster.lobby_id !== null} />

        {/* On the same floor the figures stand on, lifted a couple of units
            to roughly their head height. At floor level it would rake
            straight up the columns and wash the ceiling; from here it falls
            off across the building -- about 18 on the nearest columns, 7
            mid-way and 2 at the far end -- and it is that gradient, not the
            colour, that gives the shape away. */}
        <pointLight
          position={[
            TEMPLE_POSITION[0],
            LAND_LEVEL + TEMPLE_TABLEAU_LIFT + 2,
            TEMPLE_POSITION[2],
          ]}
          color={TEMPLE_GLOW_COLOR}
          intensity={TEMPLE_GLOW_PEAK * nightness}
          distance={TEMPLE_GLOW_DISTANCE}
          decay={TEMPLE_GLOW_DECAY}
        />

        <BuildingTarget
          position={SENATE_POSITION}
          onActivate={focusRanked}
          onHoverChange={setSenateHot}
        >
          <Senate color={senateHot ? LIT_RANKED : PLAIN} />
        </BuildingTarget>

        {/* The bot-ranked Senate, touching the first at a corner
            (docs/MY_AI.md §9.1). A plain second Senate until the /modelling
            building exists; the fork signpost between the two is what
            actually sends you to the two ladders. */}
        <BuildingTarget
          position={SENATE_BOT_POSITION}
          onActivate={focusRanked}
          onHoverChange={setSenateHot}
        >
          <Senate color={senateHot ? LIT_RANKED : PLAIN} />
        </BuildingTarget>

        <Signpost
          position={RANKED_FORK_SIGNPOST_POSITION}
          arms={[
            {
              side: 'left',
              label: 'RL RANKED',
              sublabel: rankedSublabel,
              color: RANKED_COLOR,
              onActivate: onRanked,
            },
            {
              side: 'right',
              label: 'BOT RANKED',
              sublabel: 'fight your AI',
              color: RANKED_COLOR,
              onActivate: onBotRanked,
            },
          ]}
        />

        {rankedFocus && <RankedFocusRig target={RANKED_FORK_SIGNPOST_POSITION} />}

        {/* The trading post, back-right of the default view (§3.2). Same
            arm/building hover pairing as Temple and Senate. */}
        <BuildingTarget
          position={MARKET_POSITION}
          onActivate={onMarket}
          onHoverChange={setMarketHot}
        >
          <Market color={marketHot ? LIT_MARKET : PLAIN} />
        </BuildingTarget>

        <Signpost position={SIGNPOST_POSITION} arms={arms} />

        {/* Between the viewer and the signpost, so it lights the face of the
            arms rather than their backs. Once the Sun sets the scene's key
            light goes with it and the signpost -- the one thing that must
            stay readable -- went dark with it; this is what keeps it lit.

            Laid at sunset and gone after sunrise, off the same Sun altitude
            the sky is drawn from. Nobody builds a fire they do not need, and
            a cold fire burning through an Athens afternoon read as scenery
            somebody forgot to clear away. `nightness` still ramps the light
            itself, so it catches at dusk rather than snapping to full
            brightness the instant it appears. */}
        {sunIsDown(sunAltitude) && (
          <Campfire position={CAMPFIRE_POSITION} nightness={nightness} />
        )}

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
