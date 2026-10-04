'use client';

import { useEffect, useRef, useState } from 'react';
import { LOADING_SPEC, echoesAt, pickLoadingColor, pickLoadingStart, poseAt, segmentsAt } from '@/lib/loadingAnimation';
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
 * Without a `color` it plays in one of the spec's colours (red, yellow,
 * blue), picked at random each time it mounts -- so each time loading
 * shows, since the overlay unmounts it in between. Its start (the logo's
 * center lines swinging out, or the bare hexagon folding them in) is
 * picked the same way, unless `startFoldedOut` is given: six in all.
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
  const [randomColor] = useState(() => pickLoadingColor(LOADING_SPEC));
  const [randomStart] = useState(() => pickLoadingStart(LOADING_SPEC));
  const color = colorProp ?? randomColor;
  const startFoldedOut = startProp ?? randomStart;
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const scale = canvas.width / 2 / LOADING_SPEC.extent;

    const draw = (t: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * LOADING_SPEC.lineRadius;
      ctx.strokeStyle = color;
      ctx.globalCompositeOperation = 'lighter';
      const { progress } = poseAt(LOADING_SPEC, t);
      for (const echo of echoesAt(LOADING_SPEC, t)) {
        ctx.globalAlpha = Math.min(1, echo.weight);
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of segmentsAt(LOADING_SPEC, progress, echo.spin, startFoldedOut)) {
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
  }, [size, color, startFoldedOut, reducedMotion]);

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
