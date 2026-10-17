import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('RelicCoin', () => {
  it('shows the Pen as its thumbnail rather than a 3D canvas', () => {
    render(<RelicCoin relicName="Pen" />);
    expect(screen.getByRole('img', { name: 'Pen' })).toHaveAttribute('src', '/models/relics/pen_v1.thumbnail.png');
    expect(screen.queryByTestId('model')).toBeNull();
  });

  it('keeps the spinning model for other relics', () => {
    render(<RelicCoin relicName="Paper" />);
    expect(screen.getByTestId('model')).toHaveAttribute('data-url', '/models/relics/paper_v1.glb');
  });
});
