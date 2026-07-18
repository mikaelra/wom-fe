import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import WheelSpinModal from '@/components/WheelSpinModal';
import { spinWheel } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('@/lib/api', () => ({
  spinWheel: vi.fn(),
}));

const mockedSpin = vi.mocked(spinWheel);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedSpin.mockReset();
  setStoredAccountToken('sess-1');
});

afterEach(() => {
  setStoredAccountToken(null);
});

describe('WheelSpinModal', () => {
  it('shows a spinning state, then the result and calls onSpun', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_gold_v1' });
    const onSpun = vi.fn();
    render(<WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={onSpun} />);

    expect(screen.getAllByText('Spinning…').length).toBeGreaterThan(0);
    await act(async () => {
      await flush();
    });

    expect(mockedSpin).toHaveBeenCalledWith('sess-1', 1);
    expect(screen.getByText('You got:')).toBeInTheDocument();
    expect(screen.getByText('gold')).toBeInTheDocument();
    expect(onSpun).toHaveBeenCalledWith('frog_gold_v1');
  });

  it('disables the close button while spinning, enables it once resolved', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_blue_v1' });
    render(<WheelSpinModal wheelId={1} onClose={vi.fn()} onSpun={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Spinning…' })).toBeDisabled();

    await act(async () => {
      await flush();
    });

    expect(screen.getByRole('button', { name: 'Close' })).not.toBeDisabled();
  });

  it('shows an error state and lets the user close without a result', async () => {
    mockedSpin.mockRejectedValue(new Error('Wheel not found or already spun.'));
    const onClose = vi.fn();
    render(<WheelSpinModal wheelId={1} onClose={onClose} onSpun={vi.fn()} />);

    await act(async () => {
      await flush();
    });

    expect(screen.getByText('Wheel not found or already spun.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalled();
  });
});
