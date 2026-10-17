import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MarketItemChip from '@/components/market/MarketItemChip';
import type { MarketItem } from '@/lib/market';

const skin = { item_type: 'skin', skin: 'frog_gold_v1', quantity: 2 } as unknown as MarketItem;

describe('MarketItemChip', () => {
  beforeEach(() => localStorage.clear());

  it('shows a skin as its rendered thumbnail in SD and HD', async () => {
    localStorage.setItem('textMode', 'off');
    const { container } = render(<MarketItemChip item={skin} catalog={null} />);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', '/skins/thumbnails/frog_gold_v1.png'));
    expect(container.querySelector('img')!.style.imageRendering).toBe('');
  });

  it('shows a skin as its 32x32 face in Low Definition', async () => {
    localStorage.setItem('textMode', 'on');
    const { container } = render(<MarketItemChip item={skin} catalog={null} />);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', '/pixel/frog_gold_v1.png'));
    expect(container.querySelector('img')!.style.imageRendering).toBe('pixelated');
    expect(screen.getByText(/×2/)).toBeInTheDocument();
  });

  const catalog = { relics: [{ id: 1, name: 'Paper' }, { id: 2, name: 'Hades\' Coin' }] } as never;
  const other = (o: object) => ({ quantity: 1, ...o }) as unknown as MarketItem;
  const srcs = async (mode: string, items: MarketItem[]) => {
    localStorage.setItem('textMode', mode);
    return Promise.all(
      items.map(async (item) => {
        const { container } = render(<MarketItemChip item={item} catalog={catalog} />);
        await waitFor(() => expect(container.querySelector('img')).toBeTruthy());
        return container.querySelector('img')!.getAttribute('src');
      }),
    );
  };
  const things = [
    other({ item_type: 'relic', relic_id: 1 }),
    other({ item_type: 'relic', relic_id: 2 }),
    other({ item_type: 'wheel', wheel_kind: 'special' }),
    other({ item_type: 'wheel', wheel_kind: 'normal' }),
    other({ item_type: 'artifact' }),
    other({ item_type: 'ai_credits', quantity: 100 }),
  ];

  it('gives relics, wheels, the artifact and AI credits their 32x32 in Low Definition', async () => {
    expect(await srcs('on', things)).toEqual([
      '/pixel/paper.png',
      '/pixel/hades_coin.png',
      '/pixel/special-wheel.png',
      '/pixel/wheel.png',
      '/pixel/artifact.png',
      '/pixel/my_ai_coin.png',
    ]);
  });

  it('gives them their 3D thumbnails in SD and HD', async () => {
    expect(await srcs('off', things)).toEqual([
      '/models/relics/paper_v2.thumbnail.png',
      '/models/well/rewards/gold-ld.thumbnail.png',
      '/images/special-wheel.png',
      '/images/wheel.png',
      '/skins/items/pergament_v1.thumbnail.png',
      '/images/my-ai-coin.png',
    ]);
  });
});
