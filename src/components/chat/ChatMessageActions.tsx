'use client';

import { useState } from 'react';
import { reportChatMessage } from '@/lib/api';
import { setMuted, useMutedPlayers } from '@/lib/chatMute';
import { useChatText } from '@/lib/chatFilter';
import { getStoredAccountToken } from '@/lib/http';

// What tapping another player's chat message (lobby or market) opens: Mute
// (Unmute, on a muted player's message) or Report. Mute hides their
// messages on this device (lib/chatMute.ts).
// Report asks what is wrong and sends it to wom-be (POST /chat/report),
// where it is counted in the weekly stats email. Offered to everyone who can
// chat -- lobby chat is open without an account, and the backend takes a
// report without one.

export type ChatTarget = { sender: string; message: string };

type Phase = 'menu' | 'report' | 'sending' | 'sent';

const MAX_COMPLAINT = 1000;

const button =
  'px-4 py-2 rounded-lg font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export default function ChatMessageActions({
  target,
  context,
  onClose,
}: {
  target: ChatTarget | null;
  context: 'lobby' | 'market';
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('menu');
  const [complaint, setComplaint] = useState('');
  const [error, setError] = useState('');
  const muted = useMutedPlayers();
  const chatText = useChatText();

  if (!target) return null;
  const isMuted = muted.has(target.sender);
  const token = getStoredAccountToken();

  const close = () => {
    setPhase('menu');
    setComplaint('');
    setError('');
    onClose();
  };

  const send = async () => {
    setPhase('sending');
    setError('');
    try {
      await reportChatMessage(token, {
        reportedName: target.sender,
        message: target.message,
        context,
        complaint: complaint.trim(),
      });
      setPhase('sent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report.');
      setPhase('report');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={target.sender}
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'sending') close();
      }}
    >
      <div className="bg-gray-900 border border-white/20 text-white p-5 rounded-xl shadow-2xl max-w-sm w-full mx-4">
        <p className="font-bold">{target.sender}</p>
        <p className="text-sm text-white/70 mt-1 break-words">{chatText(target.message)}</p>

        {phase === 'menu' && (
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => {
                setMuted(target.sender, !isMuted);
                close();
              }}
              className={`${button} flex-1 bg-white/10 hover:bg-white/20 border border-white/20`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={() => setPhase('report')}
              className={`${button} flex-1 bg-red-900/60 hover:bg-red-800/70 border border-red-700/60`}
            >
              Report
            </button>
          </div>
        )}

        {(phase === 'report' || phase === 'sending') && (
          <div className="mt-4">
            <label htmlFor="chat-report-complaint" className="block text-sm">
              What is wrong with this message?
            </label>
            <textarea
              id="chat-report-complaint"
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              maxLength={MAX_COMPLAINT}
              rows={4}
              className="mt-2 w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white text-sm"
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            <div className="flex gap-3 mt-3">
              <button
                type="button"
                onClick={send}
                disabled={!complaint.trim() || phase === 'sending'}
                className={`${button} flex-1 bg-red-700 hover:bg-red-600`}
              >
                {phase === 'sending' ? 'Sending…' : 'Send report'}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={phase === 'sending'}
                className={`${button} bg-white/10 hover:bg-white/20 border border-white/20`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === 'sent' && (
          <div className="mt-4">
            <p className="text-sm">Report sent.</p>
            <button type="button" onClick={close} className={`${button} mt-3 bg-white/10 hover:bg-white/20 border border-white/20`}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The mute symbol beside a muted player's name in a player list. */
export function MutedMark() {
  return (
    <span className="shrink-0" title="Muted" aria-label="Muted" role="img">
      🔇
    </span>
  );
}
