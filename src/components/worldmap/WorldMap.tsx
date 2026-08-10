'use client';

import { Suspense, useRef, useMemo, useState, useEffect, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import CityMarker, { type RankedLabelInfo } from './CityMarker';
import GlobeCrackleEffect from './GlobeCrackleEffect';
import { CITIES, latLngToVec3, type City } from '@/lib/cities';
import { STAR_CATALOG } from './starCatalog';

const GLOBE_RADIUS = 2.5;
const STAR_R = 50;
const PLANET_R = 46;
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

// ── TEMP DEBUG: pin one or more planets at a fixed separation from the Moon ─
// Real planets are rarely near the Moon, so the conjunction color/strength
// effect is invisible without this. Each entry overrides that planet's
// rendered position (so it sits exactly sepDeg degrees from the Moon, not
// just anywhere near it) and the separation used by computeMoonAstrology (so
// the two agree). 0 = exact conjunction / max effect; the orb is
// MOON_CONJUNCTION_ORB_DEG (10°), so anything >= that is zero effect. `sign`
// only affects rendering (which side of the Moon it's placed on, via
// debugConjunctionPos below) -- it has no bearing on the separation/weight
// math, which only cares about magnitude. Bodies not listed here render at
// their real position. Set to null (or []) to use everyone's real position.
// Flip off / delete once the look is confirmed for every planet.
const DEBUG_FORCED_CONJUNCTIONS: { body: Astronomy.Body; sepDeg: number; sign?: 1 | -1 }[] | null = null;
function forcedConjunctionFor(body: Astronomy.Body) {
  return DEBUG_FORCED_CONJUNCTIONS?.find((f) => f.body === body) ?? null;
}

// TEMP DEBUG: freeze "now" to a specific moment instead of the live clock.
// Pinning just the phase_fraction *number* used by computeMoonAstrology
// isn't enough -- the Moon's rendered terminator (the actual light/dark
// crescent on MoonBody) comes from real Phong shading under SunLight, which
// is driven by the real current Sun/Moon RA/Dec. Without also moving those,
// the sphere keeps showing tonight's real (near-new) phase no matter what
// the astrology strength number says. This date is a real moment (found via
// Astronomy.SearchMoonPhase(180, ...)) where the Moon is at exact full --
// moving every Sun/Moon/Venus (and, for consistency, the other planets')
// position/light to this date makes the rendered disc and the astrology
// strength agree. Set to null to go back to the live clock, or swap in any
// other SearchMoonPhase/bisected date to check a different phase. Flip off
// / delete once the look is confirmed.
const DEBUG_NOW: Date | null = null;
function debugNow(): Date {
  return DEBUG_NOW ?? new Date();
}

// Axial tilt of the ecliptic relative to the celestial equator (J2000)
const OBLIQUITY = 23.436 * RAD;
// Ecliptic north pole in scene coordinates (RA=18h, Dec=66.564°)
// x = cos(Dec)·cos(RA=270°) = 0, y = sin(Dec) = cos(ε), z = −cos(Dec)·sin(270°) = sin(ε)
const ECLIPTIC_POLE = new THREE.Vector3(0, Math.cos(OBLIQUITY), Math.sin(OBLIQUITY));

// Observer at Earth centre (geocentric) — same as threejs-earth
const OBSERVER = new Astronomy.Observer(0, 0, 0);

// GMST in hours, used to align the earth texture with the real sky
export function gmstHours(date: Date): number {
  return Astronomy.SiderealTime(date);
}

// Computed once at module load — GMST drifts slowly enough (~0.004°/s) that
// a load-time snapshot stays in sync with the sky for the entire session.
// Shared by the Globe's texture rotation and CameraRig's Athens-facing
// direction so both agree on where Athens actually sits in world space.
const EARTH_ROTATION_Y = Math.PI + gmstHours(new Date()) * (Math.PI / 12);

// Retrograde = geocentric ecliptic longitude moving westward (decreasing) over
// time. Sample two points one hour apart and check the sign of Δlongitude,
// unwrapping the 0/360° seam.
function isRetrograde(body: Astronomy.Body, date: Date): boolean {
  const t1 = new Astronomy.AstroTime(date);
  const t2 = t1.AddDays(1 / 24);
  const lon1 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t1, true)).elon;
  const lon2 = Astronomy.Ecliptic(Astronomy.GeoVector(body, t2, true)).elon;
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d < 0;
}

// ── RA/Dec → THREE.Vector3 ─────────────────────────────────────────────────

function raDecToVec3(raHours: number, decDeg: number, radius: number): THREE.Vector3 {
  const ra  = raHours * (Math.PI / 12);
  const dec = decDeg * RAD;
  return new THREE.Vector3(
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
    -radius * Math.cos(dec) * Math.sin(ra),
  );
}

// ── Moon astrology: conjunction-driven color + strength ───────────────────
// The Moon's light isn't a fixed color — it takes on the hue of whichever
// classical planet(s) it's currently closest to in the sky (geocentric
// angular separation), and gets brighter the tighter that conjunction is.
// Far from every planet it falls back to a neutral, pale moonlight color.

