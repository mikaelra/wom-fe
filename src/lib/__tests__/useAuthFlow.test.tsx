import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthFlow } from '@/lib/useAuthFlow';
import { checkName, logInUser, verifyLoginCode } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  checkName: vi.fn(),
  logInUser: vi.fn(),
  verifyLoginCode: vi.fn(),
}));

const mockedCheckName = vi.mocked(checkName);
const mockedLogInUser = vi.mocked(logInUser);
const mockedVerifyLoginCode = vi.mocked(verifyLoginCode);

const flushMicrotasks = () => act(() => Promise.resolve());

beforeEach(() => {
  mockedCheckName.mockReset();
  mockedLogInUser.mockReset();
  mockedVerifyLoginCode.mockReset();
});

describe('useAuthFlow', () => {
  it('shows an error and does not call checkName when the name is empty', async () => {
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe('Please enter a username.');
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('shows an error and does not call checkName when the name is too short', async () => {
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Al'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe('Name must be 3–12 characters long');
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('shows an error and does not call checkName when the name is too long', async () => {
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    // 13 characters -- one over wom-be's regex_name_check cap.
    act(() => result.current.setName('ThirteenChars'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe('Name must be 3–12 characters long');
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('shows an error and does not call checkName when the name has a disallowed character', async () => {
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName("Bob's"));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe(`Name cannot contain spaces or special characters like / \\ @ " ' -`);
    expect(mockedCheckName).not.toHaveBeenCalled();
  });

  it('calls onAuthenticated immediately when the name is unclaimed', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Alice'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(mockedCheckName).toHaveBeenCalledWith('Alice');
    expect(onAuthenticated).toHaveBeenCalledWith('Alice', '');
    expect(result.current.loading).toBe(false);
    expect(result.current.emailMode).toBe(false);
  });

  it('switches to email mode when the name is claimed', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.emailMode).toBe(true);
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('uses submitErrorFallback when checkName throws a non-Error', async () => {
    mockedCheckName.mockRejectedValue('boom');
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed to enter raid.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe('Failed to enter raid.');
  });

  it('falls back to a default message when submitErrorFallback is omitted', async () => {
    mockedCheckName.mockRejectedValue('boom');
    const { result } = renderHook(() => useAuthFlow({ onAuthenticated: vi.fn() }));

    act(() => result.current.setName('Bob'));
    await act(async () => {
      result.current.handleSubmitName();
    });

    expect(result.current.error).toBe('Something went wrong.');
  });

  it('logs in and authenticates without a code when requires_code is false', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true });
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => result.current.handleSubmitName());
    act(() => result.current.setEmail('bob@example.com'));
    await act(async () => result.current.handleLogin());

    expect(mockedLogInUser).toHaveBeenCalledWith('Bob', 'bob@example.com');
    expect(onAuthenticated).toHaveBeenCalledWith('Bob', 'bob@example.com');
    expect(result.current.codeMode).toBe(false);
  });

  it('switches to code mode when requires_code is true, then verifies and authenticates', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    mockedVerifyLoginCode.mockResolvedValue({ success: true });
    const onAuthenticated = vi.fn();
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => result.current.handleSubmitName());
    act(() => result.current.setEmail('bob@example.com'));
    await act(async () => result.current.handleLogin());

    expect(result.current.codeMode).toBe(true);
    expect(onAuthenticated).not.toHaveBeenCalled();

    act(() => result.current.setCode('123456'));
    await act(async () => result.current.handleVerifyCode());

    expect(mockedVerifyLoginCode).toHaveBeenCalledWith('Bob', '123456');
    expect(onAuthenticated).toHaveBeenCalledWith('Bob', 'bob@example.com');
  });

  it('sets "Wrong email" on a login failure with that exact message', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockRejectedValue(new Error('Wrong email'));
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated: vi.fn(), submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => result.current.handleSubmitName());
    act(() => result.current.setEmail('bob@example.com'));
    await act(async () => result.current.handleLogin());

    expect(result.current.emailError).toBe('Wrong email');
  });

  it('requires a code before calling verifyLoginCode', async () => {
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated: vi.fn(), submitErrorFallback: 'Failed.' })
    );

    await act(async () => result.current.handleVerifyCode());

    expect(result.current.codeError).toBe('Please enter the code from your email.');
    expect(mockedVerifyLoginCode).not.toHaveBeenCalled();
  });

  it('awaits an async onAuthenticated before clearing loading', async () => {
    mockedCheckName.mockResolvedValue({ claimed: false });
    let resolveAuth: () => void;
    const onAuthenticated = vi.fn(
      () => new Promise<void>((resolve) => { resolveAuth = resolve; })
    );
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated, submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Alice'));
    act(() => {
      result.current.handleSubmitName();
    });
    await flushMicrotasks();

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveAuth!();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
  });

  it('backToEmailStep drops from code mode to email mode without clearing name/email', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    mockedLogInUser.mockResolvedValue({ success: true, requires_code: true });
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated: vi.fn(), submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => result.current.handleSubmitName());
    act(() => result.current.setEmail('bob@example.com'));
    await act(async () => result.current.handleLogin());
    act(() => result.current.setCode('123456'));

    expect(result.current.codeMode).toBe(true);

    act(() => result.current.backToEmailStep());

    expect(result.current.codeMode).toBe(false);
    expect(result.current.code).toBe('');
    expect(result.current.emailMode).toBe(true);
    expect(result.current.name).toBe('Bob');
    expect(result.current.email).toBe('bob@example.com');
  });

  it('reset clears every field back to the name step', async () => {
    mockedCheckName.mockResolvedValue({ claimed: true });
    const { result } = renderHook(() =>
      useAuthFlow({ onAuthenticated: vi.fn(), submitErrorFallback: 'Failed.' })
    );

    act(() => result.current.setName('Bob'));
    await act(async () => result.current.handleSubmitName());
    act(() => result.current.setEmail('bob@example.com'));

    act(() => result.current.reset());

    expect(result.current.name).toBe('');
    expect(result.current.emailMode).toBe(false);
    expect(result.current.email).toBe('');
    expect(result.current.codeMode).toBe(false);
    expect(result.current.code).toBe('');
    expect(result.current.loading).toBe(false);
  });
});
