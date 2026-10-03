import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import LoadingMark from '@/components/loading/LoadingMark';
import LoadingState from '@/components/loading/LoadingState';
import LoadingOverlay from '@/components/loading/LoadingOverlay';
import NoLoadingOverlay from '@/components/loading/NoLoadingOverlay';
import { beginRequest, isScreenLoading, resetLoadingTracker } from '@/lib/loadingTracker';
import { BACKGROUND_LOADING_DELAY_MS } from '@/lib/useLoadingOverlay';
import { LOADING_LOOP_MS } from '@/lib/useMinimumLoading';

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
