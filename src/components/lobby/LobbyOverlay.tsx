'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SceneOverlay, {
  type SceneOverlayConfig,
  type GameOverRenderOpts,
  type PreGameRenderOpts,
} from '@/components/SceneOverlay';
import type { GuideHighlights } from '@/lib/guideHighlights';
import BossSignupNudge from '@/components/BossSignupNudge';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';

type LobbyOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
  externalAction?: string;
  onActionChange?: (action: string) => void;
  guideHighlight?: GuideHighlights;
};

function InviteSection({ lobbyId }: { lobbyId: string }) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const lobbyUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/lobby/${lobbyId}`
    : `/lobby/${lobbyId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(lobbyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-gray-600">Invite</span>
        <div className="flex gap-2">
          <button
            type="button"
            title={copied ? 'Copied!' : 'Copy lobby link'}
            onClick={handleCopy}
            className="p-2 rounded-lg border-2 border-black bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
          >
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <button
            type="button"
            title="Show QR code"
            onClick={() => setShowQR(true)}
            className="p-2 rounded-lg border-2 border-black bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
              <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
              <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
              <path d="M14 14h.01M17 14h.01M20 14h.01M14 17h.01M17 17h3M17 20h3" />
            </svg>
          </button>
        </div>
      </div>

      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white rounded-2xl p-8 shadow-2xl relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowQR(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold cursor-pointer transition-colors"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-5 text-gray-800">Scan to Join</h3>
            <QRCodeSVG value={lobbyUrl} size={200} />
            <p className="mt-4 text-xs text-gray-400 text-center break-all max-w-[200px]">{lobbyUrl}</p>
          </div>
        </div>
      )}
    </>
  );
}

function renderGameOver({ state, playerName }: GameOverRenderOpts) {
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
                  {(state.winner === p.name || (!state.winner && state.wellwinner === p.name)) && (
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
            <div className="flex flex-wrap gap-3 mb-4 items-end">
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

          <div className="mb-4">
            <InviteSection lobbyId={lobbyId} />
          </div>
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
  enemyMaxHp: 8,
  suppressEnemyPanel: true,
  showEnemyAlways: false,
  showPlayerList: true,
  showDenyPicker: true,
  showChat: true,
  enableRaidTimer: true,
  hidePlayerActionButtons: true,
  stageCombatDamage: true,
  renderGameOver,
};

export default function LobbyOverlay({ lobbyId, onStateChange, externalAction, onActionChange, guideHighlight }: LobbyOverlayProps) {
  const [localState, setLocalState] = useState<LobbyState | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPlayerName(localStorage.getItem('playerName') ?? '');
    }
  }, []);

  const handleStateChange = (s: LobbyState | null) => {
    setLocalState(s);
    onStateChange?.(s);
  };

  const { myPlayer } = useLobbyGame(localState, playerName);
  const showNudge =
    !nudgeDismissed &&
    (localState?.gameover ?? false) &&
    (localState?.boss_fight ?? false) &&
    (myPlayer?.pending_relic_nudge ?? false);

  return (
    <>
      <SceneOverlay
        lobbyId={lobbyId}
        onStateChange={handleStateChange}
        config={lobbyConfig}
        renderPreGame={renderPreGame}
        externalAction={externalAction}
        onActionChange={onActionChange}
        guideHighlight={guideHighlight}
      />
      {showNudge && (
        <BossSignupNudge
          lobbyId={lobbyId}
          playerName={playerName}
          onDismiss={() => setNudgeDismissed(true)}
        />
      )}
    </>
  );
}
