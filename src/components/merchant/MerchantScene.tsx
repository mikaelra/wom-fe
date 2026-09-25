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

// Table geometry: the top is tripled in thickness and raised to the middle
// of the Merchant's visible portrait (half of STAGE_H -- the clip wrapper
// below only ever shows his top half, so that's the "middle" a player
// actually sees), standing on two legs that reach back down to the stage's
// original floor line so it still reads as a table, not a slab floating
// over him. STONE_BOTTOM is derived from the same numbers so the Stone
// always lands exactly on the new top surface rather than being eyeballed
// separately each time this geometry changes.
const STAGE_H = MERCHANT_BOX_PX / 2;
const TABLE_THICKNESS = 36 * 3;
const TABLE_TOP_Y = STAGE_H / 2 - TABLE_THICKNESS / 2;
const TABLE_LEG_HEIGHT = STAGE_H - (TABLE_TOP_Y + TABLE_THICKNESS);
const STONE_BOTTOM = STAGE_H - TABLE_TOP_Y;

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

        {/* Stage: the Merchant enlarged (2.3x his original box) behind the
            table, the Stone resting on the table's raised top surface. The
            Merchant's canvas is clipped -- not just covered -- to exactly
            half his box by its own overflow-hidden wrapper (sized
            STAGE_H tall; the inner square inside it stays the full box
            height), so nothing of him ever bleeds past that line. The
            stage itself stays overflow-visible so the table/legs and the
            Stone (deliberately unclipped) render fully. Paint order below
            is load-bearing, not decoration -- no z-index anywhere: the
            Merchant paints first (furthest back), the table next (so it
            covers his middle like a real counter), the Stone last (so it
            reads as sitting on the table, not embedded in it). */}
        <div className="relative mt-2" style={{ height: STAGE_H }}>
          <div
            className="absolute right-2 top-0 overflow-hidden"
            style={{ width: MERCHANT_BOX_PX, maxWidth: '70%', height: STAGE_H }}
          >
            <div style={{ width: '100%', aspectRatio: '1 / 1' }}>
              <SpinningModelViewer key="merchant_v1" url={skinUrl('merchant_v1')} targetSize={1.6} spinSpeed={0} />
            </div>
          </div>

          {/* The table -- top tripled in thickness and raised to the
              middle of the Merchant, standing on two legs that reach back
              down to the stage's floor line. */}
          <div
            className="absolute rounded-md border border-amber-950/60 shadow-inner"
            style={{
              left: 24,
              right: 24,
              top: TABLE_TOP_Y,
              height: TABLE_THICKNESS,
              background: 'linear-gradient(180deg, #8a5a34 0%, #6b4224 60%, #52341c 100%)',
            }}
          />
          <div
            className="absolute rounded-sm"
            style={{ left: 34, top: TABLE_TOP_Y + TABLE_THICKNESS, width: 10, height: TABLE_LEG_HEIGHT, background: '#4a2e18' }}
          />
          <div
            className="absolute rounded-sm"
            style={{ right: 34, top: TABLE_TOP_Y + TABLE_THICKNESS, width: 10, height: TABLE_LEG_HEIGHT, background: '#4a2e18' }}
          />

          <div
            className="absolute"
            style={{ left: 96, bottom: STONE_BOTTOM, width: 40, height: 40 }}
          >
            <SpinningModelViewer
              key="stone_of_vitality_v1"
              url={relicModelUrl('Stone of Vitality')}
              targetSize={1.1}
              spinSpeed={0}
            />
          </div>
        </div>

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
