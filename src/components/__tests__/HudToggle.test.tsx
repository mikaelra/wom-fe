import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { isHudHidden, setHudHidden } from '@/lib/hudHidden';
import HudToggle from '@/components/worldmap/HudToggle';

afterEach(() => setHudHidden(false));

describe('HudToggle', () => {
  it('hides the HUD and turns invisible, and a second tap brings it back', () => {
    render(<HudToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide HUD' }));
    expect(isHudHidden()).toBe(true);
    const button = screen.getByRole('button', { name: 'Show HUD' });
    expect(button.className).toContain('opacity-0');
    fireEvent.click(button);
    expect(isHudHidden()).toBe(false);
  });

  it('H toggles it, but not while typing', () => {
    render(
      <>
        <input aria-label="code" />
        <HudToggle />
      </>,
    );
    fireEvent.keyDown(window, { key: 'h' });
    expect(isHudHidden()).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('code'), { key: 'H' });
    expect(isHudHidden()).toBe(true);
    fireEvent.keyDown(window, { key: 'H' });
    expect(isHudHidden()).toBe(false);
  });

  it('brings the HUD back when leaving the Earth screen', () => {
    const { unmount } = render(<HudToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide HUD' }));
    unmount();
    expect(isHudHidden()).toBe(false);
  });
});
