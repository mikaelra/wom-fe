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
  /** Animation kind for the next value change: a gain bounce or a hit shake. */
  anim?: 'bounce' | 'shake';
  /** Increment to flash a blue "blocked" aura on the card (no value change). */
  blockPulse?: number;
};

const BASE_CLASS =
  'backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150';

// Delay before the number swaps to its new value — lines up with the bounce's
// rise so the player sees "bounce, then the number changes". Scaled to
// 0.8x for a modest speedup.
const SWAP_DELAY_MS = 218;

// Must match globals.css's .resource-bounce / .resource-shake animation
// durations. The bounce/shake class is only applied for this long -- left
// on longer than that, it permanently wins the CSS cascade over
// .warn-blink-gold/.warn-blink-red (same specificity, declared later in
// the stylesheet), silencing the 10s/5s warning blink on any card whose
// value has ever changed.
const ANIM_DURATION_MS: Record<'bounce' | 'shake', number> = {
  bounce: 490,
  shake: 420,
};

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
  anim = 'bounce',
  blockPulse = 0,
}: ResourceCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [bounceCount, setBounceCount] = useState(0);
  const prevValueRef = useRef(value);
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Animation class for the current value change (read at change time so the
  // parent can set `anim` together with the new value).
  const animRef = useRef(anim);
  animRef.current = anim;
  const [animClass, setAnimClass] = useState('resource-bounce');
  // Whether the bounce/shake is actively playing right now -- distinct from
  // bounceCount > 0, which stays true forever after the first change. Gating
  // the class on this instead keeps it from permanently blocking the
  // warn-blink cue once the animation has actually finished.
  const [isAnimating, setIsAnimating] = useState(false);
  const animEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;

    // Retrigger the animation (key-remount) with the kind for this change, and
    // swap the number after the animation's rise.
    const kind = animRef.current === 'shake' ? 'shake' : 'bounce';
    setAnimClass(kind === 'shake' ? 'resource-shake' : 'resource-bounce');
    setBounceCount((c) => c + 1);
    setIsAnimating(true);
    if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
    swapTimerRef.current = setTimeout(() => setDisplayValue(value), SWAP_DELAY_MS);
    if (animEndTimerRef.current) clearTimeout(animEndTimerRef.current);
    animEndTimerRef.current = setTimeout(() => setIsAnimating(false), ANIM_DURATION_MS[kind]);

    return () => {
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current);
      if (animEndTimerRef.current) clearTimeout(animEndTimerRef.current);
    };
  }, [value]);

  // The button is keyed by bounceCount so each value change remounts it and
  // restarts the bounce/shake. The block aura lives as a sibling in this wrapper
  // (keyed by blockPulse) so it animates only on a block — not on every remount.
  return (
    <div className="relative inline-flex">
      <button
        key={`bounce-${bounceCount}`}
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`${BASE_CLASS} ${isAnimating ? animClass : ''} ${className}`}
      >
        <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
        <p className={`${valueClass} font-bold text-xl leading-tight`}>{displayValue}</p>
        <p className={`${sublabelClass} text-xs`}>{sublabel}</p>
        {overlay}
      </button>
      {blockPulse > 0 && (
        <span key={`pulse-${blockPulse}`} className="resource-block-aura pointer-events-none absolute inset-0 rounded-lg" />
      )}
    </div>
  );
}
