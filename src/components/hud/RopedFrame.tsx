import type { CSSProperties, ReactNode } from 'react';

const DEFAULT_IMAGE = '/models/buttons/rope_button-ld-v2.png';
// Same art as DEFAULT_IMAGE with its flat gray fill (162,162,162 exactly)
// chroma-keyed to transparent -- see fillColor below. Only the fill was
// removed; the rope border/outline pixels are untouched.
const FRAME_IMAGE = '/models/buttons/rope_frame-ld-v2.png';
// The gray-fill region alone, as opaque white on transparent (the exact
// inverse of FRAME_IMAGE's cutout) -- used as fillColor's CSS mask-image
// below. mask-size: contain fits this the same way object-fit: contain
// fits FRAME_IMAGE, so the two always stay pixel-aligned regardless of
// this frame's own box dimensions -- a plain percentage-inset div was
// tried first and only lined up when the box matched the art's exact
// aspect ratio, visibly off otherwise (confirmed live: a gap between the
// color and the rope border).
const FILL_MASK_IMAGE = '/models/buttons/rope_fillmask-ld-v2.png';

export type RopedFrameProps = {
  width?: number;
  height?: number;
  textClassName?: string;
  /** PNG rope-frame art. Defaults to the solid gray-fill art, or (when
   *  fillColor is set) the transparent-center frame art instead -- pass
   *  this explicitly only to override either. */
  imageUrl?: string;
  /** Tints the interior this color instead of the art's own flat gray
   *  fill -- switches imageUrl to FRAME_IMAGE (transparent center) and
   *  paints this color in behind it, clipped to the fill shape via
   *  FILL_MASK_IMAGE. */
  fillColor?: string;
  /** Applied to both the frame image and the fill layer -- RopedButton's
   *  pressed-state brightness/translateY. */
  artStyle?: CSSProperties;
  children?: ReactNode;
};

/**
 * The rope-frame art plus optional tinted fill and centered label, with no
 * interactivity of its own -- the shared visual core behind RopedButton
 * (which adds click/press/disabled handling around this) and any static
 * "roped" badge that isn't a button at all (e.g. the lobby's Lobby ID
 * pill).
 */
export default function RopedFrame({
  width = 170,
  height = 70,
  textClassName = 'text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]',
  imageUrl,
  fillColor,
  artStyle,
  children,
}: RopedFrameProps) {
  const resolvedImageUrl = imageUrl ?? (fillColor ? FRAME_IMAGE : DEFAULT_IMAGE);

  return (
    <div className="relative inline-block" style={{ width, height }}>
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
            ...artStyle,
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- a small
          fixed set of local static assets, not remote/user content */}
      <img
        src={resolvedImageUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-[filter,transform] duration-150"
        style={artStyle}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={textClassName}>{children}</span>
      </div>
    </div>
  );
}
