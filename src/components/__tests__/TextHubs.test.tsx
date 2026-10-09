import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/useBossfightCountdown', () => ({
  useBossfightCountdown: () => ({ secondsUntil: 125, bossfightMins: 2, bossfightSecs: 5 }),
}));

import TextHome from '@/components/text/TextHome';
import TextCity from '@/components/text/TextCity';
import type { MerchantOffer } from '@/lib/api';

describe('TextHome', () => {
  it('lists the next boss fight, the cities and the merchants', () => {
    const onEnterCity = vi.fn();
    const onOpenMerchant = vi.fn();
    const offer = { offer_id: 4, event_key: 'moon', merchant_name: 'John Dee' } as unknown as MerchantOffer;
    render(<TextHome offers={[offer]} onEnterCity={onEnterCity} onOpenMerchant={onOpenMerchant} />);
    expect(screen.getByText('⏳ Next boss-fight in: 2m 5s')).toBeTruthy();
    fireEvent.click(screen.getByText('🏛️ GREECE 🏛️'));
    expect(onEnterCity).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    fireEvent.click(screen.getByText('Merchant: John Dee'));
    expect(onOpenMerchant).toHaveBeenCalledWith(offer);
  });
});

describe('TextCity', () => {
  const props = () => ({
    onBossfight: vi.fn(),
    bossfightSublabel: 'BOSSFIGHT IN 2:05',
    bossfightPlaying: 2,
    onRanked: vi.fn(),
    rankedLabel: 'RANKED',
    rankedSublabel: null,
    onBotRanked: vi.fn(),
    botRankedLabel: 'BOTS',
    botRankedSublabel: 'SEARCHING',
    presence: { ranked: 1, bot_ranked: 0, market: 3 },
    onMarket: vi.fn(),
    onBackToEarth: vi.fn(),
  });

  it('shows each place with its caption, and goes there', () => {
    const p = props();
    render(<TextCity {...p} />);
    expect(screen.getByText(/BOSSFIGHT IN 2:05/)).toBeTruthy();
    expect(screen.getByText(/SEARCHING/)).toBeTruthy();
    for (const [label, handler] of [
      ['HADES', p.onBossfight],
      ['PLAYERS', p.onRanked],
      ['BOTS', p.onBotRanked],
      ['MARKET', p.onMarket],
      ['EARTH', p.onBackToEarth],
    ] as const) {
      fireEvent.click(screen.getByText(label));
      expect(handler).toHaveBeenCalled();
    }
  });

  it('says when a match is waiting to be returned to', () => {
    render(<TextCity {...props()} rankedLabel="RETURN TO MATCH" />);
    expect(screen.getByText('RETURN TO MATCH')).toBeTruthy();
  });
});
