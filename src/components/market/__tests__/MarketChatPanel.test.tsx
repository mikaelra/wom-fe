import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MarketChatPanel from '@/components/market/MarketChatPanel';
import type { MarketChatEntry } from '@/lib/market';

const msg = (minsAgo: number, message: string): MarketChatEntry => ({
  sender: 'Bo',
  message,
  timestamp: new Date(Date.now() - minsAgo * 60_000).toISOString(),
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-02T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const noop = vi.fn();

const renderPanel = (messages: MarketChatEntry[]) =>
  render(
    <MarketChatPanel messages={messages} canChat onSend={noop} onSlashCommand={noop} />,
  );

describe('MarketChatPanel', () => {
  it('shows only the last hour of messages', () => {
    renderPanel([msg(180, 'ancient news'), msg(10, 'still fresh')]);

    expect(screen.getByText('still fresh')).toBeInTheDocument();
    expect(screen.queryByText('ancient news')).not.toBeInTheDocument();
  });

  it('drops a message off the pane once it ages past an hour', () => {
    renderPanel([msg(58, 'about to expire')]);
    expect(screen.getByText('about to expire')).toBeInTheDocument();

    // 3 more minutes pass -> the 58-minute-old line is now 61 minutes old.
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });

    expect(screen.queryByText('about to expire')).not.toBeInTheDocument();
  });

  it('an empty last hour still points at the slash commands', () => {
    renderPanel([msg(120, 'old')]);

    expect(screen.getByText(/Nothing in the last hour/)).toBeInTheDocument();
  });
});
