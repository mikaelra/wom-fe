'use client';

import { useEffect, useRef, useState } from 'react';
import { equipSkin, tradeUp } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { skinLabel, skinUrl } from '@/lib/frogSkins';
import { canAfford, costLabel, outputLabel, type TradeUpRule, type TradeUpResult } from '@/lib/tradeUps';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import SpinningModelViewer from '@/components/SpinningModelViewer';
import SpecialWheelEmblem from '@/components/SpecialWheelEmblem';

type Props = {
  skin: string;
  owned: number;
  rule: TradeUpRule;
  onClose: () => void;
  onTraded: (result: TradeUpResult) => void;
  onEquipped?: (equippedSkin: string) => void;
  onSpinNow?: (wheelId: number) => void;
};

type Phase = 'preview' | 'confirming' | 'trading' | 'result' | 'error';

function GoldenArrow({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <svg
      viewBox="0 0 64 32"
      className={`w-16 h-8 shrink-0 ${reducedMotion ? '' : 'animate-pulse'}`}
      style={{ filter: 'drop-shadow(0 0 6px rgba(245,197,66,0.5))' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tradeUpArrowGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5c542" />
          <stop offset="50%" stopColor="#fff3b0" />
          <stop offset="100%" stopColor="#f5c542" />
        </linearGradient>
      </defs>
      <path d="M2 12 H44 V4 L62 16 L44 28 V20 H2 Z" fill="url(#tradeUpArrowGradient)" />
    </svg>
  );
}

export default function TradeUpModal({ skin, owned, rule, onClose, onTraded, onEquipped, onSpinNow }: Props) {
  const [phase, setPhase] = useState<Phase>('preview');
  const [error, setError] = useState('');
  const [result, setResult] = useState<TradeUpResult | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [equipError, setEquipError] = useState('');
  // Guards a fast double-click on "Yes, trade up" -- the confirm buttons
  // disappear once `phase` flips to 'trading', which is a render too late
  // for a second click that landed before the re-render (mirrors
  // WheelSpinModal's rollingRef).
  const submittingRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  const primaryRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const affordable = canAfford(owned, rule);

  useEffect(() => {
    if (phase === 'preview') primaryRef.current?.focus();
    if (phase === 'confirming') confirmRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phase === 'confirming') setPhase('preview');
      else if (phase === 'preview' || phase === 'error') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const handleConfirm = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPhase('trading');
    const token = getStoredAccountToken() ?? '';
    tradeUp(token, skin)
      .then((res) => {
        setResult(res);
        setPhase('result');
        onTraded(res);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
        setPhase('error');
      })
      .finally(() => {
        submittingRef.current = false;
      });
  };

  const handleEquip = async () => {
    if (!result || result.output_kind !== 'skin') return;
    const token = getStoredAccountToken();
    if (!token) return;
    setEquipping(true);
    setEquipError('');
    try {
      const data = await equipSkin(token, result.output);
      setEquipped(true);
      onEquipped?.(data.equipped_skin);
    } catch (e) {
      setEquipError(e instanceof Error ? e.message : 'Failed to equip skin.');
    } finally {
      setEquipping(false);
    }
  };

  const handleSpinNow = () => {
    if (!result?.wheel_id) return;
    onSpinNow?.(result.wheel_id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tradeup-modal-heading"
        className="bg-gray-900 border border-amber-500/40 rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6 relative text-white"
      >
        {phase === 'error' ? (
          <div className="text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p id="tradeup-modal-heading" className="text-red-400 text-sm font-semibold mb-4">
              {error}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-gray-700 text-gray-300 font-bold hover:bg-gray-600 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : phase === 'result' && result ? (
          <div className="text-center">
            <h2 id="tradeup-modal-heading" className="sr-only">
              Trade-up result
            </h2>
            {result.output_kind === 'skin' ? (
              <div className="w-32 h-32 mx-auto mb-2">
                <SpinningModelViewer key={result.output} url={skinUrl(result.output)} targetSize={1.6} spinSpeed={0.7} />
              </div>
            ) : (
              <div className="w-28 h-28 mx-auto mb-2">
                <SpecialWheelEmblem />
              </div>
            )}
            <p className="text-green-400 font-bold text-lg mb-1">
              {result.output_kind === 'skin' ? 'You got:' : 'You got a Special Wheel'}
            </p>
            {result.output_kind === 'skin' && (
              <p className="text-amber-300 font-semibold mb-4 capitalize">{skinLabel(result.output)}</p>
            )}
            <div className="flex gap-3 justify-center items-center mt-2">
              {result.output_kind === 'skin' ? (
                !equipped ? (
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
                )
              ) : (
                <button
                  type="button"
                  onClick={handleSpinNow}
                  className="px-5 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                >
                  Spin it now
                </button>
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
        ) : (
          <>
            <h2 id="tradeup-modal-heading" className="text-lg font-bold text-center mb-4">
              Trade up
            </h2>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="text-center">
                <div className="w-28 h-28 mx-auto">
                  <SpinningModelViewer url={skinUrl(skin)} targetSize={1.4} spinSpeed={0.5} />
                </div>
                <p className="text-sm font-semibold capitalize mt-1">{skinLabel(skin)}</p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-amber-700/60 text-amber-200 border border-amber-600">
                  ×{rule.cost}
                </span>
                <p className={`text-xs mt-1 ${owned < rule.cost ? 'text-red-400' : 'text-white/60'}`}>You have {owned}</p>
              </div>

              <GoldenArrow reducedMotion={reducedMotion} />

              <div className="text-center">
                {rule.output_kind === 'skin' ? (
                  <>
                    <div className="w-28 h-28 mx-auto">
                      <SpinningModelViewer url={skinUrl(rule.output)} targetSize={1.4} spinSpeed={0.5} />
                    </div>
                    <p className="text-sm font-semibold capitalize mt-1">{skinLabel(rule.output)}</p>
                  </>
                ) : (
                  <>
                    <div className="w-28 h-28 mx-auto flex items-center justify-center">
                      <SpecialWheelEmblem className="w-24 h-24" />
                    </div>
                    <p className="text-sm font-semibold mt-1">Special Wheel</p>
                  </>
                )}
              </div>
            </div>

            <p className="text-center text-sm text-white/70 mt-4 mb-4">
              Costs {costLabel(rule, skin)}. You have {owned}.
            </p>

            <div className="flex gap-3 justify-center">
              <button
                ref={primaryRef}
                type="button"
                onClick={() => setPhase('confirming')}
                disabled={!affordable}
                className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {affordable ? `Trade up (${costLabel(rule, skin)})` : `Need ${costLabel(rule, skin)} (you have ${owned})`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {(phase === 'confirming' || phase === 'trading') && (
              <div className="absolute inset-0 rounded-xl bg-gray-950/95 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="font-bold text-lg">Trade up {costLabel(rule, skin)}?</p>
                <p className="text-white/70 text-sm">
                  This permanently destroys {rule.cost} {rule.cost === 1 ? 'copy' : 'copies'}. It cannot be undone.
                </p>
                <p className="text-white/70 text-sm">
                  You will get: {rule.output_kind === 'wheel' ? `a ${outputLabel(rule)}` : outputLabel(rule)}.
                </p>
                {phase === 'trading' ? (
                  <p className="text-amber-300 font-semibold">Trading up…</p>
                ) : (
                  <div className="flex gap-3">
                    <button
                      ref={confirmRef}
                      type="button"
                      onClick={handleConfirm}
                      className="px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors cursor-pointer"
                    >
                      Yes, trade up
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhase('preview')}
                      className="px-5 py-2 rounded-lg bg-white/10 text-white border border-white/20 font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div aria-live="polite" className="sr-only">
          {phase === 'result' && result
            ? result.output_kind === 'wheel'
              ? 'You traded up for a Special Wheel'
              : `You traded up for ${skinLabel(result.output)}`
            : ''}
        </div>
      </div>
    </div>
  );
}
