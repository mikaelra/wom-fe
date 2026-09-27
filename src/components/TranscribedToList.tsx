'use client';

import { useState } from 'react';
import { getArtifactTranscribedTo, type TranscribedEntry } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type Level = { name: string; entries: TranscribedEntry[] };

/**
 * Who the viewer's Artifact was transcribed to, in order -- each a Paper
 * someone turned into an Artifact of their own from this one (wom-be
 * docs/MARKET_PLAN.md §1B). Styled as the discoverers list beside it.
 *
 * Followable down the chain: someone who transcribed it on in turn opens
 * their own list (Oni's shows Skoober; Skoober's shows Blimkin), with a
 * trail back up.
 */
export default function TranscribedToList({ entries }: { entries: TranscribedEntry[] }) {
  // The levels opened below the viewer's own list.
  const [path, setPath] = useState<Level[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const shown = path.length ? path[path.length - 1].entries : entries;

  const open = async (e: TranscribedEntry) => {
    const token = getStoredAccountToken();
    if (!token || e.id == null) return;
    setLoading(true);
    setError('');
    try {
      const res = await getArtifactTranscribedTo(token, e.id);
      setPath((p) => [...p, { name: res.name, entries: res.transcribed_to }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {path.length > 0 && (
        <nav aria-label="Transcribed from" className="flex flex-wrap items-center gap-1 text-sm mb-3">
          {[{ name: 'You' }, ...path].map((level, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-white/30" aria-hidden>›</span>}
              {i === path.length ? (
                <span className="font-semibold">{level.name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPath((p) => p.slice(0, i))}
                  className="text-amber-300 hover:text-amber-200 cursor-pointer"
                >
                  {level.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {shown.length === 0 ? (
        <p className="text-white/70 text-sm">No one yet.</p>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          <ol className="space-y-1">
            {shown.map((e, i) => {
              const followable = e.id != null && (e.transcribed_count ?? 0) > 0;
              const row = (
                <>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-white/50">
                    #{e.copy_number ?? i + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-left">{e.name}</span>
                  <span className="shrink-0 text-xs text-white/50 tabular-nums">{formatDate(e.at)}</span>
                  {followable && <span className="shrink-0 text-white/50" aria-hidden>›</span>}
                </>
              );
              const cls = 'w-full flex items-center gap-3 rounded-lg px-3 py-2 border bg-white/5 border-white/10';
              return (
                <li key={`${e.id ?? i}-${e.name}`}>
                  {followable ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void open(e)}
                      aria-label={`${e.name}, who they transcribed it to`}
                      className={`${cls} hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-60`}
                    >
                      {row}
                    </button>
                  ) : (
                    <div className={cls}>{row}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
