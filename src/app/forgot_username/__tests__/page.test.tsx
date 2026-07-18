import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import ForgotUsernamePage from '@/app/forgot_username/page';
import { forgotUsername } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  forgotUsername: vi.fn(),
}));

const mockedForgotUsername = vi.mocked(forgotUsername);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedForgotUsername.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ForgotUsernamePage', () => {
  it('shows the same generic success message regardless of whether a match was found', async () => {
    mockedForgotUsername.mockResolvedValue({ success: true });
    render(<ForgotUsernamePage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send my usernames' }));
      await flush();
    });

    expect(mockedForgotUsername).toHaveBeenCalledWith('alice@example.com');
    expect(
      screen.getByText((_, node) => node?.textContent === "If that email has any accounts, we've sent the list to alice@example.com.")
    ).toBeInTheDocument();
  });

  it('blocks submit with a validation message when the email is empty', async () => {
    render(<ForgotUsernamePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Send my usernames' }));
    expect(screen.getByText('Please enter your email.')).toBeInTheDocument();
    expect(mockedForgotUsername).not.toHaveBeenCalled();
  });

  it('shows a server error and stays on the form when the request fails', async () => {
    mockedForgotUsername.mockRejectedValue(new Error('Invalid email format.'));
    render(<ForgotUsernamePage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'not-an-email' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send my usernames' }));
      await flush();
    });

    expect(screen.getByText('Invalid email format.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send my usernames' })).toBeInTheDocument();
  });
});
