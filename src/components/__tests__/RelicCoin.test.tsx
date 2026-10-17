import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RelicCoin, { relicModelUrl } from '@/components/RelicCoin';

// SpinningModelViewer renders a react-three-fiber <Canvas>, which needs a
// WebGL context jsdom can't provide; useGLTF.preload runs at import.
vi.mock('@/components/SpinningModelViewer', () => ({
  default: ({ url }: { url: string }) => <div data-testid="model" data-url={url} />,
}));
vi.mock('@react-three/drei', () => ({ useGLTF: { preload: vi.fn() } }));

describe('relicModelUrl', () => {
  it('gives the Pen its quill model, which the new-moon merchant stages', () => {
    expect(relicModelUrl('Pen')).toBe('/models/relics/pen_v1.glb');
  });

  it('falls back to the coin for a relic without art', () => {
    expect(relicModelUrl('Nameless')).toBe('/models/well/rewards/gold-ld.glb');
  });
});

describe('RelicCoin in Low Definition', () => {
  beforeEach(() => localStorage.setItem('textMode', 'on'));

  it('draws the Stone, the Pen and the Paper as 32x32 pictures on their aura, never a 3D model', async () => {
    for (const [name, src] of [['Stone of Vitality', '/pixel2/stone.png'], ['Pen', '/pixel2/pen.png'], ['Paper', '/pixel2/paper.png']]) {
      const { unmount } = render(<RelicCoin relicName={name} />);
      const img = await screen.findByRole('img', { name });
      await waitFor(() => expect(img).toHaveAttribute('src', src));
      expect(img).toHaveStyle({ imageRendering: 'pixelated' });
      expect(screen.queryByTestId('model')).toBeNull();
      unmount();
    }
  });

  it("draws Hades' Coin, and any relic with no picture of its own, as the gold coin -- as in 3D, never a model", async () => {
    for (const name of ["Hades' Coin", 'Spirit of Nobody']) {
      const { unmount } = render(<RelicCoin relicName={name} />);
      const img = await screen.findByRole('img', { name });
      await waitFor(() => expect(img).toHaveAttribute('src', '/pixel2/hades_coin.png'));
      expect(screen.queryByTestId('model')).toBeNull();
      unmount();
    }
  });
});

describe('RelicCoin', () => {
  beforeEach(() => localStorage.setItem('textMode', 'off'));

  it('shows the Pen as its thumbnail rather than a 3D canvas', () => {
    render(<RelicCoin relicName="Pen" />);
    expect(screen.getByRole('img', { name: 'Pen' })).toHaveAttribute('src', '/models/relics/pen_v1.thumbnail.png');
    expect(screen.queryByTestId('model')).toBeNull();
  });

  it('keeps the spinning model for other relics', () => {
    render(<RelicCoin relicName="Paper" />);
    expect(screen.getByTestId('model')).toHaveAttribute('data-url', '/models/relics/paper_v2.glb');
  });
});
