'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getState,
  submitChoice,
  getPlayerMessages,
  createThiefEncounter,
  sendLobbyChat,
} from '@/lib/api';
import type { LobbyState, ChatMessage } from '@/types/game';

const btn = 'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

type EncounterOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
};

export default function EncounterOverlay({ lobbyId, onStateChange }: EncounterOverlayProps) {
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

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Thief intro popup
  const [showThiefPopup, setShowThiefPopup] = useState(false);
  const thiefPopupShown = useRef(false);

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

  // Show thief intro popup
  useEffect(() => {
    if (state?.thief_encounter && !thiefPopupShown.current) {
      thiefPopupShown.current = true;
      setShowThiefPopup(true);
    }
  }, [state?.thief_encounter]);

  // Update chat messages from state
  useEffect(() => {
    if (state?.chat) {
      setChatMessages(state.chat);
    }
  }, [state?.chat]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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

  // Reset choices on new round
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

  // Detect messages overflow
  useEffect(() => {
    if (!messagesWrapRef.current || !messagesRef.current) return;
    const wrap = messagesWrapRef.current;
    const list = messagesRef.current;
    const t = setTimeout(() => {
      setMessagesOverflow(list.scrollHeight > wrap.clientHeight + 2);
    }, 50);
    return () => clearTimeout(t);
  }, [messages, messagesExpanded]);

  const isThiefEncounter = state?.thief_encounter ?? false;
  const boss = state?.players.find((p) => p.boss);
  const gremlin = state?.players.find((p) => p.gremlin);
  const raskibask = state?.players.find((p) => p.raskibask);
  const thief = state?.players.find((p) => p.thief);
  const myPlayer = state?.players.find((p) => p.name === playerName);
  const isAlive = (myPlayer?.hp ?? 0) > 0;
  const gameOver = state?.gameover ?? false;
  const gameStarted = (state?.round ?? 0) > 0;

  // Determine primary target (boss — the thief in thief encounters, gremlin otherwise)
  const primaryEnemy = isThiefEncounter ? thief : boss;

  const handleResource = async (resId: string) => {
    try {
      await submitChoice(lobbyId, { player: playerName, resource: resId, action: '' });
      setResource(resId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'API error');
    }
  };

  const handleAction = async (act: string, targetName?: string) => {
    setAction(act);
    const target = act === 'attack' ? (targetName ?? primaryEnemy?.name) : undefined;
    try {
      await submitChoice(lobbyId, { player: playerName, action: act, target, resource: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'API error');
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    try {
      await sendLobbyChat(lobbyId, playerName, chatInput.trim());
      setChatInput('');
    } catch (e) {
      console.warn('Failed to send chat', e);
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
  const playerWon = gameOver && (state.winner === playerName || state.winner === 'Players');

  // Enemy display info
  const enemies = isThiefEncounter
    ? [
        { player: thief, label: thief?.name ?? 'Thief', maxHp: 10, color: 'gray' },
        { player: gremlin, label: gremlin?.name ?? 'Gremlin', maxHp: 5, color: 'green' },
      ]
    : [
        { player: boss, label: boss?.name ?? 'Gremlin', maxHp: 5, color: 'green' },
        { player: raskibask, label: raskibask?.name ?? 'Raskibask', maxHp: 3, color: 'amber' },
      ];

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <style>{`
        @keyframes round-zoom-in {
          from { transform: scale(4); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .round-zoom {
          display: inline-block;
          animation: round-zoom-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes popup-appear {
          from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          to   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>

      {/* Thief intro popup */}
      {showThiefPopup && (
        <div className="absolute inset-0 z-50 pointer-events-auto" onClick={() => setShowThiefPopup(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute bg-gray-900 border-2 border-red-600 rounded-xl px-8 py-6 text-center shadow-2xl"
            style={{
              top: '50%', left: '50%',
              animation: 'popup-appear 0.4s ease-out forwards',
            }}
          >
            <p className="text-gray-400 text-sm mb-1">The Thief speaks:</p>
            <p className="text-red-500 font-bold text-3xl tracking-wider"
               style={{ fontFamily: 'serif', textShadow: '0 0 10px rgba(255,0,0,0.5)' }}>
              &ldquo;DIE CHERUB&rdquo;
            </p>
            <p className="text-gray-500 text-xs mt-3">click anywhere to dismiss</p>
          </div>
        </div>
      )}

      {/* Back button */}
      <div className="absolute top-4 left-4 pointer-events-auto z-20">
        <Link href="/" className="text-green-300 hover:underline font-medium drop-shadow-md">
          ← Flee the forest
        </Link>
      </div>

      {/* Round messages panel at top */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto z-20">
        <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-green-500/30 p-3 sm:p-4 text-white">
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
                {playerWon ? (
                  <span className="text-green-400">
                    {isThiefEncounter ? 'You defeated the Thief!' : 'You defeated the enemies!'}
                  </span>
                ) : (
                  <span className="text-red-400">
                    {isThiefEncounter ? 'The Thief got you...' : 'The forest creatures got you...'}
                  </span>
                )}
              </p>
              {!playerWon && (
                <Link href="/" className="text-green-400 hover:underline font-medium">
                  ← Return to Home
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Enemy cards — side by side above the table */}
      <div
        className="absolute pointer-events-auto flex gap-3"
        style={{ top: '26%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        {enemies.map((enemy, idx) => {
          if (!enemy.player) return null;
          const hp = Math.max(0, enemy.player.hp);
          const hpPct = Math.max(0, (hp / enemy.maxHp) * 100);
          const barColor = enemy.color === 'green' ? 'bg-green-500' : enemy.color === 'amber' ? 'bg-amber-500' : 'bg-gray-400';
          const borderColor = enemy.color === 'green' ? 'border-green-500/30' : enemy.color === 'amber' ? 'border-amber-500/30' : 'border-gray-500/30';
          const textColor = enemy.color === 'green' ? 'text-green-400' : enemy.color === 'amber' ? 'text-amber-400' : 'text-gray-300';
          const hpTextColor = enemy.color === 'green' ? 'text-green-300' : enemy.color === 'amber' ? 'text-amber-300' : 'text-gray-300';
          const btnBg = 'bg-red-900/80 text-red-200 border-red-700 hover:bg-red-800/90';
          const btnActive = 'bg-red-600 text-white border-red-400';

          return (
            <div key={idx} className={`bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-center border ${borderColor}`}>
              <p className={`${textColor} font-bold text-sm`}>{enemy.label}</p>
              <p className="text-gray-400 text-xs">{enemy.player.title}</p>
              <div className="mt-1 w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <p className={`${hpTextColor} text-xs mt-1`}>
                {hp} / {enemy.maxHp} HP
              </p>
              {showActions && enemy.player.alive && (
                <button
                  type="button"
                  onClick={() => handleAction('attack', enemy.player!.name)}
                  className={`mt-2 w-full ${btn} text-xs shadow-lg ${
                    action === 'attack' ? btnActive : btnBg
                  }`}
                >
                  ⚔ ATTACK
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Raid button */}
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

      {/* Player nametag */}
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

      {/* Defend button */}
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

      {/* Stat windows */}
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
          <button
            type="button"
            disabled={!showActions}
            onClick={() => handleResource('gain_attack')}
            className={`backdrop-blur-sm rounded-lg px-3 py-2 border text-center min-w-[62px] transition-all duration-150
              ${!showActions ? 'opacity-60 cursor-default' : 'cursor-pointer'}
              ${resource === 'gain_attack'
                ? 'bg-blue-700/80 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                : 'bg-black/70 border-blue-500/50 hover:bg-blue-950/80 hover:border-blue-400/80 hover:shadow-[0_0_6px_rgba(59,130,246,0.3)]'
              }`}
          >
            <p className="text-gray-400 text-xs uppercase tracking-wide">ATK</p>
            <p className="text-blue-400 font-bold text-xl leading-tight">{myPlayer.attackDamage}</p>
            <p className="text-blue-400/70 text-xs">⚔ Buy</p>
          </button>
        </div>
      )}

      {/* Chat UI — only for thief encounter */}
      {isThiefEncounter && (
        <div className="absolute bottom-4 right-4 pointer-events-auto z-30">
          {chatOpen ? (
            <div className="w-72 bg-black/90 backdrop-blur-sm border border-green-500/30 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-green-500/20">
                <span className="text-green-400 font-bold text-sm">Chat</span>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
              <div className="h-48 overflow-y-auto px-3 py-2 space-y-1">
                {chatMessages.map((msg, i) => {
                  const isThiefMsg = msg.sender.includes('Thief');
                  const isSystem = msg.sender === 'System';
                  return (
                    <div key={i} className="text-xs">
                      <span className={`font-bold ${
                        isThiefMsg ? 'text-red-400' :
                        isSystem ? 'text-yellow-400' :
                        msg.sender === playerName ? 'text-blue-400' : 'text-green-400'
                      }`}>
                        {msg.sender}:
                      </span>{' '}
                      <span className="text-gray-300">{msg.message}</span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="flex border-t border-green-500/20">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendChat();
                  }}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent text-white text-sm px-3 py-2 outline-none placeholder-gray-500"
                  maxLength={200}
                />
                <button
                  type="button"
                  onClick={handleSendChat}
                  className="px-3 text-green-400 hover:text-green-300 text-sm font-bold"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="bg-black/80 border border-green-500/30 rounded-full px-4 py-2 text-green-400 font-bold text-sm
                         hover:bg-green-900/40 transition-colors shadow-lg"
            >
              💬 Chat
            </button>
          )}
        </div>
      )}

      {/* Wooden signpost after forest encounter victory → leads to thief encounter */}
      {gameOver && playerWon && !isThiefEncounter && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <button
            type="button"
            onClick={async () => {
              try {
                const { lobby_id } = await createThiefEncounter(playerName);
                router.push(`/encounter/${lobby_id}`);
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Failed to start encounter');
              }
            }}
            className="cursor-pointer group"
          >
            <div className="w-3 h-16 bg-amber-800 mx-auto rounded-sm shadow-lg" />
            <div
              className="relative -mt-20 bg-amber-700 border-4 border-amber-900 rounded-lg px-6 py-3 shadow-2xl
                         group-hover:bg-amber-600 group-hover:scale-105 transition-all duration-200"
              style={{
                backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(0,0,0,0.05) 8px, rgba(0,0,0,0.05) 9px)',
              }}
            >
              <p className="text-yellow-300 font-bold text-xl tracking-wide drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                 style={{ fontFamily: 'serif', textShadow: '1px 1px 0 #000, -1px -1px 0 #000' }}>
                THEIF!
              </p>
              <p className="text-amber-200 text-xs mt-1 opacity-80">click to continue</p>
            </div>
          </button>
        </div>
      )}

      {/* Thief encounter victory — return home */}
      {gameOver && playerWon && isThiefEncounter && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/80 backdrop-blur-sm rounded-xl px-6 py-4 text-center border border-green-500/30">
            <p className="text-green-400 font-bold text-lg mb-2">The forest is safe... for now.</p>
            <Link
              href="/"
              className="text-green-300 hover:underline font-medium"
            >
              ← Return to Home
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}
