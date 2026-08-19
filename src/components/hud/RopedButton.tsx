'use client';

import { useState, ReactNode } from 'react';

const DEFAULT_IMAGE = '/models/buttons/rope_button-ld-v2.png';
// Same art as DEFAULT_IMAGE with its flat gray fill (162,162,162 exactly)
// chroma-keyed to transparent -- see fillColor below. Only the fill was
// removed; the rope border/outline pixels are untouched.
const FRAME_IMAGE = '/models/buttons/rope_frame-ld-v2.png';
// The gray-fill region alone, as opaque white on transparent (the exact
// inverse of FRAME_IMAGE's cutout) -- used as fillColor's CSS mask-image
// below. A first attempt positioned a plain inset div at hand-measured
// percentages instead; that only lined up when the button's box matched
// the art's exact aspect ratio, and was visibly off otherwise (confirmed
// live: a gap between the color and the rope border). mask-size: contain
// fits this the same way object-fit: contain fits FRAME_IMAGE, so the two
// always stay pixel-aligned regardless of the button's own dimensions --
// no aspect-ratio caveat needed.
const FILL_MASK_IMAGE = '/models/buttons/rope_fillmask-ld-v2.png';

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
   *  gray fill -- switches imageUrl to FRAME_IMAGE (transparent center) and
   *  paints this color in behind it, clipped to the fill shape via
   *  FILL_MASK_IMAGE (see its own comment). */
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
  const resolvedImageUrl = imageUrl ?? (fillColor ? FRAME_IMAGE : DEFAULT_IMAGE);
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
      {fillColor && (
        <div
          className="absolute inset-0 pointer-events-none transition-[filter,transform] duration-150"
          style={{
            background: fillColor,
            WebkitMaskImage: `url(${FILL_MASK_IMAGE})`,
            maskImage: `url(${FILL_MASK_IMAGE})`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            ...pressedStyle,
          }}
        />
      )}
      <img
        src={resolvedImageUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter,transform] duration-150"
        style={pressedStyle}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={textClassName}>
          {loading ? 'Loading...' : children}
        </span>
      </div>
      {overlay}
    </button>
  );
}
