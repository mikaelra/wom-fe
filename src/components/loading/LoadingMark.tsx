'use client';

import { useEffect, useRef } from 'react';
import { LOADING_SPEC, echoesAt, poseAt, segmentsAt } from '@/lib/loadingAnimation';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

/**
 * The World of Mythos loading animation (src/lib/loadingAnimation.ts), drawn
 * on a canvas at the display's frame rate and true speed: the logo folds out
 * into a cube, spins with a fading trail, and folds back in, looping.
 *
 * Trail copies are added together ('lighter'), each at its own strength, the
 * same way the design renders them. With reduced motion it holds still on
 * the first frame.
 */
export default function LoadingMark({
  size = 96,
  color = LOADING_SPEC.color,
  label = 'Loading',
  className = '',
}: {
  /** CSS pixels, square. */
  size?: number;
  color?: string;
  /** Read out by screen readers. */
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
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
        for (const [x0, y0, x1, y1] of segmentsAt(LOADING_SPEC, progress, echo.spin)) {
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
  }, [size, color, reducedMotion]);

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
