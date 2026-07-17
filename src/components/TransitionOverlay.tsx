'use client';

// Full-screen white overlay used for the "zoom into the world, then into white"
// (outgoing) and "pan out from white" (incoming) halves of the lobby entrance
// transition. Both directions animate the same white sheet via CSS clip-path,
// so the circle's growth/shrink reads as the camera pushing through it.
export function TransitionOverlay({
  direction,
  onAnimationEnd,
}: {
  direction: 'out' | 'in';
  onAnimationEnd?: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-[999] bg-white pointer-events-none ${
        direction === 'out' ? 'lobby-transition-out' : 'lobby-transition-in'
      }`}
      onAnimationEnd={onAnimationEnd}
      aria-hidden="true"
    />
  );
}
