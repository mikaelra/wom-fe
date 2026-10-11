'use client';

import type { CSSProperties, MouseEventHandler } from 'react';

type ActionImageButtonProps = {
  src: string;
  alt: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** The player's currently-chosen action for this round -- not a momentary
   *  press state, since the choice stays highlighted until the round
   *  resolves (matches the dark/bright swap the text-label buttons already
   *  did before these images replaced them). */
  selected?: boolean;
  /** CSS color used for the selected-state glow, e.g. 'rgba(239,68,68,0.7)'. */
  glowColor: string;
  width?: number;
  className?: string;
  style?: CSSProperties;
};

// Cropped LD button art (attack-ld.png etc.) is a tightly-bound pill shape
// with only a few px of transparent margin left for anti-aliasing -- see the
// crop step that produced them -- so the clickable rectangle around the
// <img> stays close to the visible art instead of leaving a large
// dead-but-clickable blank area around a small graphic.
export default function ActionImageButton({
  src,
  alt,
  onClick,
  selected = false,
  glowColor,
  width = 200,
  className,
  style,
}: ActionImageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      style={{
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        padding: 0,
        lineHeight: 0,
        // Shapes the warn-blink-gold/red box-shadow (globals.css) to the
        // art's own rounded-pill silhouette instead of tracing the button's
        // full rectangular box (which has visible transparent margin in the
        // corners). Measured against attack-ld.png/defend-ld.png/well-ld.png's
        // actual alpha channel: the corner rounding is close to circular in
        // absolute terms (~55-60px on the ~613x218 source art), NOT
        // elliptical -- a single percentage (e.g. 28%) stretches the corner
        // into a flat ellipse on these wide, short buttons (28% of the
        // ~613px width is ~168px, nearly 3x the vertical rounding), which
        // undershoots the curve and leaves the shadow sitting behind the
        // art's own corners instead of around them. `H% / V%` sizes each
        // axis off its own dimension (width vs height) so the two roughly
        // cancel out to a near-circular radius despite the button's ~2.8:1
        // aspect ratio. The "selected" glow (below, a per-pixel drop-shadow
        // on the <img> itself) already hugs the art correctly and isn't
        // affected by this.
        borderRadius: '9% / 26%',
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          width,
          // Tailwind's preflight sets `img { max-width: 100% }`. The button
          // wrapper here has no defined width of its own (it shrink-wraps to
          // this image), so that percentage is indeterminate and resolves to
          // 0 per the CSS auto-sizing algorithm -- which then clamps the
          // explicit width above down to 0px too. Reproduced on both a
          // desktop browser and a real phone: the image loads fine
          // (naturalWidth/Height correct) but getComputedStyle reports
          // width/height of 0. maxWidth: 'none' opts this image out of that
          // preflight rule so the explicit width actually applies.
          maxWidth: 'none',
          height: 'auto',
          display: 'block',
          pointerEvents: 'none',
          filter: selected
            ? `brightness(1.2) saturate(1.35) drop-shadow(0 0 8px ${glowColor})`
            : 'brightness(0.82) saturate(0.85)',
          transition: 'filter 120ms ease-out',
        }}
      />
    </button>
  );
}
