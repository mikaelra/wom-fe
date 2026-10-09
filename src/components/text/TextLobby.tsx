'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FloatingMessage from '@/components/text/FloatingMessage';
import BossSignupNudge from '@/components/BossSignupNudge';
import WheelClaimNudge from '@/components/WheelClaimNudge';
import ArtifactClaimNudge from '@/components/ArtifactClaimNudge';
import ChatMessageActions, { MutedMark, type ChatTarget } from '@/components/chat/ChatMessageActions';
import MusicToggleButton from '@/components/audio/MusicToggleButton';
import SfxToggleButton from '@/components/audio/SfxToggleButton';
import { BOT_TYPES } from '@/components/lobby/LobbyOverlay';
import { RELIC_BADGE_EMOJI, RELIC_SELECT_CAPTION } from '@/components/RelicSelectionPopover';
import { useToast } from '@/components/Toast';
import { getPlayerRelics } from '@/lib/api';
import { hideMuted, useMutedPlayers } from '@/lib/chatMute';
import { useChatText } from '@/lib/chatFilter';
import { isLobbyGoneError } from '@/lib/lobbyErrors';
import { BATTLE_MUSIC, playMusic, PRE_LOBBY_MUSIC } from '@/lib/music';
import { getSocket } from '@/lib/socket';
import { useGameEvents } from '@/lib/useGameEvents';
import { useLobbyConnection } from '@/lib/useLobbyConnection';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { Relic } from '@/types/game';

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

const choiceStyle = (selected: boolean) => ({
  padding: '5px 12px',
  margin: '3px',
  border: '2px solid black',
  borderRadius: '5px',
  backgroundColor: selected ? 'crimson' : '#ddd',
  color: selected ? 'white' : 'black',
  fontWeight: 'bold' as const,
  cursor: 'pointer',
});

const bigButton = (backgroundColor: string) => ({
  padding: '10px 20px',
  margin: '10px',
  border: '2px solid black',
  borderRadius: '8px',
  backgroundColor,
  color: 'white',
  fontWeight: 'bold' as const,
  cursor: 'pointer',
});

