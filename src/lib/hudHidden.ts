// The Earth screen's "hide the HUD" switch (components/worldmap/HudToggle):
// while on, every button and the clock, Greece's sword (with its light and
// text), the merchants' markers and the planets' labels are gone, leaving
// just the globe and the sky -- for screenshots and store art. While it is
// on, a tap on the globe turns the loading animation on and off in the
// middle of the screen, looping for as long as it is on. Only for the
// current visit: a reload brings the HUD back.

import { useSyncExternalStore } from 'react';

let hidden = false;
let loadingMark = false;
const listeners = new Set<() => void>();

export function isHudHidden(): boolean {
  return hidden;
}

export function setHudHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  // The loading animation belongs to the hidden HUD: back with the HUD, it goes.
  if (!next) loadingMark = false;
  listeners.forEach((l) => l());
}

export function isHudLoadingMarkOn(): boolean {
  return loadingMark;
}

/** The globe was tapped: while the HUD is hidden, the loading animation
 *  turns on or off. Does nothing with the HUD showing. */
export function toggleHudLoadingMark(): void {
  if (!hidden) return;
  loadingMark = !loadingMark;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHudHidden(): boolean {
  return useSyncExternalStore(subscribe, isHudHidden, () => false);
}

export function useHudLoadingMark(): boolean {
  return useSyncExternalStore(subscribe, isHudLoadingMarkOn, () => false);
}
