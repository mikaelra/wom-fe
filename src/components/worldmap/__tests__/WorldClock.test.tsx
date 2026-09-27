import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import WorldClock from '@/components/worldmap/WorldClock';
import { formatWorldClock } from '@/lib/worldClock';

afterEach(() => vi.useRealTimers());

describe('WorldClock', () => {
  it('shows the viewer\'s time in green in normal time', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 27, 10, 5) });
    render(<WorldClock reverted={false} revertToDate={null} skyDate={null} skyDateReceivedAt={Date.now()} />);

    const clock = screen.getByRole('timer', { name: 'Normal time' });
    expect(clock).toHaveTextContent('10:05 27.09.2026');
    expect(clock).toHaveClass('text-green-400');
  });

  it('shows the timewarped time in red while time is turned back', () => {
    render(
      <WorldClock
        reverted
        revertToDate="2028-10-03T12:00:00Z"
        skyDate="2028-10-03T12:00:00Z"
        skyDateReceivedAt={Date.now()}
      />,
    );

    const clock = screen.getByRole('timer', { name: 'Timewarped time' });
    expect(clock).toHaveTextContent(formatWorldClock(new Date('2028-10-03T12:00:00Z')));
    expect(clock).toHaveClass('text-red-400');
  });

  it('ticks over as the minutes pass', () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 27, 10, 5, 59) });
    render(<WorldClock reverted={false} revertToDate={null} skyDate={null} skyDateReceivedAt={Date.now()} />);
    expect(screen.getByRole('timer')).toHaveTextContent('10:05');

    act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByRole('timer')).toHaveTextContent('10:06 27.09.2026');
  });

  it('shows nothing at all while the time is still loading', () => {
    const { container } = render(
      <WorldClock reverted={false} revertToDate={null} skyDate={null} skyDateReceivedAt={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
