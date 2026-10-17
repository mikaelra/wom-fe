import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { setMuted } from '@/lib/chatMute';
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
  localStorage.clear();
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

  it('keeps only a muted player\'s latest line, marked, and marks them in the Frogs list', () => {
    act(() => setMuted('Bo', true));
    renderPanel(
      [msg(2, 'old bo'), msg(1, 'latest bo'), { ...msg(1, 'from toad'), sender: 'Toad' }],
      { count: 2, names: ['Bo', 'Toad'] },
    );
    expect(screen.queryByText('old bo')).toBeNull();
    expect(screen.getByText('latest bo')).toBeInTheDocument();
    expect(screen.getByText('from toad')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Muted')).toHaveLength(1);
    fireEvent.click(screen.getByText(/Frogs/));
    expect(screen.getAllByLabelText('Muted')).toHaveLength(2);
  });

  it('opens Mute / Report on someone else\'s message, not your own, and unmutes from the kept line', () => {
    localStorage.setItem('playerName', 'Me');
    renderPanel([{ ...msg(1, 'mine'), sender: 'Me' }, msg(2, 'older'), msg(1, 'theirs')]);
    fireEvent.click(screen.getByText('mine'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('theirs'));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(screen.queryByText('older')).toBeNull();
    fireEvent.click(screen.getByText('theirs'));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(screen.getByText('older')).toBeInTheDocument();
  });

  it('stars out bad words unless the filter is off', () => {
    const { unmount } = renderPanel([msg(1, 'what the shit')]);
    expect(screen.getByText('what the ****')).toBeInTheDocument();
    unmount();
    localStorage.setItem('wom_chat_filter', 'off');
    renderPanel([msg(1, 'what the shit')]);
    expect(screen.getByText('what the shit')).toBeInTheDocument();
  });
});
