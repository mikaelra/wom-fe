'use client';

type IconToggleButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  icon: string;
  ariaLabel: string;
  className?: string;
};

/** Small transparent circular icon button used for the music/sound-effects
 *  toggles -- stays on the same glyph in both states, just dims when off,
 *  rather than swapping to a separate "muted" icon. */
export default function IconToggleButton({ enabled, onToggle, icon, ariaLabel, className = '' }: IconToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ariaLabel}
      aria-pressed={enabled}
      title={ariaLabel}
      className={`w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm border border-white/15 flex items-center justify-center text-lg leading-none cursor-pointer transition-colors ${enabled ? 'text-white/90' : 'text-white/30'} ${className}`}
    >
      {icon}
    </button>
  );
}
