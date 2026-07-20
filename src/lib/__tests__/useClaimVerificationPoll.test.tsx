import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClaimVerificationPoll } from '@/lib/useClaimVerificationPoll';
import { checkClaimVerified } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  checkClaimVerified: vi.fn(),
}));

const mockedCheckClaimVerified = vi.mocked(checkClaimVerified);
const flushMicrotasks = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
  mockedCheckClaimVerified.mockReset();
  mockedCheckClaimVerified.mockResolvedValue({ verified: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useClaimVerificationPoll', () => {
  it('does not poll while inactive', async () => {
    renderHook(() => useClaimVerificationPoll(false, 'Alice', 'alice@example.com', vi.fn()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockedCheckClaimVerified).not.toHaveBeenCalled();
  });

  it('does not poll with an empty name or email', async () => {
    renderHook(() => useClaimVerificationPoll(true, '', '', vi.fn()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockedCheckClaimVerified).not.toHaveBeenCalled();
  });

  it('polls on an interval while active and calls onVerified once verified', async () => {
    mockedCheckClaimVerified
      .mockResolvedValueOnce({ verified: false })
      .mockResolvedValueOnce({ verified: false })
      .mockResolvedValueOnce({ verified: true });
    const onVerified = vi.fn();
    renderHook(() => useClaimVerificationPoll(true, 'Alice', 'alice@example.com', onVerified));

    await vi.advanceTimersByTimeAsync(4000);
    expect(mockedCheckClaimVerified).toHaveBeenCalledTimes(1);
    expect(mockedCheckClaimVerified).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(onVerified).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onVerified).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('stops polling once inactive', async () => {
    const { rerender } = renderHook(
      ({ active }) => useClaimVerificationPoll(active, 'Alice', 'alice@example.com', vi.fn()),
      { initialProps: { active: true } },
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(mockedCheckClaimVerified).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(mockedCheckClaimVerified).toHaveBeenCalledTimes(1);
  });

  it('does not call onVerified after unmount, even if a poll resolves verified later', async () => {
    let resolvePoll: (value: { verified: boolean }) => void = () => {};
    mockedCheckClaimVerified.mockReturnValue(new Promise((resolve) => { resolvePoll = resolve; }));
    const onVerified = vi.fn();
    const { unmount } = renderHook(() => useClaimVerificationPoll(true, 'Alice', 'alice@example.com', onVerified));

    await vi.advanceTimersByTimeAsync(4000);
    unmount();
    resolvePoll({ verified: true });
    await flushMicrotasks();

    expect(onVerified).not.toHaveBeenCalled();
  });

  it('keeps polling on a transient rejection instead of throwing', async () => {
    mockedCheckClaimVerified
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ verified: true });
    const onVerified = vi.fn();
    renderHook(() => useClaimVerificationPoll(true, 'Alice', 'alice@example.com', onVerified));

    await vi.advanceTimersByTimeAsync(4000);
    expect(onVerified).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onVerified).toHaveBeenCalledTimes(1);
  });
});
