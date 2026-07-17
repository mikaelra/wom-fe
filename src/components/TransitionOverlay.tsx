'use client';

// Full-screen white overlay used for the lobby entrance transition: a plain
// opacity fade (not a shaped wipe) so every corner of the viewport, not just
// the world map underneath it, ends up solid white. "out" fades the outgoing
// screen to white (paired with a scale-up "zoom into the world" behind it);
// "in" fades the lobby screen back in from white as the camera flies in.
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
