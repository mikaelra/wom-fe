import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ResourceCard from '@/components/ResourceCard';

const baseProps = {
  label: 'HP',
  sublabel: '❤ Get',
  valueClass: 'text-red-400',
  sublabelClass: 'text-red-400/70',
  className: '',
  disabled: false,
  onClick: () => {},
};

describe('ResourceCard', () => {
  it('renders the label, value, and sublabel', () => {
    render(<ResourceCard {...baseProps} value={10} />);
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('❤ Get')).toBeInTheDocument();
  });

  it('calls onClick when not disabled', () => {
    const onClick = vi.fn();
    render(<ResourceCard {...baseProps} value={10} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<ResourceCard {...baseProps} value={10} onClick={onClick} disabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('delays swapping the displayed value until after the bounce starts', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ResourceCard {...baseProps} value={10} />);
    expect(screen.getByText('10')).toBeInTheDocument();

    rerender(<ResourceCard {...baseProps} value={12} />);
    expect(screen.getByText('10')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(273);
    });
    expect(screen.getByText('12')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('does not collide React keys when a value change and a block pulse land on the same count', () => {
    // Regression test: bounceCount (the button's remount key) and
    // blockPulse (the aura span's key) are independent counters that both
    // start at 0. When a value change and a block pulse each reach the same
    // count, the button and the aura span previously shared a React key
    // (e.g. both "1") -- React warns "Encountered two children with the
    // same key" and may duplicate or omit a sibling on the next update
    // (this is exactly how a stale HP card was left on screen in prod).
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(<ResourceCard {...baseProps} value={10} blockPulse={0} />);
    // First value change: bounceCount 0 -> 1.
    rerender(<ResourceCard {...baseProps} value={9} blockPulse={0} />);
    // First block pulse, landing on the same count as bounceCount: blockPulse 0 -> 1.
    rerender(<ResourceCard {...baseProps} value={9} blockPulse={1} />);

    const keyWarning = errorSpy.mock.calls.find((args) =>
      String(args[0]).includes('same key'),
    );
    expect(keyWarning).toBeUndefined();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    errorSpy.mockRestore();
  });
});
