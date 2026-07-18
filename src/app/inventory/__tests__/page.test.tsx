import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import InventoryPage from '@/app/inventory/page';
import { equipSkin, getInventory, spinWheel } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('@/lib/api', () => ({
  getInventory: vi.fn(),
  equipSkin: vi.fn(),
  spinWheel: vi.fn(),
}));

const mockedGetInventory = vi.mocked(getInventory);
const mockedEquipSkin = vi.mocked(equipSkin);
const mockedSpinWheel = vi.mocked(spinWheel);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedGetInventory.mockReset();
  mockedEquipSkin.mockReset();
  mockedSpinWheel.mockReset();
});

afterEach(() => {
  setStoredAccountToken(null);
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

    expect(screen.getByText('green')).toBeInTheDocument();
    expect(screen.getByText('EQUIPPED')).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: /Use normal Wheel/ })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Use normal Wheel/ }));

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
});
