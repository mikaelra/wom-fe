import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { INITIAL_CAMERA_YAW } from '@/lib/sceneConstants';

const SENSITIVITY = 0.004;
// Prevent the camera arm from going below the table (LOBBY_LOOKAT.y).
// Pitch = 0 → initial position. Positive pitch tilts arm downward (camera lowers).
// At ~0.60 rad the arm becomes horizontal; beyond that it dips below the lookat.
const MAX_PITCH = 0.55;   // near-side floor cap (camera just above table level)
const MIN_PITCH = -2.50;  // far-side floor cap (camera just above table from over the top)

const ZOOM_SENSITIVITY = 0.001;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3.0;

/**
 * Returns a ref with { yaw, pitch, zoom } offsets.
 * - Drag to pan: yaw is unlimited (full 360° horizontal).
 * - Pitch is capped so the camera cannot go below the table surface.
 * - Scroll wheel adjusts zoom (arm-length multiplier, clamped to 0.4–3.0).
 * - Position is retained when the pointer is released (no snap-back).
 */
export function usePanOffset() {
  const { gl } = useThree();
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  const offset = useRef({ yaw: INITIAL_CAMERA_YAW, pitch: 0, zoom: 1 });

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
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      offset.current.zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, offset.current.zoom + e.deltaY * ZOOM_SENSITIVITY),
      );
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  return offset;
}
