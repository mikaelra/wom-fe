'use client';

import { useState } from 'react';
import { acceptMarketTerms } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { RMT_DISCLAIMER_TEXT } from '@/components/market/RmtDisclaimerBanner';

/**
 * The one-time acknowledgment gate (wom-be docs/MARKET_PLAN.md §1.1a /
 * §8.3).
 *
 * The first time a player tries to create a listing or accept one, this
 * blocks the action behind an explicit "I understand". On confirm it calls
 * POST /market/accept_terms (which persists the acceptance server-side --
 * a client-only flag has no evidentiary value) and then runs `onAccepted`,
 * which retries the action that triggered the gate.
 *
 * Re-shown whenever `terms_version` changes (the caller only mounts this
 * when the fetched acceptance is missing or stale).
 */
export default function RmtDisclaimerGateModal({
  onAccepted,
  onClose,
}: {
  onAccepted: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const token = getStoredAccountToken();
    if (!token) {
      setError('Sign in first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptMarketTerms(token);
      onAccepted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record acceptance.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-amber-500/40 p-6 text-white shadow-xl">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span aria-hidden>⚠️</span> Before you trade
        </h2>
        <p className="text-sm text-amber-100 bg-amber-950/60 border border-amber-500/30 rounded-lg p-3 leading-snug">
          {RMT_DISCLAIMER_TEXT}
        </p>
        <p className="text-xs text-white/50 mt-3">
          Trades on the market are item-for-item only. Arranging a real-money
          payment for an in-game item, on or off the platform, will cost you
          your account.
        </p>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'I understand'}
          </button>
        </div>
      </div>
    </div>
  );
}
