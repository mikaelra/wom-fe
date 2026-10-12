import { combatFromEvents, type GameEvent } from '@/lib/gameEvents';

// The attacks of a round as numbers by the players they landed on (Mikael,
// 2026-10-12) -- the text lobby's version of the 3D game's floating combat
// numbers (components/lobby/DamageNumberEffect, lib/combatAnimationPlan):
// a red "-X" for a hit, a blue "0" for a blocked one. From this player's
// own events: their attack, by its target (and a reflected one back on
// them), and every attack on them. Instakills have their own message and
// no number, as in 3D.

export interface Hit {
  text: string;
  color: 'red' | 'blue';
}

export function roundHits(events: GameEvent[] | null | undefined, playerName: string): Map<string, Hit[]> {
  const hits = new Map<string, Hit[]>();
  const add = (name: string, hit: Hit) => hits.set(name, [...(hits.get(name) ?? []), hit]);
  const combat = combatFromEvents(events);

  const out = combat.outgoing;
  if (out) {
    const instakill = out.outcome === 'instakill' || out.outcome === 'instakill_blocked';
    const blocked = out.outcome === 'blocked' || out.outcome === 'reflected' || out.outcome === 'instakill_blocked';
    if (!instakill) add(out.target, blocked ? { text: '0', color: 'blue' } : { text: `-${out.damage ?? 0}`, color: 'red' });
    if (out.outcome === 'reflected') add(playerName, { text: `-${out.reflectDamage ?? 0}`, color: 'red' });
  }
  for (const inc of combat.incoming) {
    if (inc.outcome === 'instakill' || inc.outcome === 'instakill_blocked') continue;
    const blocked = inc.outcome === 'blocked' || inc.outcome === 'reflected_back';
    add(playerName, blocked ? { text: '0', color: 'blue' } : { text: `-${inc.damage ?? 0}`, color: 'red' });
  }
  return hits;
}
