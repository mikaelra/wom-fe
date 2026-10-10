import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/useBossfightCountdown', () => ({
  useBossfightCountdown: () => ({ secondsUntil: 125, bossfightMins: 2, bossfightSecs: 5 }),
}));

import TextHome from '@/components/text/TextHome';
import TextCity from '@/components/text/TextCity';
import type { MerchantOffer } from '@/lib/api';

describe('TextHome', () => {
  it('lists the cities and the merchants, with no boss-fight countdown', () => {
    const onEnterCity = vi.fn();
    const onOpenMerchant = vi.fn();
    const offer = { offer_id: 4, event_key: 'moon', merchant_name: 'John Dee' } as unknown as MerchantOffer;
    render(<TextHome offers={[offer]} onEnterCity={onEnterCity} onOpenMerchant={onOpenMerchant} />);
    expect(screen.queryByText(/Next boss-fight/)).toBeNull(); // that's the city's, over HADES
    fireEvent.click(screen.getByText('🏛️ GREECE 🏛️'));
    expect(onEnterCity).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(screen.queryByText(/John Dee/)).toBeNull(); // just "Merchant"
    fireEvent.click(screen.getByText('Merchant'));
    expect(onOpenMerchant).toHaveBeenCalledWith(offer);
  });
});

describe('TextCity', () => {
  const props = () => ({
    onBossfight: vi.fn(),
    bossfightSublabel: 'BOSSFIGHT IN 2:05',
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

  it('shows HADES, RANKED, EARTH and MARKET, with what is going on over them', () => {
    const p = props();
    render(<TextCity {...p} />);
    expect(screen.getByText('BOSSFIGHT IN 2:05')).toBeTruthy(); // the caption alone, no "N playing" twice
    expect(screen.getByText('SEARCHING')).toBeTruthy(); // the bots queue, over RANKED
    expect(screen.getByText('3')).toBeTruthy(); // in the market
    expect(screen.queryByText('PLAYERS')).toBeNull();
    for (const [label, handler] of [
      ['HADES', p.onBossfight],
      ['MARKET', p.onMarket],
      ['EARTH', p.onBackToEarth],
    ] as const) {
      fireEvent.click(screen.getByText(label));
      expect(handler).toHaveBeenCalled();
    }
  });

  it('says nothing over MARKET when nobody is there', () => {
    render(<TextCity {...props()} presence={{ ranked: 0, bot_ranked: 0, market: 0 }} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('opens RANKED: PLAYERS and BOTS with who is playing, and BACK', () => {
    const p = props();
    render(<TextCity {...p} />);
    fireEvent.click(screen.getByText('RANKED'));
    expect(screen.getByText('1 playing')).toBeTruthy();
    fireEvent.click(screen.getByText('PLAYERS'));
    expect(p.onRanked).toHaveBeenCalled();
    fireEvent.click(screen.getByText('BOTS'));
    expect(p.onBotRanked).toHaveBeenCalled();
    fireEvent.click(screen.getByText('BACK'));
    expect(screen.getByText('HADES')).toBeTruthy();
  });

  it('says when a match is waiting to be returned to', () => {
    render(<TextCity {...props()} rankedLabel="RETURN TO MATCH" />);
    fireEvent.click(screen.getByText('RANKED'));
    expect(screen.getByText('RETURN TO MATCH')).toBeTruthy();
  });
});
