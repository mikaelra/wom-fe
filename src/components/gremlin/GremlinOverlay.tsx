'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getState,
  submitChoice,
  getPlayerMessages,
} from '@/lib/api';
import type { LobbyState } from '@/types/game';

const btn = 'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

type GremlinOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
};

export default function GremlinOverlay({ lobbyId, onStateChange }: GremlinOverlayProps) {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [state, setState] = useState<LobbyState | null>(null);
  const [messages, setMessages] = useState<string[][]>([]);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [messagesOverflow, setMessagesOverflow] = useState(false);
  const lastMessagesFlat = useRef('');
  const messagesRef = useRef<HTMLUListElement>(null);
  const messagesWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
    }
  }, []);

  // Poll state
  useEffect(() => {
    if (!lobbyId) return;
    const fetchState = async () => {
      try {
        const json = await getState(lobbyId);
        setState(json);
      } catch (e) {
        console.warn('get_state failed', e);
      }
    };
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, [lobbyId]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Round timer
  useEffect(() => {
    if (!state?.round_end_time) {
      setSecondsLeft(null);
      return;
    }
    const endTime = new Date(state.round_end_time).getTime() / 1000;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(endTime - Date.now() / 1000));
      setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.round_end_time]);

  // Reset choices on new round, collapse messages
  useEffect(() => {
    setAction('');
    setResource('');
    setMessagesExpanded(false);
  }, [state?.round]);

  // Fetch messages
  useEffect(() => {
    if (!lobbyId || !playerName) return;
    getPlayerMessages(lobbyId, playerName)
      .then((json) => {
        const newMsgs = json.messages ?? [];
        const newFlat = newMsgs.flat().join('\n');
        if (newFlat !== lastMessagesFlat.current) {
          lastMessagesFlat.current = newFlat;
          setMessages(newMsgs);
          setMessagesExpanded(false);
        }
      })
      .catch(() => {});
  }, [state?.round, lobbyId, playerName, state?.deny_target]);

  // Detect if messages overflow the collapsed container
  useEffect(() => {
    if (!messagesWrapRef.current || !messagesRef.current) return;
    const wrap = messagesWrapRef.current;
    const list = messagesRef.current;
    // Short delay so DOM has painted
    const t = setTimeout(() => {
      setMessagesOverflow(list.scrollHeight > wrap.clientHeight + 2);
    }, 50);
    return () => clearTimeout(t);
  }, [messages, messagesExpanded]);

  const gremlin = state?.players.find((p) => p.boss);
  const myPlayer = state?.players.find((p) => p.name === playerName);
  const isAlive = (myPlayer?.hp ?? 0) > 0;
  const gameOver = state?.gameover ?? false;
  const gameStarted = (state?.round ?? 0) > 0;

  const handleResource = async (resId: string) => {
    try {
      await submitChoice(lobbyId, { player: playerName, resource: resId, action: '' });
      setResource(resId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'API error');
    }
  };

  const handleAction = async (act: string) => {
    setAction(act);
    if (act === 'attack' && gremlin) {
      try {
        await submitChoice(lobbyId, { player: playerName, action: 'attack', target: gremlin.name, resource: '' });
      } catch (e) {
        alert(e instanceof Error ? e.message : 'API error');
      }
    } else {
      try {
        await submitChoice(lobbyId, { player: playerName, action: act, resource: '' });
      } catch (e) {
        alert(e instanceof Error ? e.message : 'API error');
      }
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-green-300 text-lg">Entering the forest...</p>
      </div>
    );
  }

  const showActions = !gameOver && isAlive && gameStarted;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Keyframe for round number zoom-in */}
      <style>{`
        @keyframes round-zoom-in {
          from { transform: scale(4); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .round-zoom {
          display: inline-block;
          animation: round-zoom-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      {/* Back button */}
      <div className="absolute top-4 left-4 pointer-events-auto z-20">
        <Link href="/" className="text-green-300 hover:underline font-medium drop-shadow-md">
          ← Flee the forest
        </Link>
      </div>

      {/* Round messages panel at top */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto z-20">
        <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-green-500/30 p-3 sm:p-4 text-white">
          {/* Round info + timer */}
          <div className="flex justify-between items-center">
            <span className="text-green-400 font-semibold">
              Round <span key={state.round} className="round-zoom">{state.round}</span>
            </span>
            {secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
              <span className={`font-semibold ${secondsLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                {secondsLeft}s
              </span>
            )}
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="mt-2 border-t border-green-500/20 pt-2">
              <div
                ref={messagesWrapRef}
                className={`overflow-hidden transition-all duration-300 ${messagesExpanded ? '' : 'max-h-[4.5rem]'}`}
              >
                <ul ref={messagesRef} className="text-sm text-gray-300 space-y-1">
                  {messages.map((m, i) => (
                    <li key={i} className="text-green-200">{Array.isArray(m) ? m.join(' ') : m}</li>
                  ))}
                </ul>
              </div>
              {(messagesOverflow || messagesExpanded) && (
                <button
                  type="button"
                  onClick={() => setMessagesExpanded((e) => !e)}
                  className="mt-1 text-xs text-green-500 hover:text-green-300 pointer-events-auto"
                >
                  {messagesExpanded ? '▲ Show less' : '▼ Show more'}
                </button>
              )}
            </div>
          )}

          {/* Game Over */}
          {gameOver && (
            <div className="mt-3 text-center">
              <p className="text-xl font-bold mb-2">
                {state.winner === playerName ? (
                  <span className="text-green-400">You defeated the Gremlin!</span>
                ) : gremlin && state.winner === gremlin.name ? (
                  <span className="text-red-400">The Gremlin got you...</span>
                ) : (
                  <span className="text-yellow-400">Game Over! {state.winner} wins!</span>
                )}
              </p>
              <Link
                href="/"
                className="text-green-400 hover:underline font-medium"
              >
                ← Return to Home
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Gremlin name, HP bar, and attack button — combined card */}
      {gremlin && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '28%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-2 text-center border border-green-500/30">
            <p className="text-green-400 font-bold text-sm">{gremlin.name}</p>
            <p className="text-gray-300 text-xs">{gremlin.title}</p>
            <div className="mt-1 w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(0, (gremlin.hp / 5) * 100)}%` }}
              />
            </div>
            <p className="text-green-300 text-xs mt-1">
              {Math.max(0, gremlin.hp)} / 5 HP
            </p>
            {showActions && (
              <button
                type="button"
                onClick={() => handleAction('attack')}
                className={`mt-2 w-full ${btn} text-sm shadow-lg ${
                  action === 'attack'
                    ? 'bg-red-600 text-white border-red-400'
                    : 'bg-red-900/80 text-red-200 border-red-700 hover:bg-red-800/90'
                }`}
              >
                ⚔ ATTACK
              </button>
            )}
          </div>
        </div>
      )}

      {/* "The Well" raid button — just above player nametag */}
      {showActions && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '54%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <button
            type="button"
            onClick={() => handleAction('raid')}
            className={`${btn} text-sm backdrop-blur-sm shadow-lg ${
              action === 'raid'
                ? 'bg-purple-600 text-white border-purple-400'
                : 'bg-purple-900/80 text-purple-200 border-purple-700 hover:bg-purple-800/90'
            }`}
          >
            🏴 The Well
          </button>
        </div>
      )}

      {/* "More monsters" button — over the signpost on the right, shown after game over */}
      {gameOver && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '54%', left: '78%', transform: 'translate(-50%, -50%)' }}
        >
          <Link
            href="/"
            className={`${btn} text-sm backdrop-blur-sm shadow-lg bg-amber-900/80 text-amber-200 border-amber-700 hover:bg-amber-800/90`}
          >
            ⚔ More monsters
          </Link>
        </div>
      )}

      {/* Player nametag — between well and defend, right of center */}
      {myPlayer && (
        <div
          className="absolute"
          style={{ top: '59%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1 text-center border border-blue-500/30">
            <p className="text-blue-200 font-bold text-sm">
              {state.raidwinner === playerName ? '👑 ' : ''}{playerName}
            </p>
          </div>
        </div>
      )}

      {/* Defend button — on the player character */}
      {showActions && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '65%', left: '50%', transform: 'translateX(-50%)' }}
        >
          <button
            type="button"
            onClick={() => handleAction('defend')}
            className={`${btn} text-sm backdrop-blur-sm shadow-lg ${
              action === 'defend'
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-blue-900/80 text-blue-200 border-blue-700 hover:bg-blue-800/90'
            }`}
          >
            🛡 DEFEND
          </button>
        </div>
      )}

      {/* Stats — clickable resource windows below the player character */}
      {myPlayer && !myPlayer.spectator && (
        <div
          className="absolute flex gap-2 pointer-events-auto"
          style={{ top: '72%', left: '50%', transform: 'translateX(-50%)' }}
        >
          <button
            type="button"
            disabled={!showActions}
            onClick={() => handleResource('gain_hp')}
            className={`backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150
              ${!showActions ? 'opacity-60 cursor-default' : 'cursor-pointer'}
              ${resource === 'gain_hp'
                ? 'bg-red-700/80 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                : 'bg-black/70 border-red-500/50 hover:bg-red-950/80 hover:border-red-400/80 hover:shadow-[0_0_6px_rgba(239,68,68,0.3)]'
              }`}
          >
            <p className="text-gray-400 text-xs uppercase tracking-wide">HP</p>
            <p className="text-red-400 font-bold text-xl leading-tight">{myPlayer.hp}</p>
            <p className="text-red-400/70 text-xs">❤ Get</p>
          </button>
          <button
            type="button"
            disabled={!showActions}
            onClick={() => handleResource('gain_coin')}
            className={`backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150
              ${!showActions ? 'opacity-60 cursor-default' : 'cursor-pointer'}
              ${resource === 'gain_coin'
                ? 'bg-yellow-700/80 border-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                : 'bg-black/70 border-yellow-500/50 hover:bg-yellow-950/80 hover:border-yellow-400/80 hover:shadow-[0_0_6px_rgba(234,179,8,0.3)]'
              }`}
          >
            <p className="text-gray-400 text-xs uppercase tracking-wide">Coins</p>
            <p className="text-yellow-400 font-bold text-xl leading-tight">{myPlayer.coins}</p>
            <p className="text-yellow-400/70 text-xs">💰 Get</p>
          </button>
          {(() => {
            const cannotAffordAtk = myPlayer.coins < myPlayer.attackDamage;
            return (
              <button
                type="button"
                disabled={!showActions || cannotAffordAtk}
                onClick={() => handleResource('gain_attack')}
                className={`relative overflow-hidden backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150
                  ${!showActions || cannotAffordAtk ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                  ${resource === 'gain_attack'
                    ? 'bg-blue-700/80 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                    : 'bg-black/70 border-blue-500/50 hover:bg-blue-950/80 hover:border-blue-400/80 hover:shadow-[0_0_6px_rgba(59,130,246,0.3)]'
                  }`}
              >
                <p className="text-gray-400 text-xs uppercase tracking-wide">ATK</p>
                <p className="text-blue-400 font-bold text-xl leading-tight">{myPlayer.attackDamage}</p>
                <p className="text-blue-400/70 text-xs">⚔ Buy</p>
                {cannotAffordAtk && (
                  <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
                    <svg className="w-full h-full" preserveAspectRatio="none">
                      <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="2" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })()}
        </div>
      )}

    </div>
  );
}
