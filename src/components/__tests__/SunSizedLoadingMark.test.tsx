import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { reportSunScreenSize, setHudHidden } from '@/lib/hudHidden';
import SunSizedLoadingMark from '@/components/worldmap/SunSizedLoadingMark';

afterEach(() => setHudHidden(false));

describe('SunSizedLoadingMark', () => {
  it("stays hidden until the Sun's size arrives, then follows it", () => {
    render(<SunSizedLoadingMark />);
    const el = screen.getByTestId('sun-sized-loading');
    expect(el.style.opacity).toBe('0');
    act(() => reportSunScreenSize(256));
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toBe('scale(0.5)');
    act(() => reportSunScreenSize(1024));
    expect(el.style.transform).toBe('scale(2)');
  });
});
