import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merchantState, revertedState, stoneOffer } from '@/lib/__tests__/merchantFixtures';
import { formatWorldClock } from '@/lib/worldClock';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import InventoryPage from '@/app/inventory/page';
import {
  checkClaimVerified, equipSkin, getInventory, getMerchantOffer, getPlayerRelics, getTradeUpRules,
  revertMerchantTime, spinWheel, tradeUp,
} from '@/lib/api';
import { setStoredAccountToken, ApiError } from '@/lib/http';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock('@/lib/api', () => ({
  getInventory: vi.fn(),
  equipSkin: vi.fn(),
  spinWheel: vi.fn(),
  getPlayerRelics: vi.fn(),
  checkClaimVerified: vi.fn(),
  getTradeUpRules: vi.fn(),
  tradeUp: vi.fn(),
  revertMerchantTime: vi.fn(),
  getMerchantOffer: vi.fn(),
  getMerchantSkyEvents: vi.fn().mockResolvedValue([]),
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
const mockedRevertMerchantTime = vi.mocked(revertMerchantTime);
const mockedGetMerchantOffer = vi.mocked(getMerchantOffer);
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
  mockedRevertMerchantTime.mockReset();
  mockedGetMerchantOffer.mockReset();
  mockedGetMerchantOffer.mockResolvedValue(merchantState());
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

  it('shows the My AI credit balance with a link to My AI when you have some', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1', skins: [], wheels: [], ai_credits: 42,
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('My AI credits')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('My AI →')).toHaveAttribute('href', '/my-ai');
    expect(screen.queryByText('Buy in the shop →')).not.toBeInTheDocument();
  });

  it('links to the shop from the credits box when you have none', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({
      equipped_skin: 'frog_green_v1', skins: [], wheels: [], ai_credits: 0,
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.getByText('My AI credits')).toBeInTheDocument();
    expect(screen.getByText('Buy in the shop →')).toHaveAttribute('href', '/shop');
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
    // Relics are fetched by the session-resolved name in getInventory's own
    // response, not a client-cached localStorage guess (bug traced
    // 2026-09-25) -- no localStorage.playerName setup needed here.
    mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    mockedGetPlayerRelics.mockResolvedValue({
      relics: [
        { id: 1, boss_id: 7, created_at: '2026-01-01T00:00:00+00:00', newest_copy_created_at: '2026-01-01T00:00:00+00:00', name: 'Golden Fleece', power_category: 'fire', count: 3 },
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

  it('does not show a Revert Time button on an unrelated relic', async () => {
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    mockedGetPlayerRelics.mockResolvedValue({
      relics: [
        { id: 1, boss_id: 7, created_at: '2026-01-01T00:00:00+00:00', newest_copy_created_at: '2026-01-01T00:00:00+00:00', name: 'Golden Fleece', power_category: 'fire', count: 1 },
      ],
    });
    render(<InventoryPage />);
    await flush();

    expect(screen.queryByRole('button', { name: /Revert Time/ })).not.toBeInTheDocument();
  });

  it('tags Hades\' Coin and Stone of Vitality as Consumable, but not an unrelated relic', async () => {
    // CONSUMABLE_RELIC_NAMES (types/game.ts) is name-keyed, not
    // power_category-keyed: Spirit of Hera shares Stone of Vitality's
    // HEALTH category but isn't consumable (no wired effect exists for
    // it), so a category-based check would mislabel it.
    setStoredAccountToken('sess-1');
    mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    mockedGetPlayerRelics.mockResolvedValue({
      relics: [
        { id: 1, boss_id: 6, created_at: '2026-01-01T00:00:00+00:00', newest_copy_created_at: '2026-01-01T00:00:00+00:00', name: "Hades' Coin", power_category: 'MONETARY', count: 5 },
        { id: 9, boss_id: null, created_at: '2026-09-25T19:57:42+00:00', newest_copy_created_at: '2026-09-25T19:57:42+00:00', name: 'Stone of Vitality', power_category: 'HEALTH', count: 1 },
        { id: 2, boss_id: 4, created_at: '2026-01-01T00:00:00+00:00', newest_copy_created_at: '2026-01-01T00:00:00+00:00', name: 'Spirit of Hera', power_category: 'HEALTH', count: 1 },
      ],
    });
    render(<InventoryPage />);
    await flush();

    // Each relic's name <p> is a direct child of its own card <div>, so
    // .closest('div') from the name walks up to exactly that card.
    const coinCard = screen.getByText("Hades' Coin").closest('div') as HTMLElement;
    const stoneCard = screen.getByText('Stone of Vitality').closest('div') as HTMLElement;
    const heraCard = screen.getByText('Spirit of Hera').closest('div') as HTMLElement;

    expect(within(coinCard).getByText('Consumable')).toBeInTheDocument();
    expect(within(stoneCard).getByText('Consumable')).toBeInTheDocument();
    expect(within(heraCard).queryByText('Consumable')).not.toBeInTheDocument();
  });

  it('fetches relics by the session-resolved name, not a stale localStorage guess', async () => {
    // The actual bug (traced 2026-09-25): a player's Relics box stayed
    // empty because it asked for relics under whatever name was last
    // cached in localStorage, which had drifted from the account this
    // session token actually belongs to. getInventory's own `name` field
    // must win.
    setStoredAccountToken('sess-1');
    localStorage.setItem('playerName', 'SomeStaleName');
    mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
    mockedGetPlayerRelics.mockResolvedValue({ relics: [] });

    render(<InventoryPage />);
    await flush();

    expect(mockedGetPlayerRelics).toHaveBeenCalledWith('Alice');
    expect(mockedGetPlayerRelics).not.toHaveBeenCalledWith('SomeStaleName');
    expect(localStorage.getItem('playerName')).toBe('Alice');
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

  describe('Revert Time button (docs/MERCHANT_PLAN.md §7)', () => {
    const stoneRelic = {
      id: 9, boss_id: null, created_at: '2026-09-25T19:57:42+00:00',
      newest_copy_created_at: '2026-09-25T19:57:42+00:00',
      name: 'Stone of Vitality', power_category: 'HEALTH', count: 2,
    };

    beforeEach(() => {
      setStoredAccountToken('sess-1');
      mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
      mockedGetPlayerRelics.mockResolvedValue({ relics: [stoneRelic] });
    });

    // The model is the one way into the Timewarp popup (the card's own
    // button and status text moved into it) -- this walks through both of
    // its confirm steps.
    const openPopup = () => act(async () => {
      fireEvent.click(screen.getByLabelText('Stone of Vitality -- open the Timewarp popup'));
      await flush();
    });
    const openModalAndConfirm = () => act(async () => {
      fireEvent.click(screen.getByLabelText('Stone of Vitality -- open the Timewarp popup'));
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Timewarp' }));
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Yes, timewarp' }));
      await flush();
    });

    it('has no Revert Time button or time status on the card itself', async () => {
      mockedGetMerchantOffer.mockResolvedValue(merchantState({ offers: [stoneOffer()] }));
      render(<InventoryPage />);
      await flush();

      expect(screen.queryByRole('button', { name: 'Revert Time (1h)' })).not.toBeInTheDocument();
      expect(screen.queryByText('Normal time')).not.toBeInTheDocument();
    });

    it('shows green "Normal time" in the popup once the offer has loaded and nobody has reverted', async () => {
      mockedGetMerchantOffer.mockResolvedValue(merchantState({ offers: [stoneOffer()] }));
      render(<InventoryPage />);
      await flush();
      await openPopup();

      expect(within(screen.getByRole('dialog')).getByText('Normal time')).toBeInTheDocument();
    });

    it('shows no time status in the popup while the offer has not loaded yet, but still offers Timewarp', async () => {
      mockedGetMerchantOffer.mockReturnValue(new Promise(() => {})); // never resolves
      render(<InventoryPage />);
      await flush();
      await openPopup();

      expect(screen.queryByText('Normal time')).not.toBeInTheDocument();
      expect(screen.queryByText(/warped time to/)).not.toBeInTheDocument();
      // The action itself is still offered while we don't yet know better.
      expect(screen.getByRole('button', { name: 'Timewarp' })).toBeInTheDocument();
    });

    it('opening the popup does not call the API by itself', async () => {
      render(<InventoryPage />);
      await flush();
      await openPopup();

      expect(screen.getByText('This Stone of Vitality was bought')).toBeInTheDocument();
      expect(mockedRevertMerchantTime).not.toHaveBeenCalled();
    });

    it('calls the API only once both confirm steps are taken, then takes the player home to watch', async () => {
      mockPush.mockClear();
      mockedRevertMerchantTime.mockResolvedValue({
        ok: true,
        expires_at: '2026-09-25T21:00:00+00:00',
        revert_to_date: '2028-10-03T12:00:00+00:00',
        events: [
          { kind: 'full_moon', key: '', bodies: ['Moon'], sign: 'Aries', at: 'x' },
          { kind: 'conjunction', key: 'Mercury-Jupiter', bodies: ['Mercury', 'Jupiter'], sign: 'Libra', at: 'y' },
        ],
      });
      render(<InventoryPage />);
      await flush();

      await openModalAndConfirm();

      expect(mockedRevertMerchantTime).toHaveBeenCalledWith('sess-1', 'Stone of Vitality', null);
      // Home, with the timewarp to play: both events' colours, the moment
      // warped to, and `play` so it is the real thing rather than a preview.
      expect(mockPush).toHaveBeenCalledWith(
        '/?timewarp=full_moon%2CMercury-Jupiter&to=2028-10-03T12%3A00%3A00%2B00%3A00&play=1',
      );
    });

    it('shows the error inside the popup and stays put when the API call fails', async () => {
      mockPush.mockClear();
      mockedRevertMerchantTime.mockRejectedValue(
        new ApiError(409, 'Someone has already turned back time.', 'already_reverted'),
      );
      render(<InventoryPage />);
      await flush();
      mockedGetInventory.mockClear();

      await openModalAndConfirm();

      expect(mockedGetInventory).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText('Someone has already turned back time.')).toBeInTheDocument();
    });
  });

  describe('Paper turns back time too (docs/MERCHANT_PLAN.md)', () => {
    const paperRelic = {
      id: 10, boss_id: null, created_at: '2028-10-03T12:00:00+00:00',
      newest_copy_created_at: '2028-10-03T12:00:00+00:00',
      name: 'Paper', power_category: 'KNOWLEDGE', count: 1,
    };

    beforeEach(() => {
      setStoredAccountToken('sess-1');
      mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
      mockedGetPlayerRelics.mockResolvedValue({ relics: [paperRelic] });
    });

    it('gives the Paper card the same model popup, and reads "For writing on"', async () => {
      mockedGetPlayerRelics.mockResolvedValue({ relics: [{ ...paperRelic, flavour_text: 'For writing on' }] });
      render(<InventoryPage />);
      await flush();

      expect(screen.getByLabelText('Paper -- open the Timewarp popup')).toBeInTheDocument();
      expect(screen.getByText('For writing on')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Revert Time (1h)' })).not.toBeInTheDocument();
    });

    it('sacrifices the Paper once both confirm steps are taken', async () => {
      mockedRevertMerchantTime.mockResolvedValue({
        ok: true, expires_at: '2026-09-25T21:00:00+00:00', revert_to_date: paperRelic.newest_copy_created_at, events: [],
      });
      render(<InventoryPage />);
      await flush();

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Paper -- open the Timewarp popup'));
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Timewarp' }));
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Yes, timewarp' }));
        await flush();
      });

      expect(mockedRevertMerchantTime).toHaveBeenCalledWith('sess-1', 'Paper', null);
    });
  });

  describe('Timewarp once a running one is past its first minute', () => {
    const stoneRelic = {
      id: 9, boss_id: null, created_at: '2026-09-25T19:57:42+00:00',
      newest_copy_created_at: '2026-09-25T19:57:42+00:00',
      name: 'Stone of Vitality', power_category: 'HEALTH', count: 1,
    };

    it('shows time as reverted but lets the player Timewarp again', async () => {
      setStoredAccountToken('sess-1');
      mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
      mockedGetPlayerRelics.mockResolvedValue({ relics: [stoneRelic] });
      mockedGetMerchantOffer.mockResolvedValue(revertedState('2026-09-11T21:00:00+00:00', {
        revert_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        revert_locked_until: new Date(Date.now() - 1_000).toISOString(),
      }));
      render(<InventoryPage />);
      await flush();

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Stone of Vitality -- open the Timewarp popup'));
        await flush();
      });

      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByText(/Someone has timewarped to/)).toBeInTheDocument();
      expect(dialog.getByRole('button', { name: 'Timewarp' })).toBeEnabled();
    });
  });

  describe('Revert Time blocked by an active revert (docs/MERCHANT_PLAN.md §7)', () => {
    const stoneRelic = {
      id: 9, boss_id: null, created_at: '2026-09-25T19:57:42+00:00',
      newest_copy_created_at: '2026-09-25T19:57:42+00:00',
      name: 'Stone of Vitality', power_category: 'HEALTH', count: 1,
    };

    beforeEach(() => {
      setStoredAccountToken('sess-1');
      mockedGetInventory.mockResolvedValue({ name: 'Alice', equipped_skin: 'frog_green_v1', skins: [], wheels: [] });
      mockedGetPlayerRelics.mockResolvedValue({ relics: [stoneRelic] });
      mockedGetMerchantOffer.mockResolvedValue(revertedState('2026-09-11T21:00:00+00:00', {
        revert_expires_at: new Date(Date.now() + 42 * 60_000).toISOString(),
      }));
    });

    it('shows red text with the reverted-to instant (device-local) and a countdown in the popup', async () => {
      render(<InventoryPage />);
      await flush();
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Stone of Vitality -- open the Timewarp popup'));
        await flush();
      });

      // Same formatting the production code uses (device-local time/date,
      // no explicit timeZone) -- this checks the right data flows through
      // to the card, not a fixed string that would only hold in one TZ.
      expect(
        screen.getByText(`Someone has timewarped to ${formatWorldClock(new Date('2026-09-11T21:00:00+00:00'))}.`),
      ).toBeInTheDocument();
      // No lock reported (an older backend) holds Timewarp off for the whole revert.
      expect(screen.getByRole('button', { name: 'Timewarp available in 42:00' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Timewarp' })).not.toBeInTheDocument();
    });

    it('clicking the model still opens the popup, explaining the block with its own countdown', async () => {
      render(<InventoryPage />);
      await flush();

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Stone of Vitality -- open the Timewarp popup'));
        await flush();
      });

      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByRole('button', { name: 'Timewarp available in 42:00' })).toHaveTextContent('42:00');
      expect(screen.queryByRole('button', { name: 'Timewarp' })).not.toBeInTheDocument();
      expect(mockedRevertMerchantTime).not.toHaveBeenCalled();
    });
  });
});
