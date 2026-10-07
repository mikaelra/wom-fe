import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { reportHudMark, setHudHidden } from '@/lib/hudHidden';
import HudLoadingMark from '@/components/worldmap/HudLoadingMark';

afterEach(() => setHudHidden(false));

describe('HudLoadingMark', () => {
  it('stays hidden until placed, then sits centred on the Sun at the reported size', () => {
    render(<HudLoadingMark />);
    const el = screen.getByTestId('hud-loading-mark');
    expect(el.style.opacity).toBe('0');
    act(() => reportHudMark({ x: 300, y: 200, size: 256, visible: true }));
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toBe('translate(44px, -56px) scale(0.5)');
    act(() => reportHudMark({ x: 300, y: 200, size: 1024, visible: true }));
    expect(el.style.transform).toBe('translate(44px, -56px) scale(2)');
  });

  it('hides while the Sun is behind the camera', () => {
    render(<HudLoadingMark />);
    const el = screen.getByTestId('hud-loading-mark');
    act(() => reportHudMark({ x: 10, y: 10, size: 100, visible: false }));
    expect(el.style.opacity).toBe('0');
  });
});
