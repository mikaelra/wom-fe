'use client';

import { useState, type ReactNode } from 'react';

/**
 * A plain confirm dialog. Both posting a trade and accepting one go
 * through one of these (wom-be docs/MARKET_PLAN.md §1A.1) -- a swap is
 * irreversible once accepted, so neither is a bare one-click action.
 */
export default function ConfirmModal({
  title,
  confirmLabel,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  children: ReactNode;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-white/15 p-6 text-white shadow-xl">
        <h2 className="text-lg font-semibold mb-3">{title}</h2>
        <div className="text-sm text-white/80 space-y-2">{children}</div>
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
            onClick={run}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
