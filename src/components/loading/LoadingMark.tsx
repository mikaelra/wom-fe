'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LOADING_SPEC,
  echoColors,
  echoesAt,
  loopDuration,
  pickLoadingVariant,
  pickNextLoadingVariant,
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
 * Each time it mounts, and again at the end of every whole loop, it picks a
 * version at random by the spec's mix (the golden mean, newest first) --
 * at the end of a loop always a different one from the loop just shown: v14 (the center lines alone
 * unfolding into the cube and back), v13 (the wheel, the hue once round the
 * colour wheel per loop), v12 (the rainbow, red with the spin running round
 * the rainbow), v11 or v10 (in red, yellow or blue, from the bare hexagon or
 * the logo's center lines). A `color` plays
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
  const [firstVariant] = useState(() => pickLoadingVariant(LOADING_SPEC));
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    // One loop's figure: a given colour plays the single-colour figure, and
    // a given colour or start stays fixed across loops.
    const figure = (variant: typeof firstVariant) => {
      const kind = colorProp === undefined ? variant.kind : 'v10';
      const spec = specFor(LOADING_SPEC, kind);
      return {
        spec,
        loop: loopDuration(spec),
        color: colorProp ?? variant.color,
        startFoldedOut: startProp ?? variant.startFoldedOut,
        colorAt: { v14: v14ColorAt, wheel: wheelColorAt, rainbow: rainbowColorAt, v11: undefined, v10: undefined }[kind],
      };
    };
    let variant = firstVariant;
    let shown = figure(variant);

    const draw = (t: number) => {
      const { spec, color, startFoldedOut, colorAt } = shown;
      const scale = canvas.width / 2 / spec.extent;
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
    let loopStart = performance.now();
    const tick = (now: number) => {
      let t = (now - loopStart) / 1000;
      if (t >= shown.loop) {
        // A whole loop played: the next one is a different version.
        loopStart += shown.loop * 1000;
        t -= shown.loop;
        variant = pickNextLoadingVariant(LOADING_SPEC, variant);
        shown = figure(variant);
      }
      draw(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [size, colorProp, startProp, firstVariant, reducedMotion]);

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
