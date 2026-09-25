'use client';

import { useState } from 'react';
import SpinningModelViewer from '@/components/SpinningModelViewer';
import { skinUrl } from '@/lib/frogSkins';
import { purchaseMerchantOffer, type MerchantOffer } from '@/lib/api';
import { ApiError } from '@/lib/http';

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
 * standing in for real prop art, with the actual merchant_v1.glb model
 * (public/models/merchant_v1.glb) floating above the crate via the same
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
          <p className="text-amber-100/60 text-[11px] mt-0.5">One trade, every full moon</p>
        </div>

        <div className="w-40 h-40 mx-auto mt-1">
          <SpinningModelViewer key="merchant_v1" url={skinUrl('merchant_v1')} targetSize={1.6} spinSpeed={0} />
        </div>

        {/* The desk -- a plain wooden crate, same placeholder-art note as
            the wall above. */}
        <div
          className="mx-6 -mt-2 rounded-md border border-amber-950/60 shadow-inner"
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
