import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WheelIcon, { SPECIAL_WHEEL_ICON_URL, WHEEL_ICON_URL } from '@/components/WheelIcon';

describe('WheelIcon', () => {
  it('shows the wheel picture at emoji size, hidden from screen readers', () => {
    render(<WheelIcon />);
    const img = screen.getByTestId('wheel-icon');
    expect(img).toHaveAttribute('src', WHEEL_ICON_URL);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveClass('h-[1em]', 'w-[1em]');
  });

  it('shows the Special Wheel its own picture', () => {
    render(<WheelIcon special className="extra" />);
    const img = screen.getByTestId('special-wheel-icon');
    expect(img).toHaveAttribute('src', SPECIAL_WHEEL_ICON_URL);
    expect(img).toHaveClass('extra');
  });
});
