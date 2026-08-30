'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { getSocket } from '@/lib/socket';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { useLobbyGame } from '@/lib/useLobbyGame';
import { useRoundTimer } from '@/lib/useRoundTimer';
import { useBossfightCountdown } from '@/lib/useBossfightCountdown';
import { useCountdown } from '@/lib/useCountdown';
import { useGameEvents } from '@/lib/useGameEvents';
import { buildCombatAnimationPlan } from '@/lib/combatAnimationPlan';
import type { LobbyState, Player } from '@/types/game';
import ResourceCard from '@/components/ResourceCard';
import { useStagedResources } from '@/lib/useStagedResources';
import { useToast } from '@/components/Toast';
import ActionImageButton from '@/components/lobby/ActionImageButton';
import { CITY_PATH } from '@/lib/cities';

export const btn = 'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

// Mirrors LobbyScene's DEATH_POSE_FALLBACK_MS -- if this round's events
// never arrive, don't hold the Game Over screen back indefinitely.
const GAMEOVER_REVEAL_FALLBACK_MS = 4000;

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
  bossfightMins: number | null;
  bossfightSecs: number | null;
  rankedSecondsLeft: number | null;
  btn: string;
  onStartGame: () => void;
  onAddDummy: (botType: string) => void;
  /** Whether the 3D scene's ambient pre-round camera orbit is on, and a way
   *  to flip it -- surfaced here so renderPreGame can put a toggle button
   *  in the overlay even though the camera itself lives outside this tree. */
  spinEnabled: boolean;
  onToggleSpin: () => void;
  /** Opens the Rules popup -- owned by the caller (see LobbyOverlay), same
   *  pattern as spinEnabled/onToggleSpin above. */
  onOpenRules: () => void;
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
  showChat?: boolean;
  enableBossfightTimer?: boolean;
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
  /** Called whenever the player picks a resource (gain_hp/gain_coin/
   *  gain_attack), so LobbyScene can play the matching flask/coin/sword
   *  rise-and-absorb effect once the round resolves -- see ResourceGainEffect. */
  onResourceChange?: (resource: string) => void;
  /** Passed straight through to renderPreGame's opts -- see PreGameRenderOpts. */
  spinEnabled?: boolean;
  onToggleSpin?: () => void;
  onOpenRules?: () => void;
  /** In-round camera drag/zoom state, lifted to the page the same way
   *  spinEnabled is -- drives the Reset Camera button shown once the player
   *  has actually moved the camera during an active round (see
   *  CameraFlyIn/LobbyScene). Unlike spinEnabled/onOpenRules this isn't
   *  part of PreGameRenderOpts -- the button only makes sense once
   *  gameStarted, in this component's own in-game JSX, not renderPreGame. */
  cameraMoved?: boolean;
  onResetCamera?: () => void;
  /** Fired whenever this round's "is the Game Over reveal showing" gate
   *  (gameOver && revealedRound === state.round) changes -- see the comment
   *  above `revealedRound`. Lets callers hold their own post-game UI (wheel
   *  claim nudge, etc.) back until the same moment the Game Over text
   *  itself appears, instead of reacting to the raw state.gameover flag,
   *  which flips true the instant the server broadcast arrives -- well
   *  before the eliminating kill's animation has played. */
  onGameOverRevealed?: (revealed: boolean) => void;
  /** Poisoned Dagger (instakill Well reward) active cue for the ATK
   *  resource card -- computed by LobbyScene (a sibling render tree; see
   *  its own onInstakillActiveChange), passed down instead of re-derived
   *  here so the card and the 3D scene's cues stay in lockstep. */
  instakillActive?: boolean;
};

