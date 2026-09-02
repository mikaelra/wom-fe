/**
 * The /modelling sandbox: which buildings it can show, and how to frame one.
 *
 * A scratch route for sculpting the procedural buildings (Senate.tsx,
 * Market.tsx) without walking into the city and waiting for a sky, a
 * terrain and a sun to load first. It is deliberately temporary -- when the
 * real models land, this and the route go.
 *
 * The maths lives here rather than in the scene component for the usual
 * reason (docs/CITY_SCENE_PLAN.md's test strategy): R3F components are
 * never unit-tested in this repo, so anything that can be wrong in a way a
 * test could catch has to sit outside one.
 */

export type ModellingModelId = 'ranked' | 'market' | 'senate-city';

export interface ModellingModel {
  id: ModellingModelId;
  /** Button caption. */
  label: string;
  /** The signpost-arm colour the building answers to, so the buttons read
   *  the same way the city's arms do: red ranked, green market. */
  accent: string;
  /** One line under the button saying what you are looking at. */
  blurb: string;
}

export const MODELLING_MODELS: readonly ModellingModel[] = [
  {
    id: 'ranked',
    label: 'Ranked arena',
    accent: '#ff4d4d',
    blurb: 'Senate at lib/rankedArena.ts dimensions -- the building a ranked match is played inside.',
  },
  {
    id: 'market',
    label: 'Market',
    accent: '#5fd88a',
    blurb: 'The agora stall-row that stands on the city’s right hand.',
  },
  {
    id: 'senate-city',
    label: 'Senate (city size)',
    accent: '#ff9d6e',
    blurb: 'The same Senate component at the size it stands at in the city -- sized, not scaled, so both have to be looked at.',
  },
] as const;

export const DEFAULT_MODELLING_MODEL: ModellingModelId = 'ranked';

/** Resolve a `?model=` value, falling back to the default for anything unknown. */
export function findModellingModel(id: string | null | undefined): ModellingModel {
  const found = MODELLING_MODELS.find((m) => m.id === id);
  return found ?? MODELLING_MODELS.find((m) => m.id === DEFAULT_MODELLING_MODEL)!;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Half the bounding box's diagonal: the radius of the sphere around it. */
export function boundingRadius(size: Vec3Like): number {
  return Math.hypot(size.x, size.y, size.z) / 2;
}

export interface OrbitFraming {
  /** Where to stand the camera when this model is selected. */
  distance: number;
  /** How close OrbitControls may be pushed... */
  minDistance: number;
  /** ...and how far pulled back. */
  maxDistance: number;
}

export interface FramingOptions {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Fraction of the frame the model's bounding sphere should fill. */
  fillRatio?: number;
  /** Viewport width/height. Below 1 (a portrait phone) the horizontal
   *  extent is what runs out first, so the camera has to back off further. */
  aspect?: number;
}

/**
 * How far back to stand from a model of this size.
 *
 * Framed off the bounding SPHERE rather than the box's height, so the
 * framing does not jump when a building is turned: the sphere is the same
 * from every angle and the camera here is always orbiting.
 *
 * `minDistance` is deliberately well inside the model -- roughly a third of
 * its radius. The ranked arena is a building you stand INSIDE (the whole
 * reason Senate.tsx is a hollow peristyle), so a sandbox that cannot put
 * the camera under the dome cannot show the view the match is actually
 * played in.
 */
export function orbitFraming(size: Vec3Like, opts: FramingOptions): OrbitFraming {
  const { fov, fillRatio = 0.78, aspect = 1 } = opts;
  const radius = boundingRadius(size) || 1;
  const halfFov = (fov * Math.PI) / 360;
  // Vertical half-extent visible at distance d is d*tan(halfFov); the
  // horizontal one is that times the aspect. Whichever is smaller binds.
  const shrink = Math.min(1, aspect);
  const distance = radius / (fillRatio * Math.tan(halfFov) * shrink);
  return {
    distance,
    minDistance: Math.max(0.5, radius * 0.32),
    maxDistance: distance * 3.5,
  };
}

/**
 * The camera's starting spot: `distance` away, lifted `elevation` degrees
 * above the model's waist, looking at it.
 *
 * A hovering three-quarter view rather than a straight-on elevation, which
 * is what the world map's orbiting camera gives you and the angle the
 * buildings were drawn to be seen from.
 */
export function orbitCameraPosition(
  distance: number,
  targetY: number,
  elevationDeg = 22,
): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  return [0, targetY + distance * Math.sin(el), distance * Math.cos(el)];
}

/** A grid that comfortably outsizes the model, rounded to whole units. */
export function gridSizeFor(size: Vec3Like): number {
  const footprint = Math.max(size.x, size.z);
  return Math.max(10, Math.ceil((footprint * 2.2) / 10) * 10);
}
