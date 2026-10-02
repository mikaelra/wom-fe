import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import LoadingMark from '@/components/loading/LoadingMark';
import LoadingState from '@/components/loading/LoadingState';
import GlobalLoadingIndicator from '@/components/loading/GlobalLoadingIndicator';
import { beginRequest, isBackgroundLoading, resetLoadingTracker } from '@/lib/loadingTracker';
import { BACKGROUND_LOADING_DELAY_MS } from '@/lib/useBackgroundLoading';

afterEach(() => {
  resetLoadingTracker();
  vi.useRealTimers();
});

describe('LoadingMark', () => {
  it('renders a labelled canvas at the asked size (drawing is skipped without a 2D context)', () => {
    render(<LoadingMark size={40} label="Loading relics" />);
    const canvas = screen.getByRole('img', { name: 'Loading relics' });
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveStyle({ width: '40px', height: '40px' });
  });
});

describe('LoadingState', () => {
  it('is a labelled status, and hides the corner mark while it is shown', () => {
    beginRequest();
    const { unmount } = render(<LoadingState label="Loading lobby…" />);
    expect(screen.getByRole('status', { name: 'Loading lobby…' })).toBeInTheDocument();
    expect(isBackgroundLoading()).toBe(false);
    unmount();
    expect(isBackgroundLoading()).toBe(true);
  });
});

describe('GlobalLoadingIndicator', () => {
  it('appears once a request has run past the delay, and goes when it ends', () => {
    vi.useFakeTimers();
    render(<GlobalLoadingIndicator />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    let end = () => {};
    act(() => {
      end = beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS);
    });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    act(() => end());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays hidden while a loading state is already on screen', () => {
    vi.useFakeTimers();
    render(
      <>
        <GlobalLoadingIndicator />
        <LoadingState label="Loading shop" />
      </>
    );
    act(() => {
      beginRequest();
    });
    act(() => {
      vi.advanceTimersByTime(BACKGROUND_LOADING_DELAY_MS * 2);
    });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Loading shop' })).toBeInTheDocument();
  });
});
