'use client';

import { useState } from 'react';
import { TIMEWARP_PLANETS } from '@/lib/timewarpFx';

/**
 * The `?timewarp` preview's controls: play the full moon's timewarp, or a
 * conjunction's between any two planets -- for looking at and tuning the
 * animation without spending a relic. Only shown for a preview, never
 * after a real timewarp.
 */
export default function TimewarpPanel({ onPlay }: { onPlay: (value: string) => void }) {
  const [a, setA] = useState<string>('Mercury');
  const [b, setB] = useState<string>('Jupiter');

  const select = (value: string, onChange: (v: string) => void, other: string, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-black/70 border border-white/20 rounded px-2 py-1 text-xs text-white"
    >
      {TIMEWARP_PLANETS.map((p) => (
        <option key={p} value={p} disabled={p === other}>
          {p}
        </option>
      ))}
    </select>
  );

  const button = 'px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors';

  return (
    <div
      role="group"
      aria-label="Timewarp preview"
      className="absolute left-3 top-1/3 z-20 flex flex-col gap-2 bg-black/60 border border-white/15 rounded-lg p-3 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => onPlay('full_moon')}
        className={`${button} bg-purple-700/80 border-purple-400 text-purple-100 hover:bg-purple-600/80`}
      >
        Full Moon
      </button>
      <div className="flex items-center gap-1">
        {select(a, setA, b, 'First planet')}
        {select(b, setB, a, 'Second planet')}
      </div>
      <button
        type="button"
        onClick={() => onPlay(`${a}-${b}`)}
        className={`${button} bg-orange-600/80 border-orange-400 text-orange-50 hover:bg-orange-500/80`}
      >
        Conjunction
      </button>
    </div>
  );
}
