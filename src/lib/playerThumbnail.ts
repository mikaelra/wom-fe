import type { Player } from '@/types/game';

// What stands beside a player's name in the text match (components/text/
// TextLobby.tsx), the size of an emoji: a player's skin as its thumbnail
// (/skins/thumbnails/<skin>.png), and every bot as an emoji (Mikael,
// 2026-10-10) -- the animal for a house bot, a ghost for a Lost Soul, the
// devil for Hades, a robot for a My AI agent. Same order of checks as the
// 3D scene's model choice (components/lobby/PlayerAvatars.tsx).

const BOT_EMOJI: Record<string, string> = {
  TURTLE: '🐢',
  SHEEP: '🐑',
  WOLF: '🐺',
  OWL: '🦉',
};

export type PlayerMark = { emoji: string } | { url: string };

export function playerMark(p: Pick<Player, 'boss' | 'lost_soul' | 'bot' | 'bot_type' | 'skin'>): PlayerMark {
  if (p.boss) return { emoji: '👿' };
  if (p.lost_soul) return { emoji: '👻' };
  // A bot_type this doesn't know yet looks like the 3D scene's fallback.
  if (p.bot) return { emoji: p.bot_type ? (BOT_EMOJI[p.bot_type] ?? BOT_EMOJI.TURTLE) : '🤖' };
  return { url: `/skins/thumbnails/${p.skin ?? 'frog_green_v1'}.png` };
}
