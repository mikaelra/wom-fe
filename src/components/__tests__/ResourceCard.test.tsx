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
      vi.advanceTimersByTime(180);
    });
    expect(screen.getByText('12')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
