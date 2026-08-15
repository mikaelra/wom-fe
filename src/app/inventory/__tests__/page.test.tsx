import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import InventoryPage from '@/app/inventory/page';
import {
  checkClaimVerified, equipSkin, getInventory, getPlayerRelics, getTradeUpRules, spinWheel, tradeUp,
} from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('@/lib/api', () => ({
  getInventory: vi.fn(),
  equipSkin: vi.fn(),
  spinWheel: vi.fn(),
  getPlayerRelics: vi.fn(),
  checkClaimVerified: vi.fn(),
  getTradeUpRules: vi.fn(),
  tradeUp: vi.fn(),
}));

// Real RelicCoin/SpinningModelViewer render a react-three-fiber <Canvas>,
// which needs a WebGL context jsdom can't provide -- mocked out wholesale,
// same as this repo's other R3F leaf components in page-level tests (see
// e.g. src/app/__tests__/page.test.tsx's LobbyScene mock).
vi.mock('@/components/RelicCoin', () => ({
  default: () => <div data-testid="relic-coin" />,
}));
vi.mock('@/components/SpinningModelViewer', () => ({
  default: ({ url }: { url: string }) => <div data-testid="skin-preview" data-url={url} />,
}));

const mockedGetInventory = vi.mocked(getInventory);
const mockedEquipSkin = vi.mocked(equipSkin);
const mockedSpinWheel = vi.mocked(spinWheel);
const mockedGetPlayerRelics = vi.mocked(getPlayerRelics);
const mockedCheckClaimVerified = vi.mocked(checkClaimVerified);
const mockedGetTradeUpRules = vi.mocked(getTradeUpRules);
const mockedTradeUp = vi.mocked(tradeUp);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedGetInventory.mockReset();
  mockedEquipSkin.mockReset();
  mockedSpinWheel.mockReset();
  mockedGetPlayerRelics.mockReset();
  mockedGetPlayerRelics.mockResolvedValue({ relics: [] });
  mockedCheckClaimVerified.mockReset();
  mockedCheckClaimVerified.mockResolvedValue({ verified: false });
  mockedGetTradeUpRules.mockReset();
  mockedGetTradeUpRules.mockResolvedValue({ rules: {} });
  mockedTradeUp.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  setStoredAccountToken(null);
  localStorage.removeItem('playerName');
  localStorage.removeItem('playerEmail');
  vi.useRealTimers();
});

