'use client';

import { Suspense, useMemo } from 'react';
import { Sky, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { STAR_CATALOG } from '@/components/worldmap/starCatalog';
// `Sky` is aliased: drei's atmospheric <Sky> component owns that name here.
import { computeSky, computeAspects, type AspectBody, type Sky as SkySnapshot } from '@/lib/astrology';
import {
  localFrame, horizonOf, horizonOfRaDec, nightness, twilightBand,
  type HorizonPos, type LocalFrame,
} from '@/lib/skyLocal';
import {
  horizonToScene, eqjToSceneMatrix, eclipticPolyline, SKY_R, STAR_R,
} from '@/lib/citySkyGeometry';
import {
  seaGlitter, SUN_GLITTER_PEAK, MOON_GLITTER_PEAK, type SeaGlitter,
} from '@/lib/seaGlitter';

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

/**
 * Apparent size on the sky dome. The Sun and Moon really are about half a
 * degree across; the planets are points, drawn far larger so they read at
 * all.
 *
 * Everything except the Sun is at TWICE its first-pass size: standing on the
 * ground under a 70-degree field of view, a planet is much further from the
 * eye than it is on the globe, and at the old sizes the wanderers read as
 * dust rather than as bodies. The Sun keeps its size -- it is already the
 * brightest thing in the scene and doubling it swallows the horizon.
 *
 * These numbers also set how wide a body's reflection lies across the water
 * (lib/seaGlitter.ts), so a body and its glitter path cannot be resized
 * independently and end up disagreeing.
 */
const BODY_SIZE: Record<AspectBody, number> = {
  Sun: 16, Moon: 28, Venus: 12, Jupiter: 11, Mars: 9, Mercury: 8, Saturn: 8,
};

/** Sun and Moon are visible in daylight; the planets are not. */
const DAYLIGHT_VISIBLE: ReadonlySet<AspectBody> = new Set<AspectBody>(['Sun', 'Moon']);

export interface CityBodyPlacement {
  body: AspectBody;
  position: [number, number, number];
  horizon: HorizonPos;
  color: string;
  /** 0 when the SPRITE should not be drawn -- below the horizon, or a planet
   *  washed out by daylight. Deliberately not what the gaze labels read:
   *  they go by `horizon.altitude` alone, so a planet you cannot see in a
   *  bright sky is still named when you centre on it. Where it is remains
   *  true even when it is invisible. */
  visibility: number;
}

export interface CitySkyState {
  placements: CityBodyPlacement[];
  /** The snapshot every placement was derived from. Returned rather than
   *  recomputed by callers so a label and the sprite it names can never be
   *  reading two different instants (§0.4). */
  sky: SkySnapshot;
  /** Athens' horizon frame at that instant -- what the stars and the Milky
   *  Way are rotated by. */
  frame: LocalFrame;
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
      sky,
      frame,
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

/**
 * The ecliptic, drawn in red (docs/CITY_SCENE_PLAN.md §6.5).
 *
 * TEMPORARY, and deliberately so: this is the alignment aid for tuning the
 * sky by eye, not the finished "zodiac band" §6.5 describes. Every planet
 * rides within a few degrees of this line and the Sun sits exactly on it,
 * so if a body is drawn far off the band, the placement maths is wrong --
 * which makes it the fastest possible check that the sky is right. Step 14
 * turns it into a real toggle with a treatment to match the art; until
 * then `?ecliptic=0` on the city URL hides it.
 *
 * Depth-tested rather than drawn on top, so the sea plane hides the half of
 * the circle that is under the observer's feet and the line meets the
 * horizon exactly where the ecliptic really rises and sets.
 */
function EclipticBand({ frame, eye }: {
  frame: LocalFrame; eye: readonly [number, number, number];
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(eclipticPolyline(frame, SKY_R * 0.995, eye), 3),
    );
    const material = new THREE.LineBasicMaterial({
      color: '#ff2a2a', transparent: true, opacity: 0.75, depthWrite: false,
    });
    return new THREE.Line(geometry, material);
  }, [frame, eye]);

  // Slightly inside the body sphere (0.995) so a planet sitting on the
  // ecliptic draws in front of the line rather than z-fighting with it.
  return <primitive object={line} />;
}

/** Unit direction from the viewer to a placed body. The placements are
 *  absolute scene points on a sphere of SKY_R around the eye, so undoing
 *  exactly that gives the direction the water needs. */
function directionFromEye(
  p: CityBodyPlacement | undefined,
  eye: readonly [number, number, number],
): [number, number, number] {
  // Straight down when there is no body: a direction the water's mirror ray
  // can never match, so the path is off as well as zero-strength.
  if (!p) return [0, -1, 0];
  return [
    (p.position[0] - eye[0]) / SKY_R,
    (p.position[1] - eye[1]) / SKY_R,
    (p.position[2] - eye[2]) / SKY_R,
  ];
}

/**
 * The sea, and the light the sky lays on it.
 *
 * A custom material rather than `meshStandardMaterial` because the highlight
 * has to come from where the Sun and Moon ACTUALLY are, and a lit material
 * gets that from whatever lights the scene happens to contain -- which is
 * how a fixed [100, 20, 100] directional light ended up painting a bright
 * column on the water pointing nowhere in particular.
 *
 * Two things do the work:
 *
 * - **The mirror direction.** Every fragment reflects the view ray about the
 *   water's flat normal and asks how close that lands to the body. On a
 *   plane that sweeps smoothly from the horizon to the viewer's feet, which
 *   is what stretches a point-like body into a road along its own azimuth.
 * - **Fresnel.** Water reflects almost nothing when you look straight down
 *   into it and almost everything at a grazing angle. So the path is bright
 *   out by the horizon and fades as it comes toward you, and a low Sun makes
 *   a long road while a high one makes a small hot spot -- without either
 *   case being special-cased.
 *
 * Colours come from the bodies' own aspect colours, so the water agrees with
 * the sprite, the glow and the gaze label by construction.
 */
