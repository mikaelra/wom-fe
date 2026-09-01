'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';

import ArtifactLedger from '@/components/ArtifactLedger';
import { CITY_PATH } from '@/lib/cities';

const VaultScene = dynamic(() => import('@/components/vault/VaultScene'), { ssr: false });

/**
 * The Vault -- now a room you walk into rather than a password prompt.
 *
 * It used to ask for a 7-digit passkey and, once you got in, print that
 * passkey and the first finder's name back at you (which is how the secret
 * leaked). The passkey mechanic is retired: `wom-be`'s `routes/vault.py` and
 * all three of its endpoints are gone, and the discovery record they
 * gate-kept is public now. See wom-be `docs/ARTIFACT_PLAN.md` §8.
 *
 * Keeping the room rather than deleting the city was deliberate. The Vault
 * is a marker on the globe with its own 3D scene; removing it would leave a
 * hole in the world map to delete a form. Filling it with the ledger costs
 * no new art and finally makes the old line -- "in this vault lies ancient
 * artifacts" -- true rather than aspirational.
 *
 * It is still gated, just on a different thing: the old passkey is gone, and
 * the records are now readable only by someone who has discovered an
 * artifact. ArtifactLedger renders its own sealed state for everyone else,
 * so this page needs no check of its own.
 */
export default function VaultPage() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8"
      style={{ background: '#0a0a1a', position: 'relative' }}
    >
      <VaultScene />

      <div
        className="w-full max-w-2xl rounded-2xl shadow-xl bg-gray-900/85 backdrop-blur-sm border border-amber-500/30 p-6 sm:p-8 text-white"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <h1 className="font-semibold text-2xl mb-1">The Vault of Artifacts</h1>
        <p className="text-white/60 text-sm mb-6">
          In this vault lies every artifact ever found, and the name of whoever
          found it — readable only by those who have found one themselves.
          Artifacts turn up at The Well, and each one discovered makes the next
          a little easier to find.
        </p>

        <ArtifactLedger />

        <div className="mt-6">
          {/* Home, and beside it the city. Kept as one item so a justify-between parent cannot fling them apart. */}
          <span className="emoji-pair inline-flex items-center gap-2">
            <Link href="/" className="no-underline" style={{ fontSize: '2rem' }} aria-label="Back to Home">
              🌍
            </Link>
            <Link href={CITY_PATH} className="no-underline" style={{ fontSize: '2rem' }} aria-label="Go to the city">
              🏛️
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
