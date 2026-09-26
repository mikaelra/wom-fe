'use client';

import { useEffect, useRef, useState } from 'react';
import { revertMerchantTime, type MerchantOffer } from '@/lib/api';
import { getStoredAccountToken, ApiError } from '@/lib/http';
import { moonZodiacSign } from '@/lib/astrology';
import { useCountdown } from '@/lib/useCountdown';
import type { Relic } from '@/types/game';

type Props = {
  relic: Relic;
  /** The globe's current /merchant/offer poll, so this modal can tell
   *  whether someone else has already reverted time before the player
   *  tries to (docs/MERCHANT_PLAN.md §7) -- null while it hasn't loaded
   *  yet, in which case the action is simply not offered. */
  offer: MerchantOffer | null;
  onClose: () => void;
  /** Called once the sacrifice actually succeeds -- the caller reloads the
   *  inventory and shows its own success toast, same as every other
   *  inventory action (equip, trade-up, spin). */
  onReverted: () => void;
};

type Phase = 'preview' | 'confirming' | 'reverting' | 'error';

function formatExact(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Clicking the Stone of Vitality's model in the Inventory opens this --
 * mirrors ArtifactLedgerModal being what clicking your artifact opens.
 *
 * Two purposes in one popup: explain exactly what sacrificing a Stone will
 * do (the precise instant it reverts everyone's sky to, and what sign the
 * Moon was in then) before the player has to confirm, and -- if someone
 * has already reverted time -- block the action outright with a visible
 * reason and a countdown to when it becomes possible again, rather than
 * letting the player hit a 409 with no warning.
 */
export default function RevertTimeModal({ relic, offer, onClose, onReverted }: Props) {
  const [phase, setPhase] = useState<Phase>('preview');
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const blocked = offer?.reverted ?? false;
  const secondsUntilAvailable = useCountdown(blocked ? offer?.revert_expires_at : null);

  useEffect(() => {
    if (phase === 'confirming') confirmRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phase === 'confirming') setPhase('preview');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const handleConfirm = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase('reverting');
    const token = getStoredAccountToken();
    if (!token) {
      setError('Log in to do this.');
      setPhase('error');
      submittingRef.current = false;
      return;
    }
    revertMerchantTime(token)
      .then(() => {
        onReverted();
        onClose();
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : 'Failed to revert time.');
        setPhase('error');
      })
      .finally(() => {
        submittingRef.current = false;
      });
  };

  const revertToDate = relic.newest_copy_created_at;
  const sign = moonZodiacSign(new Date(revertToDate));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revert-time-heading"
        className="bg-gray-900 border border-purple-500/40 rounded-xl shadow-2xl max-w-sm w-full p-6 relative text-white text-center"
      >
        <h2 id="revert-time-heading" className="text-lg font-bold mb-1">
          Turn Back Time
        </h2>

        {blocked ? (
          <>
            <p className="text-red-400 text-sm font-semibold mt-3 mb-1">
              Someone has already turned back time.
            </p>
            <p className="text-white/60 text-sm mb-4">
              You can&rsquo;t use a Stone of Vitality this way while another revert is running.
            </p>
            {secondsUntilAvailable !== null && secondsUntilAvailable > 0 && (
              <p className="text-purple-300 font-mono text-2xl font-bold mb-4">
                {formatCountdown(secondsUntilAvailable)}
              </p>
            )}
            {/* Blocked from using it right now, but the player can still
                see what THIS Stone would have reverted time to -- the
                information doesn't depend on being able to act on it. */}
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 mb-4 text-left">
              <p className="text-white/50 text-[11px] uppercase tracking-wide mb-1">This Stone was bought</p>
              <p className="text-sm font-semibold">{formatExact(revertToDate)}</p>
              <p className="text-purple-300 text-xs mt-1">Full Moon in {sign}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
            >
              Close
            </button>
          </>
        ) : phase === 'error' ? (
          <>
            <p className="text-red-400 text-sm font-semibold mt-3 mb-4">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
            >
              Close
            </button>
          </>
        ) : phase === 'reverting' ? (
          <p className="text-purple-300 font-semibold mt-3 mb-2">Turning back time…</p>
        ) : phase === 'confirming' ? (
          <>
            <p className="text-white/80 text-sm mt-3 mb-4">
              This sacrifices 1 Stone of Vitality and cannot be undone. The Merchant will appear
              for everyone for 1 hour, and the sky will turn back to {formatExact(revertToDate)}.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2 rounded-lg bg-purple-700/80 text-purple-200 border border-purple-500 font-bold hover:bg-purple-600/80 transition-colors cursor-pointer"
              >
                Yes, turn back time
              </button>
              <button
                type="button"
                onClick={() => setPhase('preview')}
                className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-white/60 text-xs mb-4">
              Sacrifice this Stone of Vitality to bring the Merchant back for everyone for 1 hour.
            </p>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 mb-4 text-left">
              <p className="text-white/50 text-[11px] uppercase tracking-wide mb-1">This Stone was bought</p>
              <p className="text-sm font-semibold">{formatExact(revertToDate)}</p>
              <p className="text-purple-300 text-xs mt-1">Full Moon in {sign}</p>
            </div>
            <p className="text-white/60 text-xs mb-4">
              Using it will turn the sky back to that exact moment for everyone, for 1 hour.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setPhase('confirming')}
                className="px-5 py-2 rounded-lg bg-purple-700/80 text-purple-200 border border-purple-500 font-bold hover:bg-purple-600/80 transition-colors cursor-pointer"
              >
                Turn Back Time
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
