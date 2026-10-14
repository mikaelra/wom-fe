import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { LANDSCAPE_QUERY, useLandscapeLayout } from '@/lib/useLandscapeLayout';

describe('useLandscapeLayout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a roomy landscape window and follows it', () => {
    let matches = false;
    const listeners = new Set<() => void>();
    const asked: string[] = [];
    vi.stubGlobal('matchMedia', (q: string) => {
      asked.push(q);
      return {
        get matches() {
          return matches;
        },
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      };
    });
    const { result } = renderHook(() => useLandscapeLayout());
    expect(result.current).toBe(false);
    expect(asked).toContain(LANDSCAPE_QUERY);
    act(() => {
      matches = true;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(true);
  });

  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useLandscapeLayout()).result.current).toBe(false);
  });

  it('leaves a phone on its side out', () => {
    // 932x430: landscape and wide enough, but under the 500px height.
    expect(LANDSCAPE_QUERY).toContain('min-height: 500px');
  });
});
