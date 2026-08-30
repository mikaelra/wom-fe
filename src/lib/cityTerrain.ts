import {
  SEA_LEVEL, LAND_LEVEL, SIGNPOST_POSITION, CAMPFIRE_POSITION,
  TEMPLE_POSITION, SENATE_POSITION,
} from '@/lib/cityLayout';

export { LAND_LEVEL };

/**
 * The island Athens stands on (docs/CITY_SCENE_PLAN.md §5.1).
 *
 * Until now there was no ground at all: a single sea plane at SEA_LEVEL,
 * with every building pitched at y = 0 and rising *through* the water, so
 * the Senate's steps and the bottom two units of the signpost were
 * permanently submerged. It read as a flooded city rather than a Greek one.
 *
 * This adds land -- a plateau a little above the waterline, rolling inland,
 * dropping away to a coast -- and the buildings move up onto it.
 *
 * Pure maths so the surface is assertable without a renderer
 * (vitest.config.ts: R3F scene components are not unit-tested here). The
 * things worth asserting are exactly the ones that would be invisible in
 * code review and obvious on screen: that the ground is above water where a
 * building stands, that it is FLAT there, and that it is below water out
 * past the shore so there is a coastline rather than a cliff at the edge of
 * the mesh.
 */

/** Inland of this the ground is land; beyond it, it dives for the sea. */
export const SHORE_RADIUS = 100;
/** The mesh's own extent. Past the shore the surface is well under water and
 *  the sea plane hides it, so this only has to be comfortably larger. */
export const LAND_RADIUS = 150;
/** How far below the sea the rim sinks -- deep enough that no shallow ledge
 *  shows through the water at the horizon. */
const RIM_DEPTH = 14;

/** Tallest a hill rises above the plateau. */
export const RELIEF_HEIGHT = 3.0;

/**
 * Ground that must be flat, because something is standing on it.
 *
 * A building on a slope either floats at one corner or sinks at another --
 * there is no per-object terrain fitting here and there does not need to be,
 * because a level clearing is what a builder would have made anyway.
 * Radii are the footprint plus room to stand.
 */
const PADS: { x: number; z: number; radius: number }[] = [
  // The viewer's own ground, out past the campfire and the signpost, so the
  // near field is level and nothing rises between you and the arms you read.
  { x: 0, z: 0, radius: 16 },
  { x: CAMPFIRE_POSITION[0], z: CAMPFIRE_POSITION[2], radius: 6 },
  { x: SIGNPOST_POSITION[0], z: SIGNPOST_POSITION[2], radius: 8 },
  // temple.glb is 35.6 by 63.2, so its clearing is a field rather than a pad.
  { x: TEMPLE_POSITION[0], z: TEMPLE_POSITION[2], radius: 38 },
  { x: SENATE_POSITION[0], z: SENATE_POSITION[2], radius: 11 },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Rolling ground, from three incommensurate waves.
 *
 * Deliberately not a noise library: three sines that never line up read as
 * hills at this scale, cost nothing, and are exactly reproducible, so the
 * island is the same island on every visit and in every test.
 *
 * Normalised to 0..1 and never negative, which matters more than it looks:
 * relief only ever ADDS to the plateau, so inland ground cannot dip below
 * the waterline and open a puddle in the middle of the city.
 */
export function relief(x: number, z: number): number {
  const n =
    0.55 * Math.sin(x * 0.047) * Math.cos(z * 0.041) +
    0.30 * Math.sin(x * 0.101 + 1.7) * Math.cos(z * 0.089 - 0.6) +
    0.15 * Math.sin((x + z) * 0.163 + 2.3);
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, n));
}

/**
 * 0 on a building's pad, 1 well clear of every one of them.
 *
 * `clearRadius` adds one more pad at the origin, for a caller that stands a
 * building there which the city's own PADS know nothing about. The boss
 * lobby is exactly that: it puts temple.glb at the origin, where the city
 * only has the viewer's 16-unit clearing -- and the temple reaches 31.6
 * units down its long axis, so hills were rising more than a unit above its
 * own floor, inside the building.
 */
export function padFlatness(x: number, z: number, clearRadius = 0): number {
  let flat = 1;
  for (const pad of PADS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    flat = Math.min(flat, smoothstep(pad.radius, pad.radius * 1.9, d));
  }
  if (clearRadius > 0) {
    flat = Math.min(flat, smoothstep(clearRadius, clearRadius * 1.35, Math.hypot(x, z)));
  }
  return flat;
}

/**
 * Height of the ground at a point.
 *
 * Three terms: the plateau, the hills on it, and the dive into the sea past
 * the shore. The shore term is applied last and to the whole surface, so a
 * hill near the coast is cut down by it rather than surviving as a spike
 * standing out of the water.
 */
export function terrainHeight(x: number, z: number, clearRadius = 0): number {
  const r = Math.hypot(x, z);
  const offshore = smoothstep(SHORE_RADIUS, LAND_RADIUS, r);
  const hills = RELIEF_HEIGHT * relief(x, z) * padFlatness(x, z, clearRadius);
  return (LAND_LEVEL + hills) * (1 - offshore) - RIM_DEPTH * offshore;
}

// ── The islands on the horizon ────────────────────────────────────────────

export interface IslandPlacement {
  /** Centre, at sea level; the mesh is sunk so only its cap shows. */
  position: [number, number, number];
  /** Half-width, height above the water, half-depth. */
  scale: [number, number, number];
  rotation: number;
}

/**
 * Greek islands, far enough out to be scenery and no nearer.
 *
 * Placed by bearing rather than at random so the ring can be reasoned about:
 * they sit away from the two buildings' bearings, because an island rising
 * behind the temple would read as part of it rather than as distance.
 *
 * Sizes are chosen against the angle they subtend, which is the only thing
 * that matters at this range: a 60-unit hill 1400 out is about 2.5 degrees
 * tall, which is roughly what a real island looks like from a real coast.
 */
export function islandPlacements(): IslandPlacement[] {
  // bearing (deg), distance, width, height, depth
  const SPEC: [number, number, number, number, number][] = [
    [ 62, 1250, 210,  46, 150],
    [ 88, 1850, 300,  38, 190],
    [112, 1420, 160,  30, 120],
    [147, 1650, 260,  52, 170],
    [182, 2100, 340,  44, 210],
    [214, 1380, 190,  34, 130],
    [246, 1720, 280,  58, 180],
    [281, 2050, 230,  36, 160],
    [318, 1550, 170,  28, 120],
  ];

  return SPEC.map(([bearing, distance, w, h, d]) => {
    const a = (bearing * Math.PI) / 180;
    return {
      // Scene compass (lib/citySkyGeometry.ts): -Z is north, +X is east.
      position: [
        Math.sin(a) * distance,
        // Sunk half its height, so the waterline cuts the silhouette rather
        // than the whole shape sitting on top of the sea like a boat.
        SEA_LEVEL - h * 0.5,
        -Math.cos(a) * distance,
      ] as [number, number, number],
      scale: [w, h, d] as [number, number, number],
      rotation: a,
    };
  });
}

/**
 * How far to lift the island so its surface lands on a given standing height.
 *
 * The city and the lobby measure their floors from different places -- the
 * city's ground is LAND_LEVEL, the lobby's players stand at PLAYER_Y -- so a
 * boss fight staged on the city's terrain has to reconcile the two or the
 * players hover above the ground (or sink into it). Lifting the whole island
 * carries the sea with it, which keeps the coastline's own relationship to
 * the land intact.
 */
export function groundOffsetFor(standingHeight: number): number {
  return standingHeight - LAND_LEVEL;
}
