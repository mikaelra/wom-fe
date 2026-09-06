'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  clampCoins,
  itemKey,
  itemName,
  longOfferHours,
  mergeItemInputs,
  MAX_LONG_COINS,
  type MarketCatalog,
  type MarketItemInput,
} from '@/lib/market';

/**
 * The craft window opened by `/offer` (free, 60s) and `/longoffer` (paid,
 * 6-24h) in the market chat (wom-be docs/MARKET_PLAN.md §1A.1 / §1A.8).
 *
 * Two sides: **give** is picked from the player's own inventory, **want**
 * is searched from the full item catalog (the counterparty is unknown at
 * craft time, so "want" can't come from an inventory). Each side needs at
 * least one item; the two may be uneven.
 *
 * "Post" opens an in-place confirmation step -- a posted trade can be
 * accepted by anyone the instant it lands, so it is never a bare click.
 */

export type OwnedItem = {
  input: MarketItemInput;
  label: string;
  count: number;
};

type Line = { input: MarketItemInput; label: string; max: number | null };

/** Same sections, same order, same wording as the inventory page
 *  (src/app/inventory/page.tsx): Relics, Wheels, Skins. */
const CATEGORIES: ReadonlyArray<{ type: MarketItemInput['item_type']; label: string }> = [
  { type: 'ai_credits', label: 'AI credits' },
  { type: 'relic', label: 'Relics' },
  { type: 'wheel', label: 'Wheels' },
  { type: 'skin', label: 'Skins' },
];

//: ai_credits per line -- matches domain/market.py's MAX_AI_CREDITS_PER_ITEM.
const MAX_AI_CREDITS_PER_ITEM = 1000;

function CategoryHeader({ label }: { label: string }) {
  return (
    <p className="w-full text-[10px] uppercase tracking-wide text-white/40 mt-2 first:mt-0 mb-1">
      {label}
    </p>
  );
}

