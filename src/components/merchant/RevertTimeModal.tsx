'use client';

import { useEffect, useRef, useState } from 'react';
import { getMerchantSkyEvents, revertMerchantTime, type MerchantEvent } from '@/lib/api';
import { getStoredAccountToken, ApiError } from '@/lib/http';
import { describeMerchantEvent, merchantEventColor } from '@/lib/merchant';
import { useCountdown } from '@/lib/useCountdown';
import type { Relic } from '@/types/game';

type Props = {
  /** A merchant relic -- Stone of Vitality or Paper. */
  relic: Relic;
  /** Whether someone else has already turned back time (the merchant
   *  poll's `reverted`, docs/MERCHANT_PLAN.md §7), and until when -- so
   *  the action is blocked with a reason and a countdown before the
   *  player tries it, rather than after a 409. */
  blocked: boolean;
  blockedUntil: string | null;
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
 * Clicking a merchant relic's model (Stone of Vitality, Paper) in the
 * Inventory opens this -- mirrors ArtifactLedgerModal being what clicking
 * your artifact opens.
 *
 * Two purposes in one popup: explain exactly what sacrificing this copy
 * will do -- the precise instant it turns everyone's sky back to, and
 * every event that was live then ("Full moon in Aries", "Conjunction
 * between Mercury and Jupiter in Libra"), because each of those brings
 * its merchant back -- before the player has to confirm; and, if someone
 * has already reverted time, block the action outright with a visible
 * reason and a countdown to when it becomes possible again.
 */
export default function RevertTimeModal({ relic, blocked, blockedUntil, onClose, onReverted }: Props) {
  const [phase, setPhase] = useState<Phase>('preview');
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const secondsUntilAvailable = useCountdown(blocked ? blockedUntil : null);
  const revertToDate = relic.newest_copy_created_at;
  // The backend is the authority on which events count (which planets,
  // how close), so the list is asked for rather than re-derived here.
  // undefined while loading, null if the sky couldn't be read.
  const [events, setEvents] = useState<MerchantEvent[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setEvents(undefined);
    getMerchantSkyEvents(revertToDate)
      .then((e) => { if (!cancelled) setEvents(e); })
      .catch(() => { if (!cancelled) setEvents(null); });
    return () => { cancelled = true; };
  }, [revertToDate]);

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
    revertMerchantTime(token, relic.name)
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

  // What this copy would turn the sky back to: its instant, and every
  // merchant-summoning event live then.
  const boughtAt = (
    <div className="bg-black/30 border border-white/10 rounded-lg p-3 mb-4 text-left">
      <p className="text-white/50 text-[11px] uppercase tracking-wide mb-1">This {relic.name} was bought</p>
      <p className="text-sm font-semibold">{formatExact(revertToDate)}</p>
      {events === undefined ? (
        <p className="text-white/40 text-xs mt-1">Reading the sky…</p>
      ) : events === null ? (
        <p className="text-white/40 text-xs mt-1">Couldn&rsquo;t read the sky right now.</p>
      ) : events.length === 0 ? (
        <p className="text-white/40 text-xs mt-1">No merchant was in town then.</p>
      ) : (
        events.map((event) => (
          <p key={`${event.kind}|${event.key}`} className="text-xs mt-1" style={{ color: merchantEventColor(event) }}>
            {describeMerchantEvent(event)}
          </p>
        ))
      )}
    </div>
  );

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
              You can&rsquo;t use {relic.name === 'Paper' ? 'Paper' : `a ${relic.name}`} this way while another revert is running.
            </p>
            {secondsUntilAvailable !== null && secondsUntilAvailable > 0 && (
              <p className="text-purple-300 font-mono text-2xl font-bold mb-4">
                {formatCountdown(secondsUntilAvailable)}
              </p>
            )}
            {/* Blocked from using it right now, but the player can still
                see what THIS copy would have reverted time to -- the
                information doesn't depend on being able to act on it. */}
            {boughtAt}
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
              This sacrifices 1 {relic.name} and cannot be undone. The sky will turn back to{' '}
              {formatExact(revertToDate)} for everyone for 1 hour, and every merchant who was in
              town then will be back.
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
              Sacrifice this {relic.name} to bring back the merchants of the moment it was bought,
              for everyone, for 1 hour.
            </p>
            {boughtAt}
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
