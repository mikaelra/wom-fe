import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { ToastProvider, useToast } from '@/components/Toast';

function Trigger({ message }: { message: string }) {
  const { showError } = useToast();
  useEffect(() => {
    showError(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function SuccessTrigger({ message }: { message: string }) {
  const { showSuccess } = useToast();
  useEffect(() => {
    showSuccess(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('Toast', () => {
  it('shows a toast raised via showError, dismissible by its close button', () => {
    render(
      <ToastProvider>
        <Trigger message="Something broke" />
      </ToastProvider>,
    );

    expect(screen.getByText('Something broke')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
  });

  it('auto-dismisses after the toast duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="Auto dismiss me" />
      </ToastProvider>,
    );

    expect(screen.getByText('Auto dismiss me')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Auto dismiss me')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows a green toast raised via showSuccess, distinct from the red error toast', () => {
    render(
      <ToastProvider>
        <SuccessTrigger message="Account verified" />
      </ToastProvider>,
    );

    const toast = screen.getByText('Account verified').closest('[role="alert"]');
    expect(toast).toHaveStyle({ background: '#16a34a' });
  });

  it('keeps a stable context value across re-renders, so a `toast` dep does not loop', () => {
    // Regression: an unmemoized `{ showError, showSuccess }` handed a fresh
    // object to every consumer on each toast, re-firing any effect with
    // `toast` in its deps -- a failing request then loops flat out.
    const seen: unknown[] = [];

    function Watcher() {
      const toast = useToast();
      const renders = useRef(0);
      renders.current += 1;
      seen.push(toast);
      useEffect(() => {
        // Raise a couple of toasts -> ToastProvider re-renders each time.
        toast.showError('one');
        toast.showError('two');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <ToastProvider>
        <Watcher />
      </ToastProvider>,
    );

    // Every render saw the exact same context object.
    expect(new Set(seen).size).toBe(1);
  });

  it('logs to console.error instead of throwing when no provider is mounted', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Trigger message="No provider here" />);
    expect(errorSpy).toHaveBeenCalledWith(
      '[toast] shown with no ToastProvider mounted:',
      'No provider here',
    );
    errorSpy.mockRestore();
  });
});
