'use client';

import { useEffect, useRef } from 'react';
import LoadingMark from '@/components/loading/LoadingMark';
import { subscribeSunScreenSize, sunScreenSize } from '@/lib/hudHidden';

/** Drawn this big and scaled down, so it stays sharp when zoomed in close. */
const DRAWN_PX = 512;

// The no-HUD loading animation (lib/hudHidden.ts): in the middle of the
// screen, where the loading screen shows it, at the Sun's size on screen.
// The size comes from the sky every frame and is set on the element
// directly, so following the zoom never re-renders anything. Hidden until
// the first size arrives.
export default function SunSizedLoadingMark() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apply = (px: number) => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `scale(${px / DRAWN_PX})`;
      el.style.opacity = px > 0 ? '1' : '0';
    };
    apply(sunScreenSize());
    return subscribeSunScreenSize(apply);
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none">
      <div ref={ref} data-testid="sun-sized-loading" style={{ opacity: 0, transformOrigin: 'center' }}>
        <LoadingMark size={DRAWN_PX} />
      </div>
    </div>
  );
}
