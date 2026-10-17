import { useSyncExternalStore } from 'react';

// How fast the Earth scene's camera turns round the Earth (Mikael,
// 2026-10-11): 1x, 2x, 4x or 8x its usual pace -- the 3D globe's auto-rotate
// and the text Earth's turntable (components/text/PixelOrrery.tsx). Only the
// camera: the sky's own time is untouched. A choice per device, live: the
// scene follows it the moment it changes.

export const CAMERA_SPEEDS = [1, 2, 4, 8] as const;
export type CameraSpeed = (typeof CAMERA_SPEEDS)[number];

const KEY = 'cameraSpeed';
const listeners = new Set<() => void>();

export function getCameraSpeed(): CameraSpeed {
  try {
    const v = Number(localStorage.getItem(KEY));
    return (CAMERA_SPEEDS as readonly number[]).includes(v) ? (v as CameraSpeed) : 1;
  } catch {
    return 1;
  }
}

export function setCameraSpeed(speed: CameraSpeed): void {
  try {
    localStorage.setItem(KEY, String(speed));
  } catch {
    // private mode: the choice lasts as long as the page
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The camera speed, following changes. */
export function useCameraSpeed(): CameraSpeed {
  return useSyncExternalStore(subscribe, getCameraSpeed, () => 1);
}
