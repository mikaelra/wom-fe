'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import FloatingMessage from '@/components/text/FloatingMessage';
import BossSignupNudge from '@/components/BossSignupNudge';
import WheelClaimNudge from '@/components/WheelClaimNudge';
import ArtifactClaimNudge from '@/components/ArtifactClaimNudge';
import ChatMessageActions, { MutedMark, type ChatTarget } from '@/components/chat/ChatMessageActions';
import MusicToggleButton from '@/components/audio/MusicToggleButton';
import SfxToggleButton from '@/components/audio/SfxToggleButton';
import { BOT_TYPES } from '@/lib/botTypes';
import { CITY_PATH, RANKED_CITY_PATH } from '@/lib/cities';
import { RELIC_BADGE_EMOJI, RELIC_SELECT_CAPTION } from '@/lib/relics';
import { useToast } from '@/components/Toast';
import { getPlayerRelics } from '@/lib/api';
import { getMutedPlayers, hideMuted, useMutedPlayers } from '@/lib/chatMute';
import { useChatText } from '@/lib/chatFilter';
import { isLobbyGoneError } from '@/lib/lobbyErrors';
import { BATTLE_MUSIC, playMusic, PRE_LOBBY_MUSIC } from '@/lib/music';
import { getSocket } from '@/lib/socket';
import { useGameEvents } from '@/lib/useGameEvents';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { wellRewardFromEvents } from '@/lib/gameEvents';
import { roundHits, type Hit } from '@/lib/roundHits';
import { useWideScreen } from '@/lib/useWideScreen';
import ResourceCard from '@/components/ResourceCard';
import { lobbyTitle } from '@/lib/lobbyTitle';
import PixelTitle from '@/components/text/PixelTitle';
import LoadingState from '@/components/loading/LoadingState';
import { useLobbyGame } from '@/lib/useLobbyGame';
import { playerMark, shownPlayerName } from '@/lib/playerThumbnail';
import type { Player, Relic } from '@/types/game';
import { WheelText } from '@/components/WheelIcon';

// A match as text (Settings -> Graphics -> Text mode, src/lib/textMode.ts):
// Tjuvpakk's lobby page, kept as it was, on World of Mythos's socket. The
// game state arrives over the socket (useLobbyConnection) and every choice
// goes back over it, the same messages the 3D scene sends; each round's own
// messages are fetched once per round (useGameEvents). What World of Mythos
// added since Tjuvpakk -- bot types, relics, ranked countdowns, chat, the
// Wheel/artifact/relic prizes -- is here too, in the same style.

// Tjuvpakk's choice buttons, dark, and narrow enough that a section's three
// sit on one line on a phone (they share the row: flex 1).
const choiceStyle = (selected: boolean) => ({
  flex: 1,
  padding: '6px 4px',
  border: '2px solid #9ca3af',
  borderRadius: '5px',
  backgroundColor: selected ? 'crimson' : '#374151',
  color: 'white',
  fontWeight: 'bold' as const,
  fontSize: '15px',
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
});

const bigButton = (backgroundColor: string) => ({
  padding: '10px 20px',
  margin: '6px',
  border: '2px solid #9ca3af',
  borderRadius: '8px',
  backgroundColor,
  color: 'white',
  fontWeight: 'bold' as const,
  cursor: 'pointer',
});

const homeButton =
  'bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold no-underline hover:bg-white/20 transition-colors';

// How long each of the round's hit numbers shows, blinking once, and how
// long a chat bubble stays (the 3D game's, LobbyScene's
// CHAT_BUBBLE_DURATION_MS).
const HIT_SHOWN_MS = 1000;
// The 3D game's combat number colours (components/lobby/DamageNumberEffect),
// a shade lighter to read on the dark lobby.
const HIT_RED = '#ef4444';
const HIT_BLUE = '#3b82f6';
const CHAT_BUBBLE_MS = 4000;

// The actions as words in their colours (Mikael, 2026-10-11): Attack red,
// The Well purple, Defend blue -- the colours the 3D game's buttons have.
// Each is framed in its colour; the chosen one is filled with it, the word
// dark.
const ATTACK_COLOR = '#ef4444';
const WELL_COLOR = '#c084fc';
const DEFEND_COLOR = '#60a5fa';

function ActionWord({
  word,
  label,
  color,
  selected,
  onClick,
  small = false,
  className = '',
}: {
  word: string;
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`font-extrabold uppercase tracking-wider rounded-lg border-2 cursor-pointer transition-colors ${
        small ? 'text-sm px-2 py-0.5' : 'text-xl px-5 py-2'
      } ${className}`}
      style={{
        // Always framed in its colour; chosen, the colours swap inside.
        color: selected ? '#070b15' : color,
        borderColor: color,
        backgroundColor: selected ? color : 'transparent',
      }}
    >
      {word}
    </button>
  );
}

