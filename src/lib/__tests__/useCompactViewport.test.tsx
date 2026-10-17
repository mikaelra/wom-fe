import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCompactViewport } from '@/lib/useCompactViewport';
import { COMPACT_QUERY } from '@/lib/uiScale';

function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', (q: string) => {
    queries.push(q);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    };
  });
  return {
    queries,
    set(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

describe('useCompactViewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the compact query and follows the window', () => {
    const mq = stubMatchMedia(false);
    const { result } = renderHook(() => useCompactViewport());
    expect(result.current).toBe(false);
    expect(mq.queries).toContain(COMPACT_QUERY);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
  });

  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useCompactViewport());
    expect(result.current).toBe(false);
  });
});
