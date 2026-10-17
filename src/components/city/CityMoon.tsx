'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The Moon over Athens, as the Moon rather than as a second sun.
 *
 * Every other body in this sky is a soft additive sprite, which is right for
 * a planet -- a point of light with no disc to resolve -- and wrong for the
 * one body whose face you can actually see. Drawn that way the Moon was a
 * featureless glowing blob, indistinguishable from the Sun but for its
 * colour. It is now a textured sphere.
 *
 * ## The phase comes out of the real sky, not a parameter
 *
 * The sphere is lit by one light of its own, placed along the TRUE direction
 * of the Sun (`sunDirection`, the same unit vector the sky gradient and the
 * water's glitter are built from). Sunlight arrives at the Moon as parallel
 * rays, so the lit hemisphere is simply the one facing the Sun -- put the
 * light there and the correct phase and the correct terminator angle both
 * fall out of the geometry. Nobody has to compute a crescent: a waxing Moon
 * near a set Sun is lit from below, and it is lit from below because the Sun
 * really is down there.
 *
 * This is the same single-snapshot discipline as the rest of the scene
 * (docs/ASPECTS_PLAN.md 0): the phase is not a second opinion about where
 * the Sun is, it IS where the Sun is.
 *
 * ## Why its own light, and its own layer
 *
 * The city's ambient, key and hemisphere lights would flood the sphere and
 * flatten the phase into a fully-lit disc. So the Moon sits alone on
 * MOON_LAYER: the scene's lights cannot reach it and its own light cannot
 * reach the scene. The camera is opted into that layer so it still renders.
 *
 * ## Why additive
 *
 * The unlit limb has to disappear, not go black. Additively blended, the
 * dark side adds nothing and vanishes into whatever sky is behind it --
 * correct at night, and correct in daylight too, where a black disc hanging
 * in a blue sky would be badly wrong. Same convention as the sprites it
 * replaces: opacity is how much light this body adds.
 */

/** Layer shared only by the Moon and the Moon's own light. Nothing else in
 *  the app uses three's layers, so any free index would do. */
const MOON_LAYER = 2;

/** How far the light stands off, in Moon radii. Far enough that a point
 *  light's rays are parallel across the sphere to well under a pixel, which
 *  is what makes the terminator straight the way the real one is. */
const LIGHT_DISTANCE_RADII = 60;

/** Brightness of the lit face. Decay is switched off, so this is a plain
 *  multiplier rather than a physical intensity at a distance -- the one
 *  number to turn if the Moon reads too hot or too dim. */
const MOON_LIGHT_INTENSITY = 3.2;

/** The Moon's disc as a fraction of the sprite size the sizing maths hands
 *  us. The sprite was a gradient that faded to nothing well before its own
 *  edge, so matching its quad would have made the Moon balloon; this is
 *  about what the old glow READ as. */
const MOON_DISC_SCALE = 0.55;

export default function CityMoon({
  position,
  /** Sprite-equivalent size from CitySky's own sizing maths, so the Moon
   *  tracks BODY_SIZE and its trims rather than drifting from the water's
   *  glitter path, which is computed from the same table. */
  size,
  /** Unit vector toward the true Sun -- `sunPosition` from useCitySky. */
  sunDirection,
  /** 0 in daylight to 1 at night, as for every other body. */
  visibility,
}: {
  position: [number, number, number];
  size: number;
  sunDirection: [number, number, number];
  visibility: number;
}) {
  const map = useTexture('/textures/moon/moonmap1k.jpg');
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const camera = useThree((s) => s.camera);

  const radius = (size * MOON_DISC_SCALE) / 2;

  useEffect(() => {
    // set(), not enable(): the Moon leaves layer 0 entirely, which is what
    // takes it out of reach of the city's own lights.
    meshRef.current?.layers.set(MOON_LAYER);
    lightRef.current?.layers.set(MOON_LAYER);
    // Without this the camera would not render a thing that is no longer on
    // layer 0, and the Moon would simply be missing.
    camera.layers.enable(MOON_LAYER);
  }, [camera]);

  const d = radius * LIGHT_DISTANCE_RADII;

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          map={map}
          roughness={1}
          metalness={0}
          transparent
          opacity={visibility}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[sunDirection[0] * d, sunDirection[1] * d, sunDirection[2] * d]}
        intensity={MOON_LIGHT_INTENSITY}
        // No falloff: this stands in for a source 150 million km away, where
        // distance attenuation across a sphere this size means nothing.
        decay={0}
      />
    </group>
  );
}
