import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MarketChatPanel from '@/components/market/MarketChatPanel';
import type { MarketChatEntry } from '@/lib/market';
import type { MarketFrogs } from '@/lib/schemas';

const msg = (minsAgo: number, message: string): MarketChatEntry => ({
  sender: 'Bo',
  message,
  timestamp: new Date(Date.now() - minsAgo * 60_000).toISOString(),
});

const NO_FROGS: MarketFrogs = { count: 0, names: [] };

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-02T12:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

const noop = vi.fn();

const renderPanel = (messages: MarketChatEntry[], frogs: MarketFrogs = NO_FROGS) =>
  render(
    <MarketChatPanel
      messages={messages}
      canChat
      onSend={noop}
      onSlashCommand={noop}
      frogs={frogs}
    />,
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

describe('MarketChatPanel · Frogs', () => {
  const openFrogs = () => act(() => screen.getByRole('button', { name: /Frogs/ }).click());

  it('the button carries the headcount and toggles the list', () => {
    renderPanel([], { count: 2, names: ['Alice', 'Bo'] });

    const button = screen.getByRole('button', { name: /Frogs/ });
    expect(button).toHaveTextContent('2');
    // Collapsed by default.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    openFrogs();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();

    openFrogs();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('counts anonymous browsers as "+N browsing" under the named list', () => {
    renderPanel([], { count: 3, names: ['Alice'] });

    openFrogs();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('+2 browsing')).toBeInTheDocument();
  });

  it('shows an empty-market note when the list opens with nobody in', () => {
    renderPanel([], NO_FROGS);

    openFrogs();

    expect(screen.getByText('Nobody in the market right now.')).toBeInTheDocument();
  });
});
