import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import TradeUpModal from '@/components/TradeUpModal';
import { equipSkin, tradeUp } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';
import type { TradeUpRule } from '@/lib/tradeUps';

vi.mock('@/lib/api', () => ({
  tradeUp: vi.fn(),
  equipSkin: vi.fn(),
}));

const mockedTradeUp = vi.mocked(tradeUp);
const mockedEquip = vi.mocked(equipSkin);

const wheelRule: TradeUpRule = { cost: 5, output_kind: 'wheel', output: 'special' };
const skinRule: TradeUpRule = { cost: 5, output_kind: 'skin', output: 'frog_gold_v1' };

beforeEach(() => {
  mockedTradeUp.mockReset();
  mockedEquip.mockReset();
  setStoredAccountToken('sess-1');
});

afterEach(() => {
  setStoredAccountToken(null);
});

const openConfirm = () => act(() => screen.getByRole('button', { name: /Trade up \(/ }).click());
const confirmTrade = () => act(() => screen.getByRole('button', { name: 'Yes, trade up' }).click());
const waitForResult = () => waitFor(() => expect(mockedTradeUp).toHaveBeenCalled());

describe('TradeUpModal', () => {
  it('renders the cost and calls no API until confirmed', () => {
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={vi.fn()} onTraded={vi.fn()} />,
    );

    expect(screen.getByText('Costs 5 × Bleak Blue. You have 5.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trade up (5 × Bleak Blue)' })).toBeInTheDocument();
    expect(mockedTradeUp).not.toHaveBeenCalled();
  });

  it('disables the primary button and shows the shortfall when unaffordable', () => {
    render(
      <TradeUpModal skin="frog_blue_v1" owned={3} rule={wheelRule} onClose={vi.fn()} onTraded={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: 'Need 5 × Bleak Blue (you have 3)' });
    expect(button).toBeDisabled();
  });

  it('Cancel closes without calling the API', () => {
    const onClose = vi.fn();
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={onClose} onTraded={vi.fn()} />,
    );

    screen.getByRole('button', { name: 'Cancel' }).click();

    expect(onClose).toHaveBeenCalled();
    expect(mockedTradeUp).not.toHaveBeenCalled();
  });

  it('clicking Trade up raises a confirm box and calls no API yet', () => {
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={vi.fn()} onTraded={vi.fn()} />,
    );

    openConfirm();

    expect(screen.getByText('Trade up 5 × Bleak Blue?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, trade up' })).toBeInTheDocument();
    expect(mockedTradeUp).not.toHaveBeenCalled();
  });

  it('Back returns to the preview without calling the API', () => {
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={vi.fn()} onTraded={vi.fn()} />,
    );

    openConfirm();
    screen.getByRole('button', { name: 'Back' }).click();

    expect(screen.getByRole('button', { name: 'Trade up (5 × Bleak Blue)' })).toBeInTheDocument();
    expect(mockedTradeUp).not.toHaveBeenCalled();
  });

  it('only Yes, trade up calls the API, and a double-click calls it once', async () => {
    mockedTradeUp.mockResolvedValue({
      success: true, trade_up_id: 900, output_kind: 'wheel', output: 'special', wheel_id: 501, remaining: 0,
    });
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={vi.fn()} onTraded={vi.fn()} />,
    );

    openConfirm();
    const yes = screen.getByRole('button', { name: 'Yes, trade up' });
    await act(async () => {
      yes.click();
      yes.click();
    });

    await waitForResult();
    expect(mockedTradeUp).toHaveBeenCalledTimes(1);
    expect(mockedTradeUp).toHaveBeenCalledWith('sess-1', 'frog_blue_v1');
  });

  it('a wheel result shows Spin it now and hands the wheel_id up', async () => {
    mockedTradeUp.mockResolvedValue({
      success: true, trade_up_id: 900, output_kind: 'wheel', output: 'special', wheel_id: 501, remaining: 0,
    });
    const onSpinNow = vi.fn();
    const onClose = vi.fn();
    const onTraded = vi.fn();
    render(
      <TradeUpModal
        skin="frog_blue_v1" owned={5} rule={wheelRule}
        onClose={onClose} onTraded={onTraded} onSpinNow={onSpinNow}
      />,
    );

    openConfirm();
    confirmTrade();
    await waitFor(() => expect(screen.getByText('You got a Special Wheel')).toBeInTheDocument());
    expect(onTraded).toHaveBeenCalledWith(expect.objectContaining({ trade_up_id: 900 }));

    screen.getByRole('button', { name: 'Spin it now' }).click();

    expect(onSpinNow).toHaveBeenCalledWith(501);
    expect(onClose).toHaveBeenCalled();
  });

  it('a skin result shows Equip, and equipping calls onEquipped', async () => {
    mockedTradeUp.mockResolvedValue({
      success: true, trade_up_id: 901, output_kind: 'skin', output: 'frog_gold_v1', remaining: 3,
    });
    mockedEquip.mockResolvedValue({ success: true, equipped_skin: 'frog_gold_v1' });
    const onEquipped = vi.fn();
    render(
      <TradeUpModal
        skin="frog_silver_v1" owned={5} rule={skinRule}
        onClose={vi.fn()} onTraded={vi.fn()} onEquipped={onEquipped}
      />,
    );

    openConfirm();
    confirmTrade();
    await waitFor(() => expect(screen.getByText('You got:')).toBeInTheDocument());
    // Raw DOM text is skinLabel()'s lowercase fallback ("gold"), rendered
    // capitalized only via CSS -- same convention as WheelSpinModal.
    expect(screen.getByText('gold')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: 'Equip' }).click();
    });

    expect(mockedEquip).toHaveBeenCalledWith('sess-1', 'frog_gold_v1');
    await waitFor(() => expect(screen.getByText('EQUIPPED')).toBeInTheDocument());
    expect(onEquipped).toHaveBeenCalledWith('frog_gold_v1');
  });

  it('renders an inline error and lets the user close without a result', async () => {
    mockedTradeUp.mockRejectedValue(new Error('You no longer have enough copies.'));
    const onClose = vi.fn();
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={onClose} onTraded={vi.fn()} />,
    );

    openConfirm();
    confirmTrade();
    await waitFor(() => expect(screen.getByText('You no longer have enough copies.')).toBeInTheDocument());

    screen.getByRole('button', { name: 'Close' }).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape backs out of the confirm box instead of closing the modal', () => {
    const onClose = vi.fn();
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={onClose} onTraded={vi.fn()} />,
    );

    openConfirm();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Trade up (5 × Bleak Blue)' })).toBeInTheDocument();
  });

  it('Escape closes the modal from the preview state', () => {
    const onClose = vi.fn();
    render(
      <TradeUpModal skin="frog_blue_v1" owned={5} rule={wheelRule} onClose={onClose} onTraded={vi.fn()} />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalled();
  });
});
