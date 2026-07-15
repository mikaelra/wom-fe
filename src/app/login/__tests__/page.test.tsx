import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { logInUser, verifyLoginCode } from '@/lib/api';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
}));

const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);

beforeEach(() => {
  push.mockClear();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe('LoginPage', () => {
  it('logs in without a code, navigates home, and stores name/email', async () => {
    mockedLogInUser.mockResolvedValue({ success: true });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });

    expect(mockedLogInUser).toHaveBeenCalledWith('Alice', 'alice@example.com');
    expect(push).toHaveBeenCalledWith('/');
    expect(localStorage.getItem('playerName')).toBe('Alice');
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
  });

  it('switches to the verification-code view when requires_code is true', async () => {
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });

    expect(screen.getByText('Enter verification code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('silently blocks submit when the name is empty, never calling logInUser', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });
    expect(mockedLogInUser).not.toHaveBeenCalled();
  });

  it('shows "Please enter your email." when the email is empty', async () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Please enter your email.')).toBeInTheDocument();
    expect(mockedLogInUser).not.toHaveBeenCalled();
  });

  it('shows "Wrong email" when logInUser rejects with that message', async () => {
    mockedLogInUser.mockRejectedValue(new Error('Wrong email'));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });

    expect(screen.getByText('Wrong email')).toBeInTheDocument();
  });

  it('shows the code error on a wrong code, and completes login on a correct one', async () => {
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockRejectedValueOnce(new Error('Wrong code'));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });

    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '000000' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await Promise.resolve();
    });
    expect(screen.getByText('Wrong code')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    mockedVerifyLoginCode.mockResolvedValueOnce({ success: true });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
      await Promise.resolve();
    });

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Alice', '123456');
    expect(push).toHaveBeenCalledWith('/');
    expect(localStorage.getItem('playerEmail')).toBe('alice@example.com');
  });

  it('returns to the name/email view via Back without clearing what was typed', async () => {
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), { target: { value: 'alice@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Enter verification code')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your name')).toHaveValue('Alice');
    expect(screen.getByPlaceholderText('Enter your email')).toHaveValue('alice@example.com');
  });
});
