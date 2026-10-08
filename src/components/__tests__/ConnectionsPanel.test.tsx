import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  getConnections: vi.fn(),
  connectWeb: vi.fn(),
}));

import { connectWeb, getConnections } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';
import ConnectionsPanel from '@/components/settings/ConnectionsPanel';

const get = vi.mocked(getConnections);
const connect = vi.mocked(connectWeb);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  setStoredAccountToken(null);
  vi.clearAllMocks();
});

describe('ConnectionsPanel', () => {
  it('shows nothing when logged out', () => {
    const { container } = render(<ConnectionsPanel />);
    expect(container.innerHTML).toBe('');
    expect(get).not.toHaveBeenCalled();
  });

  it('shows nothing when the session is no good', async () => {
    setStoredAccountToken('sess');
    get.mockRejectedValue(new Error('Invalid or expired session.'));
    const { container } = render(<ConnectionsPanel />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('shows the connected Steam account and email', async () => {
    setStoredAccountToken('sess');
    get.mockResolvedValue({ steam: { name: 'Gaben' }, web: { email: 'toad@example.com' } });
    render(<ConnectionsPanel />);
    expect(await screen.findByText('✓ Gaben')).toBeTruthy();
    expect(screen.getByText('✓ toad@example.com')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
  });

  it('connects the web version from a Steam account', async () => {
    setStoredAccountToken('sess');
    get.mockResolvedValue({ steam: { name: null }, web: null });
    connect.mockResolvedValue();
    render(<ConnectionsPanel />);
    expect(await screen.findByText('✓ Connected')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' toad@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText(/link sent to toad@example\.com/)).toBeTruthy();
    expect(connect).toHaveBeenCalledWith('sess', 'toad@example.com');
  });

  it('shows why the email could not be sent', async () => {
    setStoredAccountToken('sess');
    get.mockResolvedValue({ steam: null, web: null });
    connect.mockRejectedValue(new Error('Invalid email format.'));
    render(<ConnectionsPanel />);
    expect(await screen.findByText('Not connected')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope@x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Invalid email format.')).toBeTruthy();
  });
});
