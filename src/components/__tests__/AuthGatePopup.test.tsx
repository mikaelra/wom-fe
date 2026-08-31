import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AuthGatePopup, { type AuthGatePopupProps } from '@/components/AuthGatePopup';
import type { UseAuthFlowResult } from '@/lib/useAuthFlow';

function authFlow(over: Partial<UseAuthFlowResult> = {}): UseAuthFlowResult {
  return {
    name: '', setName: vi.fn(),
    error: '', loading: false,
    emailMode: false, email: '', setEmail: vi.fn(), emailError: '',
    codeMode: false, code: '', setCode: vi.fn(), codeError: '',
    handleSubmitName: vi.fn(), handleLogin: vi.fn(), handleVerifyCode: vi.fn(),
    backToEmailStep: vi.fn(), reset: vi.fn(),
    ...over,
  };
}

function renderPopup(over: Partial<AuthGatePopupProps> = {}) {
  const props: AuthGatePopupProps = {
    authFlow: authFlow(),
    accent: 'red',
    title: 'Enter the Hades Bossfight',
    blurb: 'Choose a battle name to face Hades.',
    submitLabel: 'Enter Bossfight',
    submitLoadingLabel: 'Entering...',
    onClose: vi.fn(),
    ...over,
  };
  return { props, ...render(<AuthGatePopup {...props} />) };
}

describe('AuthGatePopup', () => {
  it('shows the name step first, with the caller-supplied copy', () => {
    renderPopup();
    expect(screen.getByText('Enter the Hades Bossfight')).toBeInTheDocument();
    expect(screen.getByText('Choose a battle name to face Hades.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your battle name')).toBeInTheDocument();
    expect(screen.getByText('Enter Bossfight')).toBeInTheDocument();
    // Later steps must not be rendered yet.
    expect(screen.queryByPlaceholderText('email')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('6-digit code')).not.toBeInTheDocument();
  });

  it('swaps the primary label while loading, and disables both buttons', () => {
    renderPopup({ authFlow: authFlow({ loading: true }) });
    expect(screen.getByText('Entering...')).toBeInTheDocument();
    expect(screen.queryByText('Enter Bossfight')).not.toBeInTheDocument();
    // The Athens original left Cancel enabled mid-flight; unified on the
    // ranked behaviour so backing out cannot race an in-flight request.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Entering...' })).toBeDisabled();
  });

  it('closes on Cancel and on a backdrop click, but not on a click inside the card', () => {
    const onClose = vi.fn();
    renderPopup({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // A click on the card itself must not bubble out to the backdrop.
    fireEvent.click(screen.getByText('Enter the Hades Bossfight'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the email step, keeping the name field visible but read-only', () => {
    renderPopup({ authFlow: authFlow({ emailMode: true, name: 'Alice', emailError: 'Wrong email' }) });
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your battle name')).toHaveAttribute('readonly');
    expect(screen.getByText('Wrong email')).toBeInTheDocument();
    expect(screen.getByText('Log in')).toBeInTheDocument();
    expect(screen.getByText('Choose new name')).toBeInTheDocument();
    // The name step's primary action is replaced, not stacked alongside.
    expect(screen.queryByText('Enter Bossfight')).not.toBeInTheDocument();
  });

  it('renders the code step with the address it was sent to, and hides the email error', () => {
    renderPopup({
      authFlow: authFlow({
        emailMode: true, codeMode: true, email: 'a@b.co',
        emailError: 'Wrong email', codeError: 'Bad code',
      }),
    });
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
    expect(screen.getByText('a@b.co')).toBeInTheDocument();
    expect(screen.getByText('Bad code')).toBeInTheDocument();
    // emailError is suppressed once the code step is up (it belongs to the
    // step the player has already cleared).
    expect(screen.queryByText('Wrong email')).not.toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('routes Enter to the handler for the step currently on screen', () => {
    const submit = vi.fn(), login = vi.fn(), verify = vi.fn();

    const { unmount } = renderPopup({
      authFlow: authFlow({ handleSubmitName: submit, handleLogin: login, handleVerifyCode: verify }),
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Your battle name'), { key: 'Enter' });
    expect(submit).toHaveBeenCalledTimes(1);
    unmount();

    const r2 = renderPopup({
      authFlow: authFlow({ emailMode: true, handleSubmitName: submit, handleLogin: login, handleVerifyCode: verify }),
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Your battle name'), { key: 'Enter' });
    expect(login).toHaveBeenCalledTimes(1);
    r2.unmount();

    renderPopup({
      authFlow: authFlow({ emailMode: true, codeMode: true, handleSubmitName: submit, handleLogin: login, handleVerifyCode: verify }),
    });
    fireEvent.keyDown(screen.getByPlaceholderText('Your battle name'), { key: 'Enter' });
    expect(verify).toHaveBeenCalledTimes(1);

    // Each step routed to exactly one handler -- no double-firing.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('strips non-digits and caps the code at six characters', () => {
    const setCode = vi.fn();
    renderPopup({ authFlow: authFlow({ emailMode: true, codeMode: true, setCode }) });
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: 'a1b2c3d4e5f6g7' } });
    expect(setCode).toHaveBeenCalledWith('123456');
  });

  it('applies the accent as complete Tailwind class names, never interpolated', () => {
    const { unmount } = renderPopup({ accent: 'red' });
    expect(screen.getByText('Enter the Hades Bossfight')).toHaveClass('text-red-400');
    expect(screen.getByRole('button', { name: 'Enter Bossfight' })).toHaveClass('bg-red-700');
    unmount();

    renderPopup({ accent: 'blue', title: 'Play Ranked', submitLabel: 'Continue' });
    expect(screen.getByText('Play Ranked')).toHaveClass('text-blue-400');
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('bg-blue-700');
  });
});
