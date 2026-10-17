import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { reportHudMarkSize, setHudHidden } from '@/lib/hudHidden';
import HudLoadingMark from '@/components/worldmap/HudLoadingMark';

afterEach(() => setHudHidden(false));

describe('HudLoadingMark', () => {
  it("stays hidden until its size arrives, then follows it", () => {
    render(<HudLoadingMark />);
    const el = screen.getByTestId('hud-loading-mark');
    expect(el.style.opacity).toBe('0');
    act(() => reportHudMarkSize(256));
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toBe('scale(0.5)');
    act(() => reportHudMarkSize(1024));
    expect(el.style.transform).toBe('scale(2)');
  });
});
