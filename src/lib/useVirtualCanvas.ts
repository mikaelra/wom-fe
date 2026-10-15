import { useSyncExternalStore } from 'react';

// A landscape window with room for the PC layout's columns but under a PC's
// 1024px: a Steam window on a scaled display (a Surface Go is 900x600 CSS px).
// The text lobby lays itself out as on a PC, on a canvas CANVAS_WIDTH wide,
// scaled down to fit -- what the web page looks like in a big window zoomed
// out (Mikael, 2026-10-15). A phone on its side is under 500px tall, so it
// keeps its one column.
export const CANVAS_WIDTH = 1200;
export const CANVAS_MIN_WIDTH = 768;
export const CANVAS_MIN_HEIGHT = 500;
const PC_MIN_WIDTH = 1024;

export interface VirtualCanvas {
  /** Canvas size in CSS px, laid out as a PC window. */
  width: number;
  height: number;
  /** How far it is scaled down to fill the window. */
  scale: number;
}

/** The canvas for a `w` x `h` window, or null when the window needs none. */
export function virtualCanvas(w: number, h: number): VirtualCanvas | null {
  if (!(w >= CANVAS_MIN_WIDTH && w < PC_MIN_WIDTH && h >= CANVAS_MIN_HEIGHT && w > h)) return null;
  const scale = w / CANVAS_WIDTH;
  return { width: CANVAS_WIDTH, height: h / scale, scale };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

// A string, so the snapshot is stable between resizes.
const size = () => `${window.innerWidth}x${window.innerHeight}`;

/** The canvas for the window right now; follows it as the window resizes. */
export function useVirtualCanvas(): VirtualCanvas | null {
  const [w, h] = useSyncExternalStore(subscribe, size, () => '0x0').split('x').map(Number);
  return virtualCanvas(w, h);
}
