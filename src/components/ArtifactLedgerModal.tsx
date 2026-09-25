'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import ArtifactLedger from '@/components/ArtifactLedger';

// The mystery reveal -- unoptimized because Next's image pipeline re-encodes
// local images to a static frame, which would silently kill the animation.
// Two crops of the same clip (added standalone in PR #352): the square one
// reads better on a wide screen, the tall one suits a phone's portrait
// viewport where a wide crop would mostly show ceiling and floor.
const REVEAL_GIF_WIDE = '/images/artifacts/white-frog-void.gif';
const REVEAL_GIF_TALL = '/images/artifacts/white-frog-void-vertical.gif';

/**
 * The discovery ledger, behind a full-screen void -- what clicking your
 * artifact in the inventory opens. The Vault renders `ArtifactLedger`
 * directly instead, since there the list *is* the page.
 *
 * Opens on just the void itself, full-viewport; clicking it reveals the
 * discovery order underneath rather than handing over both at once. The
 * backdrop-click-to-close of a normal dialog doesn't apply here -- the void
 * IS the backdrop -- so closing is the × button or Escape only.
 */
export default function ArtifactLedgerModal({
  highlightOrdinal = null,
  onClose,
}: {
  highlightOrdinal?: number | null;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Carries the reveal into view the moment it appears -- it renders below
  // the fold of the full-screen gif, so without this the click would look
  // like it did nothing.
  useEffect(() => {
    if (revealed) panelRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [revealed]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Artifact discovery"
      className="fixed inset-0 z-50 bg-black text-white overflow-y-auto"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed top-3 right-3 z-10 text-white/70 hover:text-white transition-colors text-2xl leading-none cursor-pointer"
      >
        ×
      </button>

      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-expanded={revealed}
        aria-controls="artifact-ledger-panel"
        aria-label={revealed ? 'Hide who else has found one' : 'Reveal who else has found one'}
        className="relative block w-full h-screen cursor-pointer border-0 p-0 bg-black"
      >
        <Image src={REVEAL_GIF_WIDE} alt="" fill unoptimized priority className="object-cover hidden sm:block" />
        <Image src={REVEAL_GIF_TALL} alt="" fill unoptimized priority className="object-cover sm:hidden" />
      </button>

      {revealed && (
        <div
          id="artifact-ledger-panel"
          ref={panelRef}
          className="bg-gray-900 border-t border-amber-500/40 p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Discoverers of Artifact#1</h2>
          <ArtifactLedger highlightOrdinal={highlightOrdinal} />
        </div>
      )}
    </div>
  );
}
