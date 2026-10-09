import type { Player } from '@/types/game';

// The small picture of a player's model shown beside their name in the text
// match (components/text/TextLobby.tsx): /skins/thumbnails/<key>.png, where
// the key is the model the 3D scene would show (components/lobby/
// PlayerAvatars.tsx), its file's base name -- a skin by its own name.

const BOT_THUMBNAILS: Record<string, string> = {
  TURTLE: 'turtlev01',
  SHEEP: 'sheepv01',
  WOLF: 'wolfv01',
  OWL: 'owlv01',
};

/** Which thumbnail stands for this player: in the 3D scene's order --
 *  the boss, a Lost Soul, a house bot by type (Turtle for one it doesn't
 *  know), a My AI agent (a bot with no type), else the skin worn. */
export function playerThumbnailKey(p: Pick<Player, 'boss' | 'lost_soul' | 'bot' | 'bot_type' | 'skin'>): string {
  if (p.boss) return 'hades_v4';
  if (p.lost_soul) return 'lost_soul_v2';
  if (p.bot) return p.bot_type ? (BOT_THUMBNAILS[p.bot_type] ?? BOT_THUMBNAILS.TURTLE) : 'frog_robot_v1';
  return p.skin ?? 'frog_green_v1';
}

export function playerThumbnailUrl(p: Parameters<typeof playerThumbnailKey>[0]): string {
  return `/skins/thumbnails/${playerThumbnailKey(p)}.png`;
}
