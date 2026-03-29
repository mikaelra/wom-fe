'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import SceneOverlay, {
  type SceneOverlayConfig,
  type GameOverRenderOpts,
  type PreGameRenderOpts,
} from '@/components/SceneOverlay';
import FloatingMessage from './FloatingMessage';
import type { LobbyState } from '@/types/game';
import { BACKEND_URL } from '@/config';

type LobbyOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
  externalAction?: string;
  onActionChange?: (action: string) => void;
};

function renderGameOver({ state, playerName, btn, replayVoted, replayLoading, onReplay }: GameOverRenderOpts) {
  return (
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
              onClick={onReplay}
              className={`${btn} bg-green-600 text-white border-green-500 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {replayVoted ? 'Voted to replay' : replayLoading ? '…' : 'Replay'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function renderPreGame({
  state,
  lobbyId,
  playerName,
  isAdmin,
  boss,
  raidMins,
  raidSecs,
  btn,
  onStartGame,
  onAddDummy,
  onKick,
  floatingMessages,
  onDoneFloating,
}: PreGameRenderOpts) {
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
                      onClick={() => onKick(p.name)}
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
                onClick={onStartGame}
                className={`${btn} bg-amber-600 text-white border-amber-700`}
              >
                Start Game
              </button>
              <button
                type="button"
                onClick={onAddDummy}
                className={`${btn} bg-gray-600 text-white`}
              >
                Add Bot
              </button>
            </div>
          )}

          {floatingMessages.map((msg, idx) => (
            <FloatingMessage
              key={idx}
              message={msg}
              onDone={() => onDoneFloating(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const lobbyConfig: SceneOverlayConfig = {
  theme: {
    accentColorClass: 'text-gray-300',
    panelBorderClass: 'border-white/20',
    msgBorderClass: 'border-white/20',
    msgTextClass: 'text-gray-200',
    showMoreClass: 'text-gray-400 hover:text-white',
    backLinkClass: 'text-white',
    enemyBorderClass: 'border-red-500/30',
    enemyNameClass: 'text-red-400',
    enemyHpBarClass: 'bg-red-500',
    enemyHpTextClass: 'text-red-300',
    loadingTextClass: 'text-gray-700',
    loadingBgClass: 'bg-gray-100',
  },
  backLabel: '← Back to Home',
  loadingText: 'Loading lobby…',
  enemyMaxHp: 10,
  showEnemyAlways: false,
  showPlayerList: true,
  showDenyPicker: true,
  showFloatingMessages: true,
  showChat: true,
  enableNextLobbyRedirect: true,
  enableRaidTimer: true,
  renderGameOver,
};

export default function LobbyOverlay({ lobbyId, onStateChange, externalAction, onActionChange }: LobbyOverlayProps) {
  return (
    <SceneOverlay
      lobbyId={lobbyId}
      onStateChange={onStateChange}
      config={lobbyConfig}
      renderPreGame={renderPreGame}
      externalAction={externalAction}
      onActionChange={onActionChange}
    />
  );
}
