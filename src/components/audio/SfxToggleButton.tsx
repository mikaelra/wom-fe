'use client';

import { useSfxEnabled } from '@/lib/useSoundToggle';
import IconToggleButton from './IconToggleButton';

export default function SfxToggleButton({ className }: { className?: string }) {
  const [enabled, setEnabled] = useSfxEnabled();
  return (
    <IconToggleButton
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
      icon="🔊"
      ariaLabel={enabled ? 'Mute sound effects' : 'Unmute sound effects'}
      className={className}
    />
  );
}
