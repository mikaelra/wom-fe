'use client';

import { useEffect, useRef, useState } from 'react';
import { CAMERA_SPEEDS, setCameraSpeed, useCameraSpeed } from '@/lib/cameraSpeed';

// With the sound buttons on the Earth scene (Mikael, 2026-10-11): how fast
// the camera turns round the Earth (lib/cameraSpeed.ts). A round button
// showing the speed -- "1x" -- that opens an oval of 1x, 2x, 4x and 8x, as
// the graphics quality button does.

const chip =
  'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold leading-none cursor-pointer transition-colors';

export default function CameraSpeedButton() {
  const speed = useCameraSpeed();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Camera speed: ${speed}x`}
        aria-expanded={open}
        title={`Camera speed: ${speed}x`}
        className={`${chip} bg-black/30 hover:bg-black/50 backdrop-blur-sm border border-white/15 text-white/90`}
      >
        {speed}x
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="Camera speed"
          className="absolute top-0 left-full ml-2 flex items-center gap-1 p-1 rounded-full bg-black/80 border border-white/20 backdrop-blur-sm shadow-lg"
        >
          {CAMERA_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === speed}
              aria-label={`${s}x`}
              onClick={() => {
                setCameraSpeed(s);
                setOpen(false);
              }}
              className={`${chip} text-white ${s === speed ? 'bg-white/25 ring-1 ring-white/60' : 'hover:bg-white/10'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
