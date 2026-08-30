'use client';

import { Suspense, useRef, useMemo, useState, useEffect, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import CityMarker from './CityMarker';
import SkyLabels, { type SkyLabelBody } from '@/components/sky/SkyLabels';
import { GLYPH, labelDetail } from '@/lib/skyLabelText';
import {
  milkyWayQuaternion, milkyWayTexturePath, orientMilkyWayTexture,
} from '@/lib/milkyWay';
import GlobeCrackleEffect from './GlobeCrackleEffect';
import { CITIES, latLngToVec3, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';
import {
  getSky, computeAspects, raDecToVec3,
  type BodyAspect, type AspectBody,
} from '@/lib/astrology';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';

const GLOBE_RADIUS = 2.5;
const STAR_R = 50;
const PLANET_R = 46;
/** The globe, as something that can hide a body from the gaze labels. */
const GLOBE_OCCLUDER = { center: new THREE.Vector3(0, 0, 0), radius: 2.5 };
const RAD = Math.PI / 180;

// ── Per-body render depth ("front-to-back" layering) ───────────────────────
// All bodies share the same sky-sphere angular position (RA/Dec), but the
// camera sits well inside PLANET_R (CAMERA_RADIUS = 13), so nudging a body's
// radial distance from the origin moves it closer to or farther from the
// camera without changing where it appears in the sky. Smaller radius =
// nearer the camera = renders in front. Used to force a fixed front-to-back
// draw order (Moon frontmost, then Mercury/Venus/Mars/Jupiter/Saturn) via the
// real depth buffer instead of leaving overlapping bodies to z-fight at a
// shared radius. Sun is deferred -- putting the Moon in front of it visually
// without dimming the Sun's own contribution needs more thought.
const MOON_BODY_R    = PLANET_R - 10;
const MERCURY_BODY_R = PLANET_R - 8;
const VENUS_BODY_R   = PLANET_R - 6;
const MARS_BODY_R    = PLANET_R - 4;
const JUPITER_BODY_R = PLANET_R - 2;
const SATURN_BODY_R  = PLANET_R;

// Axial tilt of the ecliptic relative to the celestial equator (J2000)
const OBLIQUITY = 23.436 * RAD;
// Ecliptic north pole in scene coordinates (RA=18h, Dec=66.564°)
// x = cos(Dec)·cos(RA=270°) = 0, y = sin(Dec) = cos(ε), z = −cos(Dec)·sin(270°) = sin(ε)
const ECLIPTIC_POLE = new THREE.Vector3(0, Math.cos(OBLIQUITY), Math.sin(OBLIQUITY));

// GMST in hours, used to align the earth texture with the real sky
export function gmstHours(date: Date): number {
  return Astronomy.SiderealTime(date);
}

// Computed once at module load — GMST drifts slowly enough (~0.004°/s) that
// a load-time snapshot stays in sync with the sky for the entire session.
// Shared by the Globe's texture rotation and NEW_YORK_DIR (below) so both
// agree on where a city actually sits in world space.
const EARTH_ROTATION_Y = Math.PI + gmstHours(new Date()) * (Math.PI / 12);

// ── Canvas sprite textures ─────────────────────────────────────────────────

function glowTex(color: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.15, color);
  g.addColorStop(0.50, color);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Soft, gradual radial haze -- unlike glowTex (bright white core, used for
// the tiny fixed-size planet sprites), this has no hot core: flat color out
// to 35%, then a long fade to fully transparent by the edge. That gradual
// falloff is what reads as "fog" drifting off a body rather than a hard
// glow disc or (worse, on a sphere with a rim shader) a lit ring. Shared by
// every body's aura layer (AuraLayers, below) -- originally the Moon's
// alone, generalized in docs/ASPECTS_PLAN.md.
function moonAuraTex(color: string, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function sunTex(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#ffffff');
  g.addColorStop(0.20, '#fffde0');
  g.addColorStop(0.45, '#fff176');
  g.addColorStop(0.70, '#ffd740');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ── Fresnel atmosphere ─────────────────────────────────────────────────────

function makeFresnelMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      color1:       { value: new THREE.Color(0x0088ff) },
      color2:       { value: new THREE.Color(0x000000) },
      fresnelBias:  { value: 0.1 },
      fresnelScale: { value: 1.0 },
      fresnelPower: { value: 4.0 },
    },
    vertexShader: /* glsl */ `
      uniform float fresnelBias, fresnelScale, fresnelPower;
      varying float vReflectionFactor;
      void main() {
        vec4 mvPosition    = modelViewMatrix * vec4(position, 1.0);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 worldNormal   = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
        vec3 I = worldPosition.xyz - cameraPosition;
        vReflectionFactor = fresnelBias + fresnelScale * pow(1.0 + dot(normalize(I), worldNormal), fresnelPower);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color1, color2;
      varying float vReflectionFactor;
      void main() {
        float f = clamp(vReflectionFactor, 0.0, 1.0);
        gl_FragColor = vec4(mix(color2, color1, vec3(f)), f);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// Same rim-light shader as the sun's fresnel atmosphere, but tinted by the
// Moon's current aspect (docs/ASPECTS_PLAN.md) — the world's "moonlight
// reflection". Sits just outside the sun's blue shell; fresnelScale tracks
// aspect.strength so it's barely there when the Moon is far from every
// other body and glows visibly at conjunction. Uses auraColor (not color)
// -- this rim is ambient/atmospheric, the same category as the aura sprite
// rather than the Moon's own body, so it's what should show a conjunct
// body's colour bleeding onto the world. The globe rim stays Moon-only for
// now -- the Earth is moonlit, not Saturn-lit.
function makeMoonFresnelMat(aspect: Pick<BodyAspect, 'auraColor' | 'strength'>) {
  const mat = makeFresnelMat();
  mat.uniforms.color1.value = aspect.auraColor;
  mat.uniforms.fresnelScale.value = aspect.strength * 6;
  mat.uniforms.fresnelPower.value = 5.5;
  return mat;
}

const jupiterTexturePath = (): string => '/textures/jupiter/jupiter2_1k.jpg';

// Web: a JPEG re-encode of the source PNG (12 MB → ~0.6 MB, the material
// ignores alpha so nothing is lost) at 4000x2000 -- kept small since every
// web visitor downloads it over the network. Native (Capacitor) / Steam
// (Electron) builds bundle their assets locally instead of fetching them,
// and are a paid product, so they use the full-resolution source PNG
// (8000x4000, MilkyWay-extreme.png -- MilkyWay-Stars.png is the same shot
// but with a survey reference grid/star-name overlay baked in, not a game
// asset) for the extra visual value. See docs/MOBILE_AND_STEAM_PLAN.md.

// Preload async textures early so they are likely cached by the time their
// phase is reached.
useTexture.preload('/textures/moon/moonmap1k.jpg');
useTexture.preload('/textures/sun/sunmap.jpg');
useTexture.preload('/textures/venus/venusmap.jpg');
useTexture.preload('/textures/mercury/mercurymap.jpg');
useTexture.preload('/textures/mercury/mercurybump.jpg');
useTexture.preload('/textures/mars/marsmap1k.jpg');
useTexture.preload('/textures/saturn/saturnmap.jpg');
useTexture.preload('/textures/saturn/saturnringcolor.jpg');
useTexture.preload('/textures/saturn/saturnringpattern.gif');
useTexture.preload('/textures/stars/circle.png');
useTexture.preload(jupiterTexturePath());

// ── Real starfield ─────────────────────────────────────────────────────────

const Starfield = memo(function Starfield() {
  const [circleTex, milkyWayTex] = useTexture([
    '/textures/stars/circle.png',
    milkyWayTexturePath(IS_NATIVE_BUILD),
  ]);

  // BackSide sphere UVs mirror the panorama left/right; this un-flips it.
  useMemo(() => orientMilkyWayTexture(milkyWayTex), [milkyWayTex]);

  // Reveal magnitude bands one at a time, brightest first.
  // Starts at 1 so the brightest band (index 0) shows immediately on mount.
  const [visibleBands, setVisibleBands] = useState(1);
  useEffect(() => {
    const timers = [
      setTimeout(() => setVisibleBands(2), 400),
      setTimeout(() => setVisibleBands(3), 800),
      setTimeout(() => setVisibleBands(4), 1200),
      setTimeout(() => setVisibleBands(5), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const bandGeos = useMemo(() => {
    const BANDS = [
      { maxMag: 0.0, size: 0.55 },
      { maxMag: 1.5, size: 0.42 },
      { maxMag: 2.5, size: 0.30 },
      { maxMag: 3.0, size: 0.20 },
      { maxMag: Infinity, size: 0.13 },
    ];

    const MIN_MAG = -1.46,
      MAX_MAG = 3.54;
    const groups = BANDS.map(() => ({ verts: [] as number[], colors: [] as number[] }));

    for (const star of STAR_CATALOG) {
      const raH = star.ra[0] + star.ra[1] / 60;
      const pos = raDecToVec3(raH, star.dec, STAR_R);
      const bi = BANDS.findIndex((b) => star.mag <= b.maxMag);
      const intensity = 0.4 + 0.6 * (MAX_MAG - star.mag) / (MAX_MAG - MIN_MAG);
      groups[bi].verts.push(pos.x, pos.y, pos.z);
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
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y -= 0.0002;
  });

  const milkyWayRef = useRef<THREE.Mesh>(null);

  // Hand-tuned alignment, now shared with the city scene (lib/milkyWay.ts).
  const milkyWayQ = useMemo(() => milkyWayQuaternion(), []);

  return (
    <group ref={groupRef}>
      <mesh
        ref={milkyWayRef}
        renderOrder={-1}
        quaternion={milkyWayQ}
      >
        <sphereGeometry args={[STAR_R, 64, 64]} />
        <meshBasicMaterial
          map={milkyWayTex}
          side={THREE.BackSide}
          depthWrite={false}
          color={0x686868}
        />
      </mesh>

      {/* your points (bandGeos) stay 100% unchanged */}
      {bandGeos.map((band, i) =>
        band && i < visibleBands ? (
          <points key={i} geometry={band.geo}>
            <pointsMaterial
              size={band.size}
              vertexColors
              map={circleTex}
              transparent
              depthWrite={false}
              sizeAttenuation
            />
          </points>
        ) : null
      )}
    </group>
  );
});

// ── Shared aura layers (docs/ASPECTS_PLAN.md §5.1) ─────────────────────────
// Two separate layers carry every body's aspect effect, split by the depth
// problem each one has to avoid:
//
// - glow shell: a sphere only marginally bigger than the body's own
//   geometry, flat additive color. Because it's real 3D geometry almost
//   coincident with the body's own surface, it never fights the body on
//   depth (unlike a flat sprite, whose single billboard depth sits at the
//   group's center -- noticeably behind the body's near, camera-facing
//   surface -- which is what hid this layer's color before real geometry
//   was used). This is what makes color visibly emanate off the body
//   itself. At `strength = 0` in a planet's own base opacity, this
//   evaluates to exactly today's fixed 0.4-opacity shell -- with no aspect
//   active nothing changes visually.
//
// - aura: the big camera-facing haze sprite (moonAuraTex) for the soft glow
//   bleeding into the surrounding space. A Fresnel/rim shader here reads as
//   a lit *ring* (bright only at the silhouette, dark facing the camera); a
//   radial-gradient sprite has no such edge bias, so it looks like fog
//   drifting off the body in every direction instead. It stays centered on
//   the body with ordinary depth testing -- no manual offset -- so the
//   globe still occludes it correctly when a body sits behind it. Its exact
//   center can get slightly clipped by the body's own mesh/glow shell,
//   which is fine: that area is already covered by the shell's brighter,
//   more saturated color. (An earlier version nudged the sprite toward the
//   camera to avoid that clipping, but a fixed offset applied to a flat
//   billboard is only exactly correct when the camera sits precisely along
//   the offset direction -- off that axis it reads as parallax, the halo
//   visibly detached from the body with the plain, unlit texture peeking
//   out to one side. Not worth it when the shell already covers the same
//   need without the tradeoff.) Planets have no aura sprite at strength 0
//   (opacity 0), so it's invisible until an aspect actually fires.
//
// Originally the Moon's alone; every body gets both layers now, driven by
// its own BodyAspect.

// Render-only tunables (docs/ASPECTS_PLAN.md §2.4) -- how aspect.strength/
// influence/sunWeight turn into opacity/scale here. Deliberately separate
// from astrology.ts's constants, which only concern the maths that produces
// those three numbers in the first place.
const SHELL_GAIN = 3;
// Raised from an initial 4 after visual review -- see astrology.ts's
// STRENGTH_BOOST comment for the live example (Mercury/Jupiter at ~1.3°)
// that was too faint to read at the old value.
const AURA_GAIN = 6;
const PLANET_AURA_BASE_MULT = 3.0;
const PLANET_AURA_GROWTH_MULT = 4.0;
const SUN_AURA_GROWTH = 2.0;
const LIGHT_GAIN = 2.0;

function AuraLayers({
  aspect,
  shellRadius,
  shellBaseOpacity,
  shellMaxOpacity,
  auraScale,
}: {
  aspect: BodyAspect;
  shellRadius: number;
  shellBaseOpacity: number;
  shellMaxOpacity: number;
  auraScale: number;
}) {
  const auraTex = useMemo(() => moonAuraTex('#' + aspect.auraColor.getHexString()), [aspect.auraColor]);
  const shellOpacity = shellBaseOpacity + Math.min(shellMaxOpacity - shellBaseOpacity, aspect.strength * SHELL_GAIN);
  const auraOpacity = Math.min(1, aspect.strength * AURA_GAIN);

  return (
    <>
      <mesh>
        <sphereGeometry args={[shellRadius, 32, 32]} />
        <meshBasicMaterial
          color={aspect.color}
          transparent
          opacity={shellOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <sprite scale={[auraScale, auraScale, 1]}>
        <spriteMaterial
          map={auraTex}
          transparent
          opacity={auraOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </>
  );
}

// ── Moon mesh (separate component so it suspends independently) ───────────

const MOON_R              = 1.5;
const MOON_GLOW_SHELL_R    = MOON_R * 1.06;
const MOON_AURA_BASE_SCALE = 3.2;
const MOON_AURA_GROWTH     = 3.4;
// The Moon has no glow shell without an aspect (base 0) and a slightly
// lower cap than planets -- both existing behaviour, unchanged by
// generalizing to AuraLayers.
const MOON_SHELL_BASE_OPACITY = 0;
const MOON_SHELL_MAX_OPACITY = 0.8;

function MoonBody({
  position,
  aspect,
  phaseFraction,
}: {
  position: THREE.Vector3;
  aspect: BodyAspect;
  phaseFraction: number;
}) {
  const moonMap = useTexture('/textures/moon/moonmap1k.jpg');
  // The phase term is existing behaviour (aura swells toward full moon,
  // shrinks toward new moon, independent of any conjunction); the solar
  // term is new -- the aura grows visibly near the Sun even though the
  // corona floor (astrology.ts) is what keeps strength itself non-zero
  // there despite phaseFraction being ~0.
  const auraScale = MOON_AURA_BASE_SCALE + MOON_AURA_GROWTH * phaseFraction + SUN_AURA_GROWTH * aspect.sunWeight;

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[MOON_R, 32, 32]} />
        <meshPhongMaterial map={moonMap} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={MOON_GLOW_SHELL_R}
        shellBaseOpacity={MOON_SHELL_BASE_OPACITY}
        shellMaxOpacity={MOON_SHELL_MAX_OPACITY}
        auraScale={auraScale}
      />
    </group>
  );
}

// ── Sun mesh — bright sphere with an additive-blended texture overlay ─────
// Inner sphere holds the brightness; the outer textured shell only ADDS
// light, so the core stays bright and texture detail blooms on top.
// No change in this pass -- the Sun's own appearance never changes
// (docs/ASPECTS_PLAN.md §1.4); it only amplifies other bodies' auras.

function SunBody({ position }: { position: THREE.Vector3 }) {
  const sunMap = useTexture('/textures/sun/sunmap.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial color={0xfff7c2} />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.01, 64, 64]} />
        <meshBasicMaterial
          map={sunMap}
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={0xf58e27}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// Planet body/shell radii -- shell is NOT a uniform 1.06x its body (unlike
// the Moon): Jupiter 0.64/0.5 = 1.28, Mercury 0.26/0.20 = 1.30,
// Venus 0.32/0.25 = 1.28, Saturn 0.26/0.20 = 1.30, Mars 0.32/0.25 = 1.28.
// Each body's existing ratio is preserved exactly (named here so both the
// body mesh and AuraLayers share the same literal) -- deriving a uniform
// ratio instead would break the zero-aspect invariant.
const JUPITER_R = 0.5, JUPITER_SHELL_R = 0.64;
const MERCURY_R = 0.20, MERCURY_SHELL_R = 0.26;
const VENUS_R = 0.25, VENUS_SHELL_R = 0.32;
const MARS_R = 0.25, MARS_SHELL_R = 0.32;
const SATURN_R = 0.20, SATURN_SHELL_R = 0.26;

// Every planet shares the same base/max shell opacity (the existing fixed
// 0.4 opacity, and a slightly higher cap than the Moon's).
const PLANET_SHELL_BASE_OPACITY = 0.4;
const PLANET_SHELL_MAX_OPACITY = 0.85;

function planetAuraScale(bodyRadius: number, aspect: BodyAspect): number {
  return bodyRadius * (PLANET_AURA_BASE_MULT + PLANET_AURA_GROWTH_MULT * aspect.influence) + SUN_AURA_GROWTH * aspect.sunWeight;
}

// ── Jupiter mesh — textured planet body ───────────────────────────────────

function JupiterBody({ position, aspect }: { position: THREE.Vector3; aspect: BodyAspect }) {
  const jupiterMap = useTexture(jupiterTexturePath());
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[JUPITER_R, 32, 32]} />
        <meshPhongMaterial map={jupiterMap} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={JUPITER_SHELL_R}
        shellBaseOpacity={PLANET_SHELL_BASE_OPACITY}
        shellMaxOpacity={PLANET_SHELL_MAX_OPACITY}
        auraScale={planetAuraScale(JUPITER_R, aspect)}
      />
    </group>
  );
}

// ── Mercury mesh — textured planet body with bump map + amber glow shell ──

function MercuryBody({ position, aspect }: { position: THREE.Vector3; aspect: BodyAspect }) {
  const [mercuryMap, mercuryBump] = useTexture([
    '/textures/mercury/mercurymap.jpg',
    '/textures/mercury/mercurybump.jpg',
  ]);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[MERCURY_R, 32, 32]} />
        <meshPhongMaterial map={mercuryMap} bumpMap={mercuryBump} bumpScale={0.01} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={MERCURY_SHELL_R}
        shellBaseOpacity={PLANET_SHELL_BASE_OPACITY}
        shellMaxOpacity={PLANET_SHELL_MAX_OPACITY}
        auraScale={planetAuraScale(MERCURY_R, aspect)}
      />
    </group>
  );
}

// ── Mars mesh — textured planet body with a red additive glow shell ──────

function MarsBody({ position, aspect }: { position: THREE.Vector3; aspect: BodyAspect }) {
  const marsMap = useTexture('/textures/mars/marsmap1k.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[MARS_R, 32, 32]} />
        <meshPhongMaterial map={marsMap} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={MARS_SHELL_R}
        shellBaseOpacity={PLANET_SHELL_BASE_OPACITY}
        shellMaxOpacity={PLANET_SHELL_MAX_OPACITY}
        auraScale={planetAuraScale(MARS_R, aspect)}
      />
    </group>
  );
}

// ── Saturn mesh — body + glow shell + barely-visible alpha-masked rings ──
//
// Ring trick: default RingGeometry UVs are a flat projection, which mangles
// strip-style ring textures. We rewrite the UVs so U = radial position across
// the ring (0 at inner edge, 1 at outer) and V = 0.5. That wraps the strip
// radially the way the asset expects. The pattern GIF is bound as alphaMap so
// real ring divisions (gaps, density variations) come through for free; low
// opacity multiplies the whole thing down to a faint, atmospheric look.
// The rings are untouched by the aspects system -- only the glow shell/aura
// (AuraLayers) respond to Saturn's current aspect.

function SaturnBody({ position, aspect }: { position: THREE.Vector3; aspect: BodyAspect }) {
  const [saturnMap, ringColor, ringAlpha] = useTexture([
    '/textures/saturn/saturnmap.jpg',
    '/textures/saturn/saturnringcolor.jpg',
    '/textures/saturn/saturnringpattern.gif',
  ]);

  const RING_INNER = 0.27;
  const RING_OUTER = 0.65;

  const ringGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 96, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const u = (v.length() - RING_INNER) / (RING_OUTER - RING_INNER);
      geo.attributes.uv.setXY(i, u, 0.5);
    }
    geo.attributes.uv.needsUpdate = true;
    return geo;
  }, []);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[SATURN_R, 32, 32]} />
        <meshPhongMaterial map={saturnMap} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={SATURN_SHELL_R}
        shellBaseOpacity={PLANET_SHELL_BASE_OPACITY}
        shellMaxOpacity={PLANET_SHELL_MAX_OPACITY}
        auraScale={planetAuraScale(SATURN_R, aspect)}
      />
      <mesh geometry={ringGeo} rotation={[-Math.PI / 2 + 10 * RAD, 0, 30 * RAD]}>
        <meshBasicMaterial
          map={ringColor}
          alphaMap={ringAlpha}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Venus mesh — textured planet body with a green additive glow shell ───

function VenusBody({ position, aspect }: { position: THREE.Vector3; aspect: BodyAspect }) {
  const venusMap = useTexture('/textures/venus/venusmap.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[VENUS_R, 32, 32]} />
        <meshBasicMaterial map={venusMap} />
      </mesh>
      <AuraLayers
        aspect={aspect}
        shellRadius={VENUS_SHELL_R}
        shellBaseOpacity={PLANET_SHELL_BASE_OPACITY}
        shellMaxOpacity={PLANET_SHELL_MAX_OPACITY}
        auraScale={planetAuraScale(VENUS_R, aspect)}
      />
    </group>
  );
}

// ── Sun directional light (always on, drifts with the sky) ────────────────
// Extracted from PlanetSprites so the Globe is lit before planets appear.
// No change in this pass -- the Sun's own aspect entry is always inert
// (docs/ASPECTS_PLAN.md §4.4), so wiring influence in here would be a
// permanent no-op.

const _sunDriftQ  = new THREE.Quaternion();
const _sunDriftAx = new THREE.Vector3(0, 1, 0);
const SKY_DRIFT   = -0.0002;

function SunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const initPos  = useMemo(() => getSky().dir.Sun.clone().multiplyScalar(PLANET_R), []);

  // Mirror the same Y-rotation the planet group applies each frame so the
  // light stays aligned with the sun sprite's world position.
  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={1.5}
      color={0xffffff}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Venus directional light (very weak, drifts with the sky) ──────────────

const VENUS_LIGHT_BASE_INTENSITY = 0.075;

function VenusLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Venus.clone().multiplyScalar(PLANET_R), [sky]);
  const influence = useMemo(() => computeAspects(sky).Venus.influence, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={VENUS_LIGHT_BASE_INTENSITY * (1 + LIGHT_GAIN * influence)}
      color={0xAB9D00}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Jupiter directional light (weak teal, drifts with the sky) ────────────

const JUPITER_LIGHT_BASE_INTENSITY = 0.1;

function JupiterLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Jupiter.clone().multiplyScalar(PLANET_R), [sky]);
  const influence = useMemo(() => computeAspects(sky).Jupiter.influence, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={JUPITER_LIGHT_BASE_INTENSITY * (1 + LIGHT_GAIN * influence)}
      color={0x008296}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mercury directional light (weak amber, drifts with the sky) ──────────

const MERCURY_LIGHT_BASE_INTENSITY = 0.06;

function MercuryLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Mercury.clone().multiplyScalar(PLANET_R), [sky]);
  const influence = useMemo(() => computeAspects(sky).Mercury.influence, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={MERCURY_LIGHT_BASE_INTENSITY * (1 + LIGHT_GAIN * influence)}
      color={sky.mercuryRetrograde ? 0xCE70FF : 0xFFBC03}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mars directional light (weak red, drifts with the sky) ───────────────

const MARS_LIGHT_BASE_INTENSITY = 0.07;

function MarsLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Mars.clone().multiplyScalar(PLANET_R), [sky]);
  const influence = useMemo(() => computeAspects(sky).Mars.influence, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={MARS_LIGHT_BASE_INTENSITY * (1 + LIGHT_GAIN * influence)}
      color={0xFF0000}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Saturn directional light (very weak amber, drifts with the sky) ──────

const SATURN_LIGHT_BASE_INTENSITY = 0.03;

function SaturnLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Saturn.clone().multiplyScalar(PLANET_R), [sky]);
  const influence = useMemo(() => computeAspects(sky).Saturn.influence, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={SATURN_LIGHT_BASE_INTENSITY * (1 + LIGHT_GAIN * influence)}
      color={0xA16300}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Moon directional light (colored + strengthened by nearby bodies) ─────
// Intensity comes from the Moon's aspect.strength: pale far from every
// other body, brighter the tighter the conjunction (or the closer to the
// Sun -- the corona floor). Computed once at mount — fine for a
// session-length scene.

const MOON_BASE_COLOR = new THREE.Color(0xcfe3ff);

function MoonLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sky      = getSky();
  const initPos  = useMemo(() => sky.dir.Moon.clone().multiplyScalar(PLANET_R), [sky]);
  const aspect   = useMemo(() => computeAspects(sky).Moon, [sky]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={aspect.strength}
      // Deliberately not aspect.color: this is a real scene light (default
      // target = origin), so a conjunction tint here Phong-shades straight
      // onto the Moon's own textured sphere -- the actual model reads as
      // "painted" that color rather than glowing. The aura sprite
      // (MoonBody) and the globe's rim shell (makeMoonFresnelMat) already
      // carry the conjunction color on their own, driven directly from
      // aspect; this light only needs to brighten, not tint. The same
      // reasoning now applies to every other body's light too (see each
      // one above) -- none of them tint either.
      color={MOON_BASE_COLOR}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Planet sprites (progressive, inside a shared drifting group) ───────────
//
// phase mapping (matches WorldMap's outer phase counter):
//   2 → Moon   3 → Mercury   4 → Venus   5 → Sun sprite
//   6 → Mars   7 → Jupiter   8 → Saturn
//
// Positions all come from one Sky snapshot (getSky().dir) -- a preset
// override and the aspect maths therefore can never disagree, unlike the
// old DEBUG_FORCED_CONJUNCTIONS scheme this replaces (docs/ASPECTS_PLAN.md
// §0), which kept the forced position and the forced separation as two
// independent hand-synced copies.

// ── Gaze-label metadata (docs/CITY_SCENE_PLAN.md §7.5) ────────────────────

/** The phase at which each body is revealed, mirroring the map above. */
const REVEAL_PHASE: Record<AspectBody, number> = {
  Moon: 2, Mercury: 3, Venus: 4, Sun: 5, Mars: 6, Jupiter: 7, Saturn: 8,
};

const PlanetSprites = memo(function PlanetSprites({ phase }: { phase: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const sky = getSky();
  const aspects = useMemo(() => computeAspects(sky), [sky]);

  const texSun   = useMemo(() => sunTex(),             []);
  const texMerc  = useMemo(() => glowTex('#ff9955'),   []);
  const texVenus = useMemo(() => glowTex('#aaffaa'),   []);
  const texMars  = useMemo(() => glowTex('#ff4422'),   []);
  const texJup   = useMemo(() => glowTex('#aaccff'),   []);
  const texSat   = useMemo(() => glowTex('#ddbb77'),   []);

  const posMoon = useMemo(() => sky.dir.Moon.clone().multiplyScalar(MOON_BODY_R), [sky]);
  const posMerc = useMemo(() => sky.dir.Mercury.clone().multiplyScalar(MERCURY_BODY_R), [sky]);
  const posVen  = useMemo(() => sky.dir.Venus.clone().multiplyScalar(VENUS_BODY_R), [sky]);
  const posSun  = useMemo(() => sky.dir.Sun.clone().multiplyScalar(PLANET_R), [sky]);
  const posMars = useMemo(() => sky.dir.Mars.clone().multiplyScalar(MARS_BODY_R), [sky]);
  const posJup  = useMemo(() => sky.dir.Jupiter.clone().multiplyScalar(JUPITER_BODY_R), [sky]);
  const posSat  = useMemo(() => sky.dir.Saturn.clone().multiplyScalar(SATURN_BODY_R), [sky]);

  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y -= 0.0002; });

  // Only bodies that have actually been revealed get a label -- otherwise a
  // name could fade in over empty space during the staggered load.
  const labelBodies = useMemo<SkyLabelBody[]>(() => {
    const positions: Record<AspectBody, THREE.Vector3> = {
      Moon: posMoon, Mercury: posMerc, Venus: posVen, Sun: posSun,
      Mars: posMars, Jupiter: posJup, Saturn: posSat,
    };
    return (Object.keys(GLYPH) as AspectBody[])
      .filter((b) => phase >= REVEAL_PHASE[b])
      .map((b) => ({
        key: b,
        position: positions[b],
        glyph: GLYPH[b],
        name: b.toUpperCase(),
        // The body's own aspect colour, so the label, its glow shell and its
        // aura are the same hue by construction rather than by discipline.
        color: `#${aspects[b].color.getHexString()}`,
        detail: labelDetail(sky, b),
      }));
  }, [phase, sky, aspects, posMoon, posMerc, posVen, posSun, posMars, posJup, posSat]);

  return (
    <group ref={groupRef}>
      {phase >= 2 && (
        <Suspense fallback={null}>
          <MoonBody position={posMoon} aspect={aspects.Moon} phaseFraction={sky.moonPhaseFraction} />
        </Suspense>
      )}

      {phase >= 3 && (
        <>
          <Suspense fallback={null}>
            <MercuryBody position={posMerc} aspect={aspects.Mercury} />
          </Suspense>
          <sprite position={posMerc} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texMerc} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 4 && (
        <>
          <Suspense fallback={null}>
            <VenusBody position={posVen} aspect={aspects.Venus} />
          </Suspense>
          <sprite position={posVen} scale={[0.825, 0.825, 1]}>
            <spriteMaterial map={texVenus} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 5 && (
        <>
          <Suspense fallback={null}>
            <SunBody position={posSun} />
          </Suspense>
          <sprite position={posSun} scale={[8.0, 8.0, 1]}>
            <spriteMaterial map={texSun} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 6 && (
        <>
          <Suspense fallback={null}>
            <MarsBody position={posMars} aspect={aspects.Mars} />
          </Suspense>
          <sprite position={posMars} scale={[0.825, 0.825, 1]}>
            <spriteMaterial map={texMars} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 7 && (
        <>
          <Suspense fallback={null}>
            <JupiterBody position={posJup} aspect={aspects.Jupiter} />
          </Suspense>
          <sprite position={posJup} scale={[1.65, 1.65, 1]}>
            <spriteMaterial map={texJup} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 8 && (
        <>
          <Suspense fallback={null}>
            <SaturnBody position={posSat} aspect={aspects.Saturn} />
          </Suspense>
          <sprite position={posSat} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texSat} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {/* Inside the drifting group, so labels ride with their bodies. The
          globe occludes: a planet on the far side must not be named through
          the Earth (§7.2). */}
      <SkyLabels bodies={labelBodies} occluder={GLOBE_OCCLUDER} />
    </group>
  );
});

// ── Globe ──────────────────────────────────────────────────────────────────

interface GlobeProps {
  onCityClick: (city: City) => void;
  onReady?: () => void;
}

function Globe({ onCityClick, onReady }: GlobeProps) {
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Epicenter for the crackle effect — Athens on the globe surface
  const athensEpicenter = useMemo(() => {
    const [x, y, z] = latLngToVec3(37.9838, -25, GLOBE_RADIUS);
    return new THREE.Vector3(x, y, z);
  }, []);

  // Web always uses 1k earth textures (downloaded over the network by every
  // visitor). Native (Capacitor) / Steam (Electron) builds bundle assets
  // locally and are a paid product, so they use the full 4k tier instead --
  // extreme-res exists on disk too but is missing the earthmap/bump/lights
  // files (only spec + cloud-alpha), so high-res/4k is the highest complete
  // tier available. Cloud textures are the same file in both folders, so
  // always pulled from high-res regardless of tier.
  const earthDir = IS_NATIVE_BUILD ? 'high-res' : 'low-res';
  const earthSuffix = IS_NATIVE_BUILD ? '4k' : '1k';
  const [earthMap, specularMap, bumpMap, lightsMap, cloudsMap, cloudsTrans] = useTexture([
    `/textures/earth/${earthDir}/00_earthmap${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/02_earthspec${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/01_earthbump${earthSuffix}.jpg`,
    `/textures/earth/${earthDir}/03_earthlights${earthSuffix}.jpg`,
    '/textures/earth/high-res/04_earthcloudmap.jpg',
    '/textures/earth/high-res/05_earthcloudmaptrans.jpg',
  ]);

  // Fires once after useTexture suspense resolves (textures are ready).
  useEffect(() => { onReady?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fresnelMat = useMemo(makeFresnelMat, []);
  const moonAspect = useMemo(() => computeAspects(getSky()).Moon, []);
  const moonFresnelMat = useMemo(() => makeMoonFresnelMat(moonAspect), [moonAspect]);

  const lightsMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      map: lightsMap,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    [lightsMap],
  );

  const cloudsMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      map: cloudsMap,
      alphaMap: cloudsTrans,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    [cloudsMap, cloudsTrans],
  );

  const geo = useMemo(() => new THREE.IcosahedronGeometry(GLOBE_RADIUS, 12), []);

  const earthRot = EARTH_ROTATION_Y;

  useFrame(() => { if (cloudsRef.current) cloudsRef.current.rotation.y += 0.000075; });

  return (
    <group rotation={[0, earthRot, 0]}>
      <mesh geometry={geo}>
        <meshPhongMaterial
          map={earthMap}
          specularMap={specularMap}
          bumpMap={bumpMap}
          bumpScale={0.04 * GLOBE_RADIUS}
        />
      </mesh>

      <mesh geometry={geo}>
        <primitive object={lightsMat} attach="material" />
      </mesh>

      <mesh ref={cloudsRef} geometry={geo} material={cloudsMat} scale={1.003} />

      <mesh geometry={geo} material={fresnelMat} scale={1.01} />

      <mesh geometry={geo} material={moonFresnelMat} scale={1.018} />

      {CITIES.map((city) => (
        <CityMarker
          key={city.id}
          city={city}
          globeRadius={GLOBE_RADIUS}
          onClick={onCityClick}
        />
      ))}

      {/* Crackle electricity radiating from the sword's impact point */}
      <GlobeCrackleEffect epicenter={athensEpicenter} radius={GLOBE_RADIUS} />
    </group>
  );
}

// ── Camera: orbits along the ecliptic plane ───────────────────────────────
// camera.up = ecliptic north pole so OrbitControls autoRotates around that
// axis. We set it every frame because OrbitControls may re-enter its own
// spherical system and needs a consistent "up" to orbit in the ecliptic plane.
// The camera starts at the anti-solar point — the Sun is always on the
// ecliptic, so its opposite direction is too. At r=13 with the Sun at r=46
// in the same direction, the Sun is hidden behind the Earth and peeks out as
// the ambient auto-rotate carries the camera around.
// Sky drift: planets, stars, and ecliptic all rotate their groups by this
// delta every frame. The camera must apply the same rotation so it stays
// locked to the ecliptic plane as the sky drifts.
const _driftQ   = new THREE.Quaternion();
const _yAxis    = new THREE.Vector3(0, 1, 0);

const CAMERA_RADIUS = 13;


function CameraRig({
  paused,
}: {
  /** Skips this rig's own camera control entirely -- used while
   *  RankedZoomRig owns the camera, so the two don't fight over it. */
  paused?: boolean;
}) {
  const { camera } = useThree();
  const initialized = useRef(false);

  useFrame(() => {
    if (!initialized.current) {
      // Reads the same sky snapshot every other position in the scene does
      // (docs/ASPECTS_PLAN.md), so a preset that moves the Sun also moves
      // the camera's anti-solar start point consistently, instead of this
      // rig independently re-querying Astronomy for the real Sun position.
      const sunDir = getSky().dir.Sun;
      camera.position.copy(sunDir).multiplyScalar(-CAMERA_RADIUS);
      camera.up.copy(ECLIPTIC_POLE);
      camera.lookAt(0, 0, 0);
      initialized.current = true;
      return;
    }

    if (paused) return;

    _driftQ.setFromAxisAngle(_yAxis, SKY_DRIFT);
    camera.position.applyQuaternion(_driftQ);
    camera.up.applyQuaternion(_driftQ).normalize();
  });
  return null;
}

// ── WorldMap ───────────────────────────────────────────────────────────────
//
// Progressive load phases (staggered with timers so the UI stays responsive):
//   1 → Globe + SunLight
//   2 → Moon
//   3 → Mercury
//   4 → Venus
//   5 → Sun sprite
//   6 → Mars
//   7 → Jupiter
//   8 → Saturn
//   9 → Stars

interface WorldMapProps {
  onCityClick: (city: City) => void;
}

export default function WorldMap({ onCityClick }: WorldMapProps) {
  const [phase, setPhase] = useState(0);
  // Flips to true once Globe signals its textures have finished loading.
  // Planet timers only start after this so planets never appear before the earth.
  const [globeReady, setGlobeReady] = useState(false);

  // Phase 1: mount the Globe immediately.
  useEffect(() => { setPhase(1); }, []);

  // Phases 2-9: stagger planets then stars, starting only after the Globe is ready.
  useEffect(() => {
    if (!globeReady) return;
    const timers = [
      setTimeout(() => setPhase(2), 200),
      setTimeout(() => setPhase(3), 400),
      setTimeout(() => setPhase(4), 600),
      setTimeout(() => setPhase(5), 800),
      setTimeout(() => setPhase(6), 1000),
      setTimeout(() => setPhase(7), 1200),
      setTimeout(() => setPhase(8), 1400),
      setTimeout(() => setPhase(9), 1600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [globeReady]);

  return (
    <>
      <CameraRig />
      <color attach="background" args={['#070b15']} />
      {/* Raised from 0.05 so the dark side of the globe stays readable */}
      <ambientLight intensity={0.12} />

      {/* Always-on directional light so the Globe is lit from phase 1. */}
      {phase >= 1 && <SunLight />}
      {phase >= 2 && <MoonLight />}
      {phase >= 3 && <MercuryLight />}
      {phase >= 4 && <VenusLight />}
      {phase >= 6 && <MarsLight />}
      {phase >= 7 && <JupiterLight />}
      {phase >= 8 && <SaturnLight />}

      {/* Globe — wrapped in its own Suspense so it appears as soon as its
          textures are ready without waiting for moon/star textures. */}
      {phase >= 1 && (
        <Suspense fallback={null}>
          <Globe onCityClick={onCityClick} onReady={() => setGlobeReady(true)} />
        </Suspense>
      )}

      {/* Planets revealed one-by-one; each has its own Suspense so the moon
          texture doesn't block the canvas-generated planet sprites. */}
      {phase >= 1 && <PlanetSprites phase={phase} />}

      {/* Stars last */}
      {phase >= 9 && (
        <Suspense fallback={null}>
          <Starfield />
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={18}
        autoRotate
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI * 0.80}
        minPolarAngle={Math.PI * 0.10}
      />
    </>
  );
}

export { GLOBE_RADIUS };