// Orb: exact conjunction (0°) is max influence; beyond this many degrees a
// planet has zero effect on the Moon's color/strength. A true 0° conjunction
// is astronomically rare (Moon and planet orbits aren't coplanar -- it takes
// the Moon's precessing nodes to line the geometry up, same mechanism behind
// real lunar occultations), so it can afford to be dramatic without ever
// dominating "normal" nights. The falloff is a power curve, not linear:
// `weight = 1 - (sep/orb)^FALLOFF_EXP` with an exponent < 1 stays close to
// full strength for longer near 0° before dropping off toward the orb edge
// (a straight line drops immediately and evenly instead). That's what makes
// moderate separations -- a few degrees, which realistically happen far more
// often than an exact conjunction -- read as meaningfully close instead of
// mostly washed out.
const MOON_CONJUNCTION_ORB_DEG = 10;
const MOON_CONJUNCTION_FALLOFF_EXP = 0.62;
const MOON_CONJUNCTION_BOOST = 0.30;
const MOON_BASE_COLOR = new THREE.Color(0xcfe3ff);

function angularSeparationDeg(a: Astronomy.Body, b: Astronomy.Body, time: Astronomy.AstroTime): number {
  const eqA = Astronomy.Equator(a, time, OBSERVER, false, true);
  const eqB = Astronomy.Equator(b, time, OBSERVER, false, true);
  const vA  = raDecToVec3(eqA.ra, eqA.dec, 1);
  const vB  = raDecToVec3(eqB.ra, eqB.dec, 1);
  return vA.angleTo(vB) / RAD;
}

