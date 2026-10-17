import type { Player } from '@/types/game';
import { PIXEL_ROBOT_URL, pixelSkinUrl } from '@/lib/pixelArt';
import { skinThumbnailUrl } from '@/lib/frogSkins';

// What stands beside a player's name in the text match (components/text/
// TextLobby.tsx): a player's skin as its 32x32 face (lib/pixelArt.ts), and
// every bot as an emoji (Mikael, 2026-10-10) -- the animal for a house bot, a
// ghost for a Lost Soul, the ogre for Hades (his own name's 👹) -- except a
// My AI agent, who is the robot frog's face (2026-10-17). Same order of checks
// as the 3D scene's model choice (components/lobby/PlayerAvatars.tsx).

const BOT_EMOJI: Record<string, string> = {
  TURTLE: '🐢',
  SHEEP: '🐑',
  WOLF: '🐺',
  OWL: '🦉',
};

export type PlayerMark = { emoji: string } | { url: string };

export function playerMark(p: Pick<Player, 'boss' | 'lost_soul' | 'bot' | 'bot_type' | 'skin'>): PlayerMark {
  if (p.boss) return { emoji: '👹' };
  if (p.lost_soul) return { emoji: '👻' };
  // A bot_type this doesn't know yet looks like the 3D scene's fallback.
  if (p.bot) return p.bot_type ? { emoji: BOT_EMOJI[p.bot_type] ?? BOT_EMOJI.TURTLE } : { url: PIXEL_ROBOT_URL };
  const skin = p.skin ?? 'frog_green_v1';
  return { url: pixelSkinUrl(skin) ?? skinThumbnailUrl(skin) };
}

/** A player's name as the text match shows it: Hades' and the Lost Soul's
 *  without the emoji their names end in ("Hades 👹", "Lost Soul 👻") --
 *  the mark in front stands for it (Mikael, 2026-10-10). Display only:
 *  anything sent to the server uses the name itself. */
export function shownPlayerName(p: Pick<Player, 'name' | 'boss' | 'lost_soul'>): string {
  if (!p.boss && !p.lost_soul) return p.name;
  return p.name.replace(/\s*(\p{Extended_Pictographic}️?)+$/u, '');
}
