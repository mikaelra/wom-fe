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
    expect((await screen.findAllByText('Not connected')).length).toBe(2);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope@x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Invalid email format.')).toBeTruthy();
  });

  it('shows a connected Apple account', async () => {
    setStoredAccountToken('sess');
    get.mockResolvedValue({ steam: null, apple: {}, web: null });
    render(<ConnectionsPanel />);
    expect(await screen.findByText('✓ Connected')).toBeTruthy();
  });

  it('offers no name choice without a Steam name', async () => {
    setStoredAccountToken('sess');
    get.mockResolvedValue({ steam: null, apple: {}, web: { email: 'toad@example.com' } });
    render(<ConnectionsPanel />);
    await screen.findByText('✓ toad@example.com');
    expect(screen.queryByText('Name shown')).toBeNull();
  });

  it('picks which name the top bar shows on this device', async () => {
    setStoredAccountToken('sess');
    localStorage.setItem('playerName', 'Toad');
    get.mockResolvedValue({ steam: { name: 'Gaben' }, apple: null, web: { email: 'toad@example.com' } });
    render(<ConnectionsPanel />);
    const web = (await screen.findByLabelText(/Web name/)) as HTMLInputElement;
    const steam = screen.getByLabelText(/Steam name/) as HTMLInputElement;
    expect(screen.getByText('(Toad)')).toBeTruthy();
    expect(web.checked).toBe(true); // the web version's default
    fireEvent.click(steam);
    expect(steam.checked).toBe(true);
    expect(localStorage.getItem('shownName')).toBe('steam');
  });
});
