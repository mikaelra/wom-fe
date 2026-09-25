import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioSettingsPanel from '@/components/audio/AudioSettingsPanel';
import IconToggleButton from '@/components/audio/IconToggleButton';
import { getMusicVolume, isMusicEnabled, isMusicInBackgroundEnabled, isSfxEnabled } from '@/lib/soundSettings';

beforeEach(() => {
  localStorage.clear();
});

describe('AudioSettingsPanel', () => {
  it('offers a level for music and for effects, plus the background option', () => {
    render(<AudioSettingsPanel />);
    expect(screen.getByLabelText('Music volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Sound effects volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Keep playing music in the background')).toBeInTheDocument();
  });

  it('writes a dragged slider through to the stored setting', () => {
    render(<AudioSettingsPanel />);
    fireEvent.change(screen.getByLabelText('Music volume'), { target: { value: '20' } });
    expect(getMusicVolume()).toBeCloseTo(0.2, 5);
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('mutes without discarding the level, so unmuting restores it', () => {
    render(<AudioSettingsPanel />);
    fireEvent.change(screen.getByLabelText('Music volume'), { target: { value: '65' } });
    fireEvent.click(screen.getByLabelText('Mute music'));

    expect(isMusicEnabled()).toBe(false);
    expect(getMusicVolume()).toBeCloseTo(0.65, 5);
  });

  it('toggles effects and background playback independently of music', () => {
    render(<AudioSettingsPanel />);
    fireEvent.click(screen.getByLabelText('Mute sound effects'));
    fireEvent.click(screen.getByLabelText('Keep playing music in the background'));

    expect(isSfxEnabled()).toBe(false);
    expect(isMusicInBackgroundEnabled()).toBe(true);
    expect(isMusicEnabled()).toBe(true);
  });
});

// Dimming alone read as "unavailable" rather than "muted", and was easy to
// miss on a dark HUD over a moving scene.
describe('IconToggleButton mute mark', () => {
  const props = { onToggle: () => {}, icon: '♪', ariaLabel: 'Mute music' };

  it('strikes the glyph through when off', () => {
    const { container } = render(<IconToggleButton {...props} enabled={false} />);
    expect(container.querySelector('.bg-red-500')).not.toBeNull();
  });

  it('leaves the glyph clear when on', () => {
    const { container } = render(<IconToggleButton {...props} enabled />);
    expect(container.querySelector('.bg-red-500')).toBeNull();
  });

  it('reports its state to assistive tech', () => {
    render(<IconToggleButton {...props} enabled={false} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
