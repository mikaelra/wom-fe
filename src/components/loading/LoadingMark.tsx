'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LOADING_SPEC,
  echoColors,
  echoesAt,
  pickLoadingVariant,
  poseAt,
  rainbowColorAt,
  segmentsAt,
  specFor,
  v14ColorAt,
  wheelColorAt,
} from '@/lib/loadingAnimation';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

/**
 * The World of Mythos loading animation (src/lib/loadingAnimation.ts), drawn
 * on a canvas at the display's frame rate and true speed: the logo folds out
 * into a cube, spins with a fading trail, and folds back in, looping.
 *
 * Trail copies are added together ('lighter'), each at its own strength, the
 * same way the design renders them. With reduced motion it holds still on
 * the first frame.
 *
 * Each time it mounts -- so each time loading shows, since the overlay
 * unmounts it in between -- it picks a variant at random by the spec's
 * mix: the wheel (v13, the hue once round the colour wheel per loop), the
 * rainbow (v12, red with the spin running round the rainbow) or one of the
 * spec's colours (red, yellow, blue), or v14 (14a then 14b, the center
 * lines alone unfolding into the cube and back); and either start (the logo's center
 * lines swinging out, or the bare hexagon folding them in). A `color` plays
 * that colour alone; `startFoldedOut` fixes the start.
 */
export default function LoadingMark({
  size = 96,
  color: colorProp,
  startFoldedOut: startProp,
  label = 'Loading',
  className = '',
}: {
  /** CSS pixels, square. */
  size?: number;
  color?: string;
  startFoldedOut?: boolean;
  /** Read out by screen readers. */
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [variant] = useState(() => pickLoadingVariant(LOADING_SPEC));
  const kind = colorProp === undefined ? variant.kind : 'classic';
  const color = colorProp ?? variant.color;
  const startFoldedOut = startProp ?? variant.startFoldedOut;
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const spec = specFor(LOADING_SPEC, kind);
    const colorAt = { wheel: wheelColorAt, rainbow: rainbowColorAt, v14: v14ColorAt, classic: undefined }[kind];
    const scale = canvas.width / 2 / spec.extent;

    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * spec.lineRadius;
      ctx.globalCompositeOperation = 'lighter';
      const { progress } = poseAt(spec, t);
      const echoes = echoesAt(spec, t);
      const colors = colorAt ? echoColors(spec, t, echoes, colorAt) : echoes.map(() => color);
      for (const [i, echo] of echoes.entries()) {
        ctx.strokeStyle = colors[i];
        ctx.globalAlpha = Math.min(1, echo.weight);
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of segmentsAt(spec, progress, echo.spin, startFoldedOut)) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
      }
    };

    if (reducedMotion) {
      draw(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      draw((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [size, color, kind, startFoldedOut, reducedMotion]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={className}
    />
  );
}
