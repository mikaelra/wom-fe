import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingMessage from '@/components/lobby/FloatingMessage';

describe('FloatingMessage', () => {
  it('renders the message text', () => {
    render(<FloatingMessage message="Alice attacked Bob" onDone={() => {}} />);
    expect(screen.getByText('Alice attacked Bob')).toBeInTheDocument();
  });

  it('calls onDone immediately on click, without waiting for the timer', () => {
    const onDone = vi.fn();
    render(<FloatingMessage message="Alice attacked Bob" onDone={onDone} />);

    fireEvent.click(screen.getByText('Alice attacked Bob'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses and calls onDone after the fade-out delay', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<FloatingMessage message="Alice attacked Bob" onDone={onDone} />);

    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2500);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(onDone).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
