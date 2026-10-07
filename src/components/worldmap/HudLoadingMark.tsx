'use client';

import { useEffect, useRef } from 'react';
import LoadingMark from '@/components/loading/LoadingMark';
import { hudMarkPlacement, subscribeHudMark, type HudMarkPlacement } from '@/lib/hudHidden';

/** Drawn this big and scaled down, so it stays sharp when zoomed in close. */
const DRAWN_PX = 512;

// The no-HUD loading animation (lib/hudHidden.ts): over the Sun, half the
// Earth's size on screen. Where and how big come from the sky every frame
// and are set on the element directly, so following the Sun and the zoom
// never re-renders anything. Hidden until the first report, and while the
// Sun is behind the camera.
export default function HudLoadingMark() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = ({ x, y, size, visible }: HudMarkPlacement) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translate(${x - DRAWN_PX / 2}px, ${y - DRAWN_PX / 2}px) scale(${size / DRAWN_PX})`;
      el.style.opacity = visible && size > 0 ? '1' : '0';
    };
    apply(hudMarkPlacement());
    return subscribeHudMark(apply);
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] overflow-hidden pointer-events-none">
      <div
        ref={ref}
        data-testid="hud-loading-mark"
        className="absolute left-0 top-0"
        style={{ opacity: 0, transformOrigin: 'center', width: DRAWN_PX, height: DRAWN_PX }}
      >
        <LoadingMark size={DRAWN_PX} />
      </div>
    </div>
  );
}
