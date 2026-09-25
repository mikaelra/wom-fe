'use client';

import { useState } from 'react';
import SpinningModelViewer from '@/components/SpinningModelViewer';
import { skinUrl } from '@/lib/frogSkins';
import { relicModelUrl } from '@/components/RelicCoin';
import { purchaseMerchantOffer, type MerchantOffer } from '@/lib/api';
import { ApiError } from '@/lib/http';

// The merchant's box at its original 160px, scaled 2.3x then another 1.5x
// per Mikael's asks -- kept as a constant since the clip wrapper's height
// is derived from it (half of this), not eyeballed separately, so scaling
// this one number keeps the clip proportion (always exactly half) intact.
const MERCHANT_BOX_PX = 160 * 2.3 * 1.5;

type Props = {
  offer: MerchantOffer;
  token: string | null;
  onClose: () => void;
  /** Called after a successful trade so the caller can refresh the offer
   * (already_bought_this_period flips, the globe marker disappears). */
  onPurchased: () => void;
};

/**
 * The Merchant encounter's scene (docs/MERCHANT_PLAN.md). Deliberately
 * simple, per the doc: a CSS wooden-logs backdrop and a plain wooden crate
 * standing in for real prop art, with the real merchant_v1.glb and
 * stone_of_vitality_v1.glb models staged over it -- Merchant behind the
 * desk on the right, the Stone beside him on the left -- via the same
 * SpinningModelViewer used for relic/skin reveals elsewhere. Swap the
 * backdrop/crate for real geometry or a rendered background later without
 * touching the offer logic below.
 */
export default function MerchantScene({ offer, token, onClose, onPurchased }: Props) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bought, setBought] = useState(false);

  const handleBuy = async () => {
    if (!token) {
      setError('Log in to trade with the Merchant.');
      return;
    }
    setBuying(true);
    setError(null);
    try {
      await purchaseMerchantOffer(token);
      setBought(true);
      onPurchased();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBuying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div
        className="relative w-full max-w-sm rounded-xl border border-amber-800/60 shadow-2xl overflow-hidden text-white"
        style={{
          backgroundColor: '#5c3a21',
          // Horizontal bands standing in for a log-cabin wall -- a
          // placeholder, not final art (see this file's header comment).
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 6px, transparent 6px, transparent 34px),' +
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 34px)',
        }}
      >
        <div className="px-5 pt-5 text-center">
          <p className="text-amber-200/80 text-xs font-bold tracking-widest uppercase">{offer.merchant_name}</p>
          <p className="text-amber-100/60 text-[11px] mt-0.5">
            {offer.reverted ? 'Someone turned back time to bring him here' : 'One trade, every full moon'}
          </p>
        </div>

        {/* Stage: the Stone of Vitality to the left, the Merchant to the
            right and enlarged (2.3x his original box), staged over the
            desk below. The Merchant's canvas is clipped -- not just
            covered -- to exactly half his box by its own overflow-hidden
            wrapper (sized MERCHANT_BOX_PX/2 tall; the inner square inside
            it stays the full box height), so nothing of him ever bleeds
            past that line into the desk or the text below it regardless
            of the desk's own height. The stage itself stays overflow-
            visible so the Stone (unclipped, deliberately) can sit slightly
            past the stage's bottom edge without being cut off. */}
        <div className="relative mt-2" style={{ height: MERCHANT_BOX_PX / 2 }}>
          <div
            className="absolute"
            style={{ left: 96, bottom: -15, width: 40, height: 40 }}
          >
            <SpinningModelViewer
              key="stone_of_vitality_v1"
              url={relicModelUrl('Stone of Vitality')}
              targetSize={1.1}
              spinSpeed={0}
            />
          </div>
          <div
            className="absolute right-2 top-0 overflow-hidden"
            style={{ width: MERCHANT_BOX_PX, maxWidth: '70%', height: MERCHANT_BOX_PX / 2 }}
          >
            <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
              <SpinningModelViewer key="merchant_v1" url={skinUrl('merchant_v1')} targetSize={1.6} spinSpeed={0} />
            </div>
          </div>
        </div>

        {/* The desk -- a plain wooden crate, same placeholder-art note as
            the wall above. No z-index trick needed any more: the Merchant
            is hard-clipped above, and the Stone (positioned, so it paints
            over this static sibling by default) is meant to slightly
            overlap the desk's top edge. */}
        <div
          className="mx-6 rounded-md border border-amber-950/60 shadow-inner"
          style={{
            background: 'linear-gradient(180deg, #8a5a34 0%, #6b4224 60%, #52341c 100%)',
            height: 36,
          }}
        />

        <div className="bg-gray-950/90 px-5 py-5 text-center">
          {bought ? (
            <>
              <p className="text-green-400 font-bold text-lg mb-1">Deal struck.</p>
              <p className="text-amber-200/80 text-sm mb-4">{offer.item_name} is in your relics now.</p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <p className="text-amber-100 font-semibold mb-1">{offer.item_name}</p>
              <p className="text-white/60 text-sm mb-4">
                {offer.cost_hades_coins} Hades&rsquo; Coin{offer.cost_hades_coins === 1 ? '' : 's'}
              </p>
              {offer.already_bought_this_period && (
                <p className="text-white/50 text-xs mb-3">You&rsquo;ve already traded this moon.</p>
              )}
              {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buying || !offer.available}
                  className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {buying ? 'Trading…' : `Trade for ${offer.cost_hades_coins}`}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