const card = 'w-full mb-4 bg-gray-900 border border-white/10 p-4 rounded-xl';

/** Whole seconds until an ISO time, never below zero; null without one. */
function useSecondsUntil(iso: string | null | undefined): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) {
      setSeconds(null);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [iso]);
  return seconds;
}

/** "Waiting for game to start" with its dots counting up -- none, one,
 *  two, three -- and round again; held in a fixed-width slot so the words
 *  don't shift as they change. */
function WaitingForStart() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(interval);
  }, []);
  return (
    <>
      Waiting for game to start<span className="inline-block w-[1.5ch] text-left">{'.'.repeat(dots)}</span>
    </>
  );
}

/** Before a player's name, the size of an emoji: their skin's thumbnail,
 *  or a bot's emoji (lib/playerThumbnail.ts). */
function PlayerThumbnail({ player }: { player: Player }) {
  const [missing, setMissing] = useState(false);
  const mark = playerMark(player);
  if ('emoji' in mark) return <span>{mark.emoji}</span>;
  if (missing) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small fixed set of local static assets
    <img
      src={mark.url}
      alt=""
      width={20}
      height={20}
      className="inline-block w-5 h-5 rounded-full object-cover"
      onError={() => setMissing(true)}
    />
  );
}

/**
 * "Add Bot", which opens into one button per bot type -- picking one adds
 * it and closes the list; so does any scroll.
 */
