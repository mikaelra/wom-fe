'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { getPlayerMessages } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { useLobbyGame } from '@/lib/useLobbyGame';
import { useRoundTimer } from '@/lib/useRoundTimer';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import type { LobbyState, Player } from '@/types/game';
import { playResourceSound } from '@/lib/sounds';
import { guideGlowClass, type GuideHighlights } from '@/lib/guideHighlights';
import ResourceCard from '@/components/ResourceCard';
import { useStagedResources } from '@/lib/useStagedResources';

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
  showChat?: boolean;
  enableRaidTimer?: boolean;
  /** When true the WELL/DEFEND/resource/nametag buttons are suppressed from the
   *  overlay — the 3D scene renders them anchored to the player model instead. */
  hidePlayerActionButtons?: boolean;
  /** When true the enemy HP panel is not rendered here — the 3D scene renders it
   *  anchored to the enemy model instead. */
  suppressEnemyPanel?: boolean;
  /** When true, incoming combat damage is peeled off the HP card per attack
   *  (synced to the 3D sword strikes via the resourceFx bus). */
  stageCombatDamage?: boolean;
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
  /** Welcome-tour highlights — glows the matching resource cards. */
  guideHighlight?: GuideHighlights;
};

export default function SceneOverlay({ lobbyId, onStateChange, config, renderPreGame, externalAction, onActionChange, guideHighlight }: SceneOverlayProps) {
  const {
    theme,
    backLabel,
    loadingText,
    enemyMaxHp,
    showEnemyAlways = false,
    showPlayerList = false,
    showDenyPicker = false,
    showChat = false,
    enableRaidTimer = false,
    hidePlayerActionButtons = false,
    suppressEnemyPanel = false,
    stageCombatDamage = false,
    renderGameOver,
    renderExtra,
  } = config;

  const [playerName, setPlayerName] = useState('');
  const [messages, setMessages] = useState<(string | string[])[]>([]);
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const pendingResourceRef = useRef('');
  const [denyTarget, setDenyTarget] = useState('');
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [messagesOverflow, setMessagesOverflow] = useState(false);
  const [messagesHidden, setMessagesHidden] = useState(false);
  const lastMessagesFlat = useRef('');
  const messagesRef = useRef<HTMLUListElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [unreadChat, setUnreadChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatExpandedRef = useRef(chatExpanded);
  useEffect(() => { chatExpandedRef.current = chatExpanded; }, [chatExpanded]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
    }
  }, []);

  useEffect(() => {
    setMessages([]);
  }, [lobbyId]);

  const { state } = useLobbyConnection(lobbyId, playerName, {
    onChatMessage: () => {
      if (!chatExpandedRef.current) setUnreadChat(true);
    },
    onError: (message) => {
      if (message !== 'Name taken') {
        alert(message);
      }
    },
  });

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const {
    round,
    myPlayer,
    isAlive,
    isAdmin,
    enemy,
    isPendingDenyChooser,
    eligibleDenyTargets,
    canAct,
    phase,
  } = useLobbyGame(state, playerName);
  const gameStarted = round > 0;
  const gameOver = phase === 'gameover';
  const isChoosingDeny = showDenyPicker && isPendingDenyChooser;
  const secondsLeft = useRoundTimer(state?.round_end_time);

  useEffect(() => {
    // Play the gain sound for the resource picked last round, then reset selection.
    if (pendingResourceRef.current && (state?.round ?? 0) > 1) {
      playResourceSound(pendingResourceRef.current);
      pendingResourceRef.current = '';
    }
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
          setMessages(newMsgs);
          setMessagesExpanded(false);
        }
      })
      .catch(() => {});
  }, [state?.round, lobbyId, playerName, state?.deny_target]);

  // Staged display values for the resource cards: holds back a Well reward at
  // round start and ticks it up when the reward lands (Phase 2). Falls back to
  // the player's real values for every other case.
  const stagedResources = useStagedResources(state, playerName, lobbyId, { stageCombat: stageCombatDamage });

  const { raidMins, raidSecs } = useBossfightCountdown(enableRaidTimer && isAlive);

  // Detect if messages overflow the collapsed container. We compare the
  // list's natural height against the fixed collapsed limit (the max-h-[4.5rem]
  // on the wrapper) so the result is correct whether the panel is currently
  // expanded or collapsed. Re-measure via ResizeObserver and once web fonts
  // settle, otherwise a stale snapshot can leave "Show more" showing when
  // there is nothing more to reveal.
  useEffect(() => {
    const list = messagesRef.current;
    if (!list) return;

    const measure = () => {
      const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const collapsedLimit = rootFont * 4.5; // matches max-h-[4.5rem]
      setMessagesOverflow(list.scrollHeight > collapsedLimit + 2);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [messages, messagesHidden]);

  const effectiveAction = externalAction !== undefined ? externalAction : action;

  const needsAction   = effectiveAction === '' && canAct;
  const needsResource = resource === '' && canAct;
  const isGoldWarn    = secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 5;
  const isRedWarn     = secondsLeft !== null && secondsLeft <= 5;
  const actionCue   = needsAction   ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '') : '';
  const resourceCue = needsResource ? (isRedWarn ? 'warn-blink-red' : isGoldWarn ? 'warn-blink-gold' : '') : '';

  const handleStartGame = () => {
    getSocket().emit('start_game', { lobby_id: lobbyId });
  };

  const handleAddDummy = () => {
    getSocket().emit('add_dummy', { lobby_id: lobbyId });
  };

  const handleKick = (targetName: string) => {
    getSocket().emit('kick_player', { lobby_id: lobbyId, target: targetName });
  };

  const handleResource = (resId: string) => {
    setResource(resId);
    pendingResourceRef.current = resId;
    getSocket().emit('submit_choice', { lobby_id: lobbyId, resource: resId, action: '' });
  };

  const handleAction = (act: string) => {
    setAction(act);
    onActionChange?.(act);
    getSocket().emit('submit_choice', {
      lobby_id: lobbyId,
      action: act,
      resource: '',
      target: act === 'attack' && enemy ? enemy.name : undefined,
    });
  };

  const handleDeny = () => {
    getSocket().emit('submit_deny_target', { lobby_id: lobbyId, target: denyTarget });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.chat]);

  useEffect(() => {
    if (!chatExpanded) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (chatRef.current && !chatRef.current.contains(e.target as Node)) {
        setChatExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [chatExpanded]);

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg || !playerName) return;
    getSocket().emit('send_message', { lobby_id: lobbyId, message: msg });
    setChatInput('');
  };

  const handleChatBlur = () => {
    closeTimerRef.current = setTimeout(() => setChatExpanded(false), 150);
  };

  const handleChatFocus = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };

  // HP / Coins / ATK cards. Rendered at the top-of-arena position when the
  // overlay owns the action UI, and pinned to the bottom of the screen when the
  // 3D scene owns the player buttons (lobby) — see render sites below.
  const renderResourceCards = (player: Player) => {
    const cannotAffordAtk = player.coins < player.attackDamage;
    // Displayed values may be staged (Well tick-up); affordability still uses
    // the player's real values.
    const shown = stagedResources ?? player;
    return (
      <>
        <ResourceCard
          value={shown.hp}
          label="HP"
          sublabel="❤ Get"
          valueClass="text-red-400"
          sublabelClass="text-red-400/70"
          anim={stagedResources?.hpAnim ?? 'bounce'}
          blockPulse={stagedResources?.hpBlockPulse ?? 0}
          disabled={!canAct}
          onClick={() => handleResource('gain_hp')}
          className={`${!canAct ? 'opacity-60 cursor-default' : 'cursor-pointer'}
            ${resourceCue} ${guideGlowClass(guideHighlight?.hp)}
            ${resource === 'gain_hp'
              ? 'bg-red-700/80 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              : 'bg-black/70 border-red-500/50 hover:bg-red-950/80 hover:border-red-400/80 hover:shadow-[0_0_6px_rgba(239,68,68,0.3)]'
            }`}
        />
        <ResourceCard
          value={shown.coins}
          label="Coins"
          sublabel="💰 Get"
          valueClass="text-yellow-400"
          sublabelClass="text-yellow-400/70"
          disabled={!canAct}
          onClick={() => handleResource('gain_coin')}
          className={`${!canAct ? 'opacity-60 cursor-default' : 'cursor-pointer'}
            ${resourceCue} ${guideGlowClass(guideHighlight?.coins)}
            ${resource === 'gain_coin'
              ? 'bg-yellow-700/80 border-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
              : 'bg-black/70 border-yellow-500/50 hover:bg-yellow-950/80 hover:border-yellow-400/80 hover:shadow-[0_0_6px_rgba(234,179,8,0.3)]'
            }`}
        />
        <ResourceCard
          value={shown.attackDamage}
          label="ATK"
          sublabel="⚔ Buy"
          valueClass="text-blue-400"
          sublabelClass="text-blue-400/70"
          disabled={!canAct || cannotAffordAtk}
          onClick={() => handleResource('gain_attack')}
          className={`relative overflow-hidden
            ${!canAct || cannotAffordAtk ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
            ${cannotAffordAtk ? '' : resourceCue} ${guideGlowClass(guideHighlight?.atk)}
            ${resource === 'gain_attack'
              ? 'bg-blue-700/80 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
              : 'bg-black/70 border-blue-500/50 hover:bg-blue-950/80 hover:border-blue-400/80 hover:shadow-[0_0_6px_rgba(59,130,246,0.3)]'
            }`}
          overlay={cannotAffordAtk && (
            <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="2" />
              </svg>
            </div>
          )}
        />
      </>
    );
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
        })}
        {showChat && (
          <div
            ref={chatRef}
            className="fixed pointer-events-auto z-50"
            style={{ bottom: '4%', left: '1%' }}
          >
            {chatExpanded && (
              <div className="absolute bottom-14 left-0 w-72 max-w-[85vw] bg-black/85 backdrop-blur-sm rounded-xl border border-white/20 flex flex-col mb-1">
                <div className="overflow-y-auto max-h-52 px-3 py-2 space-y-1">
                  {(state.chat ?? []).map((m, i) => (
                    <div key={i} className="text-xs leading-tight break-words">
                      <span className="text-blue-300 font-semibold">{m.sender}: </span>
                      <span className="text-gray-200">{m.message}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-1 p-2 border-t border-white/10">
                  <input
                    type="text"
                    maxLength={200}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                    onBlur={handleChatBlur}
                    onFocus={handleChatFocus}
                    placeholder="Chat…"
                    className="flex-1 bg-black/60 text-white text-xs rounded px-2 py-1 border border-white/20 outline-none min-w-0"
                    autoFocus
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
            )}
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => { setChatExpanded((e) => !e); setUnreadChat(false); }}
                className="w-11 h-11 rounded-full bg-blue-600/90 hover:bg-blue-500/90 flex items-center justify-center shadow-lg border border-white/20 text-lg"
                aria-label="Toggle chat"
              >
                💬
              </button>
              {unreadChat && (
                <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-orange-500 border border-white/60 pointer-events-none" />
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  const showEnemy = !suppressEnemyPanel && !!enemy && (showEnemyAlways || !!state.boss_fight);

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
              <span key={secondsLeft <= 10 ? 'red' : 'yellow'} className={`font-semibold ${secondsLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                {secondsLeft}s
              </span>
            )}
          </div>

          {messages.length > 0 && (
            <div className={`mt-2 border-t ${theme.msgBorderClass} pt-2`}>
              {!messagesHidden && (
                <div
                  className={`overflow-hidden transition-all duration-300 ${messagesExpanded ? '' : 'max-h-[4.5rem]'}`}
                >
                  <ul ref={messagesRef} className="text-sm space-y-1">
                    {messages.map((m, i) => (
                      <li key={i} className={theme.msgTextClass}>{Array.isArray(m) ? m.join(' ') : m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-1 flex justify-between items-center">
                {!messagesHidden && (messagesOverflow || messagesExpanded) ? (
                  <button
                    type="button"
                    onClick={() => setMessagesExpanded((e) => !e)}
                    className={`text-xs ${theme.showMoreClass} pointer-events-auto`}
                  >
                    {messagesExpanded ? '▲ Show less' : '▼ Show more'}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setMessagesHidden((h) => !h)}
                  className={`text-xs ${theme.showMoreClass} pointer-events-auto`}
                >
                  {messagesHidden ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>
          )}

          {gameOver && renderGameOver({ state, playerName, enemy, btn })}
        </div>
      </div>

      {/* Player list — bottom right (optional) */}
      {showPlayerList && (
        <div className="absolute bottom-4 right-4 pointer-events-auto z-20 max-w-[calc(50%-7.5rem)] sm:max-w-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-xl border border-white/20 p-2 sm:p-3 text-white text-sm">
            <ul className="space-y-1">
              {state.players.filter((p) => !p.spectator).map((p, i) => (
                <li key={`${p.name}-${i}`} className={`flex items-center gap-1 ${p.hp <= 0 ? 'opacity-40' : ''}`}>
                  {(state.winner === p.name || (!state.winner && state.wellwinner === p.name)) && <span className="shrink-0">👑</span>}
                  {p.hp <= 0 && <span className="shrink-0">☠️</span>}
                  {p.idle_rounds >= 2 && <span className="shrink-0">👻</span>}
                  <span className={`truncate min-w-0 ${p.name === playerName ? 'text-blue-300 font-bold' : 'text-gray-300'}`}>
                    {p.name}
                  </span>
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
            {canAct && (
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

      {/* WELL button (hidden when 3D scene owns player action UI) */}
      {!hidePlayerActionButtons && canAct && (
        <div
          className="absolute pointer-events-auto"
          style={{ top: '54%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <button
            type="button"
            onClick={() => handleAction('well')}
            className={`${btn} text-sm backdrop-blur-sm shadow-lg ${actionCue} ${
              effectiveAction === 'well'
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

      {/* Player nametag (hidden when 3D scene owns player action UI) */}
      {!hidePlayerActionButtons && myPlayer && (
        <div
          className="absolute"
          style={{ top: '59%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1 text-center border border-blue-500/30">
            <p className="text-blue-200 font-bold text-sm">
              {state.wellwinner === playerName ? '👑 ' : ''}{playerName}
            </p>
          </div>
        </div>
      )}

      {/* DEFEND button (hidden when 3D scene owns player action UI) */}
      {!hidePlayerActionButtons && canAct && (
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

      {/* Resource stat cards (hidden when 3D scene owns player action UI) */}
      {!hidePlayerActionButtons && myPlayer && !myPlayer.spectator && (
        <div
          className="absolute flex gap-2 pointer-events-auto"
          style={{ top: '72%', left: '50%', transform: 'translateX(-50%)' }}
        >
          {renderResourceCards(myPlayer)}
        </div>
      )}

      {/* Resource stat cards — bottom center. Used when the 3D scene owns the
          player action buttons (lobby): the cards live on this screen-fixed
          overlay layer so they stay put regardless of the camera. */}
      {hidePlayerActionButtons && myPlayer && !myPlayer.spectator && (
        <div className="absolute flex gap-2 pointer-events-auto z-20 bottom-6 left-1/2 -translate-x-1/2">
          {renderResourceCards(myPlayer)}
        </div>
      )}

      {/* Deny target picker (optional) */}
      {isChoosingDeny && (
        <div
          className="absolute pointer-events-auto z-30"
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
                {eligibleDenyTargets.map((p, i) => (
                  <option key={`${p.name}-${i}`} value={p.name}>{p.name}</option>
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
          ref={chatRef}
          className="fixed pointer-events-auto z-50"
          style={{ bottom: '4%', left: '1%' }}
        >
          {chatExpanded && (
            <div className="absolute bottom-14 left-0 w-72 max-w-[85vw] bg-black/85 backdrop-blur-sm rounded-xl border border-white/20 flex flex-col mb-1">
              <div className="overflow-y-auto max-h-52 px-3 py-2 space-y-1">
                {(state?.chat ?? []).map((m, i) => (
                  <div key={i} className="text-xs leading-tight break-words">
                    <span className="text-blue-300 font-semibold">{m.sender}: </span>
                    <span className="text-gray-200">{m.message}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-1 p-2 border-t border-white/10">
                <input
                  type="text"
                  maxLength={200}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                  onBlur={handleChatBlur}
                  onFocus={handleChatFocus}
                  placeholder="Chat…"
                  className="flex-1 bg-black/60 text-white text-xs rounded px-2 py-1 border border-white/20 outline-none min-w-0"
                  autoFocus
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
          )}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => { setChatExpanded((e) => !e); setUnreadChat(false); }}
              className="w-11 h-11 rounded-full bg-blue-600/90 hover:bg-blue-500/90 flex items-center justify-center shadow-lg border border-white/20 text-lg"
              aria-label="Toggle chat"
            >
              💬
            </button>
            {unreadChat && (
              <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-orange-500 border border-white/60 pointer-events-none" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
