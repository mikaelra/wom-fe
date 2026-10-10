'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { drawSignpostScene, layoutBoard, skyBodies, type Board } from '@/lib/pixelSignpost';

// The text city's scene (lib/pixelSignpost.ts): the signpost in 8-bit under
// the sky over the city right now. The boards are drawn on the canvas; over
// each lies a plain button (what is tapped, and what a screen reader reads)
// and, above it, the white text saying what is going on there. A canvas a
// third of the screen's size, scaled up with sharp pixels; the sky moves on
// once a minute.

const PX = 3; // screen pixels per sky pixel
const MINUTE = 60_000;

export interface SignpostBoard extends Board {
  onClick: () => void;
  info?: ReactNode;
}

export default function PixelSignpost({
  boards,
  date,
  lat,
  lng,
}: {
  boards: SignpostBoard[];
  /** The sky's moment: now, or a timewarp's. */
  date?: Date;
  lat: number;
  lng: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const minute = setInterval(() => setTick((t) => t + 1), MINUTE);
    const resize = () => setSize({ w: Math.ceil(window.innerWidth / PX), h: Math.ceil(window.innerHeight / PX) });
    resize();
    window.addEventListener('resize', resize);
    return () => {
      clearInterval(minute);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const when = date?.getTime();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !size) return;
    canvas.width = size.w;
    canvas.height = size.h;
    ctx.imageSmoothingEnabled = false;
    drawSignpostScene(ctx, size.w, size.h, boards, skyBodies(when ? new Date(when) : new Date(), lat, lng));
  }, [size, boards, when, lat, lng, tick]);

  return (
    <>
      <canvas ref={ref} aria-hidden="true" className="fixed inset-0 w-full h-full" style={{ imageRendering: 'pixelated' }} />
      {size &&
        boards.map((board) => {
          const box = layoutBoard(board, size.w, size.h);
          const pct = (v: number, of: number) => `${(v / of) * 100}%`;
          return (
            <div key={`${board.row}-${board.side}`}>
              {board.info && (
                <div
                  className="absolute text-white text-xs font-semibold text-center whitespace-pre-line drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
                  style={{
                    left: pct(box.x + box.w / 2, size.w),
                    top: pct(box.y - 2, size.h),
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  {board.info}
                </div>
              )}
              <button
                type="button"
                onClick={board.onClick}
                aria-label={board.label}
                className="absolute bg-transparent border-none cursor-pointer"
                style={{
                  left: pct(box.x - 1, size.w),
                  top: pct(box.y - 1, size.h),
                  width: pct(box.w + 2, size.w),
                  height: pct(box.h + 2, size.h),
                }}
              />
            </div>
          );
        })}
    </>
  );
}
