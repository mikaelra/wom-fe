'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// A round button that widens into its own choices (Mikael, 2026-10-12):
// showing the current one, a tap stretches the same pill to hold every
// option side by side; tapping one picks it and the pill shrinks back.
// Tapping the current one, outside, or Escape just shrinks it. Used by the
// graphics quality and camera speed buttons.

const chip =
  'w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold leading-none cursor-pointer transition-colors';

export interface Choice<T> {
  value: T;
  label: string;
  node?: ReactNode;
}

export default function ExpandingChoice<T extends string | number>({
  label,
  value,
  choices,
  onChoose,
  className = '',
}: {
  /** What is being chosen, e.g. "Graphics". */
  label: string;
  value: T;
  choices: Choice<T>[];
  onChoose: (value: T) => void;
  /** The pill's own look (background, border). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = choices.find((c) => c.value === value) ?? choices[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      role={open ? 'radiogroup' : undefined}
      aria-label={open ? label : undefined}
      className={`inline-flex items-center rounded-full text-white ${open ? 'gap-1 p-0.5' : ''} ${className}`}
    >
      {open ? (
        choices.map((c) => (
          <button
            key={String(c.value)}
            type="button"
            role="radio"
            aria-checked={c.value === value}
            aria-label={c.label}
            title={c.label}
            onClick={() => {
              setOpen(false);
              if (c.value !== value) onChoose(c.value);
            }}
            className={`${chip} ${c.value === value ? 'bg-white/25 ring-1 ring-white/60' : 'hover:bg-white/10'}`}
          >
            {c.node ?? c.label}
          </button>
        ))
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${label}: ${current.label}`}
          aria-expanded={false}
          title={`${label}: ${current.label}`}
          className={chip}
        >
          {current.node ?? current.label}
        </button>
      )}
    </div>
  );
}
