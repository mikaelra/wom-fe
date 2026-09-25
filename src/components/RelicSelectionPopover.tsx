'use client';

import { useEffect, useRef, useState } from 'react';
import { getPlayerRelics } from '@/lib/api';
import { COIN_RELIC_ID, type Relic } from '@/types/game';
import RelicCoin from '@/components/RelicCoin';
import RelicCooldownOverlay from '@/components/RelicCooldownOverlay';

const COOLDOWN_MS = 10_000;

// Name-keyed, not id-keyed: see RelicCoin.tsx's own note -- a new relic's
// id isn't safe to hardcode across environments the way COIN_RELIC_ID is.
// Kept explicit about consumption (not just "use it") so a player isn't
// surprised later that the relic is gone from the inventory page. Relic
// types with no entry here fall back to their own flavour_text, with no
// consume-and-select affordance called out.
const RELIC_SELECT_HELP: Record<string, string> = {
  "Hades' Coin": "Use one Hades' Coin to start the game with +1 coin. This consumes it.",
  'Stone of Vitality': 'Use one Stone of Vitality to start the game with 15 HP instead of 10. This consumes it.',
};

// The compact badge (selected-but-collapsed state) shows one glyph in place
// of the full 3D model -- name-keyed for the same reason as RELIC_SELECT_HELP.
const RELIC_BADGE_EMOJI: Record<string, string> = {
  "Hades' Coin": '🪙',
  'Stone of Vitality': '🪨',
};
const DEFAULT_RELIC_BADGE_EMOJI = '💠';

// Short version of RELIC_SELECT_HELP for the caption under the icon/count
// in the open popover -- that one's a full sentence meant for a
// hover/tooltip title, this is meant to fit under a compact card.
const RELIC_SELECT_CAPTION: Record<string, string> = {
  "Hades' Coin": 'Start the game with 1 coin',
  'Stone of Vitality': 'Start the game with 15 HP',
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
  // Which relic is selected, by name -- needed for the compact badge's
  // glyph/help text once more than one relic type is selectable.
  // COIN_RELIC_ID is resolved synchronously (a stable cross-environment
  // constant, same as config.COIN_RELIC_ID on wom-be) so the badge is
  // correct on the very first paint, before `relics` has ever loaded --
  // exactly the case every "selected state" test below renders directly
  // into, with no popover-open/fetch step first. Anything else falls back
  // to a name lookup in `relics`, which is only known once that load
  // resolves (a relic whose id isn't safe to hardcode, per RelicCoin.tsx).
  const selectedRelicName =
    selectedRelicId === COIN_RELIC_ID
      ? "Hades' Coin"
      : relics.find((r) => Number(r.id) === selectedRelicId)?.name;

  // Fetched on mount, not gated on `open`: the compact badge needs to know
  // *which* relic is selected (for its glyph/help text) even before the
  // popover is ever opened, e.g. right after the page loads with a relic
  // already selected from a previous session. This component only mounts
  // once per lobby (PlayerAvatars.tsx's isOwnPlayer gate), so this is one
  // extra call, not one per roster row.
  useEffect(() => {
    getPlayerRelics(playerName).then((data) => setRelics(data.relics));
  }, [playerName]);

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
        : (RELIC_SELECT_HELP[selectedRelicName ?? ''] ?? 'Selected');

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
            <span className="text-xl leading-none">
              {RELIC_BADGE_EMOJI[selectedRelicName ?? ''] ?? DEFAULT_RELIC_BADGE_EMOJI}
            </span>
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
        <div className="absolute z-30 top-full left-0 mt-1 w-max max-w-56 bg-white/20 backdrop-blur-md border border-white/40 rounded-lg shadow-lg p-4">
          {relics.length > 0 ? (
            <div className="flex flex-wrap gap-4">
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
                        : (RELIC_SELECT_HELP[relic.name] ?? relic.flavour_text ?? relic.name)
                    }
                    onClick={() => handleSelect(relicId)}
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-transparent transition-colors ${
                      onCooldown ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'
                    }`}
                  >
                    {/* Sized well beyond its old 40px -- this whole popover still
                        shrinks with camera distance (it lives in the same
                        distance-scaled Html as the name tag), so a bigger base
                        size keeps the coin legible even when the camera pulls
                        back, without needing to decouple its screen position. */}
                    <div className="w-20 h-20 overflow-hidden">
                      <RelicCoin relicName={relic.name} />
                    </div>
                    <span className="text-lg text-gray-700">×{relic.count}</span>
                    {/* Only relics with a wired server-side effect (see
                        RELIC_SELECT_HELP's own comment) get a caption --
                        this spells the effect out under the icon/count
                        instead of leaving it to the hover-only title
                        tooltip, which a touch device never sees at all. */}
                    {RELIC_SELECT_CAPTION[relic.name] && (
                      <span className="text-xs text-gray-600 text-center">{RELIC_SELECT_CAPTION[relic.name]}</span>
                    )}
                    {onCooldown && (
                      <RelicCooldownOverlay untilMs={cooldownUntil!} totalMs={COOLDOWN_MS} rounded="rounded-lg" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-base text-gray-500">You have no relics yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