describe('InventoryPage', () => {
  it('shows a login prompt when there is no stored account token', async () => {
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('You must be logged in to view your inventory.')).toBeInTheDocument();
    expect(screen.getByText('Go to log in')).toBeInTheDocument();
    expect(mockedGetInventory).not.toHaveBeenCalled();
  });

  it('shows green as always owned and equipped by default', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('OG Green')).toBeInTheDocument();
    expect(screen.getByText('EQUIPPED')).toBeInTheDocument();
    expect(screen.getByTestId('skin-preview')).toHaveAttribute('data-url', '/models/frogs/frog_green_v1.glb');
  });

  it('shows a static head thumbnail on each skin card, not the old flat color swatch', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_gold_v1', count: 1 }],
      wheels: [],
    });
    const { container } = render(<InventoryPage />);
    await flush();

    const srcs = Array.from(container.querySelectorAll('img')).map((img) => img.src);
    expect(srcs.some((src) => src.endsWith('/skins/thumbnails/frog_green_v1.png'))).toBe(true);
    expect(srcs.some((src) => src.endsWith('/skins/thumbnails/frog_gold_v1.png'))).toBe(true);
  });

  it('lists owned skins with their counts and an Equip button for unequipped ones', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_gold_v1', count: 2 }],
      wheels: [],
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('gold')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Equip' })).toBeInTheDocument();
  });

  it('equips a skin and reflects the new equipped state', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_gold_v1', count: 1 }],
      wheels: [],
    });
    mockedEquipSkin.mockResolvedValue({ success: true, equipped_skin: 'frog_gold_v1' });
    render(<InventoryPage />);
    await flush();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Equip' }));
      await flush();
    });

    expect(mockedEquipSkin).toHaveBeenCalledWith('sess-1', 'frog_gold_v1');
    expect(screen.getAllByText('EQUIPPED')).toHaveLength(1);
    expect(screen.getByTestId('skin-preview')).toHaveAttribute('data-url', '/models/frogs/frog_gold_v1.glb');
  });

  it('shows unspun wheels with a Use button', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [],
      wheels: [{ id: 1, kind: 'normal' }],
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByRole('button', { name: /Use Wheel/ })).toBeInTheDocument();
  });

  it('opens the spin modal when a wheel is used', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [],
      wheels: [{ id: 1, kind: 'normal' }],
    });
    render(<InventoryPage />);
    await flush();

    mockedSpinWheel.mockReturnValue(new Promise(() => {})); // never resolves; only the open state matters here
    fireEvent.click(screen.getByRole('button', { name: /Use Wheel/ }));

    expect(screen.getByText('🎡')).toBeInTheDocument();
  });

  it('shows the backend error and a login link when the session is invalid', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockRejectedValue(new Error('Invalid or expired session.'));
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('Invalid or expired session.')).toBeInTheDocument();
    expect(screen.getByText('Go to log in')).toBeInTheDocument();
  });

  it('lists relics as the first section, like the skins grid', async () => {
    setStoredAccountToken('sess-1');
    localStorage.setItem('playerName', 'Alice');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    mockedGetPlayerRelics.mockResolvedValue({
      relics: [
        { id: 1, boss_id: 7, created_at: '2026-01-01T00:00:00+00:00', name: 'Golden Fleece', power_category: 'fire', count: 3 },
      ],
    });
    render(<InventoryPage />);
    await flush();

    expect(mockedGetPlayerRelics).toHaveBeenCalledWith('Alice');
    expect(screen.getByText('Relics')).toBeInTheDocument();
    expect(screen.getByText('Golden Fleece')).toBeInTheDocument();
    expect(screen.getByTestId('relic-coin')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('shows a fallback message when the player has no relics', async () => {
    setStoredAccountToken('sess-1');
    localStorage.setItem('playerName', 'Alice');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('You have no relics yet.')).toBeInTheDocument();
  });

  it('stacks wheels of the same kind into a single button showing the count', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [],
      wheels: [
        { id: 1, kind: 'normal' },
        { id: 2, kind: 'normal' },
        { id: 3, kind: 'normal' },
      ],
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByRole('button', { name: '🎡 Use Wheel ×3' })).toBeInTheDocument();
  });

  it('labels a special-kind wheel "Special Wheel", not the raw backend kind', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [],
      wheels: [{ id: 1, kind: 'special' }],
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByRole('button', { name: '🎡 Use Special Wheel' })).toBeInTheDocument();
  });

  it('shows a Shop link and empty-state CTA when there are no wheels', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('Get a Special Wheel')).toHaveAttribute('href', '/shop');
    expect(screen.getByText('Shop →')).toHaveAttribute('href', '/shop');
  });

  it('shows a waiting-for-verification message when a claim is pending on this browser', async () => {
    localStorage.setItem('playerName', 'Alice');
    localStorage.setItem('playerEmail', 'alice@example.com');
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText(/Waiting for you to verify/)).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(mockedGetInventory).not.toHaveBeenCalled();
  });

  it('auto-loads the inventory once a pending claim is verified elsewhere (e.g. on a phone)', async () => {
    localStorage.setItem('playerName', 'Alice');
    localStorage.setItem('playerEmail', 'alice@example.com');
    // Real checkClaimVerified (lib/api.ts) stores the session token as a
    // side effect once verified -- simulated here since @/lib/api is mocked.
    mockedCheckClaimVerified
      .mockResolvedValueOnce({ verified: false })
      .mockImplementationOnce(async () => {
        setStoredAccountToken('sess-1');
        return { verified: true };
      });
    mockedGetInventory.mockResolvedValue({ equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    render(<InventoryPage />);
    await flush();
    expect(screen.getByText(/Waiting for you to verify/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(mockedGetInventory).toHaveBeenCalledWith('sess-1');
    expect(screen.getByText('OG Green')).toBeInTheDocument();
  });

  it('shows a Trade up button only for skins with a rule', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_blue_v1', count: 5 }],
      wheels: [],
    });
    mockedGetTradeUpRules.mockResolvedValue({
      rules: { frog_blue_v1: { cost: 5, output_kind: 'wheel', output: 'special' } },
    });
    render(<InventoryPage />);
    await flush();

    // frog_blue_v1 has a rule -- one Trade up button. frog_green_v1 (always
    // present, implicitly owned) has none.
    expect(screen.getAllByRole('button', { name: 'Trade up' })).toHaveLength(1);
  });

  it('renders no Trade up buttons, without blocking the page, when the rules fetch fails', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_blue_v1', count: 5 }],
      wheels: [],
    });
    mockedGetTradeUpRules.mockRejectedValue(new Error('Failed to load trade-up rules.'));
    render(<InventoryPage />);
    await flush();

    expect(screen.queryByRole('button', { name: 'Trade up' })).not.toBeInTheDocument();
    // The rest of the grid still renders -- a rules-fetch failure isn't an inventory failure.
    expect(screen.getByText('Equip')).toBeInTheDocument();
  });

  it('opens TradeUpModal and refreshes the inventory once a trade completes', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1',
      skins: [{ skin: 'frog_blue_v1', count: 5 }],
      wheels: [],
    });
    mockedGetTradeUpRules.mockResolvedValue({
      rules: { frog_blue_v1: { cost: 5, output_kind: 'wheel', output: 'special' } },
    });
    mockedTradeUp.mockResolvedValue({
      success: true, trade_up_id: 900, output_kind: 'wheel', output: 'special', wheel_id: 501, remaining: 0,
    });
    render(<InventoryPage />);
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Trade up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trade up (5 × Bleak Blue)' }));
    expect(screen.getByText('Trade up 5 × Bleak Blue?')).toBeInTheDocument();

    mockedGetInventory.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, trade up' }));
      await flush();
    });

    expect(mockedTradeUp).toHaveBeenCalledWith('sess-1', 'frog_blue_v1');
    // onTraded refreshes the background inventory data (docs/TRADE_UP_PLAN.md §8.4).
    expect(mockedGetInventory).toHaveBeenCalledTimes(1);
  });
});
