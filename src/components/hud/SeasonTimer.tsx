'use client';

import { useEffect, useState } from 'react';
import { getCurrentSeason } from '@/lib/api';

/** The single largest time unit remaining until `msRemaining` runs out,
 *  formatted as "12d" / "4h" / "23m" / "52s" -- never stacked. Product
 *  decision 2026-09-22: a player checking the countdown wants "it's
 *  days away" or "it's minutes away", not a ticking "12d 4h 23m 52s" --
 *  so only the most relevant unit is ever shown, and which unit that is
 *  changes automatically as the deadline gets closer. */
export function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSeconds / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 1) return `${minutes}m`;
  return `${totalSeconds}s`;
}

/** "{season}. New season in {countdown}." (docs/RANK_SYSTEM_PLAN.md §12) --
 *  the caller decides *when* to render this (stats/page.tsx and
 *  my-ai/page.tsx both gate it on the player having a rank to show, same
 *  as RankBadge), this component only knows how to fetch and tick it.
 *
 *  Fetches the current season once on mount and ticks the countdown
 *  locally every second rather than repolling the server every tick --
 *  seasons run ~3 months, so a single read is plenty fresh for as long as
 *  anyone keeps this page open. */
export default function SeasonTimer({ className = '' }: { className?: string }) {
  const [season, setSeason] = useState<{ name: string; endsAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getCurrentSeason()
      .then((data) => {
        if (!cancelled) setSeason({ name: data.name, endsAt: new Date(data.ends_at).getTime() });
      })
      .catch(() => {
        // Silent -- a missing season timer isn't worth an error banner.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!season) return null;

  return (
    <p className={`italic text-white/50 ${className}`}>
      {season.name}. New season in {formatCountdown(season.endsAt - now)}.
    </p>
  );
}
