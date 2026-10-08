'use client';

import { setMuted, useMutedPlayers } from '@/lib/chatMute';

// Settings -> Muted players: the players muted from a chat message
// (components/chat/ChatMessageActions.tsx), each with Unmute. Shows nothing
// while nobody is muted.
export default function MutedPlayersPanel() {
  const muted = useMutedPlayers();
  if (!muted.size) return null;
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-6 mt-6">
      <h2 className="text-base font-semibold">Muted players</h2>
      <ul className="mt-3 space-y-2">
        {[...muted].sort().map((name) => (
          <li key={name} className="flex items-center justify-between gap-3">
            <span className="truncate">🔇 {name}</span>
            <button
              type="button"
              onClick={() => setMuted(name, false)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-semibold transition-colors cursor-pointer"
            >
              Unmute
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