function AddBotMenu({ onAdd }: { onAdd: (botType: string) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Capture: the page scrolls inside the lobby page's own container.
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [open]);

  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={bigButton('gray')}>
        🤖 Add Bot
      </button>
      {open && (
        <div className="flex flex-wrap justify-center">
          {BOT_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
              style={{ ...bigButton('#4b5563'), padding: '6px 12px' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Picking relics to bring into the match, folded away under its heading
 * until opened -- and folded away again once scrolled out of sight, so it
 * takes no room on a phone screen when not in use.
 */
function RelicPicker({
  relics,
  selectedIds,
  onToggle,
}: {
  relics: Relic[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!open || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setOpen(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const chosen = relics.filter((r) => selectedIds.includes(Number(r.id)));

  return (
    <div ref={ref} className={`${card} !p-4`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between font-semibold text-xl text-gray-100 bg-transparent border-none cursor-pointer"
      >
        <span>
          Relics {chosen.map((r) => RELIC_BADGE_EMOJI[r.name]).join(' ')}
        </span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-3 mt-4">
          {relics.map((r) => {
            const id = Number(r.id);
            return (
              <button key={id} type="button" onClick={() => onToggle(id)} style={choiceStyle(selectedIds.includes(id))}>
                {RELIC_BADGE_EMOJI[r.name]} {RELIC_SELECT_CAPTION[r.name]} (×{r.count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function flatten(messages: (string | string[])[]): string {
  return messages.map((m) => (Array.isArray(m) ? m.join(' ') : m)).join('\n');
}

export default function TextLobby({
  lobbyId,
  playerName,
  onLobbyGone,
}: {
  lobbyId: string;
  playerName: string;
  onLobbyGone: () => void;
}) {
  const { showError } = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(false);
  // On a PC the chat sits open beside the round messages (below).
  const wide = useWideScreen();
  const chatShown = chatOpen || wide;
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatShown;
  const { state, connectionStatus } = useLobbyConnection(lobbyId, playerName, {
    // A message while the chat is closed lights the button's dot (not for
    // someone muted), as in the 3D game.
    onChatMessage: (msg) => {
      if (!chatOpenRef.current && !getMutedPlayers().has(msg.sender)) setUnreadChat(true);
    },
    onError: (message) => {
      // Same as the 3D overlay: a lobby that is gone (most often a backend
      // restart) walks the player out without a word.
      if (isLobbyGoneError(message)) {
        onLobbyGone();
        return;
      }
      if (message !== 'Name taken') showError(message);
    },
  });
  const game = useLobbyGame(state, playerName);
  const { myPlayer, phase, isAdmin, isAlive, isDenied, isPendingDenyChooser, eligibleDenyTargets, enemy } = game;
  const round = state?.round ?? 0;
  const gameOver = phase === 'gameover';
  const gameStarted = round > 0;

  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [target, setTarget] = useState('');
  const [denyTarget, setDenyTarget] = useState('');
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const dismiss = (which: string) => () => setDismissed((d) => ({ ...d, [which]: true }));

  // A new round starts with nothing chosen.
  useEffect(() => {
    setDenyTarget('');
    setTarget('');
    setAction('');
    setResource('');
  }, [round]);

  const battleStarted = phase === 'playing' || phase === 'gameover';
  useEffect(() => {
    playMusic(battleStarted ? BATTLE_MUSIC : PRE_LOBBY_MUSIC);
  }, [battleStarted]);

  // This round's messages: shown big for a moment, then listed.
  const events = useGameEvents(lobbyId, playerName, round, state?.deny_target);
  const [messages, setMessages] = useState<(string | string[])[]>([]);
  // Each bubble with its own id: keyed by position, a bubble that finished
  // would hand its finished state to the next one sliding into its place,
  // which then never finished either -- the list stayed hidden behind it.
  const [floatingMessages, setFloatingMessages] = useState<
    { id: number; text: string; list: (string | string[])[] }[]
  >([]);
  const nextFloatId = useRef(0);
  // The same messages fetched again (a deny re-fetches the round; dev
  // fetches everything twice) are not news: one bubble per new text.
  const lastFloated = useRef('');
  useEffect(() => {
    if (!events) return;
    const next = flatten(events.messages);
    if (!next || next === lastFloated.current) return;
    lastFloated.current = next;
    // On a PC the list is always in view beside the rest: straight in, no
    // bubble (Mikael, 2026-10-11).
    if (wide) {
      setMessages(events.messages);
      return;
    }
    const id = nextFloatId.current++;
    setFloatingMessages((prev) => [...prev, { id, text: next, list: events.messages }]);
  }, [events, wide]);

  const settle = (id: number) => {
    const done = floatingMessages.find((m) => m.id === id);
    if (done) setMessages(done.list);
    setFloatingMessages((prev) => prev.filter((m) => m.id !== id));
  };

  // The Well's "info" reward: every other player's stats as they stood the
  // round you won it, shown before their names that round in their colours,
  // greyed the round after, then gone -- as the 3D game badges them
  // (LobbyScene's infoReveal).
  const [infoReveal, setInfoReveal] = useState<{
    round: number;
    stats: Map<string, { hp: number; coins: number; attackDamage: number }>;
  } | null>(null);
  useEffect(() => {
    if (!events || !state || events.round !== state.round) return;
    if (!wellRewardFromEvents(events.events).some((c) => c.type === 'info')) return;
    setInfoReveal((prev) => {
      // Only ever forward: the same round fetched again keeps its snapshot.
      if (prev && events.round <= prev.round) return prev;
      const stats = new Map<string, { hp: number; coins: number; attackDamage: number }>();
      for (const p of state.players) {
        if (p.name !== playerName) stats.set(p.name, { hp: p.hp, coins: p.coins, attackDamage: p.attackDamage });
      }
      return { round: events.round, stats };
    });
  }, [events, state, playerName]);
  const infoFor = (p: { name: string; hp: number }) => {
    if (!infoReveal || p.hp <= 0 || gameOver) return null;
    const s = infoReveal.stats.get(p.name);
    if (!s) return null;
    if (infoReveal.round === round) return { ...s, stale: false };
    if (infoReveal.round === round - 1) return { ...s, stale: true };
    return null;
  };

  const muted = useMutedPlayers();
  const chatText = useChatText();

  // The round's attacks as numbers by the players they landed on, for a
  // few seconds as the round's results come in (lib/roundHits.ts) -- in
  // the same place as the info reward, when that isn't there.
  const [hits, setHits] = useState<Map<string, Hit[]> | null>(null);
  const hitsRound = useRef(-1);
  useEffect(() => {
    if (!events || !state || events.round !== state.round || hitsRound.current === events.round) return;
    hitsRound.current = events.round;
    const found = roundHits(events.events, playerName);
    if (found.size) setHits(found);
  }, [events, state, playerName]);
  // One hit at a time, a second each (Mikael, 2026-10-12): someone hit
  // three times shows their three numbers in turn, then nothing.
  const [hitStep, setHitStep] = useState(0);
  useEffect(() => {
    if (!hits) return;
    setHitStep(0);
    const steps = Math.max(...[...hits.values()].map((h) => h.length));
    let step = 0;
    const t = setInterval(() => {
      step += 1;
      if (step >= steps) {
        clearInterval(t);
        setHits(null);
      } else {
        setHitStep(step);
      }
    }, HIT_SHOWN_MS);
    return () => clearInterval(t);
  }, [hits]);

  // A chat bubble beside the name of whoever just said something, for as
  // long as the 3D game's over their head (LobbyScene's chatBubbles).
  const [bubbleTick, setBubbleTick] = useState(0);
  const bubbles = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, string>();
    for (const msg of state?.chat ?? []) {
      if (muted.has(msg.sender)) continue;
      if (now - new Date(msg.timestamp).getTime() < CHAT_BUBBLE_MS) map.set(msg.sender, chatText(msg.message));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bubbleTick re-reads the clock
  }, [state?.chat, bubbleTick, muted, chatText]);
  useEffect(() => {
    const now = Date.now();
    let soonest = Infinity;
    for (const msg of state?.chat ?? []) {
      const expiry = new Date(msg.timestamp).getTime() + CHAT_BUBBLE_MS;
      if (expiry > now) soonest = Math.min(soonest, expiry);
    }
    if (!Number.isFinite(soonest)) return;
    const t = setTimeout(() => setBubbleTick((n) => n + 1), soonest - now + 50);
    return () => clearTimeout(t);
  }, [state?.chat, bubbleTick]);

  const secondsLeft = useSecondsUntil(state?.round_end_time);
  const bossStartsIn = useSecondsUntil(state?.boss_fight && !gameStarted ? state.start_time : null);
  const rankedDeadline = state?.ranked
    ? state.ranked_countdown_deadline
    : state?.ai_ranked
      ? state.ai_ranked_countdown_deadline
      : null;
  const rankedStartsIn = useSecondsUntil(gameStarted ? null : rankedDeadline);

  // Relics a player can bring into the match (the ones that do something
  // in battle: see RelicSelectionPopover).
  const [relics, setRelics] = useState<Relic[]>([]);
  useEffect(() => {
    if (!playerName) return;
    getPlayerRelics(playerName).then((data) => setRelics(data.relics.filter((r) => r.name in RELIC_SELECT_CAPTION)));
  }, [playerName]);

  const [chatInput, setChatInput] = useState('');
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  // The newest message in sight: on opening, and as messages arrive.
  const chatEndRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (chatShown) chatEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [chatShown, state?.chat]);
  const chat = useMemo(() => hideMuted(state?.chat ?? [], muted), [state?.chat, muted]);

  const emit = getSocket();
  const winnerPlayer = state?.players.find((p) => p.name === state.winner);
  const winnerName = winnerPlayer ? shownPlayerName(winnerPlayer) : state?.winner;
  const selectedRelicIds = myPlayer?.selected_relic_ids ?? [];

  // Not caught up with the server -- joining, or reconnecting after a drop
  // (useLobbyConnection rejoins by itself; a lobby gone meanwhile walks out
  // via onLobbyGone): the whole lobby stays on screen, blurred and out of
  // reach, under the loading animation. Only the way home stays sharp.
  const stale = connectionStatus !== 'connected';
  const staleLook = stale ? ' blur-sm pointer-events-none select-none' : '';

  const submitResource = (id: string) => {
    if (!game.canAct) return;
    setResource(id);
    emit.emit('submit_choice', { lobby_id: lobbyId, resource: id, action: '' });
  };

  const submitAction = (act: string) => {
    if (!game.canAct) return;
    setAction(act);
    // An attack waits for its target.
    if (act !== 'attack') emit.emit('submit_choice', { lobby_id: lobbyId, action: act, resource: '' });
  };

  const submitTarget = (chosen: string) => {
    setTarget(chosen);
    if (chosen) emit.emit('submit_choice', { lobby_id: lobbyId, action: 'attack', target: chosen, resource: '' });
  };

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    emit.emit('send_message', { lobby_id: lobbyId, message: msg });
    setChatInput('');
  };

  // The parts of the lobby, laid out one way on a phone and another on a
  // wide screen (below).
  const title = lobbyTitle(state);
  // After a ranked game the city opens on its ranked boards, to queue again.
  const cityPath = state?.ranked || state?.ai_ranked ? RANKED_CITY_PATH : CITY_PATH;
  const header = (
    <>
      {title && <PixelTitle text={title.text} color={title.color} />}
      {state?.boss_fight && enemy && (
        <div className="bg-red-950/70 border border-red-800 p-4 rounded mb-4">
          <h2 className="text-2xl font-bold text-center">{shownPlayerName(enemy)}</h2>
          <p className="text-center text-gray-400">{enemy.title} </p>
          <p className="text-center">HP: {enemy.hp}</p>
          {bossStartsIn !== null && (
            <p className="text-center text-gray-400">
              ⏳ Boss-fight starts in {Math.floor(bossStartsIn / 60)}m {bossStartsIn % 60}s
            </p>
          )}
        </div>
      )}
      {rankedStartsIn !== null && <p className="mb-3 text-lg text-gray-300 font-medium">Match starts in {rankedStartsIn}s</p>}
      {/* A ranked match is matchmade and the bossfight is one for everyone,
          never joined by code: no id to share. */}
      {!state?.ranked && !state?.ai_ranked && !state?.boss_fight && (
        <h2 className="text-3xl font-extrabold text-white mt-6 mb-4 tracking-tight">Lobby ID: {lobbyId}</h2>
      )}
      <p className="mb-6 text-lg text-gray-300 font-medium">
        🌀 {gameStarted ? `Round: ${round}` : <WaitingForStart />}
      </p>
    </>
  );
  const canChoose = !gameOver && !isDenied && isAlive && gameStarted && !myPlayer?.spectator;
  // Running out of time with a choice still to make: the choices blink,
  // yellow from 10 seconds left and red from 5, as the 3D game's do
  // (SceneOverlay's actionCue / resourceCue, globals.css warn-blink-*).
  const warnCue =
    secondsLeft !== null && secondsLeft <= 5
      ? 'warn-blink-red'
      : secondsLeft !== null && secondsLeft <= 10
        ? 'warn-blink-gold'
        : '';
  const actionCue = canChoose && action === '' ? warnCue : '';
  const resourceCue = canChoose && resource === '' ? warnCue : '';
  const attackable = (p: { name: string; hp: number; spectator?: boolean }) =>
    canChoose && p.name !== playerName && p.hp > 0 && !p.spectator;
  // The first column: always kept on a PC; on a phone only while someone
  // has something in it.
  const showLeftColumn =
    wide ||
    !!state?.players.some((p) => infoFor(p) || hits?.get(p.name) || (state.boss_fight && (p.bot || p.boss) && p.hp > 0));
  const leftColumnWidth = wide ? 'w-36' : 'w-24';
  const playersCard = (
    <>
      <div className={card}>
        <h3 className="font-semibold text-xl text-gray-100 mb-4">Players in Lobby</h3>
        {/* A grid of two columns: each player's frame, as wide as the
            widest -- from the info on the left to the longest name -- and
            after it their Attack, chat bubble and kick. */}
        <ul className="text-gray-200 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-2 items-center">
          {state?.players.map((p) => {
            const info = infoFor(p);
            const hit = info ? undefined : hits?.get(p.name)?.[hitStep];
            const tint = (c: string) => (info?.stale ? 'text-gray-500' : c);
            const ready = state.readyPlayers?.includes(p.name);
            const crowned = state.winner === p.name || (!state.winner && state.wellwinner === p.name);
            const bossHp = state.boss_fight && (p.bot || p.boss) && p.hp > 0;
            return (
              // Each player framed in a very thin black line (Mikael, 2026-10-12).
              <li key={p.name} className="contents">
                <div className="py-1 px-2 flex items-center gap-2 border border-black rounded-md">
                {/* In columns, so every line lines up (Mikael, 2026-10-12):
                    what you know of them -- the Well's info, the round's
                    hits (blinking), or a bossfight bot's health -- set
                    against the next column rather than the left edge; the
                    crown or skull; their avatar; whether they've chosen
                    (✅) or are away (👻); then the name and the rest. */}
                {showLeftColumn && (
                  <span className={`${leftColumnWidth} ${wide ? 'text-sm' : 'text-xs'} shrink-0 flex justify-end tabular-nums`}>
                    {info ? (
                      <span
                        className={`font-semibold whitespace-nowrap ${info.stale ? 'text-gray-500' : ''}`}
                        title={info.stale ? 'Last round' : 'This round'}
                      >
                        ❤ <span className={tint('text-red-400')}>{info.hp}</span> 💰{' '}
                        <span className={tint('text-yellow-400')}>{info.coins}</span> ⚔{' '}
                        <span className={tint('text-blue-400')}>{info.attackDamage}</span>
                      </span>
                    ) : hit ? (
                      // Keyed by the step, so each number blinks once anew.
                      <span
                        key={hitStep}
                        className="font-extrabold whitespace-nowrap animate-[pulse_1s_ease-in-out_1]"
                        style={{ color: hit.color === 'red' ? HIT_RED : HIT_BLUE }}
                      >
                        {hit.text}
                      </span>
                    ) : bossHp ? (
                      <span className="text-red-400 font-semibold whitespace-nowrap" title="HP">
                        ❤ {p.hp}
                      </span>
                    ) : null}
                  </span>
                )}
                <span className="w-6 shrink-0 text-center">
                  {p.hp <= 0 ? <span className="text-red-500">☠️</span> : crowned ? <span className="text-yellow-500">👑</span> : null}
                </span>
                <span className="w-6 shrink-0 flex justify-center">
                  <PlayerThumbnail player={p} />
                </span>
                <span className="w-6 shrink-0 text-center">
                  {ready ? (
                    <span className="text-green-500">✅</span>
                  ) : p.idle_rounds >= 2 ? (
                    <span className="text-gray-400">👻</span>
                  ) : null}
                </span>
                <span className="font-medium">{shownPlayerName(p)}</span>
                {p.spectator && <span className="text-yellow-500">👁</span>}
                {muted.has(p.name) && <span>🔇</span>}
                {!gameStarted &&
                  (p.selected_relic_ids ?? []).map((id) => {
                    const relic = relics.find((r) => Number(r.id) === id);
                    return <span key={id}>{(relic && RELIC_BADGE_EMOJI[relic.name]) ?? '🪙'}</span>;
                  })}
                  {/* As much frame after the names as the info column puts before
                      them (Mikael, 2026-10-12). */}
                  {showLeftColumn && <span aria-hidden="true" className={`${leftColumnWidth} shrink-0`} />}
                </div>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                {/* Attack, the word in red, a tab's width
                    after the name of everyone you can attack -- a tap attacks
                    them. */}
                {attackable(p) && (
                  <ActionWord
                    word="Attack"
                    label={`Attack ${shownPlayerName(p)}`}
                    color={ATTACK_COLOR}
                    selected={action === 'attack' && target === p.name}
                    onClick={() => {
                      submitAction('attack');
                      submitTarget(p.name);
                    }}
                    small
                    className={`ml-4 ${actionCue}`}
                  />
                )}
                {/* What they just said in the chat, for a few seconds. */}
                {bubbles.get(p.name) && (
                  <span
                    className="max-w-[14rem] truncate rounded-2xl rounded-bl-sm bg-white text-gray-900 text-sm px-2.5 py-0.5"
                    title={bubbles.get(p.name)}
                  >
                    {bubbles.get(p.name)}
                  </span>
                )}
                {isAdmin && p.name !== playerName && p.hp > 0 && round === 0 && (
                  <span
                    className="ml-auto text-red-500 text-sm cursor-pointer"
                    title="Kick player"
                    onClick={() => emit.emit('kick_player', { lobby_id: lobbyId, target: p.name })}
                  >
                    ❌
                  </span>
                )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
  const adminControls = (
    <>
      {isAdmin && round === 0 && (
        <div className="flex flex-wrap justify-center items-start">
          <button type="button" onClick={() => emit.emit('start_game', { lobby_id: lobbyId })} style={bigButton('goldenrod')}>
            🚀 Start Game
          </button>
          <AddBotMenu onAdd={(type) => emit.emit('add_dummy', { lobby_id: lobbyId, bot_type: type })} />
        </div>
      )}
    </>
  );
  const relicPicker = (
    <>
      {round === 0 && myPlayer && !myPlayer.spectator && relics.length > 0 && (
        <RelicPicker
          relics={relics}
          selectedIds={selectedRelicIds}
          onToggle={(id) => emit.emit('toggle_relic_selection', { lobby_id: lobbyId, relic_id: id })}
        />
      )}
    </>
  );
  const floating = (
    <>
      {floatingMessages.map((msg) => (
        <FloatingMessage
          key={msg.id}
          message={msg.text}
          // Its messages go into the list as the bubble goes -- when it
          // has faded, or at once on a tap.
          onDone={() => settle(msg.id)}
          onTap={() => settle(msg.id)}
        />
      ))}
    </>
  );
  // Your choices as the 3D game shows them (Mikael, 2026-10-11): Defend
  // and The Well under the player list (Attack is beside each player in it),
  // and the 3D game's bottom bar -- your HP, coins and attack, each tapped
  // to take that resource this round.
  const defendAndWell = canChoose && (
    <div className="flex gap-3 justify-center flex-wrap mb-4">
      <ActionWord
        word="Well"
        label="The Well"
        color={WELL_COLOR}
        selected={action === 'well'}
        onClick={() => submitAction('well')}
        className={actionCue}
      />
      <ActionWord
        word="Defend"
        label="Defend"
        color={DEFEND_COLOR}
        selected={action === 'defend'}
        onClick={() => submitAction('defend')}
        className={actionCue}
      />
      {actionCue && (
        <p className={`w-full text-center bg-black/80 rounded-xl border border-white/20 p-3 text-white text-sm ${actionCue}`}>
          You must choose an action: Attack someone, Well or Defend.
        </p>
      )}
    </div>
  );

  const cannotAffordAtk = !!myPlayer && myPlayer.coins < myPlayer.attackDamage;
  const resourceBar = myPlayer && !myPlayer.spectator && (
    <div className="flex flex-col items-center gap-2">
      {resourceCue && (
        <p className={`max-w-xs text-center bg-black/80 rounded-xl border border-white/20 p-3 text-white text-sm ${resourceCue}`}>
          You must choose a resource: Get HP, Get Coin or Upgrade Attack.
        </p>
      )}
    <div className="flex gap-2 justify-center">
      <ResourceCard
        value={myPlayer.hp}
        label="HP"
        sublabel="❤ Get"
        valueClass="text-red-400"
        sublabelClass="text-red-400/70"
        disabled={!canChoose}
        onClick={() => submitResource('gain_hp')}
        className={`${!canChoose ? 'opacity-60 cursor-default' : 'cursor-pointer'} ${resourceCue} ${
          resource === 'gain_hp'
            ? 'bg-red-700/80 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
            : 'bg-black/70 border-red-500/50 hover:bg-red-950/80 hover:border-red-400/80'
        }`}
      />
      <ResourceCard
        value={myPlayer.coins}
        label="Coins"
        sublabel="💰 Get"
        valueClass="text-yellow-400"
        sublabelClass="text-yellow-400/70"
        disabled={!canChoose}
        onClick={() => submitResource('gain_coin')}
        className={`${!canChoose ? 'opacity-60 cursor-default' : 'cursor-pointer'} ${resourceCue} ${
          resource === 'gain_coin'
            ? 'bg-yellow-700/80 border-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
            : 'bg-black/70 border-yellow-500/50 hover:bg-yellow-950/80 hover:border-yellow-400/80'
        }`}
      />
      <ResourceCard
        value={myPlayer.attackDamage}
        label="ATK"
        sublabel="⚔ Buy"
        valueClass="text-blue-400"
        sublabelClass="text-blue-400/70"
        disabled={!canChoose || cannotAffordAtk}
        onClick={() => submitResource('gain_attack')}
        className={`relative overflow-hidden ${
          !canChoose || cannotAffordAtk ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${cannotAffordAtk ? '' : resourceCue} ${
          resource === 'gain_attack'
            ? 'bg-blue-700/80 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
            : 'bg-black/70 border-blue-500/50 hover:bg-blue-950/80 hover:border-blue-400/80'
        }`}
        overlay={
          cannotAffordAtk && (
            <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden">
              <svg className="w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="0" x2="100%" y2="100%" stroke="red" strokeWidth="2" />
              </svg>
            </div>
          )
        }
      />
    </div>
    </div>
  );
  const timer = (
    <>
      {gameStarted && secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
        <p className={`mb-2 text-lg font-semibold ${secondsLeft <= 10 ? 'text-red-700 animate-pulse' : 'text-red-600'}`}>
          ⏳ Time left: {secondsLeft}s
        </p>
      )}
    </>
  );
  const messagesBox = (
    <>
      <div
        className={`w-full mt-2 mb-6 transition-opacity ${
          !wide && floatingMessages.length > 0 ? 'opacity-0 duration-0' : 'opacity-100 duration-1000'
        }`}
      >
        <h3 className="font-semibold text-xl text-gray-100 mb-4 px-6">Round Messages</h3>
        <ul className="list-disc pl-6 text-gray-200 bg-gray-900 border border-white/10 p-4 rounded-xl space-y-2">
          {messages.map((m, i) => (
            <li key={i} className="py-1">
              <WheelText text={Array.isArray(m) ? m.join(' ') : m} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
  const denyChooser = (
    <>
      {isPendingDenyChooser && (
        <div className="w-full bg-yellow-950/60 border border-yellow-700 p-4 mt-4 rounded-xl">
          <h3 className="font-semibold text-lg text-yellow-300 mb-4">🛑 Choose someone to deny next round</h3>
          <div className="flex gap-4 items-center">
            <select
              className="border border-gray-600 rounded-lg p-2.5 bg-gray-800 text-white flex-1"
              value={denyTarget}
              onChange={(e) => setDenyTarget(e.target.value)}
              aria-label="Select player"
            >
              <option value="">Select player</option>
              {eligibleDenyTargets.map((p) => (
                <option key={p.name} value={p.name}>
                  {shownPlayerName(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!denyTarget}
              onClick={() => emit.emit('submit_deny_target', { lobby_id: lobbyId, target: denyTarget })}
              style={{ ...choiceStyle(false), flex: 'none', padding: '10px 20px' }}
            >
              Deny
            </button>
          </div>
        </div>
      )}
    </>
  );
  const gameOverCard = (
    <>
      {gameOver && (
        <div className="w-full bg-green-950/60 border border-green-700 text-green-300 p-4 rounded-xl mt-4 text-center">
          <p className="text-xl font-semibold mb-3">🎉 Game Over! {winnerName} has won the game!</p>
          {/* Home, and beside it the city -- the pair from the top corner. */}
          <span className="emoji-pair inline-flex items-center justify-center gap-2">
            <Link href="/" aria-label="Back to Home" className={homeButton}>
              🌍
            </Link>
            <Link href={cityPath} aria-label="Go to the city" className={homeButton}>
              🏛️
            </Link>
          </span>
        </div>
      )}
    </>
  );
  const chatBody = (
    <>
      <ChatMessageActions target={chatTarget} context="lobby" onClose={() => setChatTarget(null)} />
      <ul className={`space-y-1 text-gray-200 mb-3 overflow-y-auto ${wide ? 'flex-1 min-h-0' : 'max-h-60'}`}>
        {chat.map((m, i) => (
          <li
            key={i}
            className={`break-words ${m.sender !== playerName ? 'cursor-pointer hover:bg-white/10 rounded' : ''}`}
            onClick={m.sender !== playerName ? () => setChatTarget(m) : undefined}
          >
            {muted.has(m.sender) && <MutedMark />}
            <span className="font-semibold">{m.sender}: </span>
            {chatText(m.message)}
          </li>
        ))}
        <li ref={chatEndRef} aria-hidden="true" />
      </ul>
      <div className="flex gap-2">
        <input
          type="text"
          maxLength={200}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          placeholder="Chat…"
          aria-label="Chat message"
          // On a phone it opens to be typed in; on a PC it is always there.
          autoFocus={!wide}
          className="flex-1 border border-gray-600 rounded-lg p-2 bg-gray-800 text-white min-w-0"
        />
        <button type="button" onClick={sendChat} style={{ ...choiceStyle(false), flex: 'none', padding: '6px 12px' }}>
          Send
        </button>
      </div>
    </>
  );

  const nudges = (
    <>
      {gameOver && state?.boss_fight && myPlayer?.pending_relic_nudge && !dismissed.relic && (
        <BossSignupNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('relic')} />
      )}
      {gameOver && myPlayer?.pending_wheel_nudge && !dismissed.wheel && (
        <WheelClaimNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('wheel')} />
      )}
      {gameOver && myPlayer?.pending_artifact_nudge && !dismissed.artifact && (
        <ArtifactClaimNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('artifact')} />
      )}
    </>
  );

  const topButtons = (
    <>
      {/* Home, and beside it the city -- the same pair as the other pages'. */}
      <span className="emoji-pair absolute top-4 left-4 z-20 inline-flex items-center gap-2">
        <Link href="/" aria-label="Back to Home" className={homeButton}>
          🌍
        </Link>
        <Link href={cityPath} aria-label="Go to the city" className={homeButton}>
          🏛️
        </Link>
      </span>
      {stale && <LoadingState label="Reconnecting" overSuppression />}
      <div className={`absolute top-4 right-4 z-20 flex items-center gap-2${staleLook}`}>
        <MusicToggleButton />
        <SfxToggleButton />
      </div>
    </>
  );

  // A PC's screen (Mikael, 2026-10-11): the whole lobby in the window at
  // once, never scrolled, in two columns -- the lobby on the left (the
  // players and your choices, the bottom bar at its foot), the round messages always in
  // view on the right with the chat under them, and no bubble. A column only
  // scrolls on its own if it overflows.
  if (wide) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-[#070b15] text-gray-100">
        {topButtons}
        <div
          className={`relative z-10 h-full w-full max-w-7xl mx-auto px-6 pt-20 pb-6 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4${staleLook}`}
          aria-busy={stale}
        >
          <div className="min-h-0 overflow-y-auto flex flex-col items-center rounded-2xl bg-gray-950/80 p-3">
            {header}
            {playersCard}
            {defendAndWell}
            {timer}
            {adminControls}
            {relicPicker}
            {denyChooser}
            {gameOverCard}
            <div className="mt-auto pt-3">{resourceBar}</div>
          </div>
          <div className="min-h-0 flex flex-col gap-4">
            <div className="min-h-0 flex-1 overflow-y-auto">{messagesBox}</div>
            <div className="h-72 shrink-0 flex flex-col bg-gray-900 p-4 rounded-xl border border-gray-700">{chatBody}</div>
          </div>
        </div>
        {nudges}
      </div>
    );
  }

  return (
    // From the top, just under the home buttons -- centred in the screen, a
    // short lobby left a gap above it (Mikael, 2026-10-11).
    <div className="min-h-screen w-full flex items-start justify-center bg-[#070b15] p-4 pt-20 sm:p-8 sm:pt-20 text-gray-100">
      {topButtons}
      <div className={`relative z-10 w-full flex items-start justify-center${staleLook}`} aria-busy={stale}>
        <div className="w-full max-w-3xl flex flex-col items-center justify-start rounded-2xl bg-gray-950/80 transition-all duration-300 p-3">
          {header}
          {playersCard}
          {defendAndWell}
          {adminControls}
          {relicPicker}
          {floating}
          {timer}
          {/* On a phone the round messages come under the bottom bar. */}
          {resourceBar && <div className="mt-2 mb-4">{resourceBar}</div>}
          {messagesBox}
          {denyChooser}
          {gameOverCard}
        </div>
      </div>

      {/* Chat: a button in the bottom-right corner that opens it, so it
          takes no room on a phone screen until it's wanted. */}
      {chatOpen && (
        <div className={`fixed bottom-16 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-gray-900 p-4 rounded-xl shadow-xl border border-gray-700${staleLook}`}>
          {chatBody}
        </div>
      )}
      {/* The 3D game's own chat button (SceneOverlay), with its unread dot. */}
      <div className={`fixed bottom-4 right-4 z-40 inline-block${staleLook}`}>
        <button
          type="button"
          onClick={() => {
            setChatOpen((o) => !o);
            setUnreadChat(false);
          }}
          className="w-11 h-11 rounded-full bg-blue-600/90 hover:bg-blue-500/90 flex items-center justify-center shadow-lg border border-white/20 text-lg cursor-pointer"
          aria-label="Toggle chat"
        >
          💬
        </button>
        {unreadChat && (
          <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-orange-500 border border-white/60 pointer-events-none" />
        )}
      </div>

      {nudges}
    </div>
  );
}
