import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isHudHidden, setHudHidden, useHudHidden } from '@/lib/hudHidden';

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
});
