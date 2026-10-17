// The wheel's icon (wheel v01, Mikael 2026-10-12): three frames of loading
// animation v16 in yellow, red and blue on top of each other. The Special
// Wheel's is the same in the secondary colours, green, orange and purple.
// Drawn in wom-tools (animation-generation/wheel.py --icon), transparent, 256px.
//
// Sized like the emoji it replaces: 1em square, sitting on the text's
// baseline, so a parent's text-3xl / text-5xl sizes it. Decorative -- every
// place it appears says "Wheel" in words beside it.
import { Fragment } from 'react';
import { splitWheelEmoji } from '@/lib/wheelEmoji';
import { PIXEL_SPECIAL_WHEEL_URL, PIXEL_WHEEL_URL, pixelImageStyle, withAura } from '@/lib/pixelArt';
import { useTextMode } from '@/lib/textMode';

export const WHEEL_ICON_URL = '/images/wheel.png';
export const SPECIAL_WHEEL_ICON_URL = '/images/special-wheel.png';

// The glow behind a wheel (the shop's Special Wheel is purple, Mikael 2026-10-17): a soft
// halo in the wheel's own colour, drawn as a CSS shadow in SD and HD.
const GLOW = {
  special: 'drop-shadow(0 0 0.22em rgba(168, 85, 247, 0.95)) drop-shadow(0 0 0.55em rgba(168, 85, 247, 0.6))',
  normal: 'drop-shadow(0 0 0.22em rgba(59, 130, 246, 0.9)) drop-shadow(0 0 0.55em rgba(59, 130, 246, 0.55))',
} as const;

export default function WheelIcon({
  special = false,
  glow = false,
  className = '',
}: {
  special?: boolean;
  /** A faint glow behind it in the wheel's colour: purple for the Special Wheel. In Low
   *  Definition the picture on its own aura (lib/pixelArt.ts) is that glow. */
  glow?: boolean;
  className?: string;
}) {
  // Low Definition draws the wheel on a 32x32 grid (lib/pixelArt.ts).
  const lowDefinition = useTextMode() === true;
  const plain = lowDefinition ? (special ? PIXEL_SPECIAL_WHEEL_URL : PIXEL_WHEEL_URL) : special ? SPECIAL_WHEEL_ICON_URL : WHEEL_ICON_URL;
  const src = lowDefinition && glow ? withAura(plain) : plain;
  const style = lowDefinition
    ? pixelImageStyle
    : glow
      ? { filter: GLOW[special ? 'special' : 'normal'] }
      : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static file from public/, like the inventory's skin previews
    <img
      src={src}
      alt=""
      aria-hidden="true"
      data-testid={special ? 'special-wheel-icon' : 'wheel-icon'}
      draggable={false}
      style={style}
      className={`inline-block h-[1em] w-[1em] align-[-0.125em] ${className}`}
    />
  );
}

/** A backend message with the wheel's icon wherever it says 🎡 (the round
 *  messages' "🎡 You won a Wheel! 🎡"). Match drops are normal wheels. */
export function WheelText({ text }: { text: string }) {
  return (
    <>
      {splitWheelEmoji(text).map((piece, i) =>
        piece === null ? <WheelIcon key={i} /> : <Fragment key={i}>{piece}</Fragment>,
      )}
    </>
  );
}
