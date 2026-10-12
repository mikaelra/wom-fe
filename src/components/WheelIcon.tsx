// The wheel's icon (wheel v01, Mikael 2026-10-12): three frames of loading
// animation v16 in yellow, red and blue on top of each other. The Special
// Wheel's is the same in the secondary colours, green, orange and purple.
// Drawn in wom-tools (animation-generation/wheel.py --icon), transparent, 256px.
//
// Sized like the emoji it replaces: 1em square, sitting on the text's
// baseline, so a parent's text-3xl / text-5xl sizes it. Decorative -- every
// place it appears says "Wheel" in words beside it.
export const WHEEL_ICON_URL = '/images/wheel.png';
export const SPECIAL_WHEEL_ICON_URL = '/images/special-wheel.png';

export default function WheelIcon({ special = false, className = '' }: { special?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static file from public/, like the inventory's skin previews
    <img
      src={special ? SPECIAL_WHEEL_ICON_URL : WHEEL_ICON_URL}
      alt=""
      aria-hidden="true"
      data-testid={special ? 'special-wheel-icon' : 'wheel-icon'}
      draggable={false}
      className={`inline-block h-[1em] w-[1em] align-[-0.125em] ${className}`}
    />
  );
}