// DEBUG_FORCED_CONJUNCTIONS helper: places a body exactly sepDeg degrees from
// the Moon's direction (matching the separation computeMoonAstrology is told
// to use), not just anywhere near it. Rotating the Moon's unit direction by
// that angle around an axis *perpendicular* to it is exact -- the angle
// between the original and rotated vectors equals the rotation angle by
// construction, unlike a fixed-magnitude tangential offset (whose angular
// size depends on distance from the origin). Falls back to a different
// reference axis if the Moon sits almost exactly at the pole, where up x
// moonDir would be ~zero-length.
function debugConjunctionPos(moonDir: THREE.Vector3, bodyR: number, sepDeg: number): THREE.Vector3 {
  const up = Math.abs(moonDir.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const axis = moonDir.clone().cross(up).normalize();
  return moonDir.clone().applyAxisAngle(axis, sepDeg * RAD).multiplyScalar(bodyR);
}

interface MoonAstrology {
  color: THREE.Color;
  /** ~0–0.2, scaled by illuminated fraction; feeds both the Moon light's intensity and the reflection shell's opacity. */
  strength: number;
  /** Raw 0–1 illuminated fraction (Astronomy.Illumination) -- drives the aura's *size*, independent of strength's conjunction boost. */
  phaseFraction: number;
}

// All five classical planets. Colors match each planet's existing
// *Light/*Body tint elsewhere in this file; Mercury's flips the same way
// its own Light/Body do when retrograde.
function computeMoonAstrology(date: Date): MoonAstrology {
  const time = new Astronomy.AstroTime(date);
  const mercuryRetrograde = isRetrograde(Astronomy.Body.Mercury, date);

  const planets: { body: Astronomy.Body; color: THREE.Color }[] = [
    { body: Astronomy.Body.Mercury, color: new THREE.Color(mercuryRetrograde ? 0xCE70FF : 0xFFBC03) },
    { body: Astronomy.Body.Venus,   color: new THREE.Color(0xAB9D00) },
    { body: Astronomy.Body.Mars,    color: new THREE.Color(0xFF0000) },
    { body: Astronomy.Body.Jupiter, color: new THREE.Color(0x008296) },
    { body: Astronomy.Body.Saturn,  color: new THREE.Color(0xA16300) },
  ];

  // Each planet within the orb contributes a weight (1 at exact conjunction,
  // 0 at the orb's edge); color is the weighted average of the planets in
  // range, strength scales with the combined weight (capped at 1 so several
  // simultaneous conjunctions don't blow past a sane maximum).
  let weightSum = 0;
  const blended = new THREE.Color(0, 0, 0);
  for (const { body, color } of planets) {
    const forced = forcedConjunctionFor(body);
    const sep = forced ? forced.sepDeg : angularSeparationDeg(Astronomy.Body.Moon, body, time);
    const weight = Math.max(0, 1 - Math.pow(sep / MOON_CONJUNCTION_ORB_DEG, MOON_CONJUNCTION_FALLOFF_EXP));
    if (weight <= 0) continue;
    blended.r += color.r * weight;
    blended.g += color.g * weight;
    blended.b += color.b * weight;
    weightSum += weight;
  }

  const influence = Math.min(1, weightSum);
  const color = MOON_BASE_COLOR.clone();
  if (weightSum > 0) {
    blended.r /= weightSum;
    blended.g /= weightSum;
    blended.b /= weightSum;
    color.lerp(blended, influence);
  }

  // Strength before phasing: a flat baseline plus the conjunction boost.
  // The Moon's actual illuminated fraction then scales the *whole* thing
  // down multiplicatively -- near a new moon there's barely any moonlight
  // to color at all, even sitting right on top of Venus.
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const rawStrength = 0.05 + MOON_CONJUNCTION_BOOST * influence;
  const strength = rawStrength * illum.phase_fraction;

  return { color, strength, phaseFraction: illum.phase_fraction };
}

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
// falloff is what reads as "fog" drifting off the Moon rather than a hard
// glow disc or (worse, on a sphere with a rim shader) a lit ring.
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

// Same rim-light shader as the sun's fresnel atmosphere, but tinted by
// computeMoonAstrology — the world's "moonlight reflection". Sits just
// outside the sun's blue shell; fresnelScale tracks astro.strength so it's
// barely there when the Moon is far from Venus and glows visibly at
// conjunction.
function makeMoonFresnelMat(astro: MoonAstrology) {
  const mat = makeFresnelMat();
  mat.uniforms.color1.value = astro.color;
  mat.uniforms.fresnelScale.value = astro.strength * 6;
  mat.uniforms.fresnelPower.value = 5.5;
  return mat;
}

const jupiterTexturePath = (): string => '/textures/jupiter/jupiter2_1k.jpg';

// JPEG re-encode of MilkyWay-HD.png (12 MB → ~0.6 MB); the material ignores
// alpha, so nothing is lost.
const milkyWayTexturePath = (): string => '/textures/stars/MilkyWay-HD.jpg';

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
    milkyWayTexturePath(),
  ]);

  // Fixed: horizontal flip via repeat + offset so the Milky Way is no longer mirrored
  // (BackSide + sphere UVs cause the default image to appear flipped left↔right)
  useMemo(() => {
    milkyWayTex.wrapS = THREE.RepeatWrapping;
    milkyWayTex.wrapT = THREE.RepeatWrapping; // good practice
    milkyWayTex.repeat.x = -1;      // ← this un-mirrors the texture
    milkyWayTex.offset.x = 1;       // ← compensates for the flip (keeps your previous alignment)
    milkyWayTex.offset.y = 0;
    milkyWayTex.needsUpdate = true;
  }, [milkyWayTex]);

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

  // 1. Sirius unit vector (the axis we rotate around – never changes)
  const siriusVec = useMemo(() => {
    const siriusStar = STAR_CATALOG.find(
      (star) => Math.abs(star.mag + 1.46) < 0.01   // Sirius = mag ≈ -1.46
    );
    if (!siriusStar) {
      console.warn('Sirius not found in STAR_CATALOG');
      return new THREE.Vector3(0, 0, 1);
    }
    const raH = siriusStar.ra[0] + siriusStar.ra[1] / 60;
    return raDecToVec3(raH, siriusStar.dec, 1).normalize();
  }, []);

  // 2. Final quaternion = base alignment + exact 60° rotation around Sirius
  const milkyWayQuaternion = useMemo(() => {
    // Your original base rotation that already lands Sirius correctly
    const baseEuler = new THREE.Euler(
      -Math.PI / 25.8,
      -Math.PI / 1.3865,
      0,
      'XYZ'
    );
    const baseQ = new THREE.Quaternion().setFromEuler(baseEuler);

    // Exact 60° (π/3) twist around the Sirius axis
    // (Right-hand rule: positive = counter-clockwise when looking from outside toward center)
    const TWIST_ANGLE = -Math.PI / 2.55;          // ← 60 degrees exactly
    const twistQ = new THREE.Quaternion().setFromAxisAngle(siriusVec, TWIST_ANGLE);

    // Combine: apply base first, then twist around Sirius
    // (Sirius position stays perfectly fixed)
    return twistQ.multiply(baseQ);   // twist * base
  }, [siriusVec]);

  return (
    <group ref={groupRef}>
      <mesh
        ref={milkyWayRef}
        renderOrder={-1}
        quaternion={milkyWayQuaternion}   // ← this replaces the old rotation={...} prop
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

// ── Moon mesh (separate component so it suspends independently) ───────────
// Two separate layers carry the effect, split by the depth problem each one
// has to avoid:
//
// - glowShell: a sphere only marginally bigger than the Moon's own body
//   (MOON_GLOW_SHELL_R), flat additive color -- the same pattern every other
//   planet body already uses (VenusBody, MarsBody, etc). Because it's real
//   3D geometry almost coincident with the body's own surface, it never
//   fights the body on depth (unlike a flat sprite, whose single billboard
//   depth sits at the group's center -- noticeably behind the body's near,
//   camera-facing surface -- which is what hid this layer's color before).
//   This is what makes color visibly emanate off the Moon itself.
//
// - aura: the big camera-facing haze sprite (moonAuraTex) for the soft glow
//   bleeding into the surrounding space. A Fresnel/rim shader here reads as
//   a lit *ring* (bright only at the silhouette, dark facing the camera); a
//   radial-gradient sprite has no such edge bias, so it looks like fog
//   drifting off the Moon in every direction instead. It stays centered on
//   the Moon with ordinary depth testing -- no manual offset -- so the
//   globe still occludes it correctly when the Moon sits behind it. Its
//   exact center can get slightly clipped by the Moon's own body/glowShell,
//   which is fine: that area is already covered by glowShell's brighter,
//   more saturated color. (An earlier version nudged the sprite toward the
//   camera to avoid that clipping, but a fixed offset applied to a flat
//   billboard is only exactly correct when the camera sits precisely along
//   the offset direction -- off that axis it reads as parallax, the halo
//   visibly detached from the body with the plain, unlit texture peeking
//   out to one side. Not worth it when glowShell already covers the same
//   need without the tradeoff.)
//
// Both layers' opacity comes from astro.strength (conjunction + phase); the
// aura's *scale* additionally tracks astro.phaseFraction alone, so it swells
// toward full moon and shrinks toward new moon regardless of conjunction.
// The directional MoonLight alone is too weak to read against the much
// brighter Sun light, so these two are what actually make the effect
// visible on the Moon itself.

const MOON_R              = 1.5;
const MOON_GLOW_SHELL_R    = MOON_R * 1.06;
const MOON_AURA_BASE_SCALE = 3.2;
const MOON_AURA_GROWTH     = 3.4;

function MoonBody({ position, astro }: { position: THREE.Vector3; astro: MoonAstrology }) {
  const moonMap = useTexture('/textures/moon/moonmap1k.jpg');
  const auraTex = useMemo(() => moonAuraTex('#' + astro.color.getHexString()), [astro.color]);
  const auraScale = MOON_AURA_BASE_SCALE + MOON_AURA_GROWTH * astro.phaseFraction;
  const auraOpacity = Math.min(1, astro.strength * 4);
  const glowShellOpacity = Math.min(0.8, astro.strength * 3);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[MOON_R, 32, 32]} />
        <meshPhongMaterial map={moonMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[MOON_GLOW_SHELL_R, 32, 32]} />
        <meshBasicMaterial
          color={astro.color}
          transparent
          opacity={glowShellOpacity}
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
    </group>
  );
}

