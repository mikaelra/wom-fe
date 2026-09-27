'use client';

import type { TranscribedEntry } from '@/lib/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Who the viewer's Artifact was transcribed to, in order -- each a Paper
 * someone turned into an Artifact of their own from this one (wom-be
 * docs/MARKET_PLAN.md §1B). Styled as the discoverers list beside it.
 */
export default function TranscribedToList({ entries }: { entries: TranscribedEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-white/70 text-sm">No one yet.</p>;
  }
  return (
    <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
      <ol className="space-y-1">
        {entries.map((e, i) => (
          <li
            key={`${e.copy_number ?? i}-${e.name}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2 border bg-white/5 border-white/10"
          >
            <span className="shrink-0 tabular-nums text-sm font-bold text-white/50">
              #{e.copy_number ?? i + 1}
            </span>
            <span className="flex-1 min-w-0 truncate text-sm font-semibold">{e.name}</span>
            <span className="shrink-0 text-xs text-white/50 tabular-nums">{formatDate(e.at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
