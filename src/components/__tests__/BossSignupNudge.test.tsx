import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import BossSignupNudge from '@/components/BossSignupNudge';
import { claimPendingRelic, checkClaimVerified } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  claimPendingRelic: vi.fn(),
  checkClaimVerified: vi.fn(),
}));

const mockedClaim = vi.mocked(claimPendingRelic);
const mockedCheckClaimVerified = vi.mocked(checkClaimVerified);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedClaim.mockReset();
  mockedCheckClaimVerified.mockReset();
  mockedCheckClaimVerified.mockResolvedValue({ verified: false });
});

afterEach(() => {
  localStorage.clear();
});

describe('BossSignupNudge', () => {
  const submit = async (email: string) => {
    fireEvent.change(screen.getByPlaceholderText('Your email'), { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create account and claim relic' }));
      await flush();
    });
  };

  it('shows the immediate-claim success state when the relic is granted right away', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: false, relic_name: 'Golden Fleece' });
    const onDismiss = vi.fn();
    render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={onDismiss} />);

    await submit('alice@example.com');

    expect(screen.getByText('Relic claimed!')).toBeInTheDocument();
    expect(screen.getByText('Golden Fleece')).toBeInTheDocument();
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
  });

  it('shows an awaiting-verification state when the relic is held pending verification', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: true });
    render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');

    expect(screen.getByText('Check your inbox')).toBeInTheDocument();
    expect(screen.queryByText('Relic claimed!')).not.toBeInTheDocument();
  });

  it('Resend email re-calls claimPendingRelic while staying in the awaiting-verification state', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: true });
    render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
      await flush();
    });

    expect(mockedClaim).toHaveBeenCalledTimes(2);
  });

  it('shows a validation error for a malformed email without calling the API', async () => {
    render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('not-an-email');

    expect(screen.getByText('Please enter a valid email.')).toBeInTheDocument();
    expect(mockedClaim).not.toHaveBeenCalled();
  });

  it('shows the server error message when the claim fails', async () => {
    mockedClaim.mockRejectedValue(new Error('Name already claimed by a different email'));
    render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');

    expect(screen.getByText('Name already claimed by a different email')).toBeInTheDocument();
  });

  it('auto-transitions to a generic claimed state once verified via polling (e.g. verified on another device)', async () => {
    vi.useFakeTimers();
    try {
      mockedClaim.mockResolvedValue({ success: true, pending_verification: true });
      mockedCheckClaimVerified
        .mockResolvedValueOnce({ verified: false })
        .mockResolvedValueOnce({ verified: true });
      render(<BossSignupNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

      await submit('alice@example.com');
      expect(screen.getByText('Check your inbox')).toBeInTheDocument();

      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });

      expect(screen.getByText('Relic claimed!')).toBeInTheDocument();
      expect(screen.getByText('your relic')).toBeInTheDocument();
      expect(mockedCheckClaimVerified).toHaveBeenCalledWith('Alice', 'alice@example.com');
    } finally {
      vi.useRealTimers();
    }
  });
});
