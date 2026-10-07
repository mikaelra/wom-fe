import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isHudHidden, isHudLoadingMarkOn, reportHudMarkSize, setHudHidden, subscribeHudMarkSize, hudMarkSize,
  toggleHudLoadingMark, useHudHidden, useHudLoadingMark,
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

  it("passes the animation's size on to listeners, ignoring sub-pixel jitter, and forgets it when switched off", () => {
    const heard: number[] = [];
    const off = subscribeHudMarkSize((px) => heard.push(px));
    setHudHidden(true);
    toggleHudLoadingMark();
    reportHudMarkSize(40);
    reportHudMarkSize(40.2);
    reportHudMarkSize(80);
    expect(heard).toEqual([40, 80]);
    expect(hudMarkSize()).toBe(80);
    toggleHudLoadingMark();
    expect(hudMarkSize()).toBe(0);
    reportHudMarkSize(50);
    setHudHidden(false);
    expect(hudMarkSize()).toBe(0);
    off();
    reportHudMarkSize(90);
    expect(heard).toEqual([40, 80, 50]);
  });
});
