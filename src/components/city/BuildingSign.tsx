'use client';

import { FreshHtml } from '@/components/hud/FreshHtml';

/**
 * Floating text over a city building (docs/CITY_SCENE_PLAN.md).
 *
 * Two independent lines, either optional:
 *   * `name` -- an always-on label naming the building. The Market gets one
 *     ("MARKET", green) because it stands further back than the temple and
 *     arena and its arm-colour pairing alone doesn't carry that far.
 *   * `occupancy` -- "3 playing" / "2 in market", shown only when someone
 *     is actually there. Fed from the live counts (wom-be `city_presence`).
 *
 * Same FreshHtml + distanceFactor arrangement the signpost arms use, so all
 * the scene's floating text sits at one on-screen size regardless of how
 * far the building is.
 */
export default function BuildingSign({
  position,
  distanceFactor,
  name,
  nameColor = '#ffffff',
  occupancy,
}: {
  position: [number, number, number];
  distanceFactor: number;
  name?: string;
  nameColor?: string;
  /** The "N playing" / "N in market" line. Falsy (0 people, or no string)
   *  hides it. */
  occupancy?: string | null;
}) {
  if (!name && !occupancy) return null;

  return (
    <FreshHtml
      position={position}
      center
      distanceFactor={distanceFactor}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
        {name && (
          <div
            style={{
              color: nameColor,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: '0.08em',
              WebkitTextStroke: '1px rgba(0,0,0,0.55)',
              textShadow: '0 0 10px rgba(0,0,0,0.7)',
            }}
          >
            {name}
          </div>
        )}
        {occupancy && (
          <div
            style={{
              color: '#fff',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '0.03em',
              textShadow: '0 0 8px rgba(0,0,0,0.85)',
            }}
          >
            {occupancy}
          </div>
        )}
      </div>
    </FreshHtml>
  );
}

/** "3 playing" / "1 playing" / null when nobody's there. */
export function playingLabel(count: number): string | null {
  return count > 0 ? `${count} playing` : null;
}

/** "2 in market" / "1 in market" / null when nobody's there. */
export function inMarketLabel(count: number): string | null {
  return count > 0 ? `${count} in market` : null;
}
