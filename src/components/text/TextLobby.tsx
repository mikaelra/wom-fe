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
import { CITY_PATH } from '@/lib/cities';
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
import { useLobbyGame } from '@/lib/useLobbyGame';
import { playerMark, shownPlayerName } from '@/lib/playerThumbnail';
import type { Player, Relic } from '@/types/game';

// A match as text (Settings -> Graphics -> Text mode, src/lib/textMode.ts):
// Tjuvpakk's lobby page, kept as it was, on World of Mythos's socket. The
// game state arrives over the socket (useLobbyConnection) and every choice
// goes back over it, the same messages the 3D scene sends; each round's own
// messages are fetched once per round (useGameEvents). What World of Mythos
// added since Tjuvpakk -- bot types, relics, ranked countdowns, chat, the
// Wheel/artifact/relic prizes -- is here too, in the same style.

const RESOURCES = [
  { id: 'gain_hp', label: 'Get ❤' },
  { id: 'gain_coin', label: 'Get 💰' },
  { id: 'gain_attack', label: 'Buy ⚔' },
];
const ACTIONS = ['attack', 'defend', 'well'];

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
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
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
    const id = nextFloatId.current++;
    setFloatingMessages((prev) => [...prev, { id, text: next, list: events.messages }]);
  }, [events]);

  const settle = (id: number) => {
    const done = floatingMessages.find((m) => m.id === id);
    if (done) setMessages(done.list);
    setFloatingMessages((prev) => prev.filter((m) => m.id !== id));
  };

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

  const muted = useMutedPlayers();
  const chatText = useChatText();
  const [chatInput, setChatInput] = useState('');
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  // The newest message in sight: on opening, and as messages arrive.
  const chatEndRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [chatOpen, state?.chat]);
  const chat = useMemo(() => hideMuted(state?.chat ?? [], muted), [state?.chat, muted]);

  const emit = getSocket();
  const winnerPlayer = state?.players.find((p) => p.name === state.winner);
  const winnerName = winnerPlayer ? shownPlayerName(winnerPlayer) : state?.winner;
  const otherPlayers = state?.players.filter((p) => p.name !== playerName && p.hp > 0 && !p.spectator) ?? [];
  const selectedRelicIds = myPlayer?.selected_relic_ids ?? [];

  if (connectionStatus === 'disconnected') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#070b15] p-4">
        <p className="text-lg text-gray-100">Connection lost. Please refresh.</p>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#070b15] p-4 pt-20 sm:p-8 sm:pt-20 text-gray-100">
      {/* Home, and beside it the city -- the same pair as the other pages'. */}
      <span className="emoji-pair absolute top-4 left-4 z-20 inline-flex items-center gap-2">
        <Link href="/" aria-label="Back to Home" className={homeButton}>
          🌍
        </Link>
        <Link href={CITY_PATH} aria-label="Go to the city" className={homeButton}>
          🏛️
        </Link>
      </span>
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <MusicToggleButton />
        <SfxToggleButton />
      </div>
      <div className="relative z-10 min-h-screen w-full flex items-center justify-center">
        <div className="w-full max-w-3xl flex flex-col items-center justify-center rounded-2xl bg-gray-950/80 transition-all duration-300 p-3">
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
          {/* A ranked match is matchmade, never joined by code: no id to share
              (the 3D lobby's LobbyOverlay hides it too). */}
          {!state?.ranked && !state?.ai_ranked && (
            <h2 className="text-3xl font-extrabold text-white mt-6 mb-4 tracking-tight">Lobby ID: {lobbyId}</h2>
          )}
          <p className="mb-6 text-lg text-gray-300 font-medium">
            🌀 {gameStarted ? `Round: ${round}` : <WaitingForStart />}
          </p>

          <div className={card}>
            <h3 className="font-semibold text-xl text-gray-100 mb-4">Players in Lobby</h3>
            <ul className="list-disc pl-6 text-gray-200 space-y-2">
              {state?.players.map((p) => (
                <li key={p.name} className="py-1 flex items-center gap-2 flex-wrap">
                  {/* Every mark goes in front of the name, the player's own
                      (skin thumbnail or bot emoji) right before it -- all but
                      the admin's kick, at the end of the line. */}
                  {p.hp <= 0 && <span className="text-red-500">☠️</span>}
                  {(state.winner === p.name || (!state.winner && state.wellwinner === p.name)) && (
                    <span className="text-yellow-500">👑</span>
                  )}
                  {p.spectator && <span className="text-yellow-500">👁</span>}
                  {muted.has(p.name) && <span>🔇</span>}
                  {!gameStarted &&
                    (p.selected_relic_ids ?? []).map((id) => {
                      const relic = relics.find((r) => Number(r.id) === id);
                      return <span key={id}>{(relic && RELIC_BADGE_EMOJI[relic.name]) ?? '🪙'}</span>;
                    })}
                  {state.readyPlayers?.includes(p.name) && <span className="text-green-500">✅</span>}
                  {p.idle_rounds >= 2 && <span className="text-gray-400">👻</span>}
                  <PlayerThumbnail player={p} />
                  <span className="font-medium">{shownPlayerName(p)}</span>
                  {isAdmin && p.name !== playerName && p.hp > 0 && round === 0 && (
                    <span
                      className="ml-auto text-red-500 text-sm cursor-pointer"
                      title="Kick player"
                      onClick={() => emit.emit('kick_player', { lobby_id: lobbyId, target: p.name })}
                    >
                      ❌
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isAdmin && round === 0 && (
            <div className="flex flex-wrap justify-center items-start">
              <button type="button" onClick={() => emit.emit('start_game', { lobby_id: lobbyId })} style={bigButton('goldenrod')}>
                🚀 Start Game
              </button>
              <AddBotMenu onAdd={(type) => emit.emit('add_dummy', { lobby_id: lobbyId, bot_type: type })} />
            </div>
          )}

          {round === 0 && myPlayer && !myPlayer.spectator && relics.length > 0 && (
            <RelicPicker
              relics={relics}
              selectedIds={selectedRelicIds}
              onToggle={(id) => emit.emit('toggle_relic_selection', { lobby_id: lobbyId, relic_id: id })}
            />
          )}

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

          {myPlayer && !myPlayer.spectator && (
            <div className={card}>
              <h3 className="font-semibold text-xl text-gray-100 mb-4">Your Stats</h3>
              <p className="text-gray-200 flex gap-4">
                <span>
                  ❤ <span className="font-semibold text-red-500">{myPlayer.hp}</span>
                </span>
                <span>
                  💰 <span className="font-semibold text-yellow-500">{myPlayer.coins}</span>
                </span>
                <span>
                  ⚔ <span className="font-semibold text-blue-500">{myPlayer.attackDamage}</span>
                </span>
              </p>
            </div>
          )}

          {!gameOver && !isDenied && isAlive && gameStarted && !myPlayer?.spectator && (
            <div className={card}>
              <div>
                <h4 className="font-semibold text-lg text-gray-100 mb-3">Choose Resource</h4>
                <div className="flex gap-2">
                  {RESOURCES.map((res) => (
                    <button key={res.id} type="button" onClick={() => submitResource(res.id)} style={choiceStyle(resource === res.id)}>
                      {res.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <h4 className="font-semibold text-lg text-gray-100 mb-3">Choose Action</h4>
                <div className="flex gap-2">
                  {ACTIONS.map((act) => (
                    <button key={act} type="button" onClick={() => submitAction(act)} style={choiceStyle(action === act)}>
                      {act.toUpperCase()}
                    </button>
                  ))}
                </div>
                {action === 'attack' && (
                    <select
                      value={target}
                      onChange={(e) => submitTarget(e.target.value)}
                      aria-label="Select target"
                      style={{
                        padding: '6px',
                        border: '2px solid #9ca3af',
                        borderRadius: '5px',
                        backgroundColor: '#1f2937',
                        color: 'white',
                        fontSize: '16px',
                        marginTop: '10px',
                        width: '100%',
                      }}
                    >
                      <option value="">Select target</option>
                      {otherPlayers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {shownPlayerName(p)}
                        </option>
                      ))}
                    </select>
                  )}
              </div>
            </div>
          )}

          {gameStarted && secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
            <p className={`mb-2 text-lg font-semibold ${secondsLeft <= 10 ? 'text-red-700 animate-pulse' : 'text-red-600'}`}>
              ⏳ Time left: {secondsLeft}s
            </p>
          )}

          <div
            className={`w-full mt-2 mb-6 transition-opacity ${
              floatingMessages.length > 0 ? 'opacity-0 duration-0' : 'opacity-100 duration-1000'
            }`}
          >
            <h3 className="font-semibold text-xl text-gray-100 mb-4 px-6">Round Messages</h3>
            <ul className="list-disc pl-6 text-gray-200 bg-gray-900 border border-white/10 p-4 rounded-xl space-y-2">
              {messages.map((m, i) => (
                <li key={i} className="py-1">
                  {Array.isArray(m) ? m.join(' ') : m}
                </li>
              ))}
            </ul>
          </div>

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

          {gameOver && (
            <div className="w-full bg-green-950/60 border border-green-700 text-green-300 p-4 rounded-xl mt-4 text-center">
              <p className="text-xl font-semibold mb-3">🎉 Game Over! {winnerName} has won the game!</p>
              <Link href="/" className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200">
                ← Back to Home
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* Chat: a button in the bottom-right corner that opens it, so it
          takes no room on a phone screen until it's wanted. */}
      {chatOpen && (
        <div className="fixed bottom-16 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-gray-900 p-4 rounded-xl shadow-xl border border-gray-700">
          <ChatMessageActions target={chatTarget} context="lobby" onClose={() => setChatTarget(null)} />
          <ul className="space-y-1 text-gray-200 mb-3 max-h-60 overflow-y-auto">
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
              autoFocus
              className="flex-1 border border-gray-600 rounded-lg p-2 bg-gray-800 text-white min-w-0"
            />
            <button type="button" onClick={sendChat} style={{ ...choiceStyle(false), flex: 'none', padding: '6px 12px' }}>
              Send
            </button>
          </div>
        </div>
      )}
      {/* The 3D game's own chat button (SceneOverlay), with its unread dot. */}
      <div className="fixed bottom-4 right-4 z-40 inline-block">
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

      {gameOver && state?.boss_fight && myPlayer?.pending_relic_nudge && !dismissed.relic && (
        <BossSignupNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('relic')} />
      )}
      {gameOver && myPlayer?.pending_wheel_nudge && !dismissed.wheel && (
        <WheelClaimNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('wheel')} />
      )}
      {gameOver && myPlayer?.pending_artifact_nudge && !dismissed.artifact && (
        <ArtifactClaimNudge lobbyId={lobbyId} playerName={playerName} onDismiss={dismiss('artifact')} />
      )}
    </div>
  );
}
