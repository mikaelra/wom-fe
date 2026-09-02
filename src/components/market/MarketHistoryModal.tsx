'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarketTrades } from '@/lib/api';
import { itemLabel, type MarketCatalog, type MarketTrade } from '@/lib/market';

/**
 * "History" -- the signed-in player's own completed swaps, newest first
 * (wom-be POST /market/trades). The trades they posted and the trades
 * they accepted, each told from their side: what they gave, what they
 * got, and who the other player was.
 *
 * Keyset-paginated: each "Load more" asks for the page below the last
 * row already shown.
 */
export default function MarketHistoryModal({
  token,
  catalog,
  onClose,
}: {
  token: string;
  catalog: MarketCatalog | null;
  onClose: () => void;
}) {
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards the first load against a StrictMode double-invoke.
  const started = useRef(false);

  const load = useCallback(
    async (cursor: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const page = await getMarketTrades(token, cursor != null ? { before: cursor } : {});
        setTrades((prev) => (cursor == null ? page.trades : [...prev, ...page.trades]));
        setHasMore(page.has_more);
        setBefore(page.next_before);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load your trade history.');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(null);
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-gray-900 text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-lg font-semibold">Your trade history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {error && <p className="text-sm text-red-400">{error}</p>}

          {!error && trades.length === 0 && !loading && (
            <p className="text-sm text-white/50">You haven&apos;t completed any trades yet.</p>
          )}

          <ul className="space-y-2">
            {trades.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-white/90">
                    <span className="text-white/40">
                      {t.role === 'seller' ? 'sold to ' : 'bought from '}
                    </span>
                    <span className="font-semibold text-sky-400/90">{t.counterparty_name}</span>
                  </span>
                  <time
                    dateTime={t.completed_at}
                    className="shrink-0 text-[11px] tabular-nums text-white/40"
                  >
                    {formatWhen(t.completed_at)}
                  </time>
                </div>
                <p className="mt-1 text-white/70">
                  <span className="text-white/40">you gave </span>
                  <span>{itemsText(t.gave, catalog)}</span>
                  <span className="text-white/40"> · got </span>
                  <span>{itemsText(t.got, catalog)}</span>
                </p>
              </li>
            ))}
          </ul>

          {loading && <p className="mt-2 text-xs text-white/40">Loading…</p>}
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          {hasMore ? (
            <button
              type="button"
              onClick={() => void load(before)}
              disabled={loading}
              className="w-full rounded-lg bg-white/10 py-2 text-sm font-semibold hover:bg-white/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          ) : (
            <p className="text-center text-xs text-white/30">
              {trades.length > 0 ? 'End of history.' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function itemsText(items: MarketTrade['gave'], catalog: MarketCatalog | null): string {
  if (items.length === 0) return 'nothing';
  return items.map((i) => itemLabel(i, catalog)).join(', ');
}

/** "14:03" for today, "Sep 1, 14:03" otherwise -- local clock. "" if it
 *  doesn't parse. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}
