import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import SignupPage from '@/app/signup/page';
import { claimName } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  claimName: vi.fn(),
}));

const mockedClaimName = vi.mocked(claimName);

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  push.mockClear();
  mockedClaimName.mockReset();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('SignupPage', () => {
  it('shows an awaiting-verification state and does not navigate home when pending', async () => {
    mockedClaimName.mockResolvedValue({ success: true, pending_verification: true });
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await flush();
    });

    expect(mockedClaimName).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(screen.getByText('Almost there — check your inbox.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
  });

  it('navigates home directly when the claim is a no-op (already verified)', async () => {
    mockedClaimName.mockResolvedValue({ success: true, pending_verification: false });
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await flush();
    });

    expect(push).toHaveBeenCalledWith('/');
  });

  it('shows an error and does not navigate when the name is already claimed', async () => {
    mockedClaimName.mockRejectedValue(new Error('Name already claimed.'));
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await flush();
    });

    expect(screen.getByText('Name already claimed.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('blocks submit with a validation message when a field is empty', async () => {
    render(<SignupPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
    expect(screen.getByText('Please fill in both name and email.')).toBeInTheDocument();
    expect(mockedClaimName).not.toHaveBeenCalled();
  });

  it('Resend email re-calls claimName while staying in the awaiting-verification state', async () => {
    mockedClaimName.mockResolvedValue({ success: true, pending_verification: true });
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await flush();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
      await flush();
    });

    expect(mockedClaimName).toHaveBeenCalledTimes(2);
  });

  it('has no refresh button in the awaiting-verification state (refreshing would just show a blank form again)', async () => {
    mockedClaimName.mockResolvedValue({ success: true, pending_verification: true });
    render(<SignupPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
      await flush();
    });

    expect(screen.queryByRole('button', { name: 'Refresh page' })).not.toBeInTheDocument();
  });
});
