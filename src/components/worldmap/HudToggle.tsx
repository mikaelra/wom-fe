'use client';

import { useEffect } from 'react';
import { setHudHidden, useHudHidden } from '@/lib/hudHidden';
import GraphicsQualityButton from '@/components/hud/GraphicsQualityButton';

// The small button under the user-menu button on the Earth and city screens
// (3D and text alike) that hides
// the HUD (lib/hudHidden.ts). While the HUD is hidden the button is invisible
// too, so it isn't in the picture -- it stays where it was and a tap there
// (or the H key) brings everything back.
//
// Positioned like SceneTopBar's right-hand group, one 54px chip plus a gap
// lower, so it sits right under the user-menu button. z-10, below the top
// bar's z-20, so the user menu's dropdown opens over it. The graphics
// quality button (GraphicsQualityButton) sits to its left, and hides with
// the HUD.
// Under the top bar's user-menu button.
// Under the user pill (SceneTopBar: 0.5rem down, 54px = 3.375rem tall, in rem
// so it moves with the UI scale, lib/uiScale.ts) -- on an Apple Watch-sized
// window under the pill drawn at 80% there.
const CORNER_CLASS =
  'absolute right-3 sm:right-[calc(50%-16.0625rem)] z-10 top-[calc(env(safe-area-inset-top)+4.375rem)] compact:top-[calc(env(safe-area-inset-top)+3.45rem)] compact:scale-[0.8] compact:origin-top-right';

export default function HudToggle() {
  const hidden = useHudHidden();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'h' || e.key === 'H') setHudHidden(!hidden);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden]);

  // Back to the HUD when leaving the Earth screen.
  useEffect(() => () => setHudHidden(false), []);

  return (
    <div className={`${CORNER_CLASS} flex items-start gap-2`}>
      <GraphicsQualityButton hidden={hidden} />
      <button
        type="button"
        onClick={() => setHudHidden(!hidden)}
        aria-label={hidden ? 'Show HUD' : 'Hide HUD'}
        aria-pressed={hidden}
        title={hidden ? 'Show HUD (H)' : 'Hide HUD (H)'}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-base cursor-pointer transition-opacity ${
          hidden ? 'opacity-0' : 'bg-black/50 border border-white/20 hover:bg-black/70'
        }`}
      >
        👁
      </button>
    </div>
  );
}
