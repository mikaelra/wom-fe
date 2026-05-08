import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';

const SENSITIVITY = 0.004;
// Prevent the camera arm from going below the table (LOBBY_LOOKAT.y).
// Pitch = 0 → initial position. Positive pitch tilts arm downward (camera lowers).
// At ~0.60 rad the arm becomes horizontal; beyond that it dips below the lookat.
const MAX_PITCH = 0.55;   // near-side floor cap (camera just above table level)
const MIN_PITCH = -2.50;  // far-side floor cap (camera just above table from over the top)

/**
 * Returns a ref with { yaw, pitch } offsets in radians.
 * - Drag to pan: yaw is unlimited (full 360° horizontal).
 * - Pitch is capped so the camera cannot go below the table surface.
 * - Position is retained when the pointer is released (no snap-back).
 */
export function usePanOffset() {
  const { gl } = useThree();
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  const offset = useRef({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const el = gl.domElement;

    const onDown = (e: PointerEvent) => {
      drag.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.lastX;
      const dy = e.clientY - drag.current.lastY;
      drag.current.lastX = e.clientX;
      drag.current.lastY = e.clientY;
      offset.current.yaw -= dx * SENSITIVITY;
      offset.current.pitch = Math.max(
        MIN_PITCH,
        Math.min(MAX_PITCH, offset.current.pitch - dy * SENSITIVITY),
      );
    };
    const onUp = () => { drag.current.active = false; };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  }, [gl]);

  return offset;
}
