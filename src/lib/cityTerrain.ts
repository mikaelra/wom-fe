import {
  SEA_LEVEL, LAND_LEVEL, SIGNPOST_POSITION, CAMPFIRE_POSITION,
  TEMPLE_POSITION, SENATE_POSITION, RANKED_FORK_SIGNPOST_POSITION,
  BAY_POSITION, BAY_DIRECTION,
} from '@/lib/cityLayout';
import { TEMPLE_TABLEAU_LIFT } from '@/lib/templeTableau';

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
  // The ranked fork and the spot the guided camera stands to read it -- so
  // the post does not float and the viewpoint is not pitched on a hillock.
  { x: RANKED_FORK_SIGNPOST_POSITION[0], z: RANKED_FORK_SIGNPOST_POSITION[2], radius: 13 },
  // The Bay's quay, which stands on the land side of the inlet's head.
  { x: BAY_POSITION[0], z: BAY_POSITION[2], radius: 9 },
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
export function terrainHeight(x: number, z: number, clearRadius = 0, withBay = false): number {
  const r = Math.hypot(x, z);
  const offshore = smoothstep(SHORE_RADIUS, LAND_RADIUS, r);
  const hills = RELIEF_HEIGHT * relief(x, z) * padFlatness(x, z, clearRadius);
  if (!withBay) return (LAND_LEVEL + hills) * (1 - offshore) - RIM_DEPTH * offshore;
  // The headlands either side of the inlet push the coast out on its side.
  const shore = bayShoreRadius(x, z);
  const bayOffshore = smoothstep(shore, Math.max(LAND_RADIUS, shore + 15), r);
  // Level ground along the docks: a hill rising beside a quay would stand
  // taller than the dock it borders.
  const dockFlat = smoothstep(BAY_DOCK_WIDTH, BAY_DOCK_WIDTH + 10, bayDistance(x, z));
  const island = (LAND_LEVEL + hills * dockFlat) * (1 - bayOffshore) - RIM_DEPTH * bayOffshore;
  const water = bayWater(x, z);
  // min, so the inlet only ever digs: out past the shore the rim is already
  // deeper than the bay's bed and must stay that way.
  return Math.min(island, island * (1 - water) + BAY_BED * water);
}

// ── The Bay ───────────────────────────────────────────────────────────────

/**
 * The inlet in the city's south-west corner (lib/cityLayout.ts BAY_POSITION),
 * where components/city/Bay.tsx puts its quay and pier.
 *
 * A channel of open water running from BAY_POSITION out along BAY_DIRECTION
 * to the sea, widening as it goes, so the boat has somewhere to be going.
 * Its head is square rather than rounded: the quay is a straight wall and
 * the bank has to meet it along a line.
 *
 * Opt-in (`withBay`) rather than always on, because the boss lobby reuses
 * this island with the temple stood at the origin (padFlatness's
 * clearRadius), and the inlet's head would cut straight through the
 * temple's footprint there.
 */
/** Half the channel's width at its head -- the quay is a little wider. */
export const BAY_HALF_WIDTH = 10;
/** How much wider each side gets per unit out to sea. */
export const BAY_FLARE = 0.7;
/** Width of the sloping bank from dry land down to the channel's bed. It
 *  lies landward of the head, under the quay, which is what the quay's depth
 *  (Bay.tsx QUAY_DEPTH) is sized to hide. */
export const BAY_BANK = 3;
/** The channel's floor: deep enough to read as water, not a wet beach. */
export const BAY_BED = SEA_LEVEL - 3;
/** Width of the stone dock that lines the inlet on every side, measured in
 *  from the water's edge. Wider than the bank, so the dock covers the slope
 *  and the water meets a wall rather than a beach. */
export const BAY_DOCK_WIDTH = BAY_BANK + 1;

