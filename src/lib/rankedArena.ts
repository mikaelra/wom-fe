import { senateColumns } from '@/lib/senateGeometry';
import { LOBBY_FLOOR_Y } from '@/lib/sceneConstants';

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

/**
 * Square, as of the /modelling pass: 8 columns on all four sides.
 *
 * It was 28 x 22 with 8 columns on the long faces and 6 on the short ones.
 * Note that simply raising sideColumnCount to 8 would NOT have made the
 * sides equal -- it would have put 8 columns along a 22-unit face and 8
 * along a 28-unit one, so the short sides would read as a tighter, denser
 * colonnade than the long ones. Equal sides means an equal FOOTPRINT, so
 * the depth grew to meet the width instead.
 *
 * Grown rather than shrunk, deliberately. Every constraint in this module
 * is a floor -- the camera must stay inside the colonnade, the players must
 * fit within it -- so 28 x 28 clears them all by more than 28 x 22 did,
 * while 22 x 22 would have eaten into the margin the tests below hold.
 */
export const ARENA = {
  width: 28,
  depth: 28,
  columnHeight: 7,
  columnRadius: 0.55,
  stepHeight: 0.4,
  columnCount: 8,
  sideColumnCount: 8,
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
 * origin sits a base's height below the floor it is carrying.
 *
 * That floor is LOBBY_FLOOR_Y, not PLAYER_Y. This used to read PLAYER_Y and
 * it was wrong by the 0.78 between them, which is not a rounding error but
 * two visible faults: a player model's origin is at its MIDDLE, so a floor
 * built up to PLAYER_Y came through the players at the waist; and the well
 * stands at TABLE_POSITION's 2.55 and is 0.36 tall, so a base whose solid
 * steps filled 2.0 to 3.2 swallowed it whole and the ranked lobby had no
 * visible well at all. Both are the same number in the same place.
 *
 * The consequence to know about: with the floor at 2.42 and a 1.2 base
 * under it, the bottom 0.78 of the steps is below the sea plane at y = 2.
 * That is the temple's own arrangement -- its slabs run far deeper -- and it
 * is what standing a building in water looks like. The alternative was
 * 0.14-high steps on a 28-unit building, which reads as a kerb.
 */
export function arenaPosition(): [number, number, number] {
  return [0, LOBBY_FLOOR_Y - ARENA.stepHeight * 3, 0];
}