function Sea({ seaLevel, color, sun, moon, sunColor, moonColor }: {
  seaLevel: number;
  color: THREE.Color;
  sun: SeaGlitter;
  moon: SeaGlitter;
  sunColor: string;
  moonColor: string;
}) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uWater:        { value: new THREE.Color() },
      uSunDir:       { value: new THREE.Vector3() },
      uSunColor:     { value: new THREE.Color() },
      uSunStrength:  { value: 0 },
      uSunSigma:     { value: 1 },
      uMoonDir:      { value: new THREE.Vector3() },
      uMoonColor:    { value: new THREE.Color() },
      uMoonStrength: { value: 0 },
      uMoonSigma:    { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      // Do NOT include the <..._pars_fragment> halves here. Unlike a
      // RawShaderMaterial, a plain ShaderMaterial already gets three's
      // fragment prefix, which defines toneMapping() and
      // linearToOutputTexel() for us. Including them again is a compile
      // error ("toneMappingExposure: redefinition") and the whole sea fails
      // to build -- confirmed from the browser console, which the frontend
      // container forwards into its docker log with a [browser] prefix.
      // (No backticks in here: this whole shader is a template literal.)
      uniform vec3  uWater;
      uniform vec3  uSunDir, uSunColor, uMoonDir, uMoonColor;
      uniform float uSunStrength, uSunSigma, uMoonStrength, uMoonSigma;
      varying vec3  vWorld;

      // A Gaussian on the ANGLE between the mirror direction and the body,
      // rather than a Phong power: sigma is then literally the half-width of
      // the glitter path in radians, which is the number seaGlitter.ts
      // computes and the one worth tuning.
      float lobe(vec3 mirror, vec3 toBody, float sigma) {
        float a = acos(clamp(dot(mirror, toBody), -1.0, 1.0));
        return exp(-(a * a) / (2.0 * sigma * sigma));
      }

      void main() {
        vec3 view   = normalize(vWorld - cameraPosition);
        vec3 up     = vec3(0.0, 1.0, 0.0);
        vec3 mirror = reflect(view, up);

        // Schlick's approximation, water against air.
        float facing = clamp(dot(-view, up), 0.0, 1.0);
        float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

        vec3 col = uWater;
        col += uSunColor  * (uSunStrength  * lobe(mirror, uSunDir,  uSunSigma)  * fresnel);
        col += uMoonColor * (uMoonStrength * lobe(mirror, uMoonDir, uMoonSigma) * fresnel);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  const u = material.uniforms;
  u.uWater.value.copy(color);
  u.uSunColor.value.set(sunColor);
  u.uMoonColor.value.set(moonColor);
  u.uSunDir.value.set(...sun.direction);
  u.uMoonDir.value.set(...moon.direction);
  u.uSunStrength.value = sun.strength;
  u.uMoonStrength.value = moon.strength;
  u.uSunSigma.value = sun.sigma;
  u.uMoonSigma.value = moon.sigma;

  // Flat to the horizon in every direction, so a full 360 turn always meets
  // a horizon line.
  return (
    <mesh position={[0, seaLevel, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[6000, 6000]} />
    </mesh>
  );
}

export default function CitySky({
  date,
  realLat,
  realLng,
  eye,
  seaLevel,
  showEcliptic = true,
}: {
  date: Date;
  realLat: number;
  realLng: number;
  eye: readonly [number, number, number];
  seaLevel: number;
  /** The red alignment band. On by default while the sky is being tuned. */
  showEcliptic?: boolean;
}) {
  // One call, one snapshot: the frame the stars are rotated by is the same
  // object the bodies were placed with, rather than a second computeSky of
  // the same instant.
  const { placements, sky, frame, nightness: night, sunPosition } = useCitySky(date, realLat, realLng, eye);

  const sunPlacement = placements.find((p) => p.body === 'Sun');
  const moonPlacement = placements.find((p) => p.body === 'Moon');

  const sunGlitter = useMemo(() => seaGlitter({
    direction: directionFromEye(sunPlacement, eye),
    altitudeDeg: sunPlacement?.horizon.altitude ?? -90,
    bodySize: BODY_SIZE.Sun,
    skyRadius: SKY_R,
    peak: SUN_GLITTER_PEAK,
  }), [sunPlacement, eye]);

  const moonGlitter = useMemo(() => seaGlitter({
    direction: directionFromEye(moonPlacement, eye),
    altitudeDeg: moonPlacement?.horizon.altitude ?? -90,
    bodySize: BODY_SIZE.Moon,
    skyRadius: SKY_R,
    peak: MOON_GLITTER_PEAK,
    // A crescent lays down far less light than a full Moon.
    brightness: sky.moonPhaseFraction,
  }), [moonPlacement, eye, sky]);
  const glow = useMemo(() => glowTexture(), []);

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

      {showEcliptic && <EclipticBand frame={frame} eye={eye} />}

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

      <Sea
        seaLevel={seaLevel}
        color={seaColor}
        sun={sunGlitter}
        moon={moonGlitter}
        sunColor={sunPlacement?.color ?? '#fff3d0'}
        moonColor={moonPlacement?.color ?? '#cfe3ff'}
      />
    </>
  );
}
