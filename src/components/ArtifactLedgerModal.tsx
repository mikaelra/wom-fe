'use client';

import { useEffect } from 'react';

import ArtifactLedger from '@/components/ArtifactLedger';

/**
 * The discovery ledger in a dialog -- what clicking your Parchment in the
 * inventory opens. The Vault renders `ArtifactLedger` directly instead,
 * since there the list *is* the page.
 */
export default function ArtifactLedgerModal({
  highlightOrdinal = null,
  onClose,
}: {
  highlightOrdinal?: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="artifact-ledger-heading"
        className="bg-gray-900 border border-amber-500/40 rounded-xl shadow-2xl max-w-lg w-full p-6 relative text-white"
        // The backdrop closes on click; the panel must not, or every click
        // inside the dialog would dismiss it.
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors text-xl leading-none cursor-pointer"
        >
          ×
        </button>

        <h2 id="artifact-ledger-heading" className="text-lg font-semibold mb-1">
          Artifacts discovered
        </h2>
        <p className="text-white/50 text-xs mb-4">
          Every artifact ever found, in the order they were found.
        </p>

        <ArtifactLedger highlightOrdinal={highlightOrdinal} />
      </div>
    </div>
  );
}
