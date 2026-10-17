'use client';

import { useEffect, useRef } from 'react';
import SkinPreview from '@/components/SkinPreview';
import { skinLabel } from '@/lib/frogSkins';

/**
 * A skin shown bigger (Mikael, 2026-10-17): opened by clicking its picture in
 * the inventory. The picture is the same SkinPreview the equipped skin has --
 * the spinning model in SD and HD, the 32x32 face on its aura in Low
 * Definition -- and Trade up lives here, not on the card.
 */
export default function SkinDetailModal({
  skin,
  count,
  canTradeUp,
  onTradeUp,
  onClose,
}: {
  skin: string;
  count: number;
  /** Whether this skin has a trade-up rule (docs/TRADE_UP_PLAN.md). */
  canTradeUp: boolean;
  onTradeUp: () => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skin-detail-heading"
        className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 relative text-white text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors cursor-pointer leading-none"
        >
          ✕
        </button>
        <h2 id="skin-detail-heading" className="text-lg font-semibold capitalize">
          {skinLabel(skin)}
        </h2>
        {count > 1 && <p className="text-xs text-white/50 mt-0.5">×{count}</p>}
        <div className="w-64 h-64 max-w-full mx-auto my-4">
          <SkinPreview skin={skin} targetSize={1.8} spinSpeed={0.6} />
        </div>
        {canTradeUp && (
          <button
            type="button"
            onClick={onTradeUp}
            className="text-sm px-4 py-1.5 rounded-md bg-amber-700/80 text-amber-200 border border-amber-600 hover:bg-amber-600/80 transition-colors cursor-pointer"
          >
            Trade up
          </button>
        )}
      </div>
    </div>
  );
}
