import { senateColumns } from '@/lib/senateGeometry';
import { PLAYER_Y } from '@/lib/sceneConstants';

/**
 * The Senate, sized to hold a ranked match (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * The building you enter in the city is the building you play in: ranked
 * matches are staged inside the same Senate that stands on the city's right
 * hand, rather than under the temple every other lobby uses.
 *
 * These are dimensions rather than a scale factor, and that is the whole
 * point of the module. The lobby camera pulls back as players join --
 * 3.7 to 4.9 units by aspect ratio, times a growth factor that reaches 1.45
 * at the 24-player maximum -- and the arena has to be deep enough that the
 * camera stays INSIDE the colonnade at every one of those combinations. A column drifting between the camera and the
 * table as a lobby fills up is the failure this is guarding against, and it
 * would only appear at particular player counts on particular screens.
 * Scaling the city's Senate to that depth instead would take the step height
 * and column thickness with it and read as a toy.
 */

export const ARENA = {
  width: 28,
  depth: 22,
  columnHeight: 7,
  columnRadius: 0.55,
  stepHeight: 0.4,
  columnCount: 8,
  sideColumnCount: 6,
} as const;

/** Half the clear span inside the colonnade, along each axis. */
export function arenaInteriorHalfExtents(): { x: number; z: number } {
  const { interior } = senateColumns(
    ARENA.width, ARENA.depth, ARENA.columnRadius, ARENA.columnCount, ARENA.sideColumnCount,
  );
  return { x: interior.width / 2, z: interior.depth / 2 };
}

/**
 * Where to stand the building so its floor is the floor the players are on.
 *
 * The stepped base is built upward from the component's own origin, so the
 * origin has to sit a base's height below PLAYER_Y. With ARENA's step height
 * that lands the bottom step exactly on the lobby's waterline, which is why
 * that number is 0.4 and not something rounder.
 */
export function arenaPosition(): [number, number, number] {
  return [0, PLAYER_Y - ARENA.stepHeight * 3, 0];
}
