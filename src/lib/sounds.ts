import { isSfxEnabled } from './soundSettings';

// Prevent combat sounds from interrupting background music on mobile (iOS/Android)
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  (navigator as Navigator & { audioSession: { type: string } }).audioSession.type = 'ambient';
}

const COMBAT_SOUNDS: Record<string, string> = {
  // My own outgoing attack lands unblocked (LobbyScene's onStrike), or a
  // reflected sword's second impact landing at the end of its bounce arc
  // (onDone) -- either side of a block+reflect hears this.
  attack_hit: '/sounds/resources/AttackHit.wav',
  // A block happens (onStrike) -- heard by the attacker when their own
  // outgoing attack gets blocked, AND by the defender when their own Defend
  // successfully blocks an incoming attack (see `attacked` below for what
  // the defender hears instead when it isn't blocked).
  attack_blocked: '/sounds/resources/AttackBlocked.wav',
  // An incoming attack actually lands on the local player, i.e. their
  // Defend failed to block it (onStrike) -- see `attack_blocked` for what
  // they hear instead when it's successfully blocked.
  attacked: '/sounds/resources/AttackIncoming.wav',
};

function play(src: string): void {
  if (!isSfxEnabled()) return;
  try {
    new Audio(src).play().catch(() => {});
  } catch {
    // ignore – audio blocked by browser policy
  }
}

export function playCombatSound(event: string): void {
  const src = COMBAT_SOUNDS[event];
  if (src) play(src);
}

// gain_hp/gain_coin/gain_attack: the player's own resource choice landing
// (ResourceGainEffect's onDone), a well-won reward model landing (health/
// gold/sword -- WellRewardEffect's onLand), or a kill's victim-coins landing
// (also WellRewardEffect's onLand, type 'steal' -- reuses the coin sound,
// same model). Deliberately one call per model, not per round: a multi-unit
// grant (e.g. a "2_hp" Well reward, or looting several coins off a kill)
// mounts one effect instance per unit already (see combatAnimationPlan.ts's
// buildWellRewardEvents/scheduleKillLoot), so calling this from each
// instance's own onLand naturally plays the sound once per model, in step
// with each one actually landing -- not one sound for the whole batch.
export type ResourceSound = 'gain_hp' | 'gain_coin' | 'gain_attack';

const RESOURCE_SOUNDS: Record<ResourceSound, string> = {
  gain_hp:     '/sounds/resources/GetHp.wav',
  gain_coin:   '/sounds/resources/GetCoin.wav',
  gain_attack: '/sounds/resources/GetAtk.wav',
};

export function playResourceSound(resource: ResourceSound): void {
  play(RESOURCE_SOUNDS[resource]);
}
