import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  deleteAccount: vi.fn(),
  resolveAccountSession: vi.fn(),
}));

import { deleteAccount, resolveAccountSession } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';
import DeleteAccountPanel from '@/components/settings/DeleteAccountPanel';

const del = vi.mocked(deleteAccount);
const resolve = vi.mocked(resolveAccountSession);

beforeEach(() => {
  localStorage.clear();
  resolve.mockResolvedValue({ name: 'Toad', email: null, always_verify_email: false, email_verified: true });
});

afterEach(() => {
  setStoredAccountToken(null);
  vi.clearAllMocks();
});

async function openConfirm() {
  setStoredAccountToken('sess');
  render(<DeleteAccountPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
}

describe('DeleteAccountPanel', () => {
  it('shows nothing when logged out', () => {
    const { container } = render(<DeleteAccountPanel />);
    expect(container.innerHTML).toBe('');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('shows nothing when the session is no good', async () => {
    setStoredAccountToken('sess');
    resolve.mockRejectedValue(new Error('Invalid or expired session.'));
    const { container } = render(<DeleteAccountPanel />);
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('only deletes once the exact name is typed', async () => {
    await openConfirm();
    const button = screen.getByRole('button', { name: 'Delete forever' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'toad' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Toad' } });
    expect(button.disabled).toBe(false);
  });

  it('deletes, forgets the player and says so', async () => {
    localStorage.setItem('playerName', 'Toad');
    localStorage.setItem('playerEmail', 'toad@example.com');
    del.mockResolvedValue(undefined);
    await openConfirm();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Toad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(await screen.findByText('Your account has been deleted.')).toBeTruthy();
    expect(del).toHaveBeenCalledWith('sess', 'Toad');
    expect(localStorage.getItem('playerName')).toBeNull();
    expect(localStorage.getItem('playerEmail')).toBeNull();
  });

  it("shows the backend's refusal and lets the player try again", async () => {
    del.mockRejectedValue(new Error('Finish or leave your current game first.'));
    await openConfirm();
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Toad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));
    expect(await screen.findByText('Finish or leave your current game first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Delete forever' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('cancel closes the confirmation', async () => {
    await openConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expect(screen.queryByLabelText(/to confirm/)).toBeNull();
  });
});
