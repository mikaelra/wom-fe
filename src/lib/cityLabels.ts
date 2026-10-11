// The "N playing" / "N in market" signs over the city's buildings
// (components/city/BuildingSign.tsx), and over the text city's links
// (components/text/TextCity.tsx).

/** "3 playing" / "1 playing" / null when nobody's there. */
export function playingLabel(count: number): string | null {
  return count > 0 ? `${count} playing` : null;
}

/** "2 in game" / null when nobody is in a lobby or game. */
export function inGameLabel(count: number): string | null {
  return count > 0 ? `${count} in game` : null;
}

/** "3 searching" / null when nobody is queued. */
export function searchingLabel(count: number): string | null {
  return count > 0 ? `${count} searching` : null;
}

/** "2 in market" / "1 in market" / null when nobody's there. */
export function inMarketLabel(count: number): string | null {
  return count > 0 ? `${count} in market` : null;
}
