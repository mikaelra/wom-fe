import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import WheelSpinModal from '@/components/WheelSpinModal';
import { equipSkin, spinWheel } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('@/lib/api', () => ({
  spinWheel: vi.fn(),
  equipSkin: vi.fn(),
}));

const mockedSpin = vi.mocked(spinWheel);
const mockedEquip = vi.mocked(equipSkin);

// jsdom doesn't implement a real canvas 2D context (no `canvas` package
// installed), so HTMLCanvasElement.getContext('2d') returns null here --
// WheelSpinModal treats that as canvas-unavailable and renders the §3.5.10
// fallback (today's simple color-cycle reveal) instead of the animated
// wheel. That's exactly the path these tests exercise: the animated
// canvas/rAF path is explicitly not unit-tested (see vitest.config.ts's
// coverage philosophy and §12 Phase 2b's "verification is by eye" note) --
// it's covered by manual verification instead.

beforeEach(() => {
  mockedSpin.mockReset();
  mockedEquip.mockReset();
  setStoredAccountToken('sess-1');
});

afterEach(() => {
  setStoredAccountToken(null);
});

const clickRoll = () => act(() => screen.getByRole('button', { name: 'Roll' }).click());
const waitForResult = () => waitFor(() => expect(screen.getByText('You got:')).toBeInTheDocument());

describe('WheelSpinModal', () => {
  it('does not spin until Roll is clicked', () => {
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={vi.fn()} onSpun={vi.fn()} />);

    expect(mockedSpin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('closing before Roll never spends the wheel', () => {
    const onClose = vi.fn();
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={onClose} onSpun={vi.fn()} />);

    screen.getByRole('button', { name: 'Close' }).click();

    expect(onClose).toHaveBeenCalled();
    expect(mockedSpin).not.toHaveBeenCalled();
  });

  it('clicking Roll spins, shows the result, and calls onSpun', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_pink_v1' });
    const onSpun = vi.fn();
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={vi.fn()} onSpun={onSpun} />);

    clickRoll();

    expect(screen.queryByRole('button', { name: 'Roll' })).not.toBeInTheDocument();
    await waitForResult();

    expect(mockedSpin).toHaveBeenCalledTimes(1);
    expect(mockedSpin).toHaveBeenCalledWith('sess-1', 1);
    expect(screen.getByText('Pretty Pink')).toBeInTheDocument();
    expect(onSpun).toHaveBeenCalledWith('frog_pink_v1');
  });

  it('a rapid double-click on Roll only spins once', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_pink_v1' });
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={vi.fn()} onSpun={vi.fn()} />);

    const roll = screen.getByRole('button', { name: 'Roll' });
    await act(async () => {
      roll.click();
      roll.click();
    });

    await waitForResult();
    expect(mockedSpin).toHaveBeenCalledTimes(1);
  });

  it('shows an error state and lets the user close without a result', async () => {
    mockedSpin.mockRejectedValue(new Error('Wheel not found or already spun.'));
    const onClose = vi.fn();
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={onClose} onSpun={vi.fn()} />);

    clickRoll();
    await waitFor(() => expect(screen.getByText('Wheel not found or already spun.')).toBeInTheDocument());

    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the player equip the won skin and reports the equipped skin up', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_pink_v1' });
    mockedEquip.mockResolvedValue({ success: true, equipped_skin: 'frog_pink_v1' });
    const onEquipped = vi.fn();
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={vi.fn()} onSpun={vi.fn()} onEquipped={onEquipped} />);

    clickRoll();
    await waitForResult();
    await act(async () => {
      screen.getByRole('button', { name: 'Equip' }).click();
    });

    expect(mockedEquip).toHaveBeenCalledWith('sess-1', 'frog_pink_v1');
    await waitFor(() => expect(screen.getByText('EQUIPPED')).toBeInTheDocument());
    expect(onEquipped).toHaveBeenCalledWith('frog_pink_v1');
  });

  it('shows an inline error if equipping fails, without losing the result', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_pink_v1' });
    mockedEquip.mockRejectedValue(new Error('Failed to equip skin.'));
    render(<WheelSpinModal wheelId={1} kind="normal" onClose={vi.fn()} onSpun={vi.fn()} />);

    clickRoll();
    await waitForResult();
    await act(async () => {
      screen.getByRole('button', { name: 'Equip' }).click();
    });

    await waitFor(() => expect(screen.getByText('Failed to equip skin.')).toBeInTheDocument());
    // The won-skin result is still shown -- an equip failure isn't a spin failure.
    expect(screen.getByText('You got:')).toBeInTheDocument();
    expect(screen.getByText('Pretty Pink')).toBeInTheDocument();
  });

  it('works for a special-wheel kind too', async () => {
    mockedSpin.mockResolvedValue({ success: true, result_skin: 'frog_bling_v1' });
    render(<WheelSpinModal wheelId={2} kind="special" onClose={vi.fn()} onSpun={vi.fn()} />);

    clickRoll();
    await waitForResult();

    expect(mockedSpin).toHaveBeenCalledWith('sess-1', 2);
    expect(screen.getByText('bling')).toBeInTheDocument();
  });
});
