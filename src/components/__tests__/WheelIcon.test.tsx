import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WheelIcon, { SPECIAL_WHEEL_ICON_URL, WHEEL_ICON_URL, WheelText } from '@/components/WheelIcon';

beforeEach(() => {
  // These are about SD and HD; web opens in Low Definition unless a choice is saved.
  localStorage.setItem('textMode', 'off');
});

describe('WheelIcon in Low Definition', () => {
  it('draws the 8-bit wheel, with square pixels', async () => {
    localStorage.setItem('textMode', 'on');
    render(<WheelIcon />);
    const img = await screen.findByTestId('wheel-icon');
    await waitFor(() => expect(img).toHaveAttribute('src', '/pixel/wheel.png'));
    expect(img).toHaveStyle({ imageRendering: 'pixelated' });
  });

  it('draws the 8-bit Special Wheel, and the wheel in a message', async () => {
    localStorage.setItem('textMode', 'on');
    render(
      <>
        <WheelIcon special />
        <WheelText text="🎡 You won a Wheel! 🎡" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('special-wheel-icon')).toHaveAttribute('src', '/pixel/special-wheel.png'));
    await waitFor(() => screen.getAllByTestId('wheel-icon').forEach((i) => expect(i).toHaveAttribute('src', '/pixel/wheel.png')));
  });
});

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
