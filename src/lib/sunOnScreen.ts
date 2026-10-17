// Where the Sun is on screen right now, in CSS pixels, as the Low Definition
// Earth (components/text/PixelOrrery.tsx) last drew it -- so Blimkin can pop
// up over the Sun on the Earth screen (Mikael, 2026-10-17). Null when no sky
// is drawing it (the 3D Earth, another page, the Sun out of view).

export type ScreenPoint = { x: number; y: number };

let point: ScreenPoint | null = null;
const listeners = new Set<() => void>();

export function getSunOnScreen(): ScreenPoint | null {
  return point;
}

export function setSunOnScreen(next: ScreenPoint | null) {
  const same =
    next === point || (!!next && !!point && Math.round(next.x) === Math.round(point.x) && Math.round(next.y) === Math.round(point.y));
  if (same) return;
  point = next;
  listeners.forEach((fn) => fn());
}

export function subscribeSunOnScreen(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
