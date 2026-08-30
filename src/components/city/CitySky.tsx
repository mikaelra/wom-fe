'use client';

import { Suspense, useMemo } from 'react';
import { Sky, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { STAR_CATALOG } from '@/components/worldmap/starCatalog';
import { computeSky, computeAspects, type AspectBody } from '@/lib/astrology';
import {
  localFrame, horizonOf, horizonOfRaDec, nightness, twilightBand,
  type HorizonPos, type LocalFrame,
} from '@/lib/skyLocal';
import { horizonToScene, eqjToSceneMatrix, SKY_R, STAR_R } from '@/lib/citySkyGeometry';

export { horizonToScene } from '@/lib/citySkyGeometry';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';
import {
  milkyWayQuaternion, milkyWayTexturePath, orientMilkyWayTexture,
} from '@/lib/milkyWay';

/**
 * The real sky over Athens (docs/CITY_SCENE_PLAN.md §6).
 *
 * Every position here comes from the ephemeris at a given instant, rotated
 * into Athens' horizon by skyLocal. When it is night in Greece it is night in
 * the scene, and the planets are where they actually are -- not decoration
 * that happens to look astronomical.
 *
 * Atmosphere is drei's <Sky>, an atmospheric-scattering shader, fed the REAL
 * Sun direction rather than a fixed one. That single substitution buys
 * physically-sensible daylight, both twilights and night for free: the
 * gradient, the horizon glow and the darkness all fall out of where the Sun
 * actually is.
 */

/** A soft round sprite; the material's colour supplies the hue. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Apparent size on the sky dome. The Sun and Moon really are about half a
 *  degree across; the planets are points, drawn larger so they read at all. */
const BODY_SIZE: Record<AspectBody, number> = {
  Sun: 16, Moon: 14, Venus: 6, Jupiter: 5.5, Mars: 4.5, Mercury: 4, Saturn: 4,
};

/** Sun and Moon are visible in daylight; the planets are not. */
const DAYLIGHT_VISIBLE: ReadonlySet<AspectBody> = new Set<AspectBody>(['Sun', 'Moon']);

export interface CityBodyPlacement {
  body: AspectBody;
  position: [number, number, number];
  horizon: HorizonPos;
  color: string;
  /** 0 when it should not be drawn at all (below the horizon, or a planet in
   *  daylight). Step 11's labels read the same value, so a label can never
   *  name something that is not on screen. */
  visibility: number;
}

export interface CitySkyState {
  placements: CityBodyPlacement[];
  /** 0 (full day) to 1 (fully dark). */
  nightness: number;
  band: ReturnType<typeof twilightBand>;
  sunAltitude: number;
  /** Direction to feed drei's <Sky>. */
  sunPosition: [number, number, number];
}

/**
 * Everything the scene needs about the sky at `date`, in one pass.
 *
 * Exported because step 11's gaze labels must read exactly these placements
 * -- deriving them twice is how the two would drift apart.
 */
export function useCitySky(
  date: Date,
  realLat: number,
  realLng: number,
  eye: readonly [number, number, number],
): CitySkyState {
  return useMemo(() => {
    const sky = computeSky(date);
    const aspects = computeAspects(sky);
    const frame = localFrame(sky, realLat, realLng);

    const sunHorizon = horizonOf(sky, 'Sun', frame);
    const night = nightness(sunHorizon.altitude);

    const placements = (Object.keys(BODY_SIZE) as AspectBody[]).map((body) => {
      const horizon = horizonOf(sky, body, frame);
      const belowHorizon = horizon.altitude <= 0;
      const hiddenByDaylight = !DAYLIGHT_VISIBLE.has(body) && night < 0.35;
      return {
        body,
        position: horizonToScene(horizon, SKY_R, eye),
        horizon,
        color: `#${aspects[body].color.getHexString()}`,
        visibility: belowHorizon || hiddenByDaylight ? 0 : 1,
      };
    });

    return {
      placements,
      nightness: night,
      band: twilightBand(sunHorizon.altitude),
      sunAltitude: sunHorizon.altitude,
      sunPosition: horizonToScene(sunHorizon, 1, [0, 0, 0]),
    };
  }, [date, realLat, realLng, eye]);
}

/**
 * The real Milky Way, arcing over Athens where it actually arcs.
 *
 * The panorama's own alignment is empirical (lib/milkyWay.ts explains why it
 * cannot be derived); that quaternion puts it in the J2000 frame, and this
 * composes the rotation from there into Athens' horizon. So the band swings
 * across the sky through the night, and sits differently in December than in
 * August, without anything being hand-placed twice.
 */
function MilkyWay({ frame, eye, opacity }: {
  frame: LocalFrame; eye: readonly [number, number, number]; opacity: number;
}) {
  const tex = useTexture(milkyWayTexturePath(IS_NATIVE_BUILD));
  useMemo(() => orientMilkyWayTexture(tex), [tex]);

  const quaternion = useMemo(() => {
    const toScene = new THREE.Quaternion().setFromRotationMatrix(eqjToSceneMatrix(frame));
    // Texture -> J2000, then J2000 -> this horizon.
    return toScene.multiply(milkyWayQuaternion());
  }, [frame]);

  return (
    <mesh position={eye as unknown as THREE.Vector3Tuple} quaternion={quaternion} renderOrder={-1}>
      <sphereGeometry args={[STAR_R * 1.04, 64, 64]} />
      <meshBasicMaterial
        map={tex}
        side={THREE.BackSide}
        depthWrite={false}
        transparent
        opacity={opacity}
        color={0x686868}
      />
    </mesh>
  );
}

/**
 * The real constellations, standing where they stand over Athens tonight.
 *
 * Same catalogue and the same magnitude banding the world map uses, so a
 * constellation looks like itself in both scenes -- only the rotation
 * differs. Stars below the horizon are dropped: half the sky is under
 * Athens' feet at any moment, and drawing it would make a dome rather than
 * a sky.
 */
function Stars({ frame, eye, opacity }: {
  frame: LocalFrame; eye: readonly [number, number, number]; opacity: number;
}) {
  const circleTex = useTexture('/textures/stars/circle.png');

  const bands = useMemo(() => {
    const BANDS = [
      { maxMag: 0.0, size: 5.0 },
      { maxMag: 1.5, size: 3.8 },
      { maxMag: 2.5, size: 2.7 },
      { maxMag: 3.0, size: 1.9 },
      { maxMag: Infinity, size: 1.3 },
    ];
    const MIN_MAG = -1.46, MAX_MAG = 3.54;
    const groups = BANDS.map(() => ({ verts: [] as number[], colors: [] as number[] }));

    for (const star of STAR_CATALOG) {
      const pos = horizonOfRaDec(star.ra[0] + star.ra[1] / 60, star.dec, frame);
      if (pos.altitude <= 0) continue;
      const [x, y, z] = horizonToScene(pos, STAR_R, eye);
      const bi = BANDS.findIndex((b) => star.mag <= b.maxMag);
      const intensity = 0.4 + 0.6 * (MAX_MAG - star.mag) / (MAX_MAG - MIN_MAG);
      groups[bi].verts.push(x, y, z);
      groups[bi].colors.push(intensity, intensity, intensity);
    }

    return BANDS.map((band, i) => {
      const { verts, colors } = groups[i];
      if (verts.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      return { geo, size: band.size };
    });
  }, [frame, eye]);

  return (
    <>
      {bands.map((band, i) => band && (
        <points key={i} geometry={band.geo}>
          <pointsMaterial
            size={band.size}
            vertexColors
            map={circleTex}
            transparent
            opacity={opacity}
            depthWrite={false}
            sizeAttenuation={false}
          />
        </points>
      ))}
    </>
  );
}

export default function CitySky({
  date,
  realLat,
  realLng,
  eye,
  seaLevel,
}: {
  date: Date;
  realLat: number;
  realLng: number;
  eye: readonly [number, number, number];
  seaLevel: number;
}) {
  const { placements, nightness: night, sunPosition } = useCitySky(date, realLat, realLng, eye);
  const glow = useMemo(() => glowTexture(), []);
  const frame = useMemo(
    () => localFrame(computeSky(date), realLat, realLng),
    [date, realLat, realLng],
  );

  // The sea keeps the sky's own light: bright by day, near-black at night,
  // so the horizon does not glow blue under a starfield.
  const seaColor = useMemo(
    () => new THREE.Color('#3b7fb5').lerp(new THREE.Color('#050a14'), night),
    [night],
  );

  return (
    <>
      {/* Fed the real Sun, so daylight, both twilights and night all fall out
          of where it actually is rather than being three hand-made states. */}
      <Sky
        distance={4500}
        sunPosition={sunPosition}
        turbidity={6}
        rayleigh={2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      {/* Both fade in with the dark, so a daylight sky is not full of stars.
          Their own Suspense: a texture still loading must not hold up the
          buildings or the signpost. */}
      {night > 0.02 && (
        <Suspense fallback={null}>
          <MilkyWay frame={frame} eye={eye} opacity={night * 0.9} />
          <Stars frame={frame} eye={eye} opacity={night} />
        </Suspense>
      )}

      {placements.map((p) => (
        p.visibility > 0 && (
          <sprite key={p.body} position={p.position} scale={[BODY_SIZE[p.body], BODY_SIZE[p.body], 1]}>
            <spriteMaterial
              map={glow}
              color={p.color}
              transparent
              opacity={p.visibility}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        )
      ))}

      {/* Sea -- a huge horizontal plane, flat to the horizon in every
          direction, so a full 360 turn always meets a horizon line. */}
      <mesh position={[0, seaLevel, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshStandardMaterial color={seaColor} roughness={0.35} metalness={0.45} />
      </mesh>
    </>
  );
}
