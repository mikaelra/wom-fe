'use client';

import { useEffect } from 'react';
import { setHudHidden, useHudHidden } from '@/lib/hudHidden';

// The small button under the user-menu button on the Earth screen that hides
// the HUD (lib/hudHidden.ts). While the HUD is hidden the button is invisible
// too, so it isn't in the picture -- it stays where it was and a tap there
// (or the H key) brings everything back.
//
// Positioned like SceneTopBar's right-hand group, one 54px chip plus a gap
// lower, so it sits right under the user-menu button. z-10, below the top
// bar's z-20, so the user menu's dropdown opens over it.
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
    <div
      className="absolute right-3 sm:right-[calc(50%-257px)] z-10"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem + 54px + 0.5rem)' }}
    >
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
