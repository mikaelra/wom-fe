'use client';

import { useEffect, useRef, useState } from 'react';
import { getPlayerRelics } from '@/lib/api';
import { COIN_RELIC_ID, type Relic } from '@/types/game';
import RelicCoin from '@/components/RelicCoin';
import RelicCooldownOverlay from '@/components/RelicCooldownOverlay';

const COOLDOWN_MS = 10_000;

// The relic-specific explanation shown on hover/selection -- kept explicit
// about consumption (not just "use it") so a player isn't surprised later
// that their coin is gone from the inventory page. Only COIN_RELIC_ID has
// an effect wired up server-side today; other relic types fall back to
// their own flavour_text, with no consume-and-select affordance.
const RELIC_SELECT_HELP: Record<number, string> = {
  [COIN_RELIC_ID]: "Use one Hades' Coin to start the game with +1 coin. This consumes it.",
};

type RelicSelectionPopoverProps = {
  playerName: string;
  selectedRelicIds: number[];
  onToggle: (relicId: number) => void;
};

// The roster badge doubles as the trigger: a "+" opens the picker when
// nothing's selected, and (today, with only one spendable relic type)
// becomes that relic's own icon once selected -- clicking it again arms a
// one-tap confirmation before actually removing it, rather than removing
// on a single accidental click.
//
// The badge itself is always instantly clickable, cooldown or not -- the
// cooldown only ever blocks the actual toggle action, and is shown where
// that action lives: on the relic icon(s) inside the popover, not on the
// outer +/coin. The server remains the authority regardless (a confirm
// click that lands too early is just rejected with a toast).
export default function RelicSelectionPopover({
  playerName,
  selectedRelicIds,
  onToggle,
}: RelicSelectionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [relics, setRelics] = useState<Relic[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  // The coin badge never shows the cooldown up front -- a freshly-selected
  // relic should just look normal. It only reveals once the player actually
  // tries to interact with it (clicks to remove) while still blocked, and
  // then stays visible for the rest of the cooldown so they can see when
  // it'll clear. The "+" state never needs this: it's always clickable
  // (see handleBadgeClick), so the cooldown there only ever shows inside
  // the popover, over the relic itself.
  const [revealCooldown, setRevealCooldown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedRelicId = selectedRelicIds[0] ?? null;
  const onCooldown = cooldownUntil !== null && cooldownUntil > Date.now();
  const showCooldownOverlay = onCooldown && revealCooldown;

  useEffect(() => {
    if (!open) return;
    getPlayerRelics(playerName).then((data) => setRelics(data.relics));
  }, [open, playerName]);

  useEffect(() => {
    if (!open && !armed) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setArmed(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open, armed]);

  // Drop a stale "confirm removal" arm if the selection changed from
  // outside this control (e.g. the server ended up rejecting a change).
  useEffect(() => {
    if (selectedRelicId === null) setArmed(false);
  }, [selectedRelicId]);

  const startCooldown = () => {
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    setRevealCooldown(false);
    setTimeout(() => {
      setCooldownUntil(null);
      setRevealCooldown(false);
    }, COOLDOWN_MS);
  };

  const handleSelect = (relicId: number) => {
    if (onCooldown) return;
    onToggle(relicId);
    setOpen(false);
    startCooldown();
  };

  const handleBadgeClick = () => {
    if (selectedRelicId === null) {
      setOpen((v) => !v); // always instant -- cooldown feedback lives inside the popover, not here
      return;
    }
    if (onCooldown) {
      setRevealCooldown(true); // tried to remove it while blocked -- now show why
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    onToggle(selectedRelicId);
    setArmed(false);
    startCooldown();
  };

  const badgeTitle = showCooldownOverlay
    ? 'You can only change your relic selection once every 10 seconds.'
    : selectedRelicId === null
      ? 'View your relics'
      : armed
        ? 'Click again to remove'
        : (RELIC_SELECT_HELP[selectedRelicId] ?? 'Selected');

  return (
    <div ref={containerRef} className="relative inline-block">
      <span
        className="relative inline-flex items-center justify-center text-blue-600 text-2xl font-bold cursor-pointer select-none px-1"
        title={badgeTitle}
        onClick={handleBadgeClick}
      >
        {selectedRelicId === null ? (
          '+'
        ) : (
          <>
            <span className="text-xl leading-none">🪙</span>
            {armed && (
              <span className="absolute inset-0 flex items-center justify-center text-red-600 text-xl font-bold">
                ✕
              </span>
            )}
          </>
        )}
        {showCooldownOverlay && <RelicCooldownOverlay untilMs={cooldownUntil!} totalMs={COOLDOWN_MS} />}
      </span>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-max max-w-56 backdrop-blur-md border border-white/40 rounded-lg shadow-lg p-3">
          {relics.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {relics.map((relic) => {
                const relicId = typeof relic.id === 'number' ? relic.id : Number(relic.id);
                return (
                  <button
                    key={String(relic.id)}
                    type="button"
                    disabled={onCooldown}
                    title={
                      onCooldown
                        ? 'You can only change your relic selection once every 10 seconds.'
                        : (RELIC_SELECT_HELP[relicId] ?? relic.flavour_text ?? relic.name)
                    }
                    onClick={() => handleSelect(relicId)}
                    className={`relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-transparent transition-colors ${
                      onCooldown ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-10 h-10 overflow-hidden">
                      <RelicCoin />
                    </div>
                    <span className="text-xs text-gray-700">×{relic.count}</span>
                    {onCooldown && (
                      <RelicCooldownOverlay untilMs={cooldownUntil!} totalMs={COOLDOWN_MS} rounded="rounded-lg" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500">You have no relics yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
