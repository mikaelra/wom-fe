import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  isHudHidden, isHudLoadingMarkOn, reportHudMark, setHudHidden, subscribeHudMark, hudMarkPlacement,
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

  it("passes where and how big to draw it on to listeners, ignoring sub-pixel jitter, and forgets it when switched off", () => {
    const at = (x: number, size: number, visible = true) => ({ x, y: 100, size, visible });
    const heard: number[] = [];
    const off = subscribeHudMark((p) => heard.push(p.visible ? p.x : -1));
    setHudHidden(true);
    toggleHudLoadingMark();
    reportHudMark(at(40, 200));
    reportHudMark(at(40.2, 200.3));
    reportHudMark(at(80, 200));
    reportHudMark(at(80, 200, false));
    expect(heard).toEqual([40, 80, -1]);
    expect(hudMarkPlacement()).toEqual(at(80, 200, false));
    toggleHudLoadingMark();
    expect(hudMarkPlacement().size).toBe(0);
    reportHudMark(at(50, 200));
    setHudHidden(false);
    expect(hudMarkPlacement().size).toBe(0);
    off();
    reportHudMark(at(90, 200));
    expect(heard).toEqual([40, 80, -1, 50]);
  });
});