// ── Sun mesh — bright sphere with an additive-blended texture overlay ─────
// Inner sphere holds the brightness; the outer textured shell only ADDS
// light, so the core stays bright and texture detail blooms on top.

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

// ── Jupiter mesh — textured planet body ───────────────────────────────────

function JupiterBody({ position }: { position: THREE.Vector3 }) {
  const jupiterMap = useTexture(jupiterTexturePath());
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshPhongMaterial map={jupiterMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.64, 32, 32]} />
        <meshBasicMaterial
          color={0x008296}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Mercury mesh — textured planet body with bump map + amber glow shell ──

function MercuryBody({ position }: { position: THREE.Vector3 }) {
  const [mercuryMap, mercuryBump] = useTexture([
    '/textures/mercury/mercurymap.jpg',
    '/textures/mercury/mercurybump.jpg',
  ]);
  const retrograde = useMemo(() => isRetrograde(Astronomy.Body.Mercury, debugNow()), []);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.20, 32, 32]} />
        <meshPhongMaterial map={mercuryMap} bumpMap={mercuryBump} bumpScale={0.01} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial
          color={retrograde ? 0xCE70FF : 0xDB9504}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Mars mesh — textured planet body with a red additive glow shell ──────

function MarsBody({ position }: { position: THREE.Vector3 }) {
  const marsMap = useTexture('/textures/mars/marsmap1k.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshPhongMaterial map={marsMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial
          color={0xFF0000}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
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

function SaturnBody({ position }: { position: THREE.Vector3 }) {
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
        <sphereGeometry args={[0.20, 32, 32]} />
        <meshPhongMaterial map={saturnMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial
          color={0xA16300}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
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

function VenusBody({ position }: { position: THREE.Vector3 }) {
  const venusMap = useTexture('/textures/venus/venusmap.jpg');
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial map={venusMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshBasicMaterial
          color={0xAB9D00}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Sun directional light (always on, drifts with the sky) ────────────────
// Extracted from PlanetSprites so the Globe is lit before planets appear.

const _sunDriftQ  = new THREE.Quaternion();
const _sunDriftAx = new THREE.Vector3(0, 1, 0);
const SKY_DRIFT   = -0.0002;

function SunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Sun, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

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

function VenusLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Venus, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.075}
      color={0xAB9D00}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Jupiter directional light (weak teal, drifts with the sky) ────────────

function JupiterLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Jupiter, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.1}
      color={0x008296}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mercury directional light (weak amber, drifts with the sky) ──────────

function MercuryLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Mercury, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);
  const retrograde = useMemo(() => isRetrograde(Astronomy.Body.Mercury, now), [now]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.06}
      color={retrograde ? 0xCE70FF : 0xFFBC03}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Mars directional light (weak red, drifts with the sky) ───────────────

function MarsLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Mars, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.07}
      color={0xFF0000}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Saturn directional light (very weak amber, drifts with the sky) ──────

function SaturnLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Saturn, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={0.03}
      color={0xA16300}
      position={[initPos.x, initPos.y, initPos.z]}
    />
  );
}

// ── Moon directional light (colored + strengthened by nearby planets) ─────
// Color and intensity both come from computeMoonAstrology: pale moonlight
// far from every planet, tinting toward whichever planet(s) the Moon is
// currently closest to in the sky, brighter the tighter the conjunction.
// Computed once at mount — fine for a session-length scene.

function MoonLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const now      = useMemo(() => debugNow(), []);
  const eq       = useMemo(() => Astronomy.Equator(Astronomy.Body.Moon, now, OBSERVER, false, true), [now]);
  const initPos  = useMemo(() => raDecToVec3(eq.ra, eq.dec, PLANET_R), [eq]);
  const astro    = useMemo(() => computeMoonAstrology(now), [now]);

  useFrame(() => {
    if (lightRef.current) {
      _sunDriftQ.setFromAxisAngle(_sunDriftAx, SKY_DRIFT);
      lightRef.current.position.applyQuaternion(_sunDriftQ);
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      intensity={astro.strength}
      // Deliberately not astro.color: this is a real scene light (default
      // target = origin), so a conjunction tint here Phong-shades straight
      // onto the Moon's own textured sphere -- the actual model reads as
      // "painted" that color rather than glowing. The aura sprite
      // (MoonBody) and the globe's rim shell (makeMoonFresnelMat) already
      // carry the conjunction color on their own, driven directly from
      // astro; this light only needs to brighten, not tint.
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

const PlanetSprites = memo(function PlanetSprites({ phase }: { phase: number }) {
  const now      = useMemo(() => debugNow(), []);
  const groupRef = useRef<THREE.Group>(null);

  const texSun   = useMemo(() => sunTex(),             []);
  const texMerc  = useMemo(() => glowTex('#ff9955'),   []);
  const texVenus = useMemo(() => glowTex('#aaffaa'),   []);
  const texMars  = useMemo(() => glowTex('#ff4422'),   []);
  const texJup   = useMemo(() => glowTex('#aaccff'),   []);
  const texSat   = useMemo(() => glowTex('#ddbb77'),   []);

  const eq = useMemo(() => ({
    moon: Astronomy.Equator(Astronomy.Body.Moon,    now, OBSERVER, false, true),
    merc: Astronomy.Equator(Astronomy.Body.Mercury, now, OBSERVER, false, true),
    ven:  Astronomy.Equator(Astronomy.Body.Venus,   now, OBSERVER, false, true),
    sun:  Astronomy.Equator(Astronomy.Body.Sun,     now, OBSERVER, false, true),
    mars: Astronomy.Equator(Astronomy.Body.Mars,    now, OBSERVER, false, true),
    jup:  Astronomy.Equator(Astronomy.Body.Jupiter, now, OBSERVER, false, true),
    sat:  Astronomy.Equator(Astronomy.Body.Saturn,  now, OBSERVER, false, true),
  }), [now]);

  const posMoon = useMemo(() => raDecToVec3(eq.moon.ra, eq.moon.dec, MOON_BODY_R), [eq]);
  const astro   = useMemo(() => computeMoonAstrology(now), [now]);

  // DEBUG_FORCED_CONJUNCTIONS: any body it names gets rendered at its forced
  // separation (and side, via sign) instead of its real position, so its
  // conjunction effect -- alone or alongside another forced body -- can be
  // checked directly (matching the separation computeMoonAstrology is told
  // to use for that same body). Every other body renders at its real
  // position as usual.
  const posMercReal  = useMemo(() => raDecToVec3(eq.merc.ra, eq.merc.dec, MERCURY_BODY_R), [eq]);
  const forcedMerc    = forcedConjunctionFor(Astronomy.Body.Mercury);
  const posMercDebug = useMemo(
    () => debugConjunctionPos(posMoon.clone().normalize(), MERCURY_BODY_R, (forcedMerc?.sepDeg ?? 0) * (forcedMerc?.sign ?? 1)),
    [posMoon, forcedMerc],
  );
  const posMerc = forcedMerc ? posMercDebug : posMercReal;

  const posVenReal  = useMemo(() => raDecToVec3(eq.ven.ra, eq.ven.dec, VENUS_BODY_R), [eq]);
  const forcedVen    = forcedConjunctionFor(Astronomy.Body.Venus);
  const posVenDebug = useMemo(
    () => debugConjunctionPos(posMoon.clone().normalize(), VENUS_BODY_R, (forcedVen?.sepDeg ?? 0) * (forcedVen?.sign ?? 1)),
    [posMoon, forcedVen],
  );
  const posVen = forcedVen ? posVenDebug : posVenReal;

  const posMarsReal  = useMemo(() => raDecToVec3(eq.mars.ra, eq.mars.dec, MARS_BODY_R), [eq]);
  const forcedMars    = forcedConjunctionFor(Astronomy.Body.Mars);
  const posMarsDebug = useMemo(
    () => debugConjunctionPos(posMoon.clone().normalize(), MARS_BODY_R, (forcedMars?.sepDeg ?? 0) * (forcedMars?.sign ?? 1)),
    [posMoon, forcedMars],
  );
  const posMars = forcedMars ? posMarsDebug : posMarsReal;

  const posJupReal  = useMemo(() => raDecToVec3(eq.jup.ra, eq.jup.dec, JUPITER_BODY_R), [eq]);
  const forcedJup    = forcedConjunctionFor(Astronomy.Body.Jupiter);
  const posJupDebug = useMemo(
    () => debugConjunctionPos(posMoon.clone().normalize(), JUPITER_BODY_R, (forcedJup?.sepDeg ?? 0) * (forcedJup?.sign ?? 1)),
    [posMoon, forcedJup],
  );
  const posJup = forcedJup ? posJupDebug : posJupReal;

  const posSatReal  = useMemo(() => raDecToVec3(eq.sat.ra, eq.sat.dec, SATURN_BODY_R), [eq]);
  const forcedSat    = forcedConjunctionFor(Astronomy.Body.Saturn);
  const posSatDebug = useMemo(
    () => debugConjunctionPos(posMoon.clone().normalize(), SATURN_BODY_R, (forcedSat?.sepDeg ?? 0) * (forcedSat?.sign ?? 1)),
    [posMoon, forcedSat],
  );
  const posSat = forcedSat ? posSatDebug : posSatReal;

  const posSun = useMemo(() => raDecToVec3(eq.sun.ra, eq.sun.dec, PLANET_R), [eq]);

  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y -= 0.0002; });

  return (
    <group ref={groupRef}>
      {phase >= 2 && (
        <Suspense fallback={null}>
          <MoonBody position={posMoon} astro={astro} />
        </Suspense>
      )}

      {phase >= 3 && (
        <>
          <Suspense fallback={null}>
            <MercuryBody position={posMerc} />
          </Suspense>
          <sprite position={posMerc} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texMerc} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 4 && (
        <>
          <Suspense fallback={null}>
            <VenusBody position={posVen} />
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
            <MarsBody position={posMars} />
          </Suspense>
          <sprite position={posMars} scale={[0.825, 0.825, 1]}>
            <spriteMaterial map={texMars} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 7 && (
        <>
          <Suspense fallback={null}>
            <JupiterBody position={posJup} />
          </Suspense>
          <sprite position={posJup} scale={[1.65, 1.65, 1]}>
            <spriteMaterial map={texJup} transparent depthWrite={false} />
          </sprite>
        </>
      )}

      {phase >= 8 && (
        <>
          <Suspense fallback={null}>
            <SaturnBody position={posSat} />
          </Suspense>
          <sprite position={posSat} scale={[0.66, 0.66, 1]}>
            <spriteMaterial map={texSat} transparent depthWrite={false} />
          </sprite>
        </>
      )}
    </group>
  );
});

// ── Globe ──────────────────────────────────────────────────────────────────

interface GlobeProps {
  onCityClick: (city: City) => void;
  rankedInfo?: RankedLabelInfo;
  onReady?: () => void;
}

function Globe({ onCityClick, rankedInfo, onReady }: GlobeProps) {
  const cloudsRef = useRef<THREE.Mesh>(null);

  // Epicenter for the crackle effect — Athens on the globe surface
  const athensEpicenter = useMemo(() => {
    const [x, y, z] = latLngToVec3(37.9838, -25, GLOBE_RADIUS);
    return new THREE.Vector3(x, y, z);
  }, []);

  // Always use 1k earth textures. Cloud textures are the same file in both
  // folders, so always pulled from high-res.
  const earthDir = 'low-res';
  const earthSuffix = '1k';
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
  const moonAstro = useMemo(() => computeMoonAstrology(debugNow()), []);
  const moonFresnelMat = useMemo(() => makeMoonFresnelMat(moonAstro), [moonAstro]);

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
          rankedInfo={city.name === 'New York' ? rankedInfo : undefined}
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
// If the ambient auto-rotate hasn't carried the Athens/New York midpoint
// (PAN_TARGET_DIR, below) into view within this window, a corrective pan
// kicks in.
const SHOW_CHECK_SECONDS = 10;
const CATCHUP_SECONDS = 5;
// "Roughly centred" cone half-angle used to decide whether the ambient
// auto-rotate has already brought that midpoint into view.
const SHOWN_ANGLE_THRESHOLD = 35 * RAD;
// The catch-up pan lands with the target a smidge left of dead-centre
// rather than exactly on it — see the sign derivation in CameraRig below.
const CATCHUP_LEFT_BIAS = 12 * RAD;

// Athens' and New York's world-space directions from the globe centre, on
// the same Y rotation the Globe applies to its texture -- so a camera
// positioned along one of these rays, looking at the origin, has that city
// dead-centre in frame.
const ATHENS_DIR = (() => {
  const athens = CITIES.find((c) => c.name === 'Athens')!;
  const [x, y, z] = latLngToVec3(athens.lat, athens.lng, 1);
  return new THREE.Vector3(x, y, z).applyAxisAngle(_yAxis, EARTH_ROTATION_Y).normalize();
})();

// Used to zoom the camera in on New York while the ranked queue is
// searching (see RankedZoomRig below).
const NEW_YORK_DIR = (() => {
  const newYork = CITIES.find((c) => c.name === 'New York')!;
  const [x, y, z] = latLngToVec3(newYork.lat, newYork.lng, 1);
  return new THREE.Vector3(x, y, z).applyAxisAngle(_yAxis, EARTH_ROTATION_Y).normalize();
})();
// Closer than the ambient CAMERA_RADIUS (13) so New York reads clearly
// while its "Searching..." label is the thing the player is waiting on.
const RANKED_ZOOM_RADIUS = 6;
const RANKED_ZOOM_SECONDS = 1.6;

// The ambient corrective pan (CameraRig, below) used to target Athens alone;
// it now aims at the midpoint between Athens and New York instead, so the
// initial wide shot brings both cities toward view rather than favouring
// just the one. The angular bisector of two unit vectors is their normalized
// sum (valid as long as they aren't antipodal, which these two aren't).
const PAN_TARGET_DIR = ATHENS_DIR.clone().add(NEW_YORK_DIR).normalize();

// Cubic Hermite interpolation between p0 (t=0) and p1 (t=1), with tangents
// m0/m1 giving dp/dt at each end (total change over the unit parameter).
// Used instead of a plain ease so the catch-up pan can be handed off from,
// and back to, the ambient orbit at whatever speed it's actually moving —
// no dead stop at either end.
function hermite(t: number, p0: number, p1: number, m0: number, m1: number): number {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

// Low-pass factor for smoothing the measured ambient angular speed (rad/s
// per second of blending); just enough to reject a single noisy frame,
// with plenty of the 5s idle window left to settle before a catch-up fires.
const AMBIENT_VEL_SMOOTHING = 8;

// Shortest signed angular delta from a to b, in (-π, π].
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Right-handed basis spanning the plane ⊥ up (e1×e2 = up), used to read and
// set azimuth around an arbitrary orbit pole.
function orbitBasis(up: THREE.Vector3) {
  const ref = Math.abs(up.y) < 0.99 ? _yAxis : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(ref, up).normalize();
  const e2 = new THREE.Vector3().crossVectors(up, e1).normalize();
  return { e1, e2 };
}

function azimuthOf(v: THREE.Vector3, up: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3): number {
  const perp = v.clone().addScaledVector(up, -v.dot(up));
  return Math.atan2(perp.dot(e2), perp.dot(e1));
}

// Camera behaviour: the ambient auto-rotate (owned by OrbitControls) runs
// from the very first frame. We just watch whether the Athens/New York
// midpoint (PAN_TARGET_DIR) comes into view on its own within
// SHOW_CHECK_SECONDS. If it doesn't, we take over for a corrective pan that
// stays on the *same orbit ring* — same radius, same elevation off the
// orbit pole, only the azimuth changes — turning until that midpoint lands
// a smidge left of dead-centre. That's different from a straight-line slerp
// between two arbitrary directions, which would also drag the camera's
// elevation around and cut across the sky at an angle unrelated to the ring
// the ambient orbit runs on.
// The turn itself is a Hermite ease whose start/end tangents match the
// ambient orbit's own measured angular speed, so the hand-off into and out
// of the pan doesn't dip to zero speed and then jump back to full speed.
function CameraRig({
  onCatchupStart,
  onCatchupEnd,
  paused,
}: {
  onCatchupStart?: () => void;
  onCatchupEnd?: () => void;
  /** Skips this rig's own camera control entirely -- used while
   *  RankedZoomRig owns the camera, so the two don't fight over it. */
  paused?: boolean;
}) {
  const { camera } = useThree();
  const initialized = useRef(false);
  const shown = useRef(false);
  const elapsed = useRef(0);

  const catchingUp = useRef(false);
  const catchupElapsed = useRef(0);
  const catchupUp = useRef(new THREE.Vector3());
  const catchupE1 = useRef(new THREE.Vector3());
  const catchupE2 = useRef(new THREE.Vector3());
  const catchupUComp = useRef(0);
  const catchupPerpLen = useRef(0);
  const catchupStartAz = useRef(0);
  const catchupTargetAz = useRef(0);
  // Signed angle actually travelled, start → target. Resolved once at
  // trigger time (see below) rather than re-derived from start/target each
  // frame, since it may deliberately go the "long way" around the ring.
  const catchupTurn = useRef(0);
  // Hermite tangent (rad per unit parameter) matched to the ambient orbit's
  // own angular speed at the moment the catch-up pan starts, used at both
  // ends of the pan so it neither launches nor lands with a speed jump.
  const catchupTangent = useRef(0);

  // Tracks the ambient orbit's actual angular speed (OrbitControls'
  // autoRotate + the shared sky drift, combined) so the catch-up pan can be
  // handed off at the same rate it's already moving.
  const prevAmbientAz = useRef<number | null>(null);
  const ambientAngVel = useRef(0);

  useFrame((_, delta) => {
    if (!initialized.current) {
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, debugNow(), OBSERVER, false, true);
      const sunDir = raDecToVec3(sunEq.ra, sunEq.dec, 1).normalize();
      camera.position.copy(sunDir).multiplyScalar(-CAMERA_RADIUS);
      camera.up.copy(ECLIPTIC_POLE);
      camera.lookAt(0, 0, 0);
      initialized.current = true;
      return;
    }

    if (paused) return;

    if (catchingUp.current) {
      catchupElapsed.current += delta;
      const t = Math.min(catchupElapsed.current / CATCHUP_SECONDS, 1);
      const az = catchupStartAz.current
        + hermite(t, 0, catchupTurn.current, catchupTangent.current, catchupTangent.current);
      const up = catchupUp.current, e1 = catchupE1.current, e2 = catchupE2.current;
      camera.position
        .copy(e1).multiplyScalar(Math.cos(az) * catchupPerpLen.current)
        .addScaledVector(e2, Math.sin(az) * catchupPerpLen.current)
        .addScaledVector(up, catchupUComp.current);
      camera.up.copy(up);
      camera.lookAt(0, 0, 0);
      if (t >= 1) {
        catchingUp.current = false;
        shown.current = true; // don't retrigger — we just brought it into view
        onCatchupEnd?.();
      }
      return;
    }

    // Ambient phase: OrbitControls owns azimuth/autoRotate (and user drag).
    // We only add the slow sky-drift shared with the planet/ecliptic groups,
    // and watch for whether Athens has drifted into view on its own.
    _driftQ.setFromAxisAngle(_yAxis, SKY_DRIFT);
    camera.position.applyQuaternion(_driftQ);
    camera.up.applyQuaternion(_driftQ).normalize();

    if (!shown.current) {
      const up = camera.up.clone();
      const { e1, e2 } = orbitBasis(up);
      const az = azimuthOf(camera.position, up, e1, e2);
      if (prevAmbientAz.current !== null && delta > 0) {
        const instVel = angleDelta(prevAmbientAz.current, az) / delta;
        ambientAngVel.current += (instVel - ambientAngVel.current) * Math.min(1, delta * AMBIENT_VEL_SMOOTHING);
      }
      prevAmbientAz.current = az;

      elapsed.current += delta;
      if (camera.position.angleTo(PAN_TARGET_DIR) < SHOWN_ANGLE_THRESHOLD) {
        shown.current = true;
      } else if (elapsed.current >= SHOW_CHECK_SECONDS) {
        const uComp = camera.position.dot(up);
        const perp = camera.position.clone().addScaledVector(up, -uComp);

        catchupUp.current.copy(up);
        catchupE1.current.copy(e1);
        catchupE2.current.copy(e2);
        catchupUComp.current = uComp;
        catchupPerpLen.current = perp.length();
        catchupStartAz.current = az;
        catchupTargetAz.current = azimuthOf(PAN_TARGET_DIR, up, e1, e2) + CATCHUP_LEFT_BIAS;

        // Always turn the same way the ambient orbit is already spinning,
        // even if that's the "long way round" — reversing direction for a
        // moment (just because it's the shorter arc) reads as wrong even
        // when it's geometrically closer.
        const shortest = angleDelta(catchupStartAz.current, catchupTargetAz.current);
        const ambientDir = Math.sign(ambientAngVel.current);
        const shortestDir = Math.sign(shortest) || 1;
        const totalTurn = (ambientDir !== 0 && shortestDir !== ambientDir)
          ? shortest - shortestDir * 2 * Math.PI
          : shortest;
        catchupTurn.current = totalTurn;

        // Match the pan's launch/landing tangent to the ambient orbit's own
        // speed, capped so it can't overshoot a short turn.
        const sign = totalTurn >= 0 ? 1 : -1;
        const matched = Math.abs(ambientAngVel.current) * CATCHUP_SECONDS;
        catchupTangent.current = sign * Math.min(matched, Math.abs(totalTurn) * 0.9);

        catchupElapsed.current = 0;
        catchingUp.current = true;
        onCatchupStart?.();
      }
    }
  });
  return null;
}

// Zooms the camera in on New York while `active` (the ranked queue is
// searching for a match) so the "Searching..." label reads clearly, instead
// of leaving it small and easy to lose on the ambient wide shot. Eases both
// in and back out with a smoothstep rather than a hard cut; on the way back
// out it returns to exactly the camera pose it left the ambient orbit at,
// so CameraRig (paused meanwhile, see `paused` above) picks back up clean.
function RankedZoomRig({ active }: { active: boolean }) {
  const { camera } = useThree();
  const wasActive = useRef(false);
  const transitioning = useRef(false);
  const elapsed = useRef(0);
  const startPos = useRef(new THREE.Vector3());
  const startUp = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const targetUp = useRef(new THREE.Vector3());
  // Camera pose captured the instant the zoom-in starts, so cancelling can
  // ease back to exactly where the ambient orbit was left.
  const preZoomPos = useRef(new THREE.Vector3());
  const preZoomUp = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (active && !wasActive.current) {
      preZoomPos.current.copy(camera.position);
      preZoomUp.current.copy(camera.up);
      startPos.current.copy(camera.position);
      startUp.current.copy(camera.up);
      targetPos.current.copy(NEW_YORK_DIR).multiplyScalar(RANKED_ZOOM_RADIUS);
      targetUp.current.copy(ECLIPTIC_POLE);
      elapsed.current = 0;
      transitioning.current = true;
    } else if (!active && wasActive.current) {
      startPos.current.copy(camera.position);
      startUp.current.copy(camera.up);
      targetPos.current.copy(preZoomPos.current);
      targetUp.current.copy(preZoomUp.current);
      elapsed.current = 0;
      transitioning.current = true;
    }
    wasActive.current = active;

    if (transitioning.current) {
      elapsed.current += delta;
      const t = Math.min(elapsed.current / RANKED_ZOOM_SECONDS, 1);
      const eased = t * t * (3 - 2 * t); // smoothstep
      camera.position.lerpVectors(startPos.current, targetPos.current, eased);
      camera.up.lerpVectors(startUp.current, targetUp.current, eased).normalize();
      camera.lookAt(0, 0, 0);
      if (t >= 1) transitioning.current = false;
    } else if (active) {
      // Hold steady on New York for the rest of the search.
      camera.position.copy(targetPos.current);
      camera.up.copy(targetUp.current);
      camera.lookAt(0, 0, 0);
    }
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
  rankedInfo?: RankedLabelInfo;
}

export default function WorldMap({ onCityClick, rankedInfo }: WorldMapProps) {
  const [phase, setPhase] = useState(0);
  // Flips to true once Globe signals its textures have finished loading.
  // Planet timers only start after this so planets never appear before the earth.
  const [globeReady, setGlobeReady] = useState(false);
  // True only while the corrective pan to Athens is running; gates
  // OrbitControls so user input/autoRotate can't fight it mid-turn.
  const [catchingUp, setCatchingUp] = useState(false);
  // True while the ranked queue is searching -- camera zooms in and locks
  // onto New York for the duration (see RankedZoomRig).
  const rankedSearching = rankedInfo?.status === 'searching';

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
      <CameraRig
        onCatchupStart={() => setCatchingUp(true)}
        onCatchupEnd={() => setCatchingUp(false)}
        paused={rankedSearching}
      />
      <RankedZoomRig active={rankedSearching} />
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
          <Globe onCityClick={onCityClick} rankedInfo={rankedInfo} onReady={() => setGlobeReady(true)} />
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
        enabled={!catchingUp && !rankedSearching}
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={18}
        autoRotate={!catchingUp && !rankedSearching}
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI * 0.80}
        minPolarAngle={Math.PI * 0.10}
      />
    </>
  );
}

export { GLOBE_RADIUS };
