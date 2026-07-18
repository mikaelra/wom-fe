import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import WheelSpinModal from '@/components/WheelSpinModal';
import { spinWheel } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('@/lib/api', () => ({
  spinWheel: vi.fn(),
}));

const mockedSpin = vi.mocked(spinWheel);

// The modal pads the reveal out to a fixed minimum duration regardless of
// how fast the network responds -- advance past it (and let the already-
// resolved spinWheel promise's microtasks flush) to reach the settled state.
const advancePastMinDuration = () => act(async () => {
  await vi.advanceTimersByTimeAsync(1800);
});

beforeEach(() => {
  mockedSpin.mockReset();
  setStoredAccountToken('sess-1');
  vi.useFakeTimers();
});

afterEach(() => {
  setStoredAccountToken(null);
  vi.useRealTimers();
});

describe('WheelSpinModal', () => {
  it('shows a spinning state, then the result and calls onSpun', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_gold_v1' });
    const onSpun = vi.fn();
    render(<WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={onSpun} />);

    expect(screen.getAllByText('Spinning…').length).toBeGreaterThan(0);
    await advancePastMinDuration();

    expect(mockedSpin).toHaveBeenCalledTimes(1);
    expect(mockedSpin).toHaveBeenCalledWith('sess-1', 1);
    expect(screen.getByText('You got:')).toBeInTheDocument();
    expect(screen.getByText('gold')).toBeInTheDocument();
    expect(onSpun).toHaveBeenCalledWith('frog_gold_v1');
  });

  it('does not settle before the minimum spin duration even though the request already resolved', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_gold_v1' });
    render(<WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={vi.fn()} />);

    // Let the (already-mocked, instant) request resolve, but don't advance
    // the minimum-duration timer yet.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('You got:')).not.toBeInTheDocument();

    await advancePastMinDuration();
    expect(screen.getByText('You got:')).toBeInTheDocument();
  });

  it('calls spinWheel exactly once under StrictMode\'s dev-only double effect run', async () => {
    // Regression: without a call-once guard, StrictMode's double-invoke
    // fired a second request that hit "already spun" and clobbered the
    // first request's success state with an error, even though the skin
    // had actually been granted.
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_gold_v1' });
    render(
      <StrictMode>
        <WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={vi.fn()} />
      </StrictMode>,
    );

    await advancePastMinDuration();

    expect(mockedSpin).toHaveBeenCalledTimes(1);
    expect(screen.getByText('You got:')).toBeInTheDocument();
    expect(screen.queryByText(/already spun/)).not.toBeInTheDocument();
  });

  it('disables the close button while spinning, enables it once resolved', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_blue_v1' });
    render(<WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Spinning…' })).toBeDisabled();

    await advancePastMinDuration();

    expect(screen.getByRole('button', { name: 'Close' })).not.toBeDisabled();
  });

  it('shows an error state and lets the user close without a result', async () => {
    mockedSpin.mockRejectedValue(new Error('Wheel not found or already spun.'));
    const onClose = vi.fn();
    render(<WheelSpinModal wheelId={1} onClose={onClose} onSpun={vi.fn()} />);

    await advancePastMinDuration();

    expect(screen.getByText('Wheel not found or already spun.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalled();
  });
});
