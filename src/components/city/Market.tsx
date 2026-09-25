'use client';

import * as THREE from 'three';
import Senate from '@/components/city/Senate';

/**
 * The Market -- procedural placeholder (wom-be docs/MARKET_PLAN.md §3.2 /
 * §9, docs/CITY_SCENE_PLAN.md §9).
 *
 * It is the Senate with the roof taken off: the same stepped base,
 * colonnade and architrave ring, open to the sky. Asked for from
 * /modelling once the Senate's own shape was settled, and it is the right
 * shape for the building anyway -- an agora is a colonnade around an open
 * square, and the two buildings on the city's right hand now read as one
 * piece of architecture at two levels of completeness rather than as a
 * temple standing next to a market stall.
 *
 * What was here before: a stall-row built from primitives -- timber posts,
 * a cloth awning, a stone counter, crates. It went with this change rather
 * than being kept behind a flag; it was a placeholder of a different
 * building, not a variant of this one.
 *
 * Square in plan, like the Senate and the ranked arena: equal sides with
 * equal column counts, so no face reads as a denser colonnade than
 * another. The depth grew to meet the width rather than the width
 * shrinking to meet the depth, which is the same choice the arena made.
 *
 * `color` tints the stonework the same way the Senate is tinted on hover;
 * CityScene passes it and nothing else. The accent light stays green to
 * match MARKET_COLOR on the signpost's arm, the way the Senate's stays red
 * -- each building says from a distance what it sends you to.
 */

/** Matches the signpost's Market arm. */
const MARKET_GREEN = '#5fd88a';

export interface MarketProps {
  position?: [number, number, number];
  color?: THREE.ColorRepresentation;
  width?: number;
  depth?: number;
}

export default function Market({
  position = [0, 0, 0],
  color = '#D6D6D6',
  width = 7.5,
  depth = 7.5,
}: MarketProps) {
  return (
    <Senate
      position={position}
      color={color}
      width={width}
      depth={depth}
      roof={false}
      accentLight={MARKET_GREEN}
      // Shorter and lighter than the Senate's columns. With no dome on top
      // of them there is nothing for a tall colonnade to be carrying, and
      // the Market should not out-rank the building it stands opposite.
      columnHeight={3.4}
      columnRadius={0.26}
      stepHeight={0.3}
      columnCount={6}
      sideColumnCount={6}
    />
  );
}
