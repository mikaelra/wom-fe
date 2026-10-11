'use client';

import { formatEnded, pageCount, rowNumber } from '@/lib/paging';

// A season's games, a page at a time (lib/paging.ts): each row numbered
// from 1 for the newest, and under them |< < page > >| to go through them
// (Mikael, 2026-10-11). Shared by the My AI page and the stats page's
// ranked Games.

export interface GameRow {
  id: string;
  placement: number;
  rank: string | null;
  opponents: string;
  at: string | null;
}

const pagerButton =
  'px-2 py-1 rounded-md border border-white/20 bg-white/10 text-white text-sm font-semibold cursor-pointer hover:bg-white/20 disabled:opacity-30 disabled:cursor-default';

export default function GameHistoryTable({
  rows,
  total,
  page,
  perPage,
  onPage,
}: {
  rows: GameRow[];
  total: number;
  page: number;
  perPage: number;
  onPage: (page: number) => void;
}) {
  const pages = pageCount(total, perPage);
  return (
    <div className="w-full">
      <table className="text-sm text-white/80 w-full">
        <thead className="text-white/50 text-xs">
          <tr>
            <th className="text-left">#</th>
            <th className="text-left">Placed</th>
            <th className="text-left">Rank after</th>
            <th className="text-left">Opponents</th>
            <th className="text-right">Ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-white/10">
              <td className="text-white/50 pr-2">{rowNumber(page, i, perPage)}</td>
              <td>#{r.placement}</td>
              <td>{r.rank ?? '—'}</td>
              <td>{r.opponents}</td>
              <td className="text-right text-white/50 whitespace-nowrap">{r.at ? formatEnded(r.at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 mt-3" aria-label="Pages">
          <button type="button" className={pagerButton} disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">
            |&lt;
          </button>
          <button type="button" className={pagerButton} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            &lt;
          </button>
          <span className="text-white/60 text-sm px-2">
            {page} / {pages}
          </span>
          <button type="button" className={pagerButton} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            &gt;
          </button>
          <button type="button" className={pagerButton} disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page">
            &gt;|
          </button>
        </nav>
      )}
    </div>
  );
}
