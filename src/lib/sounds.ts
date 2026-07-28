// Prevent combat sounds from interrupting background music on mobile (iOS/Android)
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  (navigator as Navigator & { audioSession: { type: string } }).audioSession.type = 'ambient';
}

const COMBAT_SOUNDS: Record<string, string> = {
  attack_hit: '/sounds/resources/GainHP.wav',
  attack_blocked: '/sounds/resources/GainGold.wav',
  attacked: '/sounds/resources/UpgradeWpn.wav',
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
