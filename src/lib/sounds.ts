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

export function playCombatSound(event: string): void {
  const src = COMBAT_SOUNDS[event];
  if (!src) return;
  try {
    new Audio(src).play().catch(() => {});
  } catch {
    // ignore – audio blocked by browser policy
  }
}
