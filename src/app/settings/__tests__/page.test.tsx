import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import SettingsPage from '@/app/settings/page';
import { setStoredAccountToken } from '@/lib/http';
import { getAlwaysVerifyEmailFlag, getConnections, requestToggleVerifyEmail } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  getAlwaysVerifyEmailFlag: vi.fn(),
  getConnections: vi.fn(),
  requestToggleVerifyEmail: vi.fn(),
  // The other panels' calls once a session is stored.
  connectWeb: vi.fn(),
  deleteAccount: vi.fn(),
  resolveAccountSession: vi.fn(() => new Promise(() => undefined)),
  getEntitlements: vi.fn(() => new Promise(() => undefined)),
}));

const mockedGetFlag = vi.mocked(getAlwaysVerifyEmailFlag);
const mockedRequestToggle = vi.mocked(requestToggleVerifyEmail);
const mockedConnections = vi.mocked(getConnections);

const flush = () => act(async () => Promise.resolve());
const loginAs = (name: string, email: string) => {
  localStorage.setItem('playerName', name);
  localStorage.setItem('playerEmail', email);
};

beforeEach(() => {
  push.mockClear();
  mockedGetFlag.mockReset();
  mockedRequestToggle.mockReset();
  mockedConnections.mockReset();
});

afterEach(() => {
  setStoredAccountToken(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('shows a login prompt when logged out', async () => {
    render(<SettingsPage />);
    await flush();

    expect(screen.getByText('You must be logged in to view settings.')).toBeInTheDocument();
    expect(screen.getByText('Go to log in')).toBeInTheDocument();
    // The verify-email toggle is account state, so it stays behind the
    // login gate.
    expect(screen.queryByText('Toggle always e-mail verificiation.')).not.toBeInTheDocument();
    expect(mockedGetFlag).not.toHaveBeenCalled();
    // The audio settings deliberately are not: they live in localStorage on
    // this device, so gating them would leave a logged-out player with no
    // way to turn the music down.
    expect(screen.getByLabelText('Music volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Sound effects volume')).toBeInTheDocument();
  });

  it('finds the email through the session after a Steam or Apple login', async () => {
    // Those logins keep no playerEmail on the device (lib/appleAccount.ts).
    localStorage.setItem('playerName', 'Oni');
    setStoredAccountToken('tok');
    mockedConnections.mockResolvedValue({ steam: null, apple: {}, web: { email: 'oni@example.com' } });
    mockedGetFlag.mockResolvedValue({ always_verify_email: true });
    render(<SettingsPage />);
    await flush();
    await flush();

    expect(screen.queryByText('You must be logged in to view settings.')).not.toBeInTheDocument();
    expect(mockedGetFlag).toHaveBeenCalledWith('Oni', 'oni@example.com');
    expect(screen.getByText('Toggle always e-mail verificiation.')).toBeInTheDocument();
  });

  it('leaves the email toggle out for an account with no email', async () => {
    localStorage.setItem('playerName', 'Scoundrel');
    setStoredAccountToken('tok');
    mockedConnections.mockResolvedValue({ steam: null, apple: {}, web: null });
    render(<SettingsPage />);
    await flush();
    await flush();

    expect(screen.queryByText('You must be logged in to view settings.')).not.toBeInTheDocument();
    expect(screen.queryByText('Toggle always e-mail verificiation.')).not.toBeInTheDocument();
    expect(mockedGetFlag).not.toHaveBeenCalled();
  });

  it('reflects the server flag when it is on', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: true });
    render(<SettingsPage />);
    await flush();

    expect(mockedGetFlag).toHaveBeenCalledWith('Alice', 'alice@example.com');
    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    expect(verifyCheckbox).toBeChecked();
  });

  it('reflects the server flag when it is off', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: false });
    render(<SettingsPage />);
    await flush();

    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    expect(verifyCheckbox).not.toBeChecked();
  });

  it('toggling on sends a confirmation email and shows the awaiting-confirmation message', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: false });
    mockedRequestToggle.mockResolvedValue({ success: true });
    render(<SettingsPage />);
    await flush();

    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(verifyCheckbox);
      await flush();
    });

    expect(mockedRequestToggle).toHaveBeenCalledWith('Alice', 'alice@example.com', true);
    expect(
      screen.getByText('Click the link sent to your email to confirm this verification'),
    ).toBeInTheDocument();
    expect(verifyCheckbox).toBeChecked();
    expect(verifyCheckbox).toBeDisabled();
  });

  it('reverts the optimistic check and shows an error when the request fails', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: false });
    mockedRequestToggle.mockRejectedValue(new Error('Failed to send email.'));
    render(<SettingsPage />);
    await flush();

    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(verifyCheckbox);
      await flush();
    });

    expect(screen.getByText('Failed to send email.')).toBeInTheDocument();
    expect(
      screen.queryByText('Click the link sent to your email to confirm this verification'),
    ).not.toBeInTheDocument();
    expect(verifyCheckbox).not.toBeChecked();
    expect(verifyCheckbox).not.toBeDisabled();
  });

  it('Resend email re-sends the same pending value', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: false });
    mockedRequestToggle.mockResolvedValue({ success: true });
    render(<SettingsPage />);
    await flush();

    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(verifyCheckbox);
      await flush();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Resend email'));
      await flush();
    });

    expect(mockedRequestToggle).toHaveBeenCalledTimes(2);
    expect(mockedRequestToggle).toHaveBeenNthCalledWith(2, 'Alice', 'alice@example.com', true);
  });

  it('Refresh page reloads the window', async () => {
    loginAs('Alice', 'alice@example.com');
    mockedGetFlag.mockResolvedValue({ always_verify_email: false });
    mockedRequestToggle.mockResolvedValue({ success: true });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SettingsPage />);
    await flush();

    const [verifyCheckbox] = screen.getAllByRole('checkbox');
    await act(async () => {
      fireEvent.click(verifyCheckbox);
      await flush();
    });
    fireEvent.click(screen.getByText('Refresh page'));

    expect(reload).toHaveBeenCalled();
  });
});
