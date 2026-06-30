'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';

type ResourceCardProps = {
  /** Current value from game state. The card bounces whenever this changes. */
  value: number;
  /** Top label, e.g. "HP". */
  label: string;
  /** Bottom hint, e.g. "❤ Get". */
  sublabel: string;
  /** Tailwind color class for the big number, e.g. "text-red-400". */
  valueClass: string;
  /** Tailwind color class for the sublabel, e.g. "text-red-400/70". */
  sublabelClass: string;
  /** Fully-composed conditional button classes (state, color, cue, hover). */
  className: string;
  disabled: boolean;
  onClick: () => void;
  /** Optional overlay (e.g. ATK "can't afford" diagonal line). */
  overlay?: ReactNode;
};

const BASE_CLASS =
  'backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150';

// Delay before the number swaps to its new value — lines up with the bounce's
// rise so the player sees "bounce, then the number changes".
const SWAP_DELAY_MS = 180;

/**
 * A single resource stat button (HP / Coins / ATK). Displays the current value
 * and plays a small bounce whenever that value changes, swapping to the new
 * number just after the bounce begins. Increases and decreases look identical.
 */
export default function ResourceCard({
  value,
  label,
  sublabel,
  valueClass,
  sublabelClass,
  className,
  disabled,
  onClick,
  overlay,
}: ResourceCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [bounceCount, setBounceCount] = useState(0);
  const prevValueRef = useRef(value);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;

    // Retrigger the bounce animation (key-remount) and swap the number after
    // the bounce's rise.
    setBounceCount((c) => c + 1);
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    swapTimerRef.current = setTimeout(() => setDisplayValue(value), SWAP_DELAY_MS);

    return () => {
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    };
  }, [value]);

  return (
    <button
      key={bounceCount}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${BASE_CLASS} ${bounceCount > 0 ? 'resource-bounce' : ''} ${className}`}
    >
      <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`${valueClass} font-bold text-xl leading-tight`}>{displayValue}</p>
      <p className={`${sublabelClass} text-xs`}>{sublabel}</p>
      {overlay}
    </button>
  );
}
