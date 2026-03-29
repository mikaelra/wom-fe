'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getNextRaidTime,
  getPlayerMessages,
  requestReplay,
  getSocket,
} from '@/lib/api';
import type { LobbyState, Player } from '@/types/game';
import FloatingMessage from '@/components/lobby/FloatingMessage';

export const btn = 'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

export type SceneOverlayTheme = {
  accentColorClass: string;   // Round label color, e.g. 'text-green-400'
  panelBorderClass: string;   // Main panel border, e.g. 'border-green-500/30'
  msgBorderClass: string;     // Message divider border, e.g. 'border-green-500/20'
  msgTextClass: string;       // Message item color, e.g. 'text-green-200'
  showMoreClass: string;      // Show more/less button classes
  backLinkClass: string;      // Back link color, e.g. 'text-green-300'
  enemyBorderClass: string;   // Enemy panel border, e.g. 'border-green-500/30'
  enemyNameClass: string;     // Enemy name color, e.g. 'text-green-400'
  enemyHpBarClass: string;    // HP bar fill color, e.g. 'bg-green-500'
  enemyHpTextClass: string;   // HP text color, e.g. 'text-green-300'
  loadingTextClass: string;   // Loading text color, e.g. 'text-green-300'
  loadingBgClass: string;     // Loading container bg, e.g. '' or 'bg-gray-100'
};

export type GameOverRenderOpts = {
  state: LobbyState;
  playerName: string;
  enemy: Player | undefined;
  btn: string;
  replayVoted: boolean;
  replayLoading: boolean;
  onReplay: () => void;
};

export type PreGameRenderOpts = {
  state: LobbyState;
  lobbyId: string;
  playerName: string;
  isAdmin: boolean;
  boss: Player | undefined;
  raidMins: number | null;
  raidSecs: number | null;
  btn: string;
  onStartGame: () => void;
  onAddDummy: () => void;
  onKick: (name: string) => void;
  floatingMessages: string[];
  onDoneFloating: (idx: number) => void;
};

export type SceneOverlayConfig = {
  theme: SceneOverlayTheme;
  backLabel: string;
  loadingText: string;
  enemyMaxHp: number;
  /** If true, enemy panel is always shown when an enemy player exists.
   *  If false, only shown when state.boss_fight is truthy. */
  showEnemyAlways?: boolean;
  showPlayerList?: boolean;
  showDenyPicker?: boolean;
  showFloatingMessages?: boolean;
  showChat?: boolean;
  enableNextLobbyRedirect?: boolean;
  enableRaidTimer?: boolean;
  renderGameOver: (opts: GameOverRenderOpts) => ReactNode;
  /** Render additional positioned elements (e.g. a "More monsters" button) */
  renderExtra?: (opts: { gameOver: boolean; btn: string }) => ReactNode;
};

type SceneOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
  config: SceneOverlayConfig;
  /** If provided, renders pre-game UI before the game starts instead of the game overlay */
  renderPreGame?: (opts: PreGameRenderOpts) => ReactNode;
  /** Externally controlled action (e.g. set by the 3D scene attack button) */
  externalAction?: string;
  /** Called whenever the player selects an action, so callers can sync external state */
  onActionChange?: (action: string) => void;
};

