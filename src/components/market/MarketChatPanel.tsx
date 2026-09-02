'use client';

import { useEffect, useRef, useState } from 'react';
import type { MarketChatEntry } from '@/lib/market';

/**
 * The market's common chat (wom-be docs/MARKET_PLAN.md §1A / §7) -- one
 * room, everyone present sees it. Same message-length / rate limits as
 * lobby chat, enforced server-side.
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
}: {
  messages: MarketChatEntry[];
  canChat: boolean;
  onSend: (message: string) => void;
  onSlashCommand: (cmd: 'quick' | 'long') => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      <div className="px-3 py-2 border-b border-white/10 text-xs font-semibold text-white/60">
        Market chat
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-sm min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-white/40">
            No messages yet. Type <code className="text-white/60">/offer</code> or{' '}
            <code className="text-white/60">/longoffer</code> to craft a trade.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={`${m.timestamp}-${i}`} className="leading-snug">
            <span className="text-emerald-400/90 font-semibold">{m.sender}</span>
            <span className="text-white/40"> · </span>
            <span className="text-white/85 break-words">{m.message}</span>
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
