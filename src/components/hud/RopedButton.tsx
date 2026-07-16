'use client';

import { useState, ReactNode } from 'react';

const DEFAULT_IMAGE = '/models/buttons/rope_button-ld-v2.png';

type RopedButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Render the button in its darkened/pressed state regardless of pointer
   *  interaction. Used to indicate a sticky selection (e.g. action chosen
   *  for the current round). */
  selected?: boolean;
  width?: number;
  height?: number;
  textClassName?: string;
  ariaLabel?: string;
  /** PNG rope-frame art rendered behind the button label. */
  imageUrl?: string;
  children?: ReactNode;
};

export default function RopedButton({
  onClick,
  disabled = false,
  loading = false,
  selected = false,
  width = 170,
  height = 70,
  textClassName = 'text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
  ariaLabel,
  imageUrl = DEFAULT_IMAGE,
  children,
}: RopedButtonProps) {
  const [active, setActive] = useState(false);
  // Darken only on actual press or sticky selection — never on hover. A
  // hover-driven visual change makes touch browsers absorb the first tap as
  // a synthetic hover (no click) and leaves the button stuck looking pressed.
  const pressed = !disabled && (active || loading || selected);

  return (
    <button
      type="button"
      onClick={() => { if (!disabled && !loading) onClick?.(); }}
      onPointerLeave={() => setActive(false)}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className="relative inline-block bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 select-none"
      style={{ width, height }}
    >
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter,transform] duration-150"
        style={{
          filter: pressed ? 'brightness(0.65)' : 'brightness(1)',
          transform: pressed ? 'translateY(2px)' : 'translateY(0)',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={textClassName}>
          {loading ? 'Loading...' : children}
        </span>
      </div>
    </button>
  );
}
