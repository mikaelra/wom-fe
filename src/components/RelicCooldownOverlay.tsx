'use client';

import { useEffect, useState } from 'react';

type RelicCooldownOverlayProps = {
  /** Timestamp (Date.now()-scale) the cooldown ends. */
  untilMs: number;
  totalMs: number;
  rounded?: string;
};

// A red, 60%-opaque pie timer that drains as the cooldown elapses -- the
// drain itself communicates both "how much longer" and "you can't use
// this right now", so no separate strike-through is layered on top. Ticks
// every 100ms, which is cheap for a single small overlay and stops
// re-rendering once the cooldown ends.
export default function RelicCooldownOverlay({ untilMs, totalMs, rounded = 'rounded-full' }: RelicCooldownOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (now >= untilMs) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [now, untilMs]);

  const remaining = Math.max(0, untilMs - now);
  const fraction = totalMs > 0 ? remaining / totalMs : 0;
  const angle = fraction * 360;

  if (remaining <= 0) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${rounded}`}
      style={{ background: `conic-gradient(rgba(220,38,38,0.6) ${angle}deg, transparent ${angle}deg)` }}
      data-testid="relic-cooldown-overlay"
    />
  );
}
