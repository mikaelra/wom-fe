// The "N playing" / "N in market" signs over the city's buildings
// (components/city/BuildingSign.tsx), and over the text city's links
// (components/text/TextCity.tsx).

/** "3 playing" / "1 playing" / null when nobody's there. */
export function playingLabel(count: number): string | null {
  return count > 0 ? `${count} playing` : null;
}

/** "2 in market" / "1 in market" / null when nobody's there. */
export function inMarketLabel(count: number): string | null {
  return count > 0 ? `${count} in market` : null;
}
