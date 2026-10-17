// The Earth screen's "hide the HUD" switch (components/worldmap/HudToggle):
// while on, every button and the clock, Greece's sword (with its light and
// text), the merchants' markers and the planets' labels are gone, leaving
// just the globe and the sky -- for screenshots and store art. While it is
// on, a tap on the globe turns the loading animation on and off in the
// middle of the screen, looping for as long as it is on, half the size the
// Earth has on screen (reportHudMarkSize, from the sky, every frame) -- so
// it grows and shrinks with the zoom. Only for the current visit: a reload
// brings the HUD back.

import { useSyncExternalStore } from 'react';

let hidden = false;
let loadingMark = false;
let markPx = 0;
const markSizeListeners = new Set<(px: number) => void>();
const listeners = new Set<() => void>();

export function isHudHidden(): boolean {
  return hidden;
}

export function setHudHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  // The loading animation belongs to the hidden HUD: back with the HUD, it goes.
  if (!next) {
    loadingMark = false;
    markPx = 0;
  }
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
  markPx = 0;
  listeners.forEach((l) => l());
}

/** The no-HUD loading animation's size, CSS px: half the Earth's diameter
 *  on screen -- 0 until the sky first reports it. */
export function hudMarkSize(): number {
  return markPx;
}

/** From the sky, every frame while the loading animation is on. Listeners
 *  hear of changes of half a pixel or more, without a React render. */
export function reportHudMarkSize(px: number): void {
  if (Math.abs(px - markPx) < 0.5) return;
  markPx = px;
  markSizeListeners.forEach((l) => l(px));
}

export function subscribeHudMarkSize(listener: (px: number) => void): () => void {
  markSizeListeners.add(listener);
  return () => markSizeListeners.delete(listener);
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
