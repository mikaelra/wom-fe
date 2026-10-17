import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStagedBossHp } from '@/lib/useStagedBossHp';
import { emitBossHpFx } from '@/lib/bossHpFx';

afterEach(() => {
  vi.useRealTimers();
});

describe('useStagedBossHp', () => {
  it('shows the live value while there is no round yet', () => {
    const { result } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: 100 as number | undefined, round: 0 as number | undefined },
    });
    expect(result.current).toBe(100);
  });

  it('freezes at the previous value across a round the boss took damage, until the strike reveal fires', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: 100 as number | undefined, round: 1 as number | undefined },
    });
    expect(result.current).toBe(100);

    rerender({ hp: 70, round: 2 });
    expect(result.current).toBe(100); // frozen, not yet 70

    act(() => {
      emitBossHpFx({ hp: 70 });
    });
    expect(result.current).toBe(70);
  });

  it('reveals via the safety-reconcile timer if the strike event never arrives', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: 100 as number | undefined, round: 1 as number | undefined },
    });

    rerender({ hp: 70, round: 2 });
    expect(result.current).toBe(100);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toBe(70);
  });

  it('does not freeze when the boss hp is unchanged or increases', () => {
    const { result, rerender } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: 100 as number | undefined, round: 1 as number | undefined },
    });

    rerender({ hp: 100, round: 2 });
    expect(result.current).toBe(100);

    rerender({ hp: 120, round: 3 });
    expect(result.current).toBe(120);
  });

  it('does not freeze on the very first round (nothing to have dropped from)', () => {
    const { result, rerender } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: undefined as number | undefined, round: undefined as number | undefined },
    });

    rerender({ hp: 70, round: 1 });
    expect(result.current).toBe(70);
  });

  it('ignores a stale reveal whose hp no longer matches the current round', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ hp, round }) => useStagedBossHp(hp, round), {
      initialProps: { hp: 100 as number | undefined, round: 1 as number | undefined },
    });

    rerender({ hp: 70, round: 2 });
    act(() => {
      emitBossHpFx({ hp: 999 }); // some unrelated/late event
    });
    expect(result.current).toBe(100); // still frozen

    act(() => {
      emitBossHpFx({ hp: 70 });
    });
    expect(result.current).toBe(70);
  });
});
