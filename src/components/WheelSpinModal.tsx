'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { equipSkin, spinWheel } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { NORMAL_WHEEL_SKINS, skinColor, skinLabel, skinUrl } from '@/lib/frogSkins';
import {
  buildSlices,
  computeViewportGeometry,
  createSeededRng,
  oddsTable,
  wheelKindFromString,
  type Slice,
  type ViewportGeometry,
} from '@/lib/wheelGeometry';
import { getQualityTier } from '@/lib/deviceQuality';
import WheelCanvas from '@/components/wheel/WheelCanvas';
import WheelFlapper from '@/components/wheel/WheelFlapper';
import { useWheelAnimation } from '@/components/wheel/useWheelAnimation';
import SpinningModelViewer from '@/components/SpinningModelViewer';

type Props = {
  wheelId: number;
  kind: string;
  onClose: () => void;
  onSpun: (resultSkin: string) => void;
  onEquipped?: (equippedSkin: string) => void;
};

// Captured once at mount, deliberately not reactive to resize. A committed
// spin target (§ handleRoll) is an index into a specific `slices` array --
// if geometry changed mid-spin (H changes -> the slice count N changes,
// §3.5.3), that index would point at a different slice in the rebuilt
// array, landing the wheel on the wrong skin while the toast/result text
// (driven by the real server response) stayed correct. Mobile Safari's
// address bar hiding/showing while scrolling fires `resize` constantly, so
// this isn't a rare edge case -- freezing geometry for the modal's
// lifetime is what makes "the wheel lands on what you actually won" hold.
function useFrozenViewportSize() {
  const [size] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    vh: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  return size;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function WheelSpinModal({ wheelId, kind, onClose, onSpun, onEquipped }: Props) {
  // The wheel spins cosmetically the moment the modal opens (no server
  // call yet) -- Roll is what actually commits: it fires spinWheel(), and
  // once the result is back the already-spinning wheel lands on it
  // automatically. Close before Roll never spends the wheel item.
  const [rolling, setRolling] = useState(false);
  const [resultSkin, setResultSkin] = useState<string | null>(null);
  const [spinError, setSpinError] = useState('');
  const [canvasSupported, setCanvasSupported] = useState(true);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [equipError, setEquipError] = useState('');
  const [cycleIndex, setCycleIndex] = useState(0);
  // Guards a double-fire from a rapid double-click on Roll -- the button
  // itself disappears once `rolling` is true, but that's a render away.
  const rollingRef = useRef(false);
  // A fresh arrangement each time the wheel is opened, but stable for this
  // session (geometry is frozen too, so this only ever runs once anyway).
  const rngSeedRef = useRef(Math.floor(Math.random() * 2 ** 31));

  const { w, vh } = useFrozenViewportSize();
  const reducedMotion = usePrefersReducedMotion();

  const geometry = useMemo<ViewportGeometry>(
    () => computeViewportGeometry(w, vh, vh < 480 ? 180 : 200),
    [w, vh],
  );
  const table = useMemo(() => oddsTable(wheelKindFromString(kind)), [kind]);
  const slices = useMemo<Slice[]>(
    () => buildSlices(table, { R: geometry.R, H: geometry.H }, createSeededRng(rngSeedRef.current)).slices,
    [table, geometry.R, geometry.H],
  );

  const handleRoll = () => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setRolling(true);
    spinWheel(getStoredAccountToken() ?? '', wheelId)
      .then((res) => {
        setResultSkin(res.result_skin);
        onSpun(res.result_skin);
      })
      .catch((e: unknown) => {
        setSpinError(e instanceof Error ? e.message : 'Something went wrong.');
      });
  };

  const anim = useWheelAnimation({
    slices,
    resultSkin: spinError ? null : resultSkin,
    reducedMotion,
    qualityTier: getQualityTier(),
    active: canvasSupported,
  });

  // Canvas-unsupported fallback reveal cycles through possible skins while
  // waiting on the result, same treatment as before 2b.
  const useFallback = !canvasSupported;
  useEffect(() => {
    if (!useFallback || !rolling || resultSkin) return;
    const id = setInterval(() => setCycleIndex((i) => (i + 1) % NORMAL_WHEEL_SKINS.length), 120);
    return () => clearInterval(id);
  }, [useFallback, rolling, resultSkin]);

  const isResult = useFallback ? !!resultSkin : anim.phase === 'result';

  useEffect(() => {
    if (!isResult) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isResult, onClose]);

  const handleEquip = async () => {
    if (!resultSkin) return;
    const token = getStoredAccountToken();
    if (!token) return;
    setEquipping(true);
    setEquipError('');
    try {
      const data = await equipSkin(token, resultSkin);
      setEquipped(true);
      onEquipped?.(data.equipped_skin);
    } catch (e) {
      setEquipError(e instanceof Error ? e.message : 'Failed to equip skin.');
    } finally {
      setEquipping(false);
    }
  };

  if (spinError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-900 border border-amber-500/40 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 text-center">
          <p className="text-3xl mb-3">🎡</p>
          <p className="text-red-400 font-semibold mb-4">{spinError}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {useFallback ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-amber-500/40 rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
            <p className="text-3xl mb-3">🎡</p>
            <div
              data-testid="wheel-spin-swatch"
              className="w-24 h-24 mx-auto rounded-full mb-4 border-4 border-amber-500/60 transition-colors duration-100"
              style={{ background: skinColor(isResult ? resultSkin! : NORMAL_WHEEL_SKINS[cycleIndex]) }}
            />
            {isResult && (
              <>
                <p className="text-green-400 font-bold text-lg mb-1">You got:</p>
                <p className="text-amber-300 font-semibold mb-4 capitalize">{skinLabel(resultSkin!)}</p>
              </>
            )}
            {!rolling ? (
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleRoll}
                  className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer"
                >
                  Roll
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : isResult ? (
              <div className="flex gap-3 justify-center items-center">
                {!equipped ? (
                  <button
                    type="button"
                    onClick={handleEquip}
                    disabled={equipping}
                    className="px-5 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {equipping ? 'Equipping…' : 'Equip'}
                  </button>
                ) : (
                  <span className="text-xs font-bold text-green-400">EQUIPPED</span>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : null}
            {equipError && <p className="text-red-400 text-xs mt-2">{equipError}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="relative w-full shrink-0" style={{ height: geometry.H }}>
            <WheelCanvas
              slices={slices}
              geometry={geometry}
              rotation={anim.rotation}
              rotationDelta={anim.rotationDelta}
              blurSteps={anim.blurSteps}
              highlightIndex={isResult ? anim.landedIndex : null}
              onContextUnavailable={() => setCanvasSupported(false)}
            />
            <WheelFlapper geometry={geometry} thetaRad={anim.flapperTheta} />
          </div>

          <div className="flex-1 flex flex-col items-center gap-4 px-4 py-6 mx-auto w-full max-w-[480px] overflow-y-auto">
            {!rolling && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRoll}
                  className="px-6 py-3 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer"
                >
                  Roll
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}

            {isResult && (
              <div className="text-center w-full">
                <div className="w-32 h-32 mx-auto mb-2">
                  <SpinningModelViewer key={resultSkin} url={skinUrl(resultSkin!)} targetSize={1.6} spinSpeed={0.7} />
                </div>
                <p className="text-green-400 font-bold text-lg mb-1">You got:</p>
                <p className="text-amber-300 font-semibold mb-4 capitalize">{skinLabel(resultSkin!)}</p>
                <div className="flex gap-3 justify-center items-center mt-2">
                  {!equipped ? (
                    <button
                      type="button"
                      onClick={handleEquip}
                      disabled={equipping}
                      className="px-5 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {equipping ? 'Equipping…' : 'Equip'}
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-green-400">EQUIPPED</span>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                {equipError && <p className="text-red-400 text-xs mt-2">{equipError}</p>}
              </div>
            )}
          </div>
        </>
      )}

      <div aria-live="polite" className="sr-only">
        {isResult && resultSkin ? `You won ${skinLabel(resultSkin)}` : ''}
      </div>
    </div>
  );
}
