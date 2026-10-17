import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlimkinCloud from '@/components/match/BlimkinCloud';

// The 3D canvas is not drawn in jsdom.
vi.mock('@/components/match/BlimkinModel3D', () => ({ default: () => <div data-testid="model">3D Blimkin</div> }));

beforeEach(() => {
  localStorage.clear();
  // Skip his entrance: the cloud is there at once.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
});

describe('BlimkinCloud', () => {
  it('is his 8-bit picture in Low Definition, and loads no 3D', async () => {
    localStorage.setItem('textMode', 'on');
    const { container } = render(<BlimkinCloud appearance="a">Your match is ready.</BlimkinCloud>);
    await screen.findByText('Your match is ready.');
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/pixel/blimkin.png');
    expect(img.style.imageRendering).toBe('pixelated');
    expect(screen.queryByTestId('model')).toBeNull();
  });

  it.each(['off'])('is his 3D model in Standard and High Definition (textMode %s)', async (mode) => {
    localStorage.setItem('textMode', mode);
    const { container } = render(<BlimkinCloud appearance="a">Your match is ready.</BlimkinCloud>);
    expect(await screen.findByTestId('model')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('is his 8-bit picture by default on the web, message and all', () => {
    const { container } = render(<BlimkinCloud appearance="a">Your match is ready.</BlimkinCloud>);
    expect(screen.getByText('Your match is ready.')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
