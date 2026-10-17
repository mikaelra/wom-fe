import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketHudControls from '@/components/market/MarketHudControls';

const merchantState = vi.hoisted(() => ({
  value: {
    merchant: null as { sky_date: string | null } | null,
    offers: [] as { event: string }[],
    receivedAt: Date.now() as number | null,
    reverted: false,
    revertExpiresAt: null as string | null,
    revertLockedUntil: null,
    revertToDate: null as string | null,
    refresh: () => {},
  },
}));
vi.mock('@/lib/useMerchantOffer', () => ({ useMerchantOffer: () => merchantState.value }));

describe('MarketHudControls', () => {
  beforeEach(() => {
    localStorage.clear();
    merchantState.value = { ...merchantState.value, merchant: null, offers: [], receivedAt: Date.now(), reverted: false, revertToDate: null };
  });

  it("has the city's clock, the graphics quality, the music and the sound effects", async () => {
    render(<MarketHudControls />);
    expect(await screen.findByRole('timer')).toHaveTextContent(/\d\d:\d\d \d\d\.\d\d\.\d{4}/); // Athens' time
    expect(screen.getByRole('timer')).toHaveAccessibleName('Normal time');
    expect(screen.getByRole('button', { name: 'Mute music' })).toBeInTheDocument();
    // the market keeps the effects: it will get sounds
    expect(screen.getByRole('button', { name: 'Mute sound effects' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Graphics/ })).toBeInTheDocument();
  });

  it('shows the timewarped time while time is turned back', async () => {
    merchantState.value = { ...merchantState.value, reverted: true, merchant: { sky_date: '2026-03-03T12:00:00Z' }, offers: [{ event: 'full_moon' }] };
    render(<MarketHudControls />);
    expect(await screen.findByRole('timer')).toHaveAccessibleName('Timewarped time');
  });

  it('shows no clock until the first poll has answered', () => {
    merchantState.value = { ...merchantState.value, receivedAt: null };
    render(<MarketHudControls />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute music' })).toBeInTheDocument();
  });
});
