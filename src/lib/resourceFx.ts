/**
 * Tiny singleton pub/sub for signalling the 2D resource cards (rendered in the
 * DOM overlay) from the 3D scene (rendered inside the R3F <Canvas>). React
 * context does not cross the Canvas boundary, so a module-level bus is the
 * simplest reliable channel. There is only ever one local player per tab, so a
 * global bus is sufficient.
 */

export type HpFxEvent =
  | { kind: 'hit'; damage: number } // shake the HP card and drop it by `damage`
  | { kind: 'kill' }                // shake the HP card and drop it to 0 (instakill)
  | { kind: 'block' };              // pulse the HP card border blue, no number change

type Listener = (e: HpFxEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to HP feedback events. Returns an unsubscribe function. */
export function onHpFx(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Emit an HP feedback event to all subscribers. */
export function emitHpFx(e: HpFxEvent): void {
  listeners.forEach((fn) => fn(e));
}
