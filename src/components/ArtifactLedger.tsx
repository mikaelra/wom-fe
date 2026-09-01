'use client';

import { useCallback, useEffect, useState } from 'react';

import { getArtifactLedger } from '@/lib/api';
import { ApiError, getStoredAccountToken } from '@/lib/http';
import { discoveryGapMs, formatDiscoveryGap } from '@/lib/artifactLedger';

type Entry = { ordinal: number; finder_name: string; discovered_at: string | null };

const PAGE = 100;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function oneIn(chance: number): string {
  if (chance >= 1) return 'guaranteed';
  return `1 in ${Math.round(1 / chance).toLocaleString()}`;
}

/**
 * The discovery ledger: every artifact ever found, oldest first, with who
 * found it and when.
 *
 * Readable only by someone who has discovered an artifact themselves. The
 * ledger is part of the reward -- who came before you, and where you stand
 * among them -- so anyone else gets the sealed state below rather than an
 * error. The real gate is the server's (403); this component only decides
 * how that reads.
 *
 * Used in two places -- the inventory's Artifacts card (in a modal) and the
 * Vault, which is now this list in a room rather than a password prompt.
 *
 * Paginated by keyset on `ordinal`. The list is short today and stays short
 * for a while, but the drop odds rise with every discovery until they reach
 * certainty, so its length eventually tracks the number of accounts that
 * have ever played (wom-be docs/ARTIFACT_PLAN.md §4.2.1) -- "load more" is
 * not decoration.
 */
export default function ArtifactLedger({
  highlightOrdinal = null,
  className = '',
}: {
  /** The viewer's own artifact, marked in the list. */
  highlightOrdinal?: number | null;
  className?: string;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [chance, setChance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // Not an error: the caller has no artifact (or no session), so the records
  // are simply not theirs to read.
  const [sealed, setSealed] = useState(false);

  const loadPage = useCallback(async (after: number) => {
    const token = getStoredAccountToken();
    if (!token) {
      setSealed(true);
      return;
    }
    const data = await getArtifactLedger(token, after, PAGE);
    setEntries((prev) => (after === 0 ? data.artifacts : [...prev, ...data.artifacts]));
    setTotal(data.total);
    setChance(data.current_chance);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadPage(0);
      } catch (e) {
        if (cancelled) return;
        // 401 (no valid session) and 403 (no artifact) are both "not yours
        // to read" -- neither is a fault worth showing as red text.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setSealed(true);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load the ledger.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const handleMore = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      await loadPage(last.ordinal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <p className={`text-white/60 text-sm ${className}`}>Loading the ledger…</p>;
  if (error) return <p className={`text-red-400 text-sm ${className}`}>{error}</p>;

  if (sealed) {
    return (
      <div className={className}>
        <p className="text-white/70 text-sm">
          These records are sealed. Only those who have discovered an artifact
          may read who came before them.
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={className}>
        <p className="text-white/70 text-sm">
          No artifact has ever been discovered. The first one is waiting.
        </p>
        {chance !== null && (
          <p className="text-white/50 text-xs mt-2">
            Every Well win: <strong className="text-amber-300">{oneIn(chance)}</strong>.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <p className="text-white/60 text-xs">
          {total.toLocaleString()} discovered
          {chance !== null && (
            <>
              {' · '}next: <strong className="text-amber-300">{oneIn(chance)}</strong> per Well win
            </>
          )}
        </p>
      </div>

      {/* Scrolls inside its own container so a long ledger never makes the
          page itself scroll sideways or push the modal off screen. */}
      <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
        <ol className="space-y-1">
          {entries.map((e, i) => {
            const isMine = highlightOrdinal === e.ordinal;
            // The gap to the discovery directly above. entries is one
            // append-only list across pages, so a row at a page boundary
            // still measures against the real previous entry rather than
            // starting over.
            const gap = i === 0 ? null : discoveryGapMs(entries[i - 1].discovered_at, e.discovered_at);
            return (
              <li
                key={e.ordinal}
                className={`rounded-lg px-3 py-2 border ${
                  isMine
                    ? 'bg-amber-500/15 border-amber-400/50'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`shrink-0 tabular-nums text-sm font-bold ${
                      e.ordinal === 1 ? 'text-amber-300' : 'text-white/50'
                    }`}
                    aria-label={`Artifact number ${e.ordinal}`}
                  >
                    #{e.ordinal}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold">
                    {e.finder_name}
                    {isMine && <span className="ml-2 text-xs text-amber-300">(you)</span>}
                  </span>
                  <span className="shrink-0 text-xs text-white/50 tabular-nums">
                    {formatDate(e.discovered_at)}
                  </span>
                </div>

                {/* How long the world waited after the discovery above this
                    one. Its own line, hard left, so the column of gaps reads
                    down the list as a rhythm -- which is the interesting
                    thing about it. #1 has nothing above it and gets none. */}
                {gap !== null && (
                  <div
                    className="mt-0.5 text-[11px] font-semibold tabular-nums"
                    style={{
                      color: '#6bff9e',
                      textShadow: '0 0 6px rgba(107, 255, 158, 0.55)',
                    }}
                    title="Time since the previous discovery"
                  >
                    + {formatDiscoveryGap(gap)}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {entries.length < total && (
        <button
          type="button"
          onClick={handleMore}
          disabled={loadingMore}
          className="mt-3 w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-sm font-semibold hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loadingMore ? 'Loading…' : `Load more (${(total - entries.length).toLocaleString()} left)`}
        </button>
      )}
    </div>
  );
}
