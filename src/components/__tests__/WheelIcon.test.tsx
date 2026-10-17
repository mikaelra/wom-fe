import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WheelIcon, { SPECIAL_WHEEL_ICON_URL, WHEEL_ICON_URL, WheelText } from '@/components/WheelIcon';

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

  it("draws the backend's wheel emoji in a message as the icon", () => {
    const { container } = render(<WheelText text="🎡 You won a Wheel! 🎡" />);
    expect(screen.getAllByTestId('wheel-icon')).toHaveLength(2);
    expect(container.textContent).toBe(' You won a Wheel! ');
    expect(container.textContent).not.toContain('🎡');
  });

  it('leaves a message without it as plain text', () => {
    const { container } = render(<WheelText text="Player A attacked Player B" />);
    expect(screen.queryByTestId('wheel-icon')).not.toBeInTheDocument();
    expect(container.textContent).toBe('Player A attacked Player B');
  });
});
