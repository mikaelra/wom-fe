import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import LoadingMark from '@/components/loading/LoadingMark';
import LoadingState from '@/components/loading/LoadingState';
import LoadingOverlay from '@/components/loading/LoadingOverlay';
import NoLoadingOverlay from '@/components/loading/NoLoadingOverlay';
import { beginRequest, isScreenLoading, resetLoadingTracker } from '@/lib/loadingTracker';
import { BACKGROUND_LOADING_DELAY_MS } from '@/lib/useLoadingOverlay';
import { LOADING_LOOP_MS } from '@/lib/useMinimumLoading';
import { LOADING_SPEC, spinWindow, wheelColorAt } from '@/lib/loadingAnimation';

afterEach(() => {
  resetLoadingTracker();
  vi.useRealTimers();
});

const overlay = () => screen.queryByRole('status', { name: 'Loading' });

describe('LoadingMark', () => {
  it('renders a labelled canvas at the asked size (drawing is skipped without a 2D context)', () => {
    render(<LoadingMark size={40} label="Loading relics" />);
    const canvas = screen.getByRole('img', { name: 'Loading relics' });
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('plays a variant picked at random as it mounts: the wheel, the rainbow, or a colour unless one is given', () => {
    const strokes: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : () => {}),
      set: (target, key, value) => {
        if (key === 'strokeStyle') strokes.push(value as string);
        target[key as string] = value;
        return true;
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    // a fixed clock, so the drawn frame is exactly `at` into the loop
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    let scheduled = false;
    let at = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      if (!scheduled) {
        scheduled = true;
        cb(performance.now() + at);
      }
      return 1;
    });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);

    // past the wheel's and the rainbow's share: one of the six, here blue
    const { unmount } = render(<LoadingMark />);
    expect(strokes.at(-1)).toBe('#0000ff');
    unmount();

    // the rainbow: mid-spin it is no longer red
    random.mockReturnValue(0.85);
    const [start, end] = spinWindow(LOADING_SPEC);
    at = ((start + end) / 2) * 1000;
    scheduled = false;
    const rainbow = render(<LoadingMark />);
    expect(strokes.at(-1)).toMatch(/^rgb\(/);
    expect(strokes.at(-1)).not.toBe('rgb(255, 0, 0)');
    rainbow.unmount();

    // the wheel: the sharp figure (the frame's first stroke) in its colour
    // at that time; the trail behind it in earlier colours
    random.mockReturnValue(0.5);
    scheduled = false;
    const first = strokes.length;
    const wheel = render(<LoadingMark />);
    expect(strokes[first]).toBe(wheelColorAt(LOADING_SPEC, (start + end) / 2));
    expect(strokes.at(-1)).not.toBe(strokes[first]);
    wheel.unmount();

    scheduled = false;
    render(<LoadingMark color="#ffff00" />);
    expect(strokes.at(-1)).toBe('#ffff00');

    // the start is picked too: with every random number high, the hexagon
    // start's first frame touches nothing at the center
    const moves: [number, number][] = [];
    (ctx as Record<string, unknown>).moveTo = (x: number, y: number) => moves.push([x, y]);
    random.mockReturnValue(0.99);
    at = 0;
    scheduled = false;
    render(<LoadingMark />);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some(([x, y]) => Math.hypot(x, y) < 1e-6)).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('LoadingState', () => {
  it('leaves a labelled status for screen readers and claims the screen while mounted', () => {
    const { unmount } = render(<LoadingState label="Loading lobby…" />);
    expect(screen.getByRole('status', { name: 'Loading lobby…' })).toBeInTheDocument();
    expect(isScreenLoading()).toBe(true);
    unmount();
    expect(isScreenLoading()).toBe(false);
  });
});

describe('LoadingOverlay', () => {
  it('covers the screen, half grey at first, at once for a screen waiting on content, for at least one whole loop', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <>
        <LoadingOverlay />
        <LoadingState label="Loading shop" />
      </>
    );
    const el = overlay();
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ background: 'rgba(128, 128, 128, 0.5)' });
    expect(el).toHaveClass('fixed', 'inset-0');

    // content arrives quickly: the animation still plays its whole turn
    rerender(<LoadingOverlay />);
    act(() => {
      vi.advanceTimersByTime(LOADING_LOOP_MS - 50);
    });
    expect(overlay()).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(overlay()).not.toBeInTheDocument();
  });

  it('shows for an API call only once it has run past the delay', () => {
    vi.useFakeTimers();
    render(<LoadingOverlay />);
    let end = () => {};
    act(() => {
      end = beginRequest();
    });
    expect(overlay()).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(overlay()).toBeInTheDocument();
    act(() => end());
    act(() => {
      vi.advanceTimersByTime(LOADING_LOOP_MS);
    });
    expect(overlay()).not.toBeInTheDocument();
  });

  it('never shows for a quick API call', () => {
    vi.useFakeTimers();
    render(<LoadingOverlay />);
    let end = () => {};
    act(() => {
      end = beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS - 50);
    });
    act(() => end());
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(overlay()).not.toBeInTheDocument();
  });
});

describe('NoLoadingOverlay', () => {
  it('keeps the overlay away while mounted (live lobbies)', () => {
    const { rerender } = render(
      <>
        <LoadingOverlay />
        <NoLoadingOverlay />
        <LoadingState label="Loading lobby…" />
      </>
    );
    expect(overlay()).not.toBeInTheDocument();
    rerender(
      <>
        <LoadingOverlay />
        <LoadingState label="Loading lobby…" />
      </>
    );
    expect(overlay()).toBeInTheDocument();
  });
});
