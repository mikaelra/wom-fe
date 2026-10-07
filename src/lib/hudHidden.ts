// The Earth screen's "hide the HUD" switch (components/worldmap/HudToggle):
// while on, every button and the clock, Greece's sword (with its light and
// text), the merchants' markers and the planets' labels are gone, leaving
// just the globe and the sky -- for screenshots and store art. While it is
// on, a tap on the globe turns the loading animation on and off in the
// Sun, looping for as long as it is on, half the size the Earth has on
// screen (reportHudMark, from the sky, every frame) -- so it follows the
// Sun across the screen and grows and shrinks with the zoom. Only for the current visit: a reload
// brings the HUD back.

import { useSyncExternalStore } from 'react';

let hidden = false;
let loadingMark = false;
/** Where and how big the no-HUD loading animation is drawn, CSS px: centred
 *  on the Sun on screen (x, y from the top left), half the Earth's diameter
 *  on screen across (size), and `visible` false with the Sun behind the
 *  camera. size 0 until the sky first reports. */
export type HudMarkPlacement = { x: number; y: number; size: number; visible: boolean };
const UNPLACED: HudMarkPlacement = { x: 0, y: 0, size: 0, visible: false };
let markPlacement: HudMarkPlacement = UNPLACED;
const markListeners = new Set<(p: HudMarkPlacement) => void>();
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
    markPlacement = UNPLACED;
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
  markPlacement = UNPLACED;
  listeners.forEach((l) => l());
}

export function hudMarkPlacement(): HudMarkPlacement {
  return markPlacement;
}

/** From the sky, every frame while the loading animation is on. Listeners
 *  hear of moves or size changes of half a pixel or more, and of the Sun
 *  going behind the camera or coming back, without a React render. */
export function reportHudMark(next: HudMarkPlacement): void {
  const p = markPlacement;
  if (
    p.visible === next.visible
    && Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 && Math.abs(p.size - next.size) < 0.5
  ) return;
  markPlacement = next;
  markListeners.forEach((l) => l(next));
}

export function subscribeHudMark(listener: (p: HudMarkPlacement) => void): () => void {
  markListeners.add(listener);
  return () => markListeners.delete(listener);
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
