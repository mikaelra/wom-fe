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
});
