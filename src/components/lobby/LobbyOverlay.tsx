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
import WheelClaimNudge from '@/components/WheelClaimNudge';
import StartGameButton from '@/components/StartGameButton';
import RankBadge from '@/components/hud/RankBadge';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';

type LobbyOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
  externalAction?: string;
  onActionChange?: (action: string) => void;
  guideHighlight?: GuideHighlights;
  /** Ambient pre-round camera orbit (see CameraFlyIn/LobbyScene) -- lifted up
   *  to the page since the camera and this overlay are separate render trees. */
  spinEnabled?: boolean;
  onToggleSpin?: () => void;
};

export function InviteSection({ lobbyId }: { lobbyId: string }) {
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
        <span className="text-sm font-semibold text-white/70">Invite</span>
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

export function renderGameOver({ state, playerName }: GameOverRenderOpts) {
  const myPlayer = state.players.find((p) => p.name === playerName);
  const rankedResult = state.ranked_results?.[playerName];

  return (
    <div className="mt-3 text-center">
      <p className="text-xl font-bold mb-2">
        {state.winner === playerName ? (
          <span className="text-green-400">You won! 👑</span>
        ) : (
          <span className="text-yellow-400">Game Over! {state.winner} wins!</span>
        )}
      </p>
      {myPlayer?.wheel_awarded && (
        <p className="text-amber-300 font-semibold mb-2">
          🎡 You won a Wheel!{' '}
          <Link href="/inventory" className="underline hover:text-amber-200">
            Spin it in your inventory
          </Link>
        </p>
      )}
      {/* No raw rating number shown -- only the derived tier, once there is
          one (rankedResult.tier_after is null while still hidden during
          placements, docs/RANK_SYSTEM_PLAN.md §4/§5). */}
      {rankedResult?.tier_after && (
        <p className="mb-2 flex items-center justify-center gap-2 flex-wrap">
          <RankBadge tier={rankedResult.tier_after} />
          {/* tier_before is only ever null here on the game-10 debut reveal
              (docs/RANK_SYSTEM_PLAN.md §5) -- promoted stays null too since
              the backend has nothing to compare against, so this and the
              up/down text below are mutually exclusive. */}
          {rankedResult.tier_before === null && (
            <span className="text-cyan-400 font-semibold">Placement complete!</span>
          )}
          {rankedResult.promoted === true && <span className="text-green-400 font-semibold">Ranked up!</span>}
          {rankedResult.promoted === false && <span className="text-red-400 font-semibold">Ranked down.</span>}
        </p>
      )}
      <div className="flex flex-col gap-2 items-center">
        <Link href="/" className="text-blue-400 hover:underline font-medium">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

export function renderPreGame({
  state,
  lobbyId,
  isAdmin,
  boss,
  raidMins,
  raidSecs,
  rankedSecondsLeft,
  btn,
  onStartGame,
  onAddDummy,
  spinEnabled,
  onToggleSpin,
}: PreGameRenderOpts) {
  // Deliberately no full-screen backdrop and no player list here -- the 3D
  // scene (players seated at the table) is the primary view while everyone
  // waits, complete with its own per-player kick/relic/status controls (see
  // PlayerAvatars' lobby-controls row). This overlay is now just a thin top
  // status pill plus the admin/invite controls pinned to the bottom.
  return (
    <>
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <Link href="/" className="text-white/90 hover:underline font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          ← Back to Home
        </Link>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center gap-2">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl border border-white/15 px-5 py-2 text-white text-center">
          {state.boss_fight && boss ? (
            <>
              <p className="font-bold">{boss.name}</p>
              <p className="text-white/60 text-xs">{boss.title}</p>
              <p className="text-sm">HP: {boss.hp}</p>
              {raidMins != null && raidSecs != null && (
                <p className="text-white/60 text-xs">Boss-fight starts in {raidMins}m {raidSecs}s</p>
              )}
            </>
          ) : state.ranked ? (
            <>
              <p className="font-bold text-amber-300">Ranked Match</p>
              <p className="text-white/70 text-sm">{state.players.length}/6 players joined</p>
              {rankedSecondsLeft != null && (
                <p className="text-white/70 text-xs">Match starts in {rankedSecondsLeft}s</p>
              )}
            </>
          ) : (
            <p className="font-bold tracking-tight">Lobby ID: {lobbyId}</p>
          )}
        </div>
        {/* Pauses CameraFlyIn's ambient pre-round orbit -- it's hard to land a
            kick/relic click in the 3D scene while the table is drifting. Its own
            box, separate from the status pill above. */}
        <button
          type="button"
          onClick={onToggleSpin}
          className="text-xs px-2 py-1 rounded-md border border-white/20 bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
        >
          {spinEnabled ? '⏸ Pause camera spin' : '▶️ Play camera spin'}
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center gap-4">
        {isAdmin && (
          <div className="flex flex-wrap gap-3 justify-center">
            <StartGameButton state={state} btn={btn} onStartGame={onStartGame} />
            <button
              type="button"
              onClick={onAddDummy}
              className={`${btn} bg-gray-600 text-white`}
            >
              Add Bot
            </button>
          </div>
        )}
        <InviteSection lobbyId={lobbyId} />
      </div>
    </>
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

export default function LobbyOverlay({ lobbyId, onStateChange, externalAction, onActionChange, guideHighlight, spinEnabled, onToggleSpin }: LobbyOverlayProps) {
  const [localState, setLocalState] = useState<LobbyState | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [wheelNudgeDismissed, setWheelNudgeDismissed] = useState(false);
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
  // Not gated on boss_fight -- the Wheel drops on any match end (PvP or
  // boss fight), unlike relics which are Hades-bossfight-only.
  const showWheelNudge =
    !wheelNudgeDismissed &&
    (localState?.gameover ?? false) &&
    (myPlayer?.pending_wheel_nudge ?? false);

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
        spinEnabled={spinEnabled}
        onToggleSpin={onToggleSpin}
      />
      {showNudge && (
        <BossSignupNudge
          lobbyId={lobbyId}
          playerName={playerName}
          onDismiss={() => setNudgeDismissed(true)}
        />
      )}
      {showWheelNudge && (
        <WheelClaimNudge
          lobbyId={lobbyId}
          playerName={playerName}
          onDismiss={() => setWheelNudgeDismissed(true)}
        />
      )}
    </>
  );
}
