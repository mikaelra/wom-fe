import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/lib/api', () => ({
  affirmAge: vi.fn(),
  resolveAccountSession: vi.fn(),
}));

import { affirmAge, resolveAccountSession } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';
import AgePrompt, { resetAgePromptForTests } from '@/components/AgePrompt';

const affirm = vi.mocked(affirmAge);
const resolve = vi.mocked(resolveAccountSession);
const session = (age_affirmed?: boolean) => ({
  name: 'Toad', email: null, always_verify_email: false, email_verified: true, age_affirmed,
});
const box = () => screen.getByRole('checkbox');
const cont = () => screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;

beforeEach(() => {
  pathname = '/';
  resetAgePromptForTests();
});

afterEach(() => {
  setStoredAccountToken(null);
  vi.clearAllMocks();
});

describe('AgePrompt', () => {
  it('asks nothing when logged out', () => {
    const { container } = render(<AgePrompt />);
    expect(container.innerHTML).toBe('');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('asks nothing once the account has answered, or on an older backend', async () => {
    setStoredAccountToken('a');
    resolve.mockResolvedValue(session(true));
    const { container, unmount } = render(<AgePrompt />);
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    unmount();

    setStoredAccountToken('b');
    resolve.mockResolvedValue(session(undefined));
    const second = render(<AgePrompt />);
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(second.container.innerHTML).toBe('');
  });

  it('stays quiet when the session check fails', async () => {
    setStoredAccountToken('a');
    resolve.mockRejectedValue(new Error('offline'));
    const { container } = render(<AgePrompt />);
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('records the answer once the box is ticked', async () => {
    setStoredAccountToken('a');
    resolve.mockResolvedValue(session(false));
    affirm.mockResolvedValue(undefined);
    render(<AgePrompt />);
    await screen.findByRole('dialog');
    expect(cont().disabled).toBe(true);
    fireEvent.click(box());
    fireEvent.click(cont());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(affirm).toHaveBeenCalledWith('a');
  });

  it('shows a failure and stays open', async () => {
    setStoredAccountToken('a');
    resolve.mockResolvedValue(session(false));
    affirm.mockRejectedValue(new Error('Could not save your answer.'));
    render(<AgePrompt />);
    await screen.findByRole('dialog');
    fireEvent.click(box());
    fireEvent.click(cont());
    expect(await screen.findByText('Could not save your answer.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('"Not now" closes it without answering, and it is not asked again this visit', async () => {
    setStoredAccountToken('a');
    resolve.mockResolvedValue(session(false));
    const { rerender } = render(<AgePrompt />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    pathname = '/city';
    rerender(<AgePrompt />);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(affirm).not.toHaveBeenCalled();
  });

  it('checks again after a login on another page', async () => {
    resolve.mockResolvedValue(session(false));
    const { rerender } = render(<AgePrompt />);
    setStoredAccountToken('new');
    pathname = '/city';
    rerender(<AgePrompt />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(resolve).toHaveBeenCalledWith('new');
  });
});
