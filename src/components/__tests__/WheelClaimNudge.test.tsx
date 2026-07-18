import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import WheelClaimNudge from '@/components/WheelClaimNudge';
import { claimPendingWheel } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  claimPendingWheel: vi.fn(),
}));

const mockedClaim = vi.mocked(claimPendingWheel);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedClaim.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('WheelClaimNudge', () => {
  const submit = async (email: string) => {
    fireEvent.change(screen.getByPlaceholderText('Your email'), { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create account and claim wheel' }));
      await flush();
    });
  };

  it('shows the claimed state and a link to the inventory when granted right away', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: false });
    const onDismiss = vi.fn();
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={onDismiss} />);

    await submit('alice@example.com');

    expect(screen.getByText('Wheel claimed!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Spin it in your inventory' })).toHaveAttribute(
      'href',
      '/inventory',
    );
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
  });

  it('shows an awaiting-verification state when the wheel is held pending verification', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: true });
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');

    expect(screen.getByText('Check your inbox')).toBeInTheDocument();
    expect(screen.queryByText('Wheel claimed!')).not.toBeInTheDocument();
  });

  it('Resend email re-calls claimPendingWheel while staying in the awaiting-verification state', async () => {
    mockedClaim.mockResolvedValue({ success: true, pending_verification: true });
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
      await flush();
    });

    expect(mockedClaim).toHaveBeenCalledTimes(2);
  });

  it('shows a validation error for a malformed email without calling the API', async () => {
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('not-an-email');

    expect(screen.getByText('Please enter a valid email.')).toBeInTheDocument();
    expect(mockedClaim).not.toHaveBeenCalled();
  });

  it('shows the server error message when the claim fails', async () => {
    mockedClaim.mockRejectedValue(new Error('Name already claimed by a different email'));
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={vi.fn()} />);

    await submit('alice@example.com');

    expect(screen.getByText('Name already claimed by a different email')).toBeInTheDocument();
  });

  it('calls onDismiss when "No thanks" is clicked', () => {
    const onDismiss = vi.fn();
    render(<WheelClaimNudge lobbyId="lobby1" playerName="Alice" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));

    expect(onDismiss).toHaveBeenCalled();
  });
});
