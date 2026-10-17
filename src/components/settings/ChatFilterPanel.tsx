'use client';

import { setChatFilterOn, useChatFilterOn } from '@/lib/chatFilter';

// Settings -> the chat bad-word filter (lib/chatFilter.ts), on by default.
export default function ChatFilterPanel() {
  const on = useChatFilterOn();
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-6 mt-6">
      <h2 className="text-base font-semibold">Chat</h2>
      <label className="mt-3 flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setChatFilterOn(e.target.checked)}
          className="w-5 h-5 accent-amber-500 cursor-pointer"
        />
        <span className="text-sm">Filter bad words in chat</span>
      </label>
    </div>
  );
}