const card = 'w-full mb-6 bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200';

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
  const { state, connectionStatus } = useLobbyConnection(lobbyId, playerName, {
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
  const [floatingMessages, setFloatingMessages] = useState<string[]>([]);
  useEffect(() => {
    if (!events) return;
    const next = flatten(events.messages);
    if (!next || next === flatten(messages)) return;
    setFloatingMessages((prev) => [...prev, next]);
    const t = setTimeout(() => setMessages(events.messages), 2500);
    return () => clearTimeout(t);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps -- once per fetched result

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
  const chat = useMemo(() => hideMuted(state?.chat ?? [], muted), [state?.chat, muted]);

  const emit = getSocket();
  const otherPlayers = state?.players.filter((p) => p.name !== playerName && p.hp > 0 && !p.spectator) ?? [];
  const selectedRelicIds = myPlayer?.selected_relic_ids ?? [];

  if (connectionStatus === 'disconnected') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4">
        <p className="text-lg text-gray-800">Connection lost. Please refresh.</p>
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
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8 text-gray-900">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <MusicToggleButton />
        <SfxToggleButton />
      </div>
      <div className="relative z-10 min-h-screen w-full flex items-center justify-center">
        <div className="w-full max-w-3xl flex flex-col items-center justify-center rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm transition-all duration-300 p-4">
          {state?.boss_fight && enemy && (
            <div className="bg-red-200 p-4 rounded mb-4">
              <h2 className="text-2xl font-bold text-center">{enemy.name}</h2>
              <p className="text-center text-gray-500">{enemy.title} </p>
              <p className="text-center">HP: {enemy.hp}</p>
              {bossStartsIn !== null && (
                <p className="text-center text-gray-500">
                  ⏳ Boss-fight starts in {Math.floor(bossStartsIn / 60)}m {bossStartsIn % 60}s
                </p>
              )}
            </div>
          )}
          {rankedStartsIn !== null && <p className="mb-3 text-lg text-gray-600 font-medium">Match starts in {rankedStartsIn}s</p>}
          <h2 className="text-3xl font-extrabold text-gray-900 mt-6 mb-4 tracking-tight">Lobby ID: {lobbyId}</h2>
          <p className="mb-3 text-lg text-gray-600 font-medium">🌀 Round: {state?.round ?? '?'}</p>
          <p className="mb-6 text-lg text-gray-600 font-medium">🦹‍♂️ Your Name: {playerName}</p>

          <div className={card}>
            <h3 className="font-semibold text-xl text-gray-800 mb-4">Players in Lobby</h3>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              {state?.players.map((p) => (
                <li key={p.name} className="py-1 flex items-center gap-2 flex-wrap">
                  {p.hp <= 0 && <span className="text-red-500">☠️</span>}
                  {(state.winner === p.name || (!state.winner && state.wellwinner === p.name)) && (
                    <span className="text-yellow-500">👑</span>
                  )}
                  {p.spectator && <span className="text-yellow-500">👁</span>}
                  <span className="font-medium">{p.name}</span>
                  {muted.has(p.name) && <span>🔇</span>}
                  {!gameStarted &&
                    (p.selected_relic_ids ?? []).map((id) => {
                      const relic = relics.find((r) => Number(r.id) === id);
                      return <span key={id}>{(relic && RELIC_BADGE_EMOJI[relic.name]) ?? '🪙'}</span>;
                    })}
                  {isAdmin && p.name !== playerName && p.hp > 0 && round === 0 && (
                    <span
                      className="ml-2 text-red-500 text-sm cursor-pointer"
                      title="Kick player"
                      onClick={() => emit.emit('kick_player', { lobby_id: lobbyId, target: p.name })}
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

          {isAdmin && round === 0 && (
            <div className="flex flex-wrap justify-center">
              <button type="button" onClick={() => emit.emit('start_game', { lobby_id: lobbyId })} style={bigButton('goldenrod')}>
                🚀 Start Game
              </button>
              {BOT_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => emit.emit('add_dummy', { lobby_id: lobbyId, bot_type: type })}
                  style={bigButton('gray')}
                >
                  🤖 Add {label} Bot
                </button>
              ))}
            </div>
          )}

          {round === 0 && myPlayer && !myPlayer.spectator && relics.length > 0 && (
            <div className={card}>
              <h3 className="font-semibold text-xl text-gray-800 mb-4">Relics</h3>
              <div className="flex flex-wrap gap-3">
                {relics.map((r) => {
                  const id = Number(r.id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => emit.emit('toggle_relic_selection', { lobby_id: lobbyId, relic_id: id })}
                      style={choiceStyle(selectedRelicIds.includes(id))}
                    >
                      {RELIC_BADGE_EMOJI[r.name]} {RELIC_SELECT_CAPTION[r.name]} (×{r.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {floatingMessages.map((msg, idx) => (
            <FloatingMessage
              key={idx}
              message={msg}
              onDone={() => setFloatingMessages((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}

          {myPlayer && !myPlayer.spectator && (
            <div className={card}>
              <h3 className="font-semibold text-xl text-gray-800 mb-4">Your Stats</h3>
              <p className="text-gray-700 flex gap-4">
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
                <h4 className="font-semibold text-lg text-gray-800 mb-3">Choose Resource</h4>
                <div className="flex flex-wrap gap-3">
                  {RESOURCES.map((res) => (
                    <button key={res.id} type="button" onClick={() => submitResource(res.id)} style={choiceStyle(resource === res.id)}>
                      {res.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <h4 className="font-semibold text-lg text-gray-800 mb-3">Choose Action</h4>
                <div className="flex flex-wrap gap-3">
                  {ACTIONS.map((act) => (
                    <button key={act} type="button" onClick={() => submitAction(act)} style={choiceStyle(action === act)}>
                      {act.toUpperCase()}
                    </button>
                  ))}
                  {action === 'attack' && (
                    <select
                      value={target}
                      onChange={(e) => submitTarget(e.target.value)}
                      aria-label="Select target"
                      style={{
                        padding: '5px',
                        border: '2px solid black',
                        borderRadius: '5px',
                        backgroundColor: 'white',
                        color: 'black',
                        fontSize: '16px',
                        margin: '10px 0',
                        width: '33%',
                      }}
                    >
                      <option value="">Select target</option>
                      {otherPlayers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          {secondsLeft !== null && secondsLeft <= 20 && !gameOver && (
            <p className={`mb-2 text-lg font-semibold ${secondsLeft <= 10 ? 'text-red-700 animate-pulse' : 'text-red-600'}`}>
              ⏳ Time left: {secondsLeft}s
            </p>
          )}

          <div
            className={`w-full mt-2 mb-6 transition-opacity ${
              floatingMessages.length > 0 ? 'opacity-0 duration-0' : 'opacity-100 duration-1000'
            }`}
          >
            <h3 className="font-semibold text-xl text-gray-800 mb-4 px-6">Round Messages</h3>
            <ul className="list-disc pl-6 text-gray-700 bg-white p-6 rounded-xl shadow-sm space-y-2">
              {messages.map((m, i) => (
                <li key={i} className="py-1">
                  {Array.isArray(m) ? m.join(' ') : m}
                </li>
              ))}
            </ul>
          </div>

          {isPendingDenyChooser && (
            <div className="w-full bg-yellow-50 border border-yellow-200 p-6 mt-6 rounded-xl shadow-sm">
              <h3 className="font-semibold text-lg text-yellow-800 mb-4">🛑 Choose someone to deny next round</h3>
              <div className="flex gap-4 items-center">
                <select
                  className="border border-gray-200 rounded-lg p-2.5 bg-white text-gray-700 flex-1"
                  value={denyTarget}
                  onChange={(e) => setDenyTarget(e.target.value)}
                  aria-label="Select player"
                >
                  <option value="">Select player</option>
                  {eligibleDenyTargets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!denyTarget}
                  onClick={() => emit.emit('submit_deny_target', { lobby_id: lobbyId, target: denyTarget })}
                  style={{ ...choiceStyle(false), padding: '10px 20px', margin: '5px' }}
                >
                  Deny
                </button>
              </div>
            </div>
          )}

          {gameOver && (
            <div className="w-full bg-green-50 border border-green-200 text-green-800 p-6 rounded-xl mt-6 text-center shadow-sm">
              <p className="text-xl font-semibold mb-3">🎉 Game Over! {state?.winner} has won the game!</p>
              <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200">
                ← Back to Home
              </Link>
            </div>
          )}

          <div className={`${card} mt-6`}>
            <h3 className="font-semibold text-xl text-gray-800 mb-4">Chat</h3>
            <ChatMessageActions target={chatTarget} context="lobby" onClose={() => setChatTarget(null)} />
            <ul className="space-y-1 text-gray-700 mb-3">
              {chat.map((m, i) => (
                <li
                  key={i}
                  className={`break-words ${m.sender !== playerName ? 'cursor-pointer hover:bg-gray-100 rounded' : ''}`}
                  onClick={m.sender !== playerName ? () => setChatTarget(m) : undefined}
                >
                  {muted.has(m.sender) && <MutedMark />}
                  <span className="font-semibold">{m.sender}: </span>
                  {chatText(m.message)}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={200}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Chat…"
                aria-label="Chat"
                className="flex-1 border border-gray-300 rounded-lg p-2 bg-white text-gray-900 min-w-0"
              />
              <button type="button" onClick={sendChat} style={choiceStyle(false)}>
                Send
              </button>
            </div>
          </div>
        </div>
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
