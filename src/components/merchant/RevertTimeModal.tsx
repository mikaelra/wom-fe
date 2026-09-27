'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getMerchantSkyEvents, revertMerchantTime, type MerchantEvent } from '@/lib/api';
import { getStoredAccountToken, ApiError } from '@/lib/http';
import { timewarpEventLabels } from '@/lib/merchant';
import { formatWorldClock } from '@/lib/worldClock';
import { useCountdown } from '@/lib/useCountdown';
import type { Relic } from '@/types/game';

type Props = {
  /** A merchant relic -- Stone of Vitality or Paper. */
  relic: Relic;
  /** Whether time is turned back right now, and to when -- the status line. */
  reverted: boolean;
  revertedTo: string | null;
  /** Whether someone has timewarped within the last minute (the lock,
   *  docs/MERCHANT_PLAN.md §7), and until when -- so the action is blocked
   *  with a reason and a countdown before the player tries it, rather than
   *  after a 409. */
  blocked: boolean;
  blockedUntil: string | null;
  /** Whether the merchant poll has answered yet -- the status line says
   *  nothing until it has, since there is nothing honest to say about the
   *  world's clock before that. */
  statusKnown: boolean;
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

/** An instant as ISO 8601, whatever form it arrived in -- the relic list's
 *  own timestamps come back RFC 1123 ("Tue, 03 Oct 2028 12:00:00 GMT"),
 *  which /merchant/sky_events does not read. */
function toIso(instant: string): string {
  const d = new Date(instant);
  return Number.isNaN(d.getTime()) ? instant : d.toISOString();
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
 * Where time stands (normal, or reverted and until when), every copy the
 * player owns with the instant it was bought and every event that was
 * live then ("Full moon", "Conjunction") -- each copy turns time back to
 * its own moment, so
 * the player picks which -- and the Timewarp action. For a minute after
 * anyone timewarps, the Timewarp button is disabled and shows the time
 * left, rather than letting the player hit a 409.
 */
export default function RevertTimeModal({
  relic, reverted, revertedTo, blocked, blockedUntil, statusKnown, onClose, onReverted,
}: Props) {
  const [phase, setPhase] = useState<Phase>('preview');
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const secondsUntilAvailable = useCountdown(blocked ? blockedUntil : null);
  // Every copy, newest first. A backend that predates the per-copy list
  // only knows the newest one, which is also what it sacrifices unasked.
  const copies = useMemo(
    () =>
      relic.copies?.length
        ? relic.copies
        : [{ id: null as number | null, created_at: relic.newest_copy_created_at }],
    [relic.copies, relic.newest_copy_created_at],
  );
  const [chosenIndex, setChosenIndex] = useState(0);
  const chosen = copies[Math.min(chosenIndex, copies.length - 1)];

  // The backend is the authority on which events count (which planets,
  // how close), so each copy's list is asked for rather than re-derived
  // here. Keyed by instant: undefined while loading, null if the sky
  // couldn't be read.
  const [events, setEvents] = useState<Record<string, MerchantEvent[] | null>>({});
  useEffect(() => {
    let cancelled = false;
    for (const instant of new Set(copies.map((c) => toIso(c.created_at)))) {
      getMerchantSkyEvents(instant)
        .then((e) => { if (!cancelled) setEvents((prev) => ({ ...prev, [instant]: e })); })
        .catch(() => { if (!cancelled) setEvents((prev) => ({ ...prev, [instant]: null })); });
    }
    return () => { cancelled = true; };
  }, [copies]);

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
    revertMerchantTime(token, relic.name, chosen.id)
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

  // Where time stands right now -- moved here from the inventory card.
  const status = !statusKnown ? null : reverted && revertedTo ? (
    <p className="text-red-400 text-xs font-semibold mb-3">
      Someone has currently warped time to {formatWorldClock(new Date(revertedTo))}.
    </p>
  ) : !reverted ? (
    <p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-3">Normal time</p>
  ) : null;
  // Someone timewarped within the last minute: Timewarp waits, showing how
  // long for, and comes back on its own when the countdown runs out.
  const locked = blocked && secondsUntilAvailable !== null && secondsUntilAvailable > 0;

  const eventLines = (instant: string) => {
    const list = events[toIso(instant)];
    if (list === undefined) return <p className="text-white/40 text-xs mt-1">Reading the sky…</p>;
    if (list === null) return <p className="text-white/40 text-xs mt-1">Couldn&rsquo;t read the sky right now.</p>;
    if (list.length === 0) return <p className="text-white/40 text-xs mt-1">No merchant was in town then.</p>;
    return timewarpEventLabels(list).map(({ text, color }) => (
      <p key={text} className="text-xs mt-1" style={{ color }}>
        {text}
      </p>
    ));
  };

  // Every copy's own time -- the one chosen is the one Timewarp spends.
  const copyList = (
    <div className="mb-4 text-left">
      <p className="text-white/50 text-[11px] uppercase tracking-wide mb-1">
        {copies.length > 1 ? 'Choose a time' : `This ${relic.name} was bought`}
      </p>
      <div role={copies.length > 1 ? 'radiogroup' : undefined} className="flex flex-col gap-2">
        {copies.map((copy, i) => {
          const selected = copy === chosen;
          const body = (
            <>
              <p className="text-sm font-semibold">{formatExact(copy.created_at)}</p>
              {eventLines(copy.created_at)}
            </>
          );
          return copies.length > 1 ? (
            <button
              key={`${copy.id}|${copy.created_at}|${i}`}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChosenIndex(i)}
              className={`w-full text-left rounded-lg p-3 border transition-colors cursor-pointer ${
                selected ? 'bg-purple-900/40 border-purple-400' : 'bg-black/30 border-white/10 hover:border-white/30'
              }`}
            >
              {body}
            </button>
          ) : (
            <div key={`${copy.id}|${copy.created_at}|${i}`} className="bg-black/30 border border-white/10 rounded-lg p-3">
              {body}
            </div>
          );
        })}
      </div>
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
          {relic.name}
        </h2>
        {relic.flavour_text && <p className="text-white/50 text-xs mb-4">{relic.flavour_text}</p>}

        <h3 className="text-base font-bold mb-1">Time Warp</h3>
        {status}

        {phase === 'error' ? (
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
              {formatExact(chosen.created_at)} for everyone for 1 hour, and every merchant who was in
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
            {copyList}
            <p className="text-white/60 text-xs mb-4">
              Using it will turn the sky back to that exact moment for everyone, for 1 hour.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setPhase('confirming')}
                disabled={locked}
                aria-label={locked ? `Timewarp available in ${formatCountdown(secondsUntilAvailable!)}` : undefined}
                className="px-5 py-2 rounded-lg bg-purple-700/80 text-purple-200 border border-purple-500 font-bold hover:bg-purple-600/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-700/80"
              >
                {locked ? formatCountdown(secondsUntilAvailable!) : 'Timewarp'}
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
