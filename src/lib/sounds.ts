// Prevent resource sounds from interrupting background music on mobile (iOS/Android)
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  (navigator as any).audioSession.type = 'ambient';
}

const RESOURCE_SOUNDS: Record<string, string> = {
  gain_hp: '/sounds/resources/GainHP.wav',
  gain_coin: '/sounds/resources/GainGold.wav',
  gain_attack: '/sounds/resources/UpgradeWpn.wav',
};

export function playResourceSound(resource: string): void {
  const src = RESOURCE_SOUNDS[resource];
  if (!src) return;
  try {
    new Audio(src).play().catch(() => {});
  } catch {
    // ignore – audio blocked by browser policy
  }
}
