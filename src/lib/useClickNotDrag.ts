'use client';

import { useCallback, useRef } from 'react';

/**
 * Telling a click apart from a camera drag (docs/CITY_SCENE_PLAN.md §5.3).
 *
 * The city scene has to do two things at once that fight each other:
 * OrbitControls consumes pointer drags to look around the sky, and the
 * signpost arms and buildings need pointer clicks to start a fight. R3F
 * fires `onClick` on pointer-up no matter how far the pointer travelled in
 * between, so a player who begins a camera drag on top of the Temple and
 * happens to release still on top of it enters the bossfight they never asked
 * for. A misfire here is not cosmetic -- it drops you into a boss fight.
 *
 * The same latent bug exists on the world map's swords today, against that
 * scene's OrbitControls; this is deliberately shared rather than
 * city-specific so both can use it.
 */

/** Pointer travel beyond this (CSS px) reads as looking around, not clicking. */
export const DRAG_PX = 6;
/** A press held longer than this (ms) reads as deliberate, not a tap. */
export const HOLD_MS = 400;

export interface PointerSample {
  x: number;
  y: number;
  /** Milliseconds, from any monotonic-enough source. */
  t: number;
}

export interface ClickNotDragOptions {
  dragPx?: number;
  holdMs?: number;
}

/**
 * Did this press/release pair mean "activate"?
 *
 * Pure, so the thresholds can be tested without a renderer -- R3F scene
 * components are not unit-tested in this repo (see vitest.config.ts), which
 * is exactly why the decision lives here rather than inside a component.
 */
export function isClickNotDrag(
  down: PointerSample,
  up: PointerSample,
  { dragPx = DRAG_PX, holdMs = HOLD_MS }: ClickNotDragOptions = {},
): boolean {
  // Straight-line distance, not per-axis: a diagonal drag of 5px on each
  // axis is 7.1px of travel and should count as a drag, which a per-axis
  // check would wave through.
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  if (Math.hypot(dx, dy) > dragPx) return false;
  // A backwards or absurd timestamp (clock change, synthetic event) should
  // fail closed -- never activate -- rather than fire on a stale press.
  const held = up.t - down.t;
  if (!(held >= 0) || held > holdMs) return false;
  return true;
}

export interface ClickNotDragHandlers {
  onPointerDown: (e: { clientX: number; clientY: number }) => void;
  onPointerUp: (e: { clientX: number; clientY: number }) => void;
  onPointerLeave: () => void;
}

/**
 * Handlers to spread onto an R3F object that must respond to taps without
 * stealing the camera's drags. Use INSTEAD of `onClick`, not alongside it.
 */
export function useClickNotDrag(
  onActivate: () => void,
  options?: ClickNotDragOptions,
): ClickNotDragHandlers {
  const down = useRef<PointerSample | null>(null);
  const dragPx = options?.dragPx;
  const holdMs = options?.holdMs;

  const onPointerDown = useCallback((e: { clientX: number; clientY: number }) => {
    down.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, []);

  const onPointerUp = useCallback((e: { clientX: number; clientY: number }) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    if (isClickNotDrag(start, { x: e.clientX, y: e.clientY, t: Date.now() }, { dragPx, holdMs })) {
      onActivate();
    }
  }, [onActivate, dragPx, holdMs]);

  // A pointer that wanders off the object mid-press is a drag by definition.
  // Without this the press stays armed, and coming back over the object to
  // release would fire it.
  const onPointerLeave = useCallback(() => { down.current = null; }, []);

  return { onPointerDown, onPointerUp, onPointerLeave };
}
