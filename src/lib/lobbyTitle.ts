import { BOSSFIGHT_COLOR, RANKED_COLOR } from '@/components/city/signpostColors';

// The 8-bit title over a text lobby (components/text/PixelTitle.tsx): what
// kind of match it is, in its colour (Mikael, 2026-10-11) -- the bossfight
// blue and ranked red of the city's signpost, a private lobby orange.

export const PRIVATE_LOBBY_COLOR = '#ff9f43';

export function lobbyTitle(state: {
  boss_fight?: boolean;
  ranked?: boolean;
  ai_ranked?: boolean;
} | null): { text: string; color: string } | null {
  if (!state) return null;
  if (state.boss_fight) return { text: 'Bossfight', color: BOSSFIGHT_COLOR };
  if (state.ai_ranked) return { text: 'Bot Ranked', color: RANKED_COLOR };
  if (state.ranked) return { text: 'Ranked', color: RANKED_COLOR };
  return { text: 'Private lobby', color: PRIVATE_LOBBY_COLOR };
}
