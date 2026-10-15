import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { CANVAS_WIDTH, useVirtualCanvas, virtualCanvas } from '@/lib/useVirtualCanvas';

describe('virtualCanvas', () => {
  it('lays a Surface Go window out as a 1200x800 PC window at 0.75', () => {
    const c = virtualCanvas(900, 600)!;
    expect(c.width).toBe(CANVAS_WIDTH);
    expect(c.scale).toBeCloseTo(0.75);
    expect(c.height).toBeCloseTo(800);
  });

  it('leaves a PC window, a phone, and a phone on its side alone', () => {
    expect(virtualCanvas(1024, 768)).toBeNull();
    expect(virtualCanvas(390, 844)).toBeNull();
    expect(virtualCanvas(932, 430)).toBeNull();
    expect(virtualCanvas(800, 1000)).toBeNull();
    expect(virtualCanvas(0, 0)).toBeNull();
  });

  it('follows the window as it resizes', () => {
    window.innerWidth = 900;
    window.innerHeight = 600;
    const { result } = renderHook(() => useVirtualCanvas());
    expect(result.current?.scale).toBeCloseTo(0.75);
    act(() => {
      window.innerWidth = 1200;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBeNull();
  });
});
