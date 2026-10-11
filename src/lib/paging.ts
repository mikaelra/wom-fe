// Paging through a list of games (the My AI page's, the stats page's ranked
// Games): a page at a time, the newest first, each row numbered by when it
// was played -- the season's first game #1, the newest #n (Mikael,
// 2026-10-11).

export const GAMES_PER_PAGE = 10;

/** How many pages `total` rows make; at least one, so an empty list still
 *  reads "page 1 of 1". */
export function pageCount(total: number, perPage: number = GAMES_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The game number of the `index`th row on `page`, of `total` games
 *  listed newest first: the newest is `total`, the first ever 1. */
export function rowNumber(total: number, page: number, index: number, perPage: number = GAMES_PER_PAGE): number {
  return total - ((page - 1) * perPage + index);
}

/** When a game ended: the time alone today, the date as well before. */
export function formatEnded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (new Date().toDateString() === d.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
