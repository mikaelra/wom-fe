// Prevent combat sounds from interrupting background music on mobile (iOS/Android)
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  (navigator as Navigator & { audioSession: { type: string } }).audioSession.type = 'ambient';
}

const COMBAT_SOUNDS: Record<string, string> = {
  // My own outgoing attack lands unblocked (LobbyScene's onStrike), or a
  // reflected sword's second impact landing at the end of its bounce arc
  // (onDone) -- either side of a block+reflect hears this.
  attack_hit: '/sounds/resources/AttackHit.wav',
  // My own outgoing attack gets blocked (onStrike) -- heard by the attacker,
  // not the defender (see `attacked` below for what the defender hears).
  attack_blocked: '/sounds/resources/AttackBlocked.wav',
  // An incoming attack makes contact with the local player (onStrike),
  // regardless of whether it's about to hit or get blocked.
  attacked: '/sounds/resources/AttackIncoming.wav',
};

export function playCombatSound(event: string): void {
  const src = COMBAT_SOUNDS[event];
  if (!src) return;
  try {
    new Audio(src).play().catch(() => {});
  } catch {
    // ignore – audio blocked by browser policy
  }
}
