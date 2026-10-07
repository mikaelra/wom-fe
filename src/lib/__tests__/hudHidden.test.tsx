import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isHudHidden, isHudLoadingMarkOn, setHudHidden, toggleHudLoadingMark, useHudHidden, useHudLoadingMark,
} from '@/lib/hudHidden';

afterEach(() => setHudHidden(false));

describe('hudHidden', () => {
  it('starts shown and follows setHudHidden', () => {
    const { result } = renderHook(() => useHudHidden());
    expect(result.current).toBe(false);
    act(() => setHudHidden(true));
    expect(isHudHidden()).toBe(true);
    expect(result.current).toBe(true);
    act(() => setHudHidden(true));
    expect(result.current).toBe(true);
    act(() => setHudHidden(false));
    expect(result.current).toBe(false);
  });

  it('a globe tap loops the loading animation only while the HUD is hidden', () => {
    const { result } = renderHook(() => useHudLoadingMark());
    act(() => toggleHudLoadingMark());
    expect(result.current).toBe(false);
    act(() => setHudHidden(true));
    act(() => toggleHudLoadingMark());
    expect(result.current).toBe(true);
    act(() => toggleHudLoadingMark());
    expect(isHudLoadingMarkOn()).toBe(false);
    act(() => toggleHudLoadingMark());
    act(() => setHudHidden(false));
    expect(result.current).toBe(false);
  });
});
