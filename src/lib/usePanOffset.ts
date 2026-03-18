import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

const MAX_ANGLE = Math.PI / 6; // 30 degrees
const SENSITIVITY = 0.004;     // radians per pixel
const SNAP_SPEED = 0.05;       // lerp factor per frame for snap-back

/**
 * Returns a ref with { yaw, pitch } offsets in radians.
 * - Drag to pan up to 30° in any direction.
 * - Releases slowly snap back to { yaw: 0, pitch: 0 }.
 */
export function usePanOffset() {
  const { gl } = useThree();
  const drag = useRef({ active: false, lastX: 0, lastY: 0 });
  const targetOffset = useRef({ yaw: 0, pitch: 0 });
  const currentOffset = useRef({ yaw: 0, pitch: 0 });

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
      targetOffset.current.yaw = Math.max(
        -MAX_ANGLE,
        Math.min(MAX_ANGLE, targetOffset.current.yaw - dx * SENSITIVITY),
      );
      targetOffset.current.pitch = Math.max(
        -MAX_ANGLE,
        Math.min(MAX_ANGLE, targetOffset.current.pitch - dy * SENSITIVITY),
      );
    };
    const onUp = () => {
      drag.current.active = false;
      targetOffset.current.yaw = 0;
      targetOffset.current.pitch = 0;
    };

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

  useFrame(() => {
    currentOffset.current.yaw +=
      (targetOffset.current.yaw - currentOffset.current.yaw) * SNAP_SPEED;
    currentOffset.current.pitch +=
      (targetOffset.current.pitch - currentOffset.current.pitch) * SNAP_SPEED;
  });

  return currentOffset;
}
