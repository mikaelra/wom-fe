/**
 * Tiny singleton pub/sub, sibling to resourceFx.ts, signalling the boss HP
 * bar (rendered in the DOM overlay via FreshHtml, see PlayerAvatars.tsx)
 * from the 3D scene's sword-strike impact callback (LobbyScene.tsx). React
 * context does not cross the Canvas boundary, so a module-level bus is the
 * simplest reliable channel -- kept separate from resourceFx.ts since that
 * one is scoped to the *local player's own* HP card, and there is only ever
 * one boss per lobby, so a global bus is sufficient here too.
 */

export type BossHpFxEvent = { hp: number };

type Listener = (e: BossHpFxEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to boss-HP-reveal events. Returns an unsubscribe function. */
export function onBossHpFx(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Emit a boss-HP-reveal event to all subscribers. */
export function emitBossHpFx(e: BossHpFxEvent): void {
  listeners.forEach((fn) => fn(e));
}
