import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import SettingsPage from '@/app/settings/page';
import { getAlwaysVerifyEmailFlag, requestToggleVerifyEmail } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  getAlwaysVerifyEmailFlag: vi.fn(),
  requestToggleVerifyEmail: vi.fn(),
}));

const mockedGetFlag = vi.mocked(getAlwaysVerifyEmailFlag);
const mockedRequestToggle = vi.mocked(requestToggleVerifyEmail);

const flush = () => act(async () => Promise.resolve());
const loginAs = (name: string, email: string) => {
  localStorage.setItem('playerName', name);
  localStorage.setItem('playerEmail', email);
};

beforeEach(() => {
  push.mockClear();
  mockedGetFlag.mockReset();
  mockedRequestToggle.mockReset();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('SettingsPage', () => {
  it('shows a login prompt when logged out', async () => {
    render(<SettingsPage />);
    await flush();

    expect(screen.getByText('You must be logged in to view settings.')).toBeInTheDocument();
    expect(screen.getByText('Go to log in')).toBeInTheDocument();
    // The verify-email toggle is gated behind login, and it's the only
    // setting on this page now -- nothing renders here.
    expect(screen.queryByText('Toggle always e-mail verificiation.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
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