export default function CraftOfferModal({
  kind,
  catalog,
  owned,
  coinsAvailable,
  onSubmit,
  onClose,
}: {
  kind: 'quick' | 'long';
  catalog: MarketCatalog;
  /** The player's tradeable inventory, flattened. */
  owned: OwnedItem[];
  coinsAvailable: number;
  onSubmit: (payload: {
    kind: 'quick' | 'long';
    coins: number;
    give: MarketItemInput[];
    want: MarketItemInput[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [give, setGive] = useState<Line[]>([]);
  const [want, setWant] = useState<Line[]>([]);
  const [coins, setCoins] = useState(1);
  const [wantSearch, setWantSearch] = useState('');
  const [step, setStep] = useState<'craft' | 'confirm'>('craft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catalogLines = useMemo<Line[]>(() => {
    const skins: Line[] = catalog.skins.map((s) => ({
      input: { item_type: 'skin', skin: s, quantity: 1 },
      label: itemName({ item_type: 'skin', skin: s, relic_id: null, wheel_kind: null }, catalog),
      max: null,
    }));
    const relics: Line[] = catalog.relics.map((r) => ({
      input: { item_type: 'relic', relic_id: r.id, quantity: 1 },
      label: r.name,
      max: null,
    }));
    const wheels: Line[] = catalog.wheel_kinds.map((k) => ({
      input: { item_type: 'wheel', wheel_kind: k, quantity: 1 },
      label: itemName({ item_type: 'wheel', skin: null, relic_id: null, wheel_kind: k }, catalog),
      max: null,
    }));
    // ai_credits isn't a catalog row -- it's always askable, any amount.
    const aiCredits: Line = {
      input: { item_type: 'ai_credits', quantity: 1 },
      label: 'AI credits',
      max: MAX_AI_CREDITS_PER_ITEM,
    };
    return [aiCredits, ...skins, ...relics, ...wheels];
  }, [catalog]);

  const wantMatches = catalogLines.filter((l) =>
    l.label.toLowerCase().includes(wantSearch.trim().toLowerCase()),
  );

  const addTo = (side: 'give' | 'want', line: Line) => {
    const setter = side === 'give' ? setGive : setWant;
    setter((prev) => {
      const existing = prev.find((l) => itemKey(l.input) === itemKey(line.input));
      if (existing) {
        const nextQty = existing.input.quantity + 1;
        if (line.max != null && nextQty > line.max) return prev;
        return prev.map((l) =>
          l === existing ? { ...l, input: { ...l.input, quantity: nextQty } } : l,
        );
      }
      return [...prev, { ...line, input: { ...line.input, quantity: 1 } }];
    });
  };

  const removeFrom = (side: 'give' | 'want', key: string) => {
    const setter = side === 'give' ? setGive : setWant;
    setter((prev) => prev.filter((l) => itemKey(l.input) !== key));
  };

  const setQty = (side: 'give' | 'want', key: string, qty: number) => {
    const setter = side === 'give' ? setGive : setWant;
    setter((prev) =>
      prev.map((l) => {
        if (itemKey(l.input) !== key) return l;
        const clamped = Math.max(1, Math.min(qty, l.max ?? 99));
        return { ...l, input: { ...l.input, quantity: clamped } };
      }),
    );
  };

  const canProceed =
    give.length > 0 &&
    want.length > 0 &&
    (kind === 'quick' || (coins >= 1 && coins <= Math.min(MAX_LONG_COINS, coinsAvailable)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        coins: kind === 'long' ? clampCoins(coins) : 0,
        give: mergeItemInputs(give.map((l) => l.input)),
        want: mergeItemInputs(want.map((l) => l.input)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post the trade.');
      setBusy(false);
      setStep('craft');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-white/15 p-5 text-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {kind === 'long' ? 'Craft a long offer' : 'Craft an offer'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white text-xl leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {step === 'craft' && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              {/* GIVE */}
              <section>
                <h3 className="text-sm font-semibold text-white/70 mb-1">You give</h3>
                <SideList
                  lines={give}
                  onRemove={(k) => removeFrom('give', k)}
                  onQty={(k, q) => setQty('give', k, q)}
                />
                <p className="text-xs text-white/40 mt-2 mb-1">From your inventory:</p>
                <div className="flex flex-wrap gap-1">
                  {owned.length === 0 && (
                    <span className="text-xs text-white/40">Nothing tradeable yet.</span>
                  )}
                  {CATEGORIES.map(({ type, label }) => {
                    const rows = owned.filter((o) => o.input.item_type === type);
                    if (rows.length === 0) return null;
                    return (
                      <div key={type} className="w-full flex flex-wrap gap-1">
                        <CategoryHeader label={label} />
                        {rows.map((o) => (
                          <button
                            key={itemKey(o.input)}
                            type="button"
                            onClick={() =>
                              addTo('give', { input: o.input, label: o.label, max: o.count })
                            }
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {o.label}{' '}
                            <span className="text-white/40">
                              {o.input.item_type === 'ai_credits' ? `(${o.count})` : `×${o.count}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* WANT */}
              <section>
                <h3 className="text-sm font-semibold text-white/70 mb-1">You want</h3>
                <SideList
                  lines={want}
                  onRemove={(k) => removeFrom('want', k)}
                  onQty={(k, q) => setQty('want', k, q)}
                />
                <input
                  value={wantSearch}
                  onChange={(e) => setWantSearch(e.target.value)}
                  placeholder="Search the catalog…"
                  className="w-full mt-2 mb-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none focus:border-white/30"
                />
                <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                  {CATEGORIES.map(({ type, label }) => {
                    const rows = wantMatches.filter((l) => l.input.item_type === type);
                    if (rows.length === 0) return null;
                    return (
                      <div key={type} className="w-full flex flex-wrap gap-1">
                        <CategoryHeader label={label} />
                        {rows.map((l) => (
                          <button
                            key={itemKey(l.input)}
                            type="button"
                            onClick={() => addTo('want', l)}
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {kind === 'long' && (
              <div className="mt-4 bg-amber-950/40 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-100 mb-2">
                  Spend Hades&apos; Coins for board time — 6h each, non-refundable.
                  You have {coinsAvailable}.
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={n > coinsAvailable}
                      onClick={() => setCoins(n)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:opacity-30 ${
                        coins === n
                          ? 'bg-amber-500 text-black'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {n}🪙 → {longOfferHours(n)}h
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => setStep('confirm')}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Review &amp; post
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="text-sm text-white/80 space-y-3">
            <p>Post this trade to the board?</p>
            <div className="rounded-lg bg-white/5 border border-white/10 p-3">
              <p>
                <span className="text-white/50">Give: </span>
                {give.map((l) => `${l.label}${l.input.quantity > 1 ? ` ×${l.input.quantity}` : ''}`).join(', ')}
              </p>
              <p>
                <span className="text-white/50">Want: </span>
                {want.map((l) => `${l.label}${l.input.quantity > 1 ? ` ×${l.input.quantity}` : ''}`).join(', ')}
              </p>
              <p className="text-white/50 mt-1">
                {kind === 'long'
                  ? `Lives ${longOfferHours(coins)}h · costs ${clampCoins(coins)} Hades' Coin(s), non-refundable`
                  : 'Lives 60 seconds · free'}
              </p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep('craft')}
                className="px-4 py-2 rounded-lg border border-white/20 text-sm hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Posting…' : 'Post trade'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SideList({
  lines,
  onRemove,
  onQty,
}: {
  lines: Line[];
  onRemove: (key: string) => void;
  onQty: (key: string, qty: number) => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 text-xs text-white/40 p-3 text-center">
        Pick at least one item
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {lines.map((l) => {
        const key = itemKey(l.input);
        return (
          <li
            key={key}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs"
          >
            <span className="flex-1 truncate">{l.label}</span>
            <QtyInput
              value={l.input.quantity}
              max={l.max ?? 99}
              onCommit={(n) => onQty(key, n)}
            />
            <button
              type="button"
              onClick={() => onRemove(key)}
              className="text-white/40 hover:text-red-400 cursor-pointer"
              aria-label="Remove"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A quantity box you can actually edit. A plain controlled
 * `<input type="number" value={n}>` with an onChange that clamps to >= 1
 * snaps back to "1" the instant you delete the digit, so you can never
 * type a fresh number. This keeps its own string draft: type anything
 * (including empty) while focused; a valid whole number >= 1 commits
 * live; on blur an invalid or empty box reverts to the last good value.
 */
export function QtyInput({
  value,
  max,
  onCommit,
}: {
  value: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Follow the committed value when it changes from outside (picking the
  // same item again bumps its quantity) -- but don't fight the user while
  // they're mid-edit on a draft that already parses to the same number.
  useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)));
  }, [value]);

  const parse = (s: string): number | null => {
    if (s.trim() === '') return null;
    const n = Number(s);
    return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : null;
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label="Quantity"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parse(e.target.value);
        if (n !== null && n !== value) onCommit(n);
      }}
      onBlur={() => {
        const n = parse(draft);
        setDraft(String(n ?? value));
        if (n !== null && n !== value) onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="w-12 bg-white/10 rounded px-1 py-0.5 text-center outline-none"
    />
  );
}