/**
 * How much further the coast reaches on the Bay's side: half the inlet's
 * run from its head to the ordinary shore, so the channel cuts 1.5 times as
 * far through land before it opens to the sea. The head cannot come any
 * nearer the viewer (the quay behind it would stand in their clearing), so
 * the length is added at the far end, as two headlands flanking the mouth.
 */
export const BAY_SHORE_REACH = 0.5 * (SHORE_RADIUS - Math.hypot(BAY_POSITION[0], BAY_POSITION[2]));
/** Headlands at full reach within this angle of the inlet's bearing... */
const HEADLAND_FULL = (35 * Math.PI) / 180;
/** ...easing back to the ordinary coast by this one. Kept inside 60 degrees
 *  so the pushed-out coast stays off the axis-aligned edges of Terrain's
 *  square mesh, which is only 150 out there -- the ground has to be under
 *  water before the mesh ends or it stops at a cliff. */
const HEADLAND_FADE = (60 * Math.PI) / 180;

/** Where the island's coast is on this bearing, with the Bay's headlands. */
export function bayShoreRadius(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r === 0) return SHORE_RADIUS;
  const cos = (x * BAY_DIRECTION[0] + z * BAY_DIRECTION[1]) / r;
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  return SHORE_RADIUS + BAY_SHORE_REACH * (1 - smoothstep(HEADLAND_FULL, HEADLAND_FADE, angle));
}

/**
 * How far out along the channel its sides reach before they meet the
 * headlands' shore -- where Bay.tsx's side docks end, because past it the
 * ground falls away into the sea and there is no bank to line.
 *
 * The edge at `t` is BAY_POSITION + t·dir ± w(t)·across, with w linear in t,
 * so its distance from the origin squared is a quadratic in t:
 *   (head + t)² + (W + F·t)² = R².
 */
export function bayDockLength(): number {
  const R = SHORE_RADIUS + BAY_SHORE_REACH;
  const head = Math.hypot(BAY_POSITION[0], BAY_POSITION[2]);
  const a = 1 + BAY_FLARE * BAY_FLARE;
  const b = 2 * (head + BAY_HALF_WIDTH * BAY_FLARE);
  const c = head * head + BAY_HALF_WIDTH * BAY_HALF_WIDTH - R * R;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/**
 * How far a point is from the channel, 0 anywhere inside it.
 *
 * The signed-distance shape of a half-strip: `t` is how far along the
 * channel from its head, `s` how far off its centre line.
 */
export function bayDistance(x: number, z: number): number {
  const dx = x - BAY_POSITION[0];
  const dz = z - BAY_POSITION[2];
  const t = dx * BAY_DIRECTION[0] + dz * BAY_DIRECTION[1];
  const s = Math.abs(dx * BAY_DIRECTION[1] - dz * BAY_DIRECTION[0]);
  if (t >= 0) return Math.max(0, s - (BAY_HALF_WIDTH + BAY_FLARE * t));
  // Behind the head: straight back from the square end, or from its corner.
  return s <= BAY_HALF_WIDTH ? -t : Math.hypot(t, s - BAY_HALF_WIDTH);
}

/** 1 in the channel, 0 on dry land, easing across the bank between. */
export function bayWater(x: number, z: number): number {
  return 1 - smoothstep(0, BAY_BANK, bayDistance(x, z));
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
 * How far to lift the island so the temple's floor lands on a given standing
 * height -- and therefore so the ground sits the same distance below that
 * floor as it does in the city.
 *
 * The first version of this aligned the island to the standing height
 * itself, which put the ground AT the temple's floor: inside the building,
 * underfoot, where the city has a floor 7.27 units above open ground. The
 * temple is entered at its base and stood in at its floor, and only the
 * base has anything to do with the terrain.
 *
 * Stated as "put the city's temple floor where this scene's players stand",
 * so the whole relationship -- floor above base, base on the ground --
 * carries over from the city intact rather than being re-derived.
 */
export function templeFloorOffsetFor(standingHeight: number): number {
  return standingHeight - (LAND_LEVEL + TEMPLE_TABLEAU_LIFT);
}
