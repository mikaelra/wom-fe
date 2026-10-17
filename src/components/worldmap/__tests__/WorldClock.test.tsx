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
    expect((clock.querySelector('span') as HTMLElement).style.backgroundImage).toContain('rgb(248, 113, 113)');
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

  it('shows a full moon\'s timewarp in its purple', () => {
    render(
      <WorldClock reverted revertToDate="2028-10-03T12:00:00Z" skyDate="2028-10-03T12:00:00Z"
        skyDateReceivedAt={Date.now()} warpColors={['#a855f7']} />,
    );
    const clock = screen.getByRole('timer', { name: 'Timewarped time' });
    const span = clock.querySelector('span') as HTMLElement;
    expect(span.style.backgroundImage).toContain('rgb(168, 85, 247)');
    expect(span.style.backgroundImage).not.toContain('rgb(248, 113, 113)');
  });

  it('bands a conjunction\'s two colours through the digits, top and bottom', () => {
    render(
      <WorldClock reverted revertToDate="2028-10-03T12:00:00Z" skyDate="2028-10-03T12:00:00Z"
        skyDateReceivedAt={Date.now()} warpColors={['#ff0000', '#008296']} />,
    );
    const span = screen.getByRole('timer', { name: 'Timewarped time' }).querySelector('span') as HTMLElement;
    // The browser writes it normalised (top-to-bottom is the default, so
    // it drops the direction): Mars red over Jupiter teal, split at 50%.
    expect(span.style.backgroundImage).toContain('rgb(255, 0, 0) 50.00%, rgb(0, 130, 150) 50.00%');
    expect(span.style.color).toBe('transparent');
  });

  it('greys out from the left as the hour runs out: half grey at half an hour', () => {
    vi.useFakeTimers({ now: new Date('2026-09-27T12:30:00Z') });
    render(
      <WorldClock reverted revertToDate="2028-10-03T12:00:00Z" skyDate="2028-10-03T12:30:00Z"
        skyDateReceivedAt={Date.now()} warpColors={['#a855f7']} revertExpiresAt="2026-09-27T13:00:00Z" />,
    );
    const span = screen.getByRole('timer', { name: 'Timewarped time' }).querySelector('span') as HTMLElement;
    expect(span.style.backgroundImage).toContain('rgb(107, 114, 128) 50.00%, transparent 50.00%');
  });

  it('stays green in normal time whatever colours it is given', () => {
    render(<WorldClock reverted={false} revertToDate={null} skyDate={null}
      skyDateReceivedAt={Date.now()} warpColors={['#ff0000', '#008296']} />);
    const clock = screen.getByRole('timer', { name: 'Normal time' });
    expect(clock).toHaveClass('text-green-400');
    expect((clock.querySelector('span') as HTMLElement).style.backgroundImage).toBe('');
  });
});
