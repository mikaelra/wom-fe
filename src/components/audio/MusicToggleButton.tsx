'use client';

import { useMusicEnabled } from '@/lib/useSoundToggle';
import IconToggleButton from './IconToggleButton';

export default function MusicToggleButton({ className }: { className?: string }) {
  const [enabled, setEnabled] = useMusicEnabled();
  return (
    <IconToggleButton
      enabled={enabled}
      onToggle={() => setEnabled(!enabled)}
      icon="♪"
      ariaLabel={enabled ? 'Mute music' : 'Unmute music'}
      className={className}
    />
  );
}
