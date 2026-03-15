'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getState,
  getNextRaidTime,
  startGame,
  addDummy,
  kickPlayer,
  submitChoice,
  submitDenyTarget,
  getPlayerMessages,
  requestReplay,
} from '@/lib/api';
import type { LobbyState } from '@/types/game';
import FloatingMessage from './FloatingMessage';

const btn = 'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

type LobbyOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
};

export default function LobbyOverlay({ lobbyId, onStateChange }: LobbyOverlayProps) {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [state, setState] = useState<LobbyState | null>(null);
  const [messages, setMessages] = useState<string[][]>([]);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [denyTarget, setDenyTarget] = useState('');
  const [replayVoted, setReplayVoted] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [floatingMessages, setFloatingMessages] = useState<string[]>([]);
  const [nextRaidTime, setNextRaidTime] = useState<number | null>(null);
  const [raidMins, setRaidMins] = useState<number | null>(null);
  const [raidSecs, setRaidSecs] = useState<number | null>(null);
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

  useEffect(() => {
    setState(null);
    setReplayVoted(false);
    setFloatingMessages([]);
    setMessages([]);
  }, [lobbyId]);

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

  const gameOver = state?.gameover ?? false;
  useEffect(() => {
    if (gameOver && state?.next_lobby_id && state.next_lobby_id !== lobbyId) {
      router.replace(`/lobby/${state.next_lobby_id}`);
    }
  }, [gameOver, state?.next_lobby_id, lobbyId, router]);

  useEffect(() => {
    setDenyTarget('');
    setAction('');
    setResource('');
    setMessagesExpanded(false);
  }, [state?.round]);

  useEffect(() => {
    if (!lobbyId || !playerName) return;
    getPlayerMessages(lobbyId, playerName)
      .then((json) => {
        const newMsgs = json.messages ?? [];
        const newFlat = newMsgs.flat().join('\n');
        if (newFlat !== lastMessagesFlat.current) {
          lastMessagesFlat.current = newFlat;
          setFloatingMessages((prev) => [...prev, newFlat]);
          setMessagesExpanded(false);
          setTimeout(() => setMessages(newMsgs), 2500);
        }
      })
      .catch(() => {});
  }, [state?.round, lobbyId, playerName, state?.deny_target]);

  const isAlive = (state?.players.find((p) => p.name === playerName)?.hp ?? 0) > 0;
  useEffect(() => {
    if (!isAlive) return;
    getNextRaidTime()
      .then((json) => setNextRaidTime(json.start_time))
      .catch(() => setNextRaidTime(null));
  }, [isAlive]);

  useEffect(() => {
    if (nextRaidTime == null) return;
    const nextRT = new Date(nextRaidTime);
    const interval = setInterval(() => {
      const diff = Math.floor((nextRT.getTime() - Date.now()) / 1000);
      setRaidSecs(Math.floor(diff % 60));
      setRaidMins(Math.floor(diff / 60));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRaidTime]);

  // Detect if messages overflow the collapsed container
  useEffect(() => {
    if (!messagesWrapRef.current || !messagesRef.current) return;
    const wrap = messagesWrapRef.current;
    const list = messagesRef.current;
    const t = setTimeout(() => {
      setMessagesOverflow(list.scrollHeight > wrap.clientHeight + 2);
    }, 50);
    return () => clearTimeout(t);
  }, [messages, messagesExpanded]);

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const isAdmin = myPlayer?.admin ?? false;
  const boss = state?.players.find((p) => p.boss);
  const gameStarted = (state?.round ?? 0) > 0;
  const isDenied = playerName === state?.deny_target;
  const isChoosingDeny = state?.pending_deny === playerName;
  const eligibleTargets = state?.players.filter((p) => p.name !== playerName && p.hp > 0) ?? [];
  const showActions = !gameOver && !isDenied && isAlive && !myPlayer?.spectator;

  const handleStartGame = async () => {
    try {
      await startGame(lobbyId, playerName);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to start game');
    }
  };

  const handleAddDummy = async () => {
    try {
      await addDummy(lobbyId, playerName);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add bot');
    }
  };

  const handleKick = async (targetName: string) => {
    try {
      await kickPlayer(lobbyId, playerName, targetName);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to kick');
    }
  };

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
    try {
      await submitChoice(lobbyId, { player: playerName, action: act, resource: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'API error');
    }
  };

  const handleAttackBoss = async () => {
    if (!boss) return;
    try {
      await submitChoice(lobbyId, { player: playerName, action: 'attack', target: boss.name, resource: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'API error');
    }
  };

  const handleDeny = async () => {
    try {
      await submitDenyTarget(lobbyId, playerName, denyTarget);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit deny');
    }
  };

  const handleReplay = async () => {
    setReplayLoading(true);
    try {
      const data = await requestReplay(lobbyId, playerName);
      setReplayVoted(true);
      if (data.next_lobby_id) {
        setState((s) => (s ? { ...s, next_lobby_id: data.next_lobby_id } : s));
      } else {
        const updated = await getState(lobbyId);
        setState(updated);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to vote for replay');
    } finally {
      setReplayLoading(false);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-700 text-lg">Loading lobby…</p>
      </div>
    );
  }

  // PRE-GAME: existing white card UI unchanged
  if (!gameStarted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
        <div className="absolute top-4 left-4 z-20">
          <Link href="/" className="text-blue-600 hover:underline font-medium">
            ← Back to Home
          </Link>
        </div>
        <div className="relative z-10 min-h-screen w-full flex items-center justify-center">
          <div className="w-full max-w-3xl flex flex-col items-center justify-center rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm transition-all duration-300 p-6 text-gray-900">
            {state.boss_fight && boss && (
              <div className="bg-red-200 p-4 rounded mb-4 w-full text-center">
                <h2 className="text-2xl font-bold">{boss.name}</h2>
                <p className="text-gray-500">{boss.title}</p>
                <p>HP: {boss.hp}</p>
                {raidMins != null && raidSecs != null && (
                  <p className="text-gray-500">
                    Boss-fight starts in {raidMins}m {raidSecs}s
                  </p>
                )}
              </div>
            )}

            <h2 className="text-3xl font-extrabold mt-6 mb-4 tracking-tight">Lobby ID: {lobbyId}</h2>
            <p className="mb-3 text-lg text-gray-600">Round: {state.round ?? '?'}</p>
            <p className="mb-6 text-lg text-gray-600">Your Name: {playerName}</p>

            <div className="w-full mb-6 bg-white p-6 rounded-xl shadow-sm">
              <h3 className="font-semibold text-xl text-gray-800 mb-4">Players in Lobby</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                {state.players.map((p) => (
                  <li key={p.name} className="py-1 flex items-center gap-2 flex-wrap">
                    {p.hp <= 0 && <span className="text-red-500">☠️</span>}
                    {(state.winner === p.name || (!state.winner && state.raidwinner === p.name)) && (
                      <span className="text-yellow-500">👑</span>
                    )}
                    {p.spectator && <span className="text-yellow-500">👁</span>}
                    <span className="font-medium">{p.name}</span>
                    {isAdmin && p.name !== playerName && p.hp > 0 && state.round === 0 && (
                      <span
                        className="ml-2 text-red-500 text-sm cursor-pointer"
                        title="Kick player"
                        onClick={() => handleKick(p.name)}
                      >
                        ❌
                      </span>
                    )}
                    {state.readyPlayers?.includes(p.name) && <span className="text-green-500">✅</span>}
                    {p.idle_rounds >= 2 && <span className="text-gray-400">👻</span>}
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap gap-3 mb-4">
                <button
                  type="button"
                  onClick={handleStartGame}
                  className={`${btn} bg-amber-600 text-white border-amber-700`}
                >
                  Start Game
                </button>
                <button
                  type="button"
                  onClick={handleAddDummy}
                  className={`${btn} bg-gray-600 text-white`}
                >
                  Add Random Bot
                </button>
              </div>
            )}

            {floatingMessages.map((msg, idx) => (
              <FloatingMessage
                key={idx}
                message={msg}
                onDone={() => setFloatingMessages((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // POST-GAME: gremlin-style overlay
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
      `}</style>

      {/* Back button */}
      <div className="absolute top-4 left-4 pointer-events-auto z-20">
        <Link href="/" className="text-white hover:underline font-medium drop-shadow-md">
          ← Back to Home
        </Link>
      </div>

      {/* Round messages panel — top center */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto z-20">
        <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-white/20 p-3 sm:p-4 text-white">
          <div className="flex justify-between items-center">
            <span className="text-gray-300 font-semibold">
              Round <span key={state.round} className="round-zoom">{state.round}</span>
            </span>
            {secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
              <span className={`font-semibold ${secondsLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                {secondsLeft}s
              </span>
            )}
          </div>

          {messages.length > 0 && (
            <div className="mt-2 border-t border-white/20 pt-2">
              <div
                ref={messagesWrapRef}
                className={`overflow-hidden transition-all duration-300 ${messagesExpanded ? '' : 'max-h-[4.5rem]'}`}
              >
                <ul ref={messagesRef} className="text-sm space-y-1">
                  {messages.map((m, i) => (
                    <li key={i} className="text-gray-200">{Array.isArray(m) ? m.join(' ') : m}</li>
                  ))}
                </ul>
              </div>
              {(messagesOverflow || messagesExpanded) && (
                <button
                  type="button"
                  onClick={() => setMessagesExpanded((e) => !e)}
                  className="mt-1 text-xs text-gray-400 hover:text-white pointer-events-auto"
                >
                  {messagesExpanded ? '▲ Show less' : '▼ Show more'}
                </button>
              )}
            </div>
          )}

          {gameOver && (
            <div className="mt-3 text-center">
              <p className="text-xl font-bold mb-2">
                {state.winner === playerName ? (
                  <span className="text-green-400">You won! 👑</span>
                ) : (
                  <span className="text-yellow-400">Game Over! {state.winner} wins!</span>
                )}
              </p>
              <div className="flex flex-col gap-2 items-center">
                <Link href="/" className="text-blue-400 hover:underline font-medium">
                  ← Back to Home
                </Link>
                {typeof state.replay_votes_needed === 'number' && state.replay_votes_needed > 0 && (
                  <>
                    <p className="text-sm text-gray-400">
                      {state.replay_votes_count ?? 0} / {state.replay_votes_needed} ready to replay
                    </p>
                    <button
                      type="button"
                      disabled={replayVoted || replayLoading}
                      onClick={handleReplay}
                      className={`${btn} bg-green-600 text-white border-green-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {replayVoted ? 'Voted to replay' : replayLoading ? '…' : 'Replay'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player list — top right */}
      <div className="absolute top-12 right-4 pointer-events-auto z-20">
        <div className="bg-black/70 backdrop-blur-sm rounded-xl border border-white/20 p-3 text-white text-sm">
          <ul className="space-y-1">
            {state.players.filter((p) => !p.spectator).map((p) => (
              <li key={p.name} className={`flex items-center gap-1 ${p.hp <= 0 ? 'opacity-40' : ''}`}>
                {(state.winner === p.name || (!state.winner && state.raidwinner === p.name)) && <span>👑</span>}
                {p.hp <= 0 && <span>☠️</span>}
                {p.idle_rounds >= 2 && <span>👻</span>}
                <span className={p.name === playerName ? 'text-blue-300 font-bold' : 'text-gray-300'}>
                  {p.name}
                </span>
                <span className="text-red-400 text-xs">{p.hp}hp</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Boss HP panel */}
      {state.boss_fight && boss && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '28%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-2 text-center border border-red-500/30">
            <p className="text-red-400 font-bold text-sm">{boss.name}</p>
            <p className="text-gray-300 text-xs">{boss.title}</p>
            <div className="mt-1 w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(0, (boss.hp / 10) * 100)}%` }}
              />
            </div>
            <p className="text-red-300 text-xs mt-1">{Math.max(0, boss.hp)} HP</p>
            {showActions && (
              <button
                type="button"
                onClick={handleAttackBoss}
                className={`${btn} text-sm backdrop-blur-sm shadow-lg mt-2 bg-red-900/80 text-red-200 border-red-700 hover:bg-red-800/90`}
              >
                ⚔ ATTACK
              </button>
            )}
          </div>
        </div>
      )}

      {/* RAID button */}
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
            🏴 RAID
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

      {/* DEFEND button */}
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

      {/* Resource stat cards */}
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

      {/* Deny target picker */}
      {isChoosingDeny && (
        <div
          className="absolute pointer-events-auto"
          style={{ bottom: '4%', left: '50%', transform: 'translateX(-50%)' }}
        >
          <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-amber-500/30 p-4 text-white">
            <h3 className="font-semibold text-sm text-amber-400 mb-3">Choose someone to deny next round</h3>
            <div className="flex gap-3 items-center">
              <select
                value={denyTarget}
                onChange={(e) => setDenyTarget(e.target.value)}
                className="border border-gray-600 rounded-lg p-2 bg-black/80 text-white text-sm flex-1 min-w-[120px]"
              >
                <option value="">Select player</option>
                {eligibleTargets.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!denyTarget}
                onClick={handleDeny}
                className={`${btn} bg-amber-700/80 text-amber-200 border-amber-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Deny
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating messages */}
      {floatingMessages.map((msg, idx) => (
        <FloatingMessage
          key={idx}
          message={msg}
          onDone={() => setFloatingMessages((prev) => prev.filter((_, i) => i !== idx))}
        />
      ))}
    </div>
  );
}
