'use client';

import { useState, ReactNode } from 'react';
import RopedFrame from '@/components/hud/RopedFrame';

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
  /** Extra classes merged onto the outer <button> itself (e.g. a visibility
   *  toggle) -- textClassName is for the label, this is for the button. */
  className?: string;
  ariaLabel?: string;
  title?: string;
  /** PNG rope-frame art rendered behind the button label. Defaults to the
   *  solid gray-fill art, or (when fillColor is set) the transparent-center
   *  frame art instead -- pass this explicitly only to override either. */
  imageUrl?: string;
  /** Tints the button's interior this color instead of the art's own flat
   *  gray fill -- see RopedFrame's own comment for how. */
  fillColor?: string;
  /** Extra layer painted on top of the art/fill/text -- e.g. a cooldown
   *  timer overlay. Rendered last, so it covers everything else. */
  overlay?: ReactNode;
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
  className = '',
  ariaLabel,
  title,
  imageUrl,
  fillColor,
  overlay,
  children,
}: RopedButtonProps) {
  const [active, setActive] = useState(false);
  // Darken only on actual press or sticky selection — never on hover. A
  // hover-driven visual change makes touch browsers absorb the first tap as
  // a synthetic hover (no click) and leaves the button stuck looking pressed.
  const pressed = !disabled && (active || loading || selected);
  const pressedStyle = {
    filter: pressed ? 'brightness(0.65)' : 'brightness(1)',
    transform: pressed ? 'translateY(2px)' : 'translateY(0)',
  };

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
      title={title}
      className={`relative inline-block bg-transparent border-0 p-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 select-none ${className}`}
      style={{ width, height }}
    >
      <RopedFrame
        width={width}
        height={height}
        textClassName={textClassName}
        imageUrl={imageUrl}
        fillColor={fillColor}
        artStyle={pressedStyle}
      >
        {loading ? 'Loading...' : children}
      </RopedFrame>
      {overlay}
    </button>
  );
}
