'use client';

import { useEffect, useRef, useState } from 'react';
import { spinWheel } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { NORMAL_WHEEL_SKINS, skinColor, skinLabel } from '@/lib/frogSkins';

type Props = {
  wheelId: number;
  onClose: () => void;
  onSpun: (resultSkin: string) => void;
};

type Phase = 'spinning' | 'result' | 'error';

const REVEAL_INTERVAL_MS = 120;
// The backend call is a fast local round-trip (well under a second), which
// made the reveal feel like it barely happened. Padding it out to a fixed
// minimum -- independent of how fast the network actually responds -- is
// what makes it read as a "spin" instead of a flicker.
const MIN_SPIN_DURATION_MS = 1800;

export default function WheelSpinModal({ wheelId, onClose, onSpun }: Props) {
  const [phase, setPhase] = useState<Phase>('spinning');
  const [cycleIndex, setCycleIndex] = useState(0);
  const [resultSkin, setResultSkin] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Guards against React StrictMode's dev-mode double-invoke of effects:
  // without this, spinWheel fired twice -- the first call correctly
  // consumed the wheel and granted the skin, and the *second* call's 404
  // ("already spun") landed after and overwrote the success state with an
  // error, even though the spin had actually succeeded. Same pattern as
  // verify_email/page.tsx's calledRef.
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    // Simple reveal: cycle through the possible skins while the spin
    // request is in flight, then settle on whatever the server returned.
    // Not a physically-accurate spinning wheel with slices/pointer -- that
    // only pays for itself once the Special Wheel (uneven odds) exists.
    const interval = setInterval(() => {
      setCycleIndex((i) => (i + 1) % NORMAL_WHEEL_SKINS.length);
    }, REVEAL_INTERVAL_MS);

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_SPIN_DURATION_MS));
    const spin = spinWheel(getStoredAccountToken() ?? '', wheelId);

    Promise.allSettled([spin, minDelay]).then(([spinResult]) => {
      clearInterval(interval);
      if (spinResult.status === 'fulfilled') {
        setResultSkin(spinResult.value.result_skin);
        setPhase('result');
        onSpun(spinResult.value.result_skin);
      } else {
        const e = spinResult.reason;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setPhase('error');
      }
    });

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wheelId]);

  const displayedSkin = phase === 'result' && resultSkin ? resultSkin : NORMAL_WHEEL_SKINS[cycleIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center">
        <p className="text-3xl mb-3">🎡</p>

        {phase === 'error' ? (
          <>
            <p className="text-red-400 font-semibold mb-4">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div
              data-testid="wheel-spin-swatch"
              className="w-24 h-24 mx-auto rounded-full mb-4 border-4 border-amber-500/60 transition-colors duration-100"
              style={{ background: skinColor(displayedSkin) }}
            />
            {phase === 'spinning' && <p className="text-gray-300 font-semibold mb-4">Spinning…</p>}
            {phase === 'result' && resultSkin && (
              <>
                <p className="text-green-400 font-bold text-lg mb-1">You got:</p>
                <p className="text-amber-300 font-semibold mb-4 capitalize">{skinLabel(resultSkin)}</p>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'spinning'}
              className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {phase === 'spinning' ? 'Spinning…' : 'Close'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
