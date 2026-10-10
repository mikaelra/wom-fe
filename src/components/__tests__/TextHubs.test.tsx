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
    const offer = {
      offer_id: 4,
      event_key: 'moon',
      merchant_name: 'John Dee',
      event: { kind: 'full_moon', key: 'full_moon', bodies: ['Moon'], sign: '', at: '' },
    } as unknown as MerchantOffer;
    render(<TextHome offers={[offer]} onEnterCity={onEnterCity} onOpenMerchant={onOpenMerchant} />);
    expect(screen.queryByText(/Next boss-fight/)).toBeNull(); // that's the city's, over HADES
    fireEvent.click(screen.getByText('GREECE'));
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
    lat: 37.98,
    lng: 23.73,
  });

  it('shows HADES, RANKED, EARTH and MARKET, with what is going on over them', () => {
    const p = props();
    render(<TextCity {...p} />);
    expect(screen.getByText('BOSSFIGHT IN 2:05')).toBeTruthy(); // the caption alone, no "N playing" twice
    expect(screen.getByText('SEARCHING')).toBeTruthy(); // the bots queue, over RANKED
    expect(screen.getByText('3 in market')).toBeTruthy();
    expect(screen.queryByLabelText('PLAYERS')).toBeNull();
    for (const [label, handler] of [
      ['HADES', p.onBossfight],
      ['MARKET', p.onMarket],
      ['EARTH', p.onBackToEarth],
    ] as const) {
      fireEvent.click(screen.getByLabelText(label));
      expect(handler).toHaveBeenCalled();
    }
  });

  it('says nothing over MARKET when nobody is there', () => {
    render(<TextCity {...props()} presence={{ ranked: 0, bot_ranked: 0, market: 0 }} />);
    expect(screen.queryByText(/in market/)).toBeNull();
  });

  it('opens RANKED: PLAYERS and BOTS with who is playing, and BACK', () => {
    const p = props();
    render(<TextCity {...p} />);
    fireEvent.click(screen.getByLabelText('RANKED'));
    expect(screen.getByText('1 playing')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('PLAYERS'));
    expect(p.onRanked).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('BOTS'));
    expect(p.onBotRanked).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('BACK'));
    expect(screen.getByLabelText('HADES')).toBeTruthy();
  });

  it('says when a match is waiting to be returned to', () => {
    render(<TextCity {...props()} rankedLabel="RETURN TO MATCH" />);
    fireEvent.click(screen.getByLabelText('RANKED'));
    expect(screen.getByLabelText('RETURN TO MATCH')).toBeTruthy();
  });
});

describe('TextHome merchants', () => {
  it("paints a conjunction merchant in its planets' colours, the full moon's in one", () => {
    const moon = {
      offer_id: 1, event_key: 'fm', merchant_name: 'John Dee',
      event: { kind: 'full_moon', key: 'full_moon', bodies: ['Moon'], sign: '', at: '' },
    } as unknown as MerchantOffer;
    const conj = {
      offer_id: 2, event_key: 'mj', merchant_name: 'Hildegard von Bingen',
      event: { kind: 'conjunction', key: 'Mars-Jupiter', bodies: ['Mars', 'Jupiter'], sign: '', at: '' },
    } as unknown as MerchantOffer;
    render(<TextHome offers={[moon, conj]} onEnterCity={vi.fn()} onOpenMerchant={vi.fn()} />);
    const [a, b] = screen.getAllByText('Merchant');
    expect(a.style.backgroundImage).not.toContain('gradient'); // one plain colour
    expect(a.style.color).not.toBe('');
    expect(b.style.backgroundImage).toContain('linear-gradient');
    expect(a.style.fontSize).toBe(b.style.fontSize); // the same lettering
  });
});
