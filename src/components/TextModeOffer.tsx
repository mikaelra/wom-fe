'use client';

import { useEffect, useState } from 'react';
import { setTextMode } from '@/lib/textMode';
import { OFFER_EVENT, dismissOffer, endedInACrash, shouldOffer } from '@/lib/textModeOffer';

/**
 * Offers text mode to a player whose device struggles with the 3D game
 * (lib/textModeOffer.ts): after a crash in a 3D scene, or a connection
 * that keeps dropping. Mounted once, in the root layout.
 */
export default function TextModeOffer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (endedInACrash() && shouldOffer()) setOpen(true);
    const offer = () => shouldOffer() && setOpen(true);
    window.addEventListener(OFFER_EVENT, offer);
    return () => window.removeEventListener(OFFER_EVENT, offer);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" aria-modal="true" role="dialog">
      <div className="bg-gray-900 border border-white/20 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4">
        <h2 className="text-xl font-bold mb-2">Trouble playing?</h2>
        <p className="text-sm text-white/80 mb-5 leading-relaxed">
          The game closed or lost its connection. Text mode plays without 3D graphics and runs on any device. You can
          switch back in Settings → Graphics.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setTextMode(true);
              window.location.reload();
            }}
            className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-100 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer"
          >
            Turn on text mode
          </button>
          <button
            type="button"
            onClick={() => {
              dismissOffer();
              setOpen(false);
            }}
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 font-bold hover:bg-white/20 transition-colors cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