export default function SceneOverlay({ lobbyId, onStateChange, config, renderPreGame, externalAction, onActionChange }: SceneOverlayProps) {
  const {
    theme,
    backLabel,
    loadingText,
    enemyMaxHp,
    showEnemyAlways = false,
    showPlayerList = false,
    showDenyPicker = false,
    showFloatingMessages = false,
    showChat = false,
    enableNextLobbyRedirect = false,
    enableRaidTimer = false,
    renderGameOver,
    renderExtra,
  } = config;

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
  const [chatInput, setChatInput] = useState('');
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    if (!lobbyId || !playerName) return;
    const sock = getSocket();

    sock.emit("join_room", { lobby_id: lobbyId, name: playerName });

    sock.on("state_update", (data) => {
      setState(data);
    });

    sock.on("chat_message", (msg) => {
      setState((prev) =>
        prev ? { ...prev, chat: [...(prev.chat ?? []), msg] } : prev
      );
    });

    sock.on("error", (data) => {
      alert(data.message);
    });

    return () => {
      sock.emit("leave_room", { lobby_id: lobbyId, name: playerName });
      sock.off("state_update");
      sock.off("chat_message");
      sock.off("error");
    };
  }, [lobbyId, playerName]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // While waiting in the pre-game lobby, periodically re-emit join_room so the
  // server sends back the current state. This catches new players joining when
  // the server doesn't broadcast state_update to existing room members on join.
  const gameStarted = (state?.round ?? 0) > 0;
  useEffect(() => {
    if (!lobbyId || !playerName || gameStarted) return;
    const interval = setInterval(() => {
      getSocket().emit("join_room", { lobby_id: lobbyId, name: playerName });
    }, 3000);
    return () => clearInterval(interval);
  }, [lobbyId, playerName, gameStarted]);

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
    if (!enableNextLobbyRedirect) return;
    if (gameOver && state?.next_lobby_id && state.next_lobby_id !== lobbyId) {
      router.replace(`/lobby/${state.next_lobby_id}`);
    }
  }, [gameOver, state?.next_lobby_id, lobbyId, router, enableNextLobbyRedirect]);

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
          if (showFloatingMessages) {
            setFloatingMessages((prev) => [...prev, newFlat]);
            setMessagesExpanded(false);
            setTimeout(() => setMessages(newMsgs), 2500);
          } else {
            setMessages(newMsgs);
            setMessagesExpanded(false);
          }
        }
      })
      .catch(() => {});
  }, [state?.round, lobbyId, playerName, state?.deny_target, showFloatingMessages]);

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const isAlive = (myPlayer?.hp ?? 0) > 0;

  useEffect(() => {
    if (!enableRaidTimer || !isAlive) return;
    getNextRaidTime()
      .then((json) => setNextRaidTime(json.start_time))
      .catch(() => setNextRaidTime(null));
  }, [isAlive, enableRaidTimer]);

  useEffect(() => {
    if (!enableRaidTimer || nextRaidTime == null) return;
    const nextRT = new Date(nextRaidTime);
    const interval = setInterval(() => {
      const diff = Math.floor((nextRT.getTime() - Date.now()) / 1000);
      setRaidSecs(Math.floor(diff % 60));
      setRaidMins(Math.floor(diff / 60));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRaidTime, enableRaidTimer]);

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

  const isAdmin = myPlayer?.admin ?? false;
  const enemy = state?.players.find((p) => p.boss);
  const isDenied = playerName === state?.deny_target;
  const isChoosingDeny = showDenyPicker && state?.pending_deny === playerName;
  const eligibleTargets = state?.players.filter((p) => p.name !== playerName && p.hp > 0) ?? [];
  const showActions = !gameOver && !isDenied && isAlive && !myPlayer?.spectator && gameStarted;

  const effectiveAction = externalAction !== undefined ? externalAction : action;

  const needsAction   = effectiveAction === '' && showActions;
  const needsResource = resource === '' && showActions;
  const isGoldWarn    = secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 5;
  const isRedWarn     = secondsLeft !== null && secondsLeft <= 5;
  const actionCue   = needsAction   ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '') : '';
  const resourceCue = needsResource ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '') : '';

  const handleStartGame = () => {
    getSocket().emit('start_game', { lobby_id: lobbyId, admin: playerName });
  };

  const handleAddDummy = () => {
    getSocket().emit('add_dummy', { lobby_id: lobbyId, name: playerName });
  };

  const handleKick = (targetName: string) => {
    getSocket().emit('kick_player', { lobby_id: lobbyId, admin: playerName, target: targetName });
  };

  const handleResource = (resId: string) => {
    setResource(resId);
    getSocket().emit('submit_choice', { lobby_id: lobbyId, player: playerName, resource: resId, action: '' });
  };

  const handleAction = (act: string) => {
    setAction(act);
    onActionChange?.(act);
    getSocket().emit('submit_choice', {
      lobby_id: lobbyId,
      player: playerName,
      action: act,
      resource: '',
      target: act === 'attack' && enemy ? enemy.name : undefined,
    });
  };

  const handleDeny = () => {
    getSocket().emit('submit_deny_target', { lobby_id: lobbyId, player: playerName, target: denyTarget });
  };

  const handleReplay = async () => {
    setReplayLoading(true);
    try {
      const data = await requestReplay(lobbyId, playerName);
      setReplayVoted(true);
      if (data.next_lobby_id) {
        setState((s) => (s ? { ...s, next_lobby_id: data.next_lobby_id } : s));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to vote for replay');
    } finally {
      setReplayLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.chat]);

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg || !playerName) return;
    getSocket().emit('send_message', { lobby_id: lobbyId, name: playerName, message: msg });
    setChatInput('');
  };

  if (!state) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme.loadingBgClass}`}>
        <p className={`${theme.loadingTextClass} text-lg`}>{loadingText}</p>
      </div>
    );
  }

  // Pre-game: delegate to render prop if provided
  if (!gameStarted && renderPreGame) {
    return (
      <>
        {renderPreGame({
          state,
          lobbyId,
          playerName,
          isAdmin,
          boss: enemy,
          raidMins,
          raidSecs,
          btn,
          onStartGame: handleStartGame,
          onAddDummy: handleAddDummy,
          onKick: handleKick,
          floatingMessages,
          onDoneFloating: (idx) => setFloatingMessages((prev) => prev.filter((_, i) => i !== idx)),
        })}
        {showChat && (
          <div className="fixed pointer-events-auto z-50" style={{ bottom: '4%', left: '1%' }}>
            <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-white/20 flex flex-col w-56 max-w-[56vw]">
              <button
                type="button"
                onClick={() => setChatExpanded((e) => !e)}
                className="flex items-center justify-between px-2 py-1.5 text-xs text-gray-300 hover:text-white w-full text-left"
              >
                <span>💬 Chat</span>
                <span>{chatExpanded ? '▲' : '▼'}</span>
              </button>
              {chatExpanded ? (
                <div className="overflow-y-auto max-h-40 px-2 pb-1 space-y-1 border-t border-white/10">
                  {(state.chat ?? []).map((m, i) => (
                    <div key={i} className="text-xs leading-tight break-words pt-1">
                      <span className="text-blue-300 font-semibold">{m.sender}: </span>
                      <span className="text-gray-200">{m.message}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div className="px-2 pb-1 space-y-1 border-t border-white/10">
                  {(state.chat ?? []).slice(-2).map((m, i) => (
                    <div key={i} className="text-xs leading-tight break-words pt-1">
                      <span className="text-blue-300 font-semibold">{m.sender}: </span>
                      <span className="text-gray-200">{m.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1 p-1.5 border-t border-white/10">
                <input
                  type="text"
                  maxLength={200}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                  placeholder="Chat…"
                  className="flex-1 bg-black/60 text-white text-xs rounded px-2 py-1 border border-white/20 outline-none min-w-0"
                />
                <button
                  type="button"
                  disabled={!chatInput.trim()}
                  onClick={handleSendChat}
                  className="text-xs text-blue-300 hover:text-blue-100 disabled:opacity-40 px-1"
                >
                  ↵
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const showEnemy = !!enemy && (showEnemyAlways || !!state.boss_fight);

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
        <Link href="/" className={`${theme.backLinkClass} hover:underline font-medium drop-shadow-md`}>
          {backLabel}
        </Link>
      </div>

      {/* Round messages panel — top center */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-auto z-20">
        <div className={`bg-black/80 backdrop-blur-sm rounded-xl border ${theme.panelBorderClass} p-3 sm:p-4 text-white`}>
          <div className="flex justify-between items-center">
            <span className={`${theme.accentColorClass} font-semibold`}>
              Round <span key={state.round} className="round-zoom">{state.round}</span>
            </span>
            {secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
              <span className={`font-semibold ${secondsLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                {secondsLeft}s
              </span>
            )}
          </div>

          {messages.length > 0 && (
            <div className={`mt-2 border-t ${theme.msgBorderClass} pt-2`}>
              <div
                ref={messagesWrapRef}
                className={`overflow-hidden transition-all duration-300 ${messagesExpanded ? '' : 'max-h-[4.5rem]'}`}
              >
                <ul ref={messagesRef} className="text-sm space-y-1">
                  {messages.map((m, i) => (
                    <li key={i} className={theme.msgTextClass}>{Array.isArray(m) ? m.join(' ') : m}</li>
                  ))}
                </ul>
              </div>
              {(messagesOverflow || messagesExpanded) && (
                <button
                  type="button"
                  onClick={() => setMessagesExpanded((e) => !e)}
                  className={`mt-1 text-xs ${theme.showMoreClass} pointer-events-auto`}
                >
                  {messagesExpanded ? '▲ Show less' : '▼ Show more'}
                </button>
              )}
            </div>
          )}

          {gameOver && renderGameOver({ state, playerName, enemy, btn, replayVoted, replayLoading, onReplay: handleReplay })}
        </div>
      </div>

      {/* Player list — top right (optional) */}
      {showPlayerList && (
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
      )}

      {/* Enemy HP panel */}
      {showEnemy && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '28%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className={`bg-black/70 backdrop-blur-sm rounded-xl px-4 py-2 text-center border ${theme.enemyBorderClass}`}>
            <p className={`${theme.enemyNameClass} font-bold text-sm`}>{enemy!.name}</p>
            <p className="text-gray-300 text-xs">{enemy!.title}</p>
            <div className="mt-1 w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${theme.enemyHpBarClass} transition-all duration-500 rounded-full`}
                style={{ width: `${Math.max(0, (enemy!.hp / enemyMaxHp) * 100)}%` }}
              />
            </div>
            <p className={`${theme.enemyHpTextClass} text-xs mt-1`}>{Math.max(0, enemy!.hp)} / {enemyMaxHp} HP</p>
            {showActions && (
              <button
                type="button"
                onClick={() => handleAction('attack')}
                className={`${btn} text-sm backdrop-blur-sm shadow-lg mt-2 ${actionCue} ${
                  effectiveAction === 'attack'
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

      {/* RAID button */}
      {showActions && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '54%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <button
            type="button"
            onClick={() => handleAction('raid')}
            className={`${btn} text-sm backdrop-blur-sm shadow-lg ${actionCue} ${
              effectiveAction === 'raid'
                ? 'bg-purple-600 text-white border-purple-400'
                : 'bg-purple-900/80 text-purple-200 border-purple-700 hover:bg-purple-800/90'
            }`}
          >
            🏴 The Well
          </button>
        </div>
      )}

      {/* Extra elements slot (e.g. scene-specific buttons) */}
      {renderExtra?.({ gameOver, btn })}

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
            className={`${btn} text-sm backdrop-blur-sm shadow-lg ${actionCue} ${
              effectiveAction === 'defend'
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
              ${resourceCue}
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
              ${resourceCue}
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
                  ${cannotAffordAtk ? '' : resourceCue}
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

      {/* Deny target picker (optional) */}
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

      {/* Chat panel (optional) */}
      {showChat && (
        <div
          className="absolute pointer-events-auto"
          style={{ bottom: '4%', left: '1%' }}
        >
          <div className="bg-black/80 backdrop-blur-sm rounded-xl border border-white/20 flex flex-col w-56 max-w-[56vw]">
            <button
              type="button"
              onClick={() => setChatExpanded((e) => !e)}
              className="flex items-center justify-between px-2 py-1.5 text-xs text-gray-300 hover:text-white w-full text-left"
            >
              <span>💬 Chat</span>
              <span>{chatExpanded ? '▲' : '▼'}</span>
            </button>
            {chatExpanded ? (
              <div className="overflow-y-auto max-h-40 px-2 pb-1 space-y-1 border-t border-white/10">
                {(state?.chat ?? []).map((m, i) => (
                  <div key={i} className="text-xs leading-tight break-words pt-1">
                    <span className="text-blue-300 font-semibold">{m.sender}: </span>
                    <span className="text-gray-200">{m.message}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            ) : (
              <div className="px-2 pb-1 space-y-1 border-t border-white/10">
                {(state?.chat ?? []).slice(-2).map((m, i) => (
                  <div key={i} className="text-xs leading-tight break-words pt-1">
                    <span className="text-blue-300 font-semibold">{m.sender}: </span>
                    <span className="text-gray-200">{m.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1 p-1.5 border-t border-white/10">
              <input
                type="text"
                maxLength={200}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                placeholder="Chat…"
                className="flex-1 bg-black/60 text-white text-xs rounded px-2 py-1 border border-white/20 outline-none min-w-0"
              />
              <button
                type="button"
                disabled={!chatInput.trim()}
                onClick={handleSendChat}
                className="text-xs text-blue-300 hover:text-blue-100 disabled:opacity-40 px-1"
              >
                ↵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating messages (optional) */}
      {showFloatingMessages && floatingMessages.map((msg, idx) => (
        <FloatingMessage
          key={idx}
          message={msg}
          onDone={() => setFloatingMessages((prev) => prev.filter((_, i) => i !== idx))}
        />
      ))}
    </div>
  );
}
