'use client';

type IconToggleButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  icon: string;
  ariaLabel: string;
  className?: string;
};

/** Small transparent circular icon button used for the music/sound-effects
 *  toggles. Off is drawn as a red slash struck through the glyph, not just a
 *  dimmer glyph: dimming alone reads as "disabled/unavailable" rather than
 *  "muted", and on a dark HUD over a moving 3D scene the difference between
 *  90% and 30% white is genuinely easy to miss. The slash is the
 *  conventional mute mark and survives being glanced at. */
export default function IconToggleButton({ enabled, onToggle, icon, ariaLabel, className = '' }: IconToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={enabled}
      title={ariaLabel}
      className={`relative w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm border border-white/15 flex items-center justify-center text-lg leading-none cursor-pointer transition-colors ${enabled ? 'text-white/90' : 'text-white/40'} ${className}`}
    >
      {icon}
      {!enabled && (
        // Drawn rather than a second glyph so it lands identically over the
        // music note and the speaker, neither of which has a muted variant
        // that matches its own weight.
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="block w-[26px] h-[2px] rounded-full bg-red-500 rotate-45 shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
        </span>
      )}
    </button>
  );
}