export default function SceneOverlay({ lobbyId, onStateChange, config, renderPreGame, externalAction, onActionChange, onResourceChange, spinEnabled = true, onToggleSpin, onOpenRules, cameraMoved, onResetCamera, onGameOverRevealed, instakillActive }: SceneOverlayProps) {
  const {
    theme,
    backLabel,
    loadingText,
    enemyMaxHp,
    showEnemyAlways = false,
    showPlayerList = false,
    showChat = false,
    enableBossfightTimer = false,
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
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [messagesOverflow, setMessagesOverflow] = useState(false);
  const [messagesHidden, setMessagesHidden] = useState(false);
  const [playerListCollapsed, setPlayerListCollapsed] = useState(false);
  const messagesRef = useRef<HTMLUListElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [unreadChat, setUnreadChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatExpandedRef = useRef(chatExpanded);
  useEffect(() => { chatExpandedRef.current = chatExpanded; }, [chatExpanded]);
  const { showError } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') || '');
    }
  }, []);

  useEffect(() => {
    setMessages([]);
  }, [lobbyId]);

  const { state, connectionStatus } = useLobbyConnection(lobbyId, playerName, {
    onChatMessage: () => {
      if (!chatExpandedRef.current) setUnreadChat(true);
    },
    onError: (message) => {
      if (message !== 'Name taken') {
        showError(message);
      }
    },
  });
  // useLobbyConnection already tracks this (a real socket 'disconnect'
  // handler) but it went completely unused here -- state simply keeps its
  // last-known value forever on a lost connection (e.g. the backend
  // process itself going away, which loses all in-memory lobby state with
  // no possible recovery), so the player would otherwise sit on a frozen,
  // stale screen with zero indication anything is wrong. Reactive, not a
  // one-way trap: a transient network blip that reconnects on its own
  // clears this again once connectionStatus flips back to 'connected'.
  const connectionLost = connectionStatus === 'disconnected';

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const {
    round,
    myPlayer,
    isAlive,
    isAdmin,
    enemy,
    isDenied,
    canAct,
    phase,
  } = useLobbyGame(state, playerName);
  const gameStarted = round > 0;
  const gameOver = phase === 'gameover';
  const secondsLeft = useRoundTimer(state?.round_end_time);

  // Kicking (handle_kick_player, wom-be) is the only thing that ever
  // removes an entry from state.players outright -- a disconnect just
  // unbinds the socket, it doesn't touch the players list. So "I was a
  // member, and now I'm not" can only mean I was kicked; previously this
  // went completely unnoticed (myPlayer just silently became undefined
  // and the stale pre-kick UI kept rendering forever).
  const wasEverMyPlayerRef = useRef(false);
  useEffect(() => {
    if (myPlayer) wasEverMyPlayerRef.current = true;
  }, [myPlayer]);
  const wasKicked = wasEverMyPlayerRef.current && !myPlayer;

  useEffect(() => {
    setAction('');
    setResource('');
    setMessagesExpanded(false);
  }, [state?.round]);

  const gameEvents = useGameEvents(lobbyId, playerName, state?.round, state?.deny_target);

  // Which round's messages + Game Over screen have actually been revealed.
  // Ordinary rounds reveal the instant their events arrive (unchanged from
  // before); a round that ends the game holds off until the kill animation
  // that caused it (the sword strike, kill-fire glow, dead-pose reveal --
  // timed identically to LobbyScene's own buildCombatAnimationPlan, just
  // re-run here with placeholder positions since only the *timing* matters
  // off the 3D scene) has actually finished, instead of "Game Over" and the
  // kill message flashing up before the animation even starts.
  const [revealedRound, setRevealedRound] = useState<number | null>(null);

  useEffect(() => {
    if (!state || !gameEvents || gameEvents.round !== state.round) return;
    // Already handled this round -- gated on the round number itself (not
    // message content) since a round can legitimately have empty/repeated
    // content and still need its one-time reveal to fire.
    if (revealedRound === gameEvents.round) return;

    const newMsgs = gameEvents.messages ?? [];

    const reveal = () => {
      setMessages(newMsgs);
      setMessagesExpanded(false);
      setRevealedRound(gameEvents.round);
    };

    if (!state.gameover) {
      reveal();
      return;
    }

    const myNowHp = myPlayer?.hp ?? 1;
    const wonWell = state.wellwinner === playerName;
    // Positions don't affect batch *timing*, only whether an outgoing strike
    // is added at all (skipped when the target's position is unknown) --
    // a placeholder for every real player in the lobby keeps that check a
    // no-op here, so the duration matches what LobbyScene will actually play.
    const placeholderPosMap = new Map(state.players.map((p) => [p.name, [0, 0, 0] as [number, number, number]]));
    const plan = buildCombatAnimationPlan({
      events: gameEvents.events,
      playerName,
      posMap: placeholderPosMap,
      myNowHp,
      wonWell,
    });
    const holdMs = plan.length ? Math.max(...plan.map((b) => b.delayMs)) : 0;
    const timer = setTimeout(reveal, holdMs);
    return () => clearTimeout(timer);
  }, [gameEvents, state, playerName, myPlayer?.hp, revealedRound]);

  // Safety net: the hold above only ever starts once this round's events have
  // actually arrived (a second fetch, separate from `state`). If that fetch
  // is slow or fails, don't leave the player stuck without a Game Over
  // screen forever -- reveal anyway after a short grace window.
  useEffect(() => {
    if (!gameOver || revealedRound === (state?.round ?? null)) return;
    const fallback = setTimeout(() => setRevealedRound(state?.round ?? null), GAMEOVER_REVEAL_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [gameOver, state?.round, revealedRound]);

  const gameOverRevealed = gameOver && revealedRound === (state?.round ?? null);
  useEffect(() => {
    onGameOverRevealed?.(gameOverRevealed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOverRevealed]);

  // Staged display values for the resource cards: holds back a Well reward at
  // round start and ticks it up when the reward lands (Phase 2). Falls back to
  // the player's real values for every other case.
  const stagedResources = useStagedResources(state, playerName, gameEvents, { stageCombat: stageCombatDamage });

  const { bossfightMins, bossfightSecs } = useBossfightCountdown(enableBossfightTimer && isAlive);
  const rankedSecondsLeft = useCountdown(state?.ranked_countdown_deadline);

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

  // Reminder bubble stacked above the resource cards. Only shows up once
  // the same 10s/5s warning window as the blinking buttons kicks in (not
  // the instant the round starts), and blinks along with it. Rendered at
  // both resource-card sites (2D overlay + 3D-lobby-owned layout) so it
  // shows wherever the cards themselves currently show. Vanishes the
  // moment the player picks a resource.
  const resourceReminder = resourceCue && (
    <div className={`bg-black/80 backdrop-blur-sm rounded-xl border ${theme.panelBorderClass} p-3 text-white text-sm text-center max-w-xs ${resourceCue}`}>
      You must choose a resource: Get HP, Get Coin or Upgrade Attack.
    </div>
  );

  // Shown once the player has actually dragged/scrolled the in-round camera
  // (cameraMoved, lifted to the page -- see CameraFlyIn/usePanOffset's
  // onUserAdjust) so it doesn't clutter the screen for anyone who never
  // touches it. Same visual treatment as the pre-game "Camera Spin" toggle
  // for a consistent camera-control affordance. Sits directly above the
  // resource cards, in both render sites, same pattern as resourceReminder.
  const resetCameraButton = cameraMoved && onResetCamera && (
    <button
      type="button"
      onClick={onResetCamera}
      className="text-xs px-2 py-1 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-white/80 transition-colors pointer-events-auto"
    >
      Reset Camera
    </button>
  );

  const handleStartGame = () => {
    getSocket().emit('start_game', { lobby_id: lobbyId });
  };

  const handleAddDummy = (botType: string) => {
    getSocket().emit('add_dummy', { lobby_id: lobbyId, bot_type: botType });
  };

  const handleResource = (resId: string) => {
    // The resource cards stay looking (and natively) clickable a beat past
    // the real death reveal (see renderResourceCards' canActLook) so the 3D
    // death animation gets to play before the UI gives it away -- guard the
    // actual submission on the real, immediate canAct so a click landing in
    // that window can't submit for an already-dead player.
    if (!canAct) return;
    setResource(resId);
    onResourceChange?.(resId);
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
    // canAct flips false the instant the server reports hp<=0 -- immediately
    // greying out/disabling these cards, well before the 3D death animation
    // (sword strike, kill-fire, dead-pose reveal) has even started, which
    // gives the death away early. shown.hp is the *staged* display value
    // (see useStagedResources) -- while it's still peeling down in sync
    // with the strike animation and hasn't visibly reached 0 yet, keep the
    // cards looking (and staying) interactive. Deliberately does NOT check
    // isAlive or gameOver here -- both flip in the very same tick as the
    // death itself (a fatal blow that also ends the match flips gameOver
    // at once too), so gating on them reintroduces the exact instant-reveal
    // bug this exists to fix. denied/spectator/pre-round dimming (unrelated
    // to death) is untouched. disabled= below follows this too, not the raw
    // canAct -- some browsers dim disabled form controls regardless of
    // custom classes, and handleResource itself guards on the real canAct
    // so a click during this window can't actually submit anything.
    const canActLook = canAct || (!isDenied && !player.spectator && round > 0 && shown.hp > 0);
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
          disabled={!canActLook}
          onClick={() => handleResource('gain_hp')}
          className={`${!canActLook ? 'opacity-60 cursor-default' : 'cursor-pointer'}
            ${resourceCue}
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
          disabled={!canActLook}
          onClick={() => handleResource('gain_coin')}
          className={`${!canActLook ? 'opacity-60 cursor-default' : 'cursor-pointer'}
            ${resourceCue}
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
          disabled={!canActLook || cannotAffordAtk}
          onClick={() => handleResource('gain_attack')}
          className={`relative overflow-hidden ${instakillActive ? 'instakill-flame' : ''}
            ${!canActLook || cannotAffordAtk ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
            ${cannotAffordAtk ? '' : resourceCue}
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

  if (connectionLost) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme.loadingBgClass}`}>
        <p className={`${theme.loadingTextClass} text-lg font-semibold`}>
          Connection lost. Please refresh.
        </p>
      </div>
    );
  }

  if (wasKicked) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${theme.loadingBgClass}`}>
        <p className={`${theme.loadingTextClass} text-lg font-semibold`}>
          You were removed from this lobby.
        </p>
        {/* Home, and beside it the city -- as a pair, so the column layout
            of this screen does not stack them one above the other. */}
        <span className="inline-flex items-center gap-3">
          <Link href="/" className="text-blue-400 no-underline text-2xl" aria-label="Back to Home">
            🌍
          </Link>
          <Link href={CITY_PATH} className="text-blue-400 no-underline text-2xl" aria-label="Go to the city">
            🏛️
          </Link>
        </span>
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
          bossfightMins,
          bossfightSecs,
          rankedSecondsLeft,
          btn,
          onStartGame: handleStartGame,
          onAddDummy: handleAddDummy,
          spinEnabled,
          onToggleSpin: onToggleSpin ?? (() => {}),
          onOpenRules: onOpenRules ?? (() => {}),
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

      {/* Back button, and beside it the way into the city. The globe is the
          theme's own `backLabel` (a string, so it cannot carry a second link
          of its own) -- hence the temple being spelled out here rather than
          coming through the theme with it. */}
      <div className="absolute top-4 left-4 pointer-events-auto z-20 flex items-center gap-2">
        <Link href="/" className={`${theme.backLinkClass} no-underline text-2xl drop-shadow-md`} aria-label="Back to Home">
          {backLabel}
        </Link>
        <Link href={CITY_PATH} className={`${theme.backLinkClass} no-underline text-2xl drop-shadow-md`} aria-label="Go to the city">
          🏛️
        </Link>
      </div>

      {/* Missing-action reminder — top left, below the back button and the
          music/SFX toggle row (LobbyOverlay renders that at top-16 left-4).
          Only shows up once the same 10s/5s warning window as the blinking
          buttons kicks in, and blinks along with it. Vanishes the moment
          the player picks attack/well/defend. */}
      {actionCue && (
        <div className="absolute top-28 left-4 w-1/2 max-w-xs px-4 z-20">
          <div className={`bg-black/80 backdrop-blur-sm rounded-xl border ${theme.panelBorderClass} p-3 text-white text-sm ${actionCue}`}>
            You must choose an action: Attack someone, Well or Defend.
          </div>
        </div>
      )}

      {/* Round messages panel — top right, half width */}
      <div className="absolute top-12 right-4 w-1/2 max-w-2xl px-4 pointer-events-auto z-20">
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

          {gameOverRevealed && renderGameOver({ state, playerName, enemy, btn })}
        </div>
      </div>

      {/* Player list — bottom right (optional). Collapsible: a full/near-full
          lobby can run quite tall, especially on a phone, so clicking the
          header hides everything but the count. */}
      {showPlayerList && (
        <div className="absolute bottom-4 right-4 pointer-events-auto z-20 max-w-[calc(50%-7.5rem)] sm:max-w-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-xl border border-white/20 p-2 sm:p-3 text-white text-sm">
            <button
              type="button"
              onClick={() => setPlayerListCollapsed((c) => !c)}
              className="flex items-center gap-2 w-full text-left text-xs text-gray-300 font-semibold cursor-pointer"
            >
              <span>Players ({state.players.filter((p) => !p.spectator).length})</span>
              <span className="text-gray-400">{playerListCollapsed ? '▸' : '▾'}</span>
            </button>
            {!playerListCollapsed && (
              <ul className="space-y-1 mt-1">
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
            )}
            {/* Watchers, under their own heading below the players. The
                list has always filtered them out of the player COUNT; until
                now it dropped them entirely, so someone spectating could
                not see they were in the lobby at all. */}
            {!playerListCollapsed && state.players.some((p) => p.spectator) && (
              <>
                <p className="text-xs text-gray-400 font-semibold mt-2">
                  {state.players.filter((p) => p.spectator).length === 1 ? 'Spectator' : 'Spectators'}
                  {' '}({state.players.filter((p) => p.spectator).length})
                </p>
                <ul className="space-y-1 mt-1">
                  {state.players.filter((p) => p.spectator).map((p, i) => (
                    <li key={`spectator-${p.name}-${i}`} className="flex items-center gap-1 opacity-60">
                      <span className="shrink-0" title="Spectator">👁</span>
                      <span className={`truncate min-w-0 ${p.name === playerName ? 'text-blue-300 font-bold' : 'text-gray-300'}`}>
                        {p.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
              <ActionImageButton
                src="/images/buttons/attack-ld.png"
                alt="Attack"
                onClick={() => handleAction('attack')}
                selected={effectiveAction === 'attack'}
                glowColor="rgba(239,68,68,0.7)"
                width={150}
                className={`mt-2 ${actionCue}`}
              />
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
          <ActionImageButton
            src="/images/buttons/well-ld.png"
            alt="The Well"
            onClick={() => handleAction('well')}
            selected={effectiveAction === 'well'}
            glowColor="rgba(167,139,250,0.7)"
            width={150}
            className={actionCue}
          />
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
          <ActionImageButton
            src="/images/buttons/defend-ld.png"
            alt="Defend"
            onClick={() => handleAction('defend')}
            selected={effectiveAction === 'defend'}
            glowColor="rgba(59,130,246,0.7)"
            width={150}
            className={actionCue}
          />
        </div>
      )}

      {/* Resource stat cards (hidden when 3D scene owns player action UI) */}
      {!hidePlayerActionButtons && myPlayer && !myPlayer.spectator && (
        <div
          className="absolute flex flex-col items-center gap-2 pointer-events-auto"
          style={{ top: '72%', left: '50%', transform: 'translateX(-50%)' }}
        >
          {resourceReminder}
          {resetCameraButton}
          <div className="flex gap-2">{renderResourceCards(myPlayer)}</div>
        </div>
      )}

      {/* Resource stat cards — bottom center. Used when the 3D scene owns the
          player action buttons (lobby): the cards live on this screen-fixed
          overlay layer so they stay put regardless of the camera. */}
      {hidePlayerActionButtons && myPlayer && !myPlayer.spectator && (
        <div className="absolute flex flex-col items-center gap-2 pointer-events-auto z-20 bottom-6 left-1/2 -translate-x-1/2">
          {resourceReminder}
          {resetCameraButton}
          <div className="flex gap-2">{renderResourceCards(myPlayer)}</div>
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
