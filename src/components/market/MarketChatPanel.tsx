'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { recentChat, type MarketChatEntry } from '@/lib/market';

/** Local wall-clock "HH:MM" for a chat line, or "" if the timestamp
 *  doesn't parse. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The market's common chat (wom-be docs/MARKET_PLAN.md §1A / §7) -- one
 * room, everyone present sees it. Same message-length / rate limits as
 * lobby chat, enforced server-side.
 *
 * Only the last hour shows here -- it's ambient "who's around" presence,
 * not a log. Older chatter, and every completed trade, is behind the
 * History button. The window is re-applied on a timer so a message sent
 * while the tab stayed open still drops off once it ages out.
 *
 * The input doubles as the trade launcher: typing `/offer` or `/longoffer`
 * (alone, or as the whole message) opens the craft window instead of
 * sending a message (§1A.8).
 */
export default function MarketChatPanel({
  messages,
  canChat,
  onSend,
  onSlashCommand,
  onOpenHistory,
}: {
  messages: MarketChatEntry[];
  canChat: boolean;
  onSend: (message: string) => void;
  onSlashCommand: (cmd: 'quick' | 'long') => void;
  onOpenHistory: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-tick every minute so a line that was fresh when it arrived leaves
  // the pane once it's an hour old, even on an otherwise-idle tab.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => recentChat(messages, nowMs), [messages, nowMs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    if (lower === '/offer' || lower.startsWith('/offer ')) {
      onSlashCommand('quick');
      setDraft('');
      return;
    }
    if (lower === '/longoffer' || lower.startsWith('/longoffer ')) {
      onSlashCommand('long');
      setDraft('');
      return;
    }
    onSend(text);
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full rounded-xl bg-gray-900/80 border border-white/10 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white/60">Market chat · last hour</span>
        <button
          type="button"
          onClick={onOpenHistory}
          className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-semibold transition-colors cursor-pointer"
        >
          History
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-sm min-h-0">
        {visible.length === 0 && (
          <p className="text-xs text-white/40">
            Nothing in the last hour. Type <code className="text-white/60">/offer</code> or{' '}
            <code className="text-white/60">/longoffer</code> to craft a trade, or open{' '}
            <span className="text-white/60">History</span> for past trades.
          </p>
        )}
        {visible.map((m, i) => (
          <div key={`${m.timestamp}-${i}`} className="flex gap-2 leading-snug">
            <div className="min-w-0 flex-1">
              <span className="text-emerald-400/90 font-semibold">{m.sender}</span>
              <span className="text-white/40"> · </span>
              <span className="text-white/85 break-words">{m.message}</span>
            </div>
            <time
              dateTime={m.timestamp}
              className="shrink-0 text-[11px] tabular-nums text-white/30 pt-0.5"
            >
              {formatClock(m.timestamp)}
            </time>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-white/10 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          disabled={!canChat}
          placeholder={canChat ? 'Message, or /offer …' : 'Sign in and verify your email to chat'}
          maxLength={200}
          className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-sm outline-none focus:border-white/30 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canChat}
          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm transition-colors cursor-pointer disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
