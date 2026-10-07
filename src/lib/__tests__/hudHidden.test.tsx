import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isHudHidden, isHudLoadingMarkOn, reportSunScreenSize, setHudHidden, subscribeSunScreenSize, sunScreenSize,
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

  it("passes the Sun's size on to listeners, ignoring sub-pixel jitter, and forgets it when switched off", () => {
    const heard: number[] = [];
    const off = subscribeSunScreenSize((px) => heard.push(px));
    setHudHidden(true);
    toggleHudLoadingMark();
    reportSunScreenSize(40);
    reportSunScreenSize(40.2);
    reportSunScreenSize(80);
    expect(heard).toEqual([40, 80]);
    expect(sunScreenSize()).toBe(80);
    toggleHudLoadingMark();
    expect(sunScreenSize()).toBe(0);
    reportSunScreenSize(50);
    setHudHidden(false);
    expect(sunScreenSize()).toBe(0);
    off();
    reportSunScreenSize(90);
    expect(heard).toEqual([40, 80, 50]);
  });
});
