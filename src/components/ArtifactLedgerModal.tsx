'use client';

import { useEffect } from 'react';
import Image from 'next/image';

import ArtifactLedger from '@/components/ArtifactLedger';

// The mystery reveal banner up top -- unoptimized because Next's image
// pipeline re-encodes local images to a static frame, which would silently
// kill the animation. Two crops of the same clip (added standalone in PR
// #352, unused until now): the square one reads better once the modal's
// max-w-lg has room to breathe, the tall one suits a phone-width dialog
// where a wide crop would mostly show ceiling and floor.
const REVEAL_GIF_WIDE = '/images/artifacts/white-frog-void.gif';
const REVEAL_GIF_TALL = '/images/artifacts/white-frog-void-vertical.gif';

/**
 * The discovery ledger in a dialog -- what clicking your artifact in the
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

        {/* Decorative -- the void the artifact came out of, not information
            in its own right, so it carries no alt text. */}
        <div className="relative h-40 w-full rounded-lg overflow-hidden border border-white/10 bg-black mb-4">
          <Image src={REVEAL_GIF_WIDE} alt="" fill unoptimized className="object-cover hidden sm:block" />
          <Image src={REVEAL_GIF_TALL} alt="" fill unoptimized className="object-cover sm:hidden" />
        </div>

        <h2 id="artifact-ledger-heading" className="text-lg font-semibold mb-1">
          Artifacts discovered
        </h2>
        <p className="text-white/50 text-xs mb-4">
          Every artifact ever found, oldest first.
        </p>

        <ArtifactLedger highlightOrdinal={highlightOrdinal} />
      </div>
    </div>
  );
}
