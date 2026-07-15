import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGuideEnabled } from '@/lib/useGuideEnabled';

afterEach(() => {
  localStorage.clear();
});

describe('useGuideEnabled', () => {
  it('defaults to enabled when no flag is stored', () => {
    const { result } = renderHook(() => useGuideEnabled());
    expect(result.current.mounted).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it('reflects a pre-existing false flag on mount', () => {
    localStorage.setItem('womGuideEnabled', 'false');
    const { result } = renderHook(() => useGuideEnabled());
    expect(result.current.enabled).toBe(false);
  });

  it('setEnabled(false) persists to localStorage and updates state', () => {
    const { result } = renderHook(() => useGuideEnabled());
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem('womGuideEnabled')).toBe('false');
  });

  it('setEnabled(true) after being off flips the flag back', () => {
    localStorage.setItem('womGuideEnabled', 'false');
    const { result } = renderHook(() => useGuideEnabled());
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem('womGuideEnabled')).toBe('true');
  });

  it('syncs a second instance in the same tab via the custom change event', () => {
    const a = renderHook(() => useGuideEnabled());
    const b = renderHook(() => useGuideEnabled());
    act(() => a.result.current.setEnabled(false));
    expect(b.result.current.enabled).toBe(false);
  });

  it('syncs across tabs via the native storage event', () => {
    const { result } = renderHook(() => useGuideEnabled());
    localStorage.setItem('womGuideEnabled', 'false');
    act(() => {
      window.dispatchEvent(new Event('storage'));
    });
    expect(result.current.enabled).toBe(false);
  });
});
