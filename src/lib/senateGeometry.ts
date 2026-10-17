/**
 * The Senate's colonnade (docs/CITY_SCENE_PLAN.md §5.2, §9).
 *
 * Pure, so the one property that matters can be asserted: no two columns
 * occupy the same place. The building's middle was hollowed out to hold a
 * ranked match, which meant running the colonnade around the whole
 * perimeter instead of across the facade only -- and the obvious way to
 * write that (a loop per side) puts two columns on every corner. Duplicate
 * geometry is invisible in code and very visible on screen, as z-fighting
 * that flickers when the camera moves.
 */

export interface SenateColumns {
  /** Column centres in the building's own x/z, one per column. */
  positions: [number, number][];
  /** The clear span inside the colonnade -- what has to fit the players. */
  interior: { width: number; depth: number };
}

export function senateColumns(
  width: number,
  depth: number,
  columnRadius: number,
  frontCount: number,
  sideCount: number,
): SenateColumns {
  const halfW = (width - columnRadius * 4) / 2;
  const halfD = (depth - columnRadius * 4) / 2;
  const positions: [number, number][] = [];

  // Facade and back, corners included.
  for (let i = 0; i < frontCount; i++) {
    const x = (i / (frontCount - 1) - 0.5) * halfW * 2;
    positions.push([x, halfD]);
    positions.push([x, -halfD]);
  }
  // Sides, corners EXCLUDED -- the loop above already placed all four.
  for (let i = 1; i < sideCount - 1; i++) {
    const z = (i / (sideCount - 1) - 0.5) * halfD * 2;
    positions.push([halfW, z]);
    positions.push([-halfW, z]);
  }

  return {
    positions,
    // Clear of the columns themselves, which is the space a player can
    // actually stand in rather than the footprint on the ground.
    interior: {
      width: halfW * 2 - columnRadius * 2,
      depth: halfD * 2 - columnRadius * 2,
    },
  };
}
