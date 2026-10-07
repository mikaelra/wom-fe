// The Earth screen's "hide the HUD" switch (components/worldmap/HudToggle):
// while on, every button and the clock, Greece's sword (with its light and
// text), the merchants' markers and the planets' labels are gone, leaving
// just the globe and the sky -- for screenshots and store art. Only for the
// current visit: a reload brings the HUD back.

import { useSyncExternalStore } from 'react';

let hidden = false;
const listeners = new Set<() => void>();

export function isHudHidden(): boolean {
  return hidden;
}

export function setHudHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHudHidden(): boolean {
  return useSyncExternalStore(subscribe, isHudHidden, () => false);
}
