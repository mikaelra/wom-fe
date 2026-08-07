'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SceneOverlay, {
  type SceneOverlayConfig,
  type GameOverRenderOpts,
  type PreGameRenderOpts,
} from '@/components/SceneOverlay';
import BossSignupNudge from '@/components/BossSignupNudge';
import WheelClaimNudge from '@/components/WheelClaimNudge';
import StartGameButton from '@/components/StartGameButton';
import RulesModal from '@/components/lobby/RulesModal';
import RankBadge from '@/components/hud/RankBadge';
import { useLobbyGame } from '@/lib/useLobbyGame';
import type { LobbyState } from '@/types/game';

type LobbyOverlayProps = {
  lobbyId: string;
  onStateChange?: (state: LobbyState | null) => void;
  externalAction?: string;
  onActionChange?: (action: string) => void;
  /** Called whenever the player picks a resource -- see SceneOverlayProps. */
  onResourceChange?: (resource: string) => void;
  /** Ambient pre-round camera orbit (see CameraFlyIn/LobbyScene) -- lifted up
   *  to the page since the camera and this overlay are separate render trees. */
  spinEnabled?: boolean;
  onToggleSpin?: () => void;
  /** In-round camera drag/zoom state -- same lift-to-the-page split as
   *  spinEnabled above. Drives the Reset Camera button. */
  cameraMoved?: boolean;
  onResetCamera?: () => void;
  /** Poisoned Dagger (instakill) cue for the ATK resource card -- computed
   *  by LobbyScene (see its own onInstakillActiveChange), passed straight
   *  through to SceneOverlay. */
  instakillActive?: boolean;
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
        // overflow-y-auto on THIS outer layer (not just the card below) is
        // what actually guarantees reachability on a short viewport: a
        // max-height + internal scroll on the card alone still left the top
        // of the card pushed off-screen by the outer flex's vertical
        // centering, with nothing to scroll to bring it back -- confirmed
        // live at a 375x420 viewport. The inner min-h-full+flex wrapper
        // keeps the card centered whenever it *does* fit, same as before.
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQR(false)}
        >
          <div className="min-h-full flex items-center justify-center p-4">
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
        </div>
      )}
    </>
  );
}

export function renderGameOver({ state, playerName }: GameOverRenderOpts) {
  const myPlayer = state.players.find((p) => p.name === playerName);
  const rankedResult = state.ranked_results?.[playerName];
  // "No contest" ending (engine.boss_ai.players_defeated): every human is
  // dead but a bot survived, so no winner is ever declared -- distinct
  // from a boss-fight loss, which sets state.winner to the boss's own
  // name (e.g. "Hades wins!") and must keep reading as that, not this.
  // The bot-alive check rules out the one other way gameover can end up
  // true with no winner (a crashed pre-game ranked-countdown watcher,
  // sockets/utils.py's end_game(None) -- round 0, no bots in play yet).
  const botsWon = !state.winner && state.players.some((p) => p.bot && p.alive);

  return (
    <div className="mt-3 text-center">
      <p className="text-xl font-bold mb-2">
        {state.winner === playerName ? (
          <span className="text-green-400">You won! 👑</span>
        ) : botsWon ? (
          <span className="text-yellow-400">🤖 Bots win!</span>
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
        <Link href="/" className="text-blue-400 no-underline text-2xl" aria-label="Back to Home">
          🏠
        </Link>
      </div>
    </div>
  );
}

// Kept in sync by hand with wom-be's config.BOT_TYPES/BOT_DISPLAY_NAMES --
// bot_type is never part of the public wire format (domain/player.py's
// PUBLIC_PLAYER_FIELDS omits it, it's server-internal AI dispatch), so
// there's nothing to derive this list from at runtime.
//
// The empty-string entry isn't a real bot_type -- sockets/lobby.py's
// handle_add_dummy falls back to its own random pick for anything that
// doesn't name one of BOT_TYPES, which this deliberately relies on rather
// than duplicating the random choice here.
const RANDOM_BOT_TYPE = '';
const BOT_TYPES: { type: string; label: string }[] = [
  { type: 'TURTLE', label: 'Turtle' },
  { type: 'SHEEP', label: 'Sheep' },
  { type: 'WOLF', label: 'Wolf' },
  { type: 'OWL', label: 'Owl' },
  { type: RANDOM_BOT_TYPE, label: 'Random' },
];

// "Add Bot" expands into one button per bot type, stacked vertically above
// where it was -- picking one adds that bot and immediately collapses back
// to "Add Bot" so the admin can add another right away; clicking anywhere
// outside cancels the same way, without adding anything. Same
// click-outside-to-cancel idiom as RelicSelectionPopover.tsx. Absolutely
// positioned (not a plain flex sibling of Start Game) so the stack growing
// to 4 buttons tall can never stretch/resize Start Game's own button --
// the relative wrapper it's anchored to has no intrinsic height of its own.
function AddBotButton({ btn, onAddDummy }: { btn: string; onAddDummy: (botType: string) => void }) {
  const [picking, setPicking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picking) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPicking(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [picking]);

  const handlePick = (botType: string) => {
    onAddDummy(botType);
    setPicking(false);
  };

  return (
    <div className="relative">
      {/* Stays in normal flow (just hidden, not unmounted) while picking --
          an unmounted button would collapse this wrapper to zero width,
          shrinking the row and re-centering it (see the parent's
          items-center), which visibly shifted Start Game sideways every
          time this opened. `invisible` keeps the exact same box reserved
          (and stops clicks on it, unlike opacity-0) without that shift. */}
      <button
        type="button"
        onClick={() => setPicking(true)}
        className={`${btn} bg-gray-600 text-white ${picking ? 'invisible' : ''}`}
      >
        Add Bot
      </button>
      {picking && (
        <div
          ref={containerRef}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col gap-2"
        >
          {BOT_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => handlePick(type)}
              className={`${btn} bg-gray-600 text-white`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
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
  onOpenRules,
}: PreGameRenderOpts) {
  // Deliberately no full-screen backdrop and no player list here -- the 3D
  // scene (players seated at the table) is the primary view while everyone
  // waits, complete with its own per-player kick/relic/status controls (see
  // PlayerAvatars' lobby-controls row). This overlay is now just a thin top
  // status pill plus the admin/invite controls pinned to the bottom.
  return (
    <>
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <Link href="/" className="text-white/90 no-underline text-2xl drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" aria-label="Back to Home">
          🏠
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
          {spinEnabled ? '⏸' : '▶️'} Camera Spin
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center gap-4">
        {isAdmin && (
          // w-max, not the default auto: this div's ancestor is centered via
          // `left-1/2 -translate-x-1/2`, and for an absolutely-positioned
          // auto-width box, `left: 50%` caps the shrink-to-fit available
          // width to (containing block width - left offset) = half the
          // viewport, computed *before* the translate re-centers it -- so on
          // a narrow phone Start Game + Add Bot didn't actually have room to
          // sit side by side and wrapped onto separate lines even though
          // there was plenty of real screen width either side. w-max sizes
          // this row to its own content instead of that phantom half-width
          // cap, so flex-wrap never needs to trigger.
          <div className="flex w-max gap-3">
            <StartGameButton state={state} btn={btn} onStartGame={onStartGame} />
            <AddBotButton btn={btn} onAddDummy={onAddDummy} />
          </div>
        )}
        <button
          type="button"
          onClick={onOpenRules}
          className="text-sm px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
        >
          Rules
        </button>
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
  backLabel: '🏠',
  loadingText: 'Loading lobby…',
  enemyMaxHp: 8,
  suppressEnemyPanel: true,
  showEnemyAlways: false,
  showPlayerList: true,
  showChat: true,
  enableRaidTimer: true,
  hidePlayerActionButtons: true,
  stageCombatDamage: true,
  renderGameOver,
};

export default function LobbyOverlay({ lobbyId, onStateChange, externalAction, onActionChange, onResourceChange, spinEnabled, onToggleSpin, cameraMoved, onResetCamera, instakillActive }: LobbyOverlayProps) {
  const [localState, setLocalState] = useState<LobbyState | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [wheelNudgeDismissed, setWheelNudgeDismissed] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [playerName, setPlayerName] = useState('');
  // Mirrors SceneOverlay's own gate for when the Game Over text actually
  // appears (held back until the eliminating kill's animation has played --
  // see its onGameOverRevealed comment). The nudges below used to react to
  // the raw state.gameover flag instead, which flips true the instant the
  // server broadcast arrives, so a wheel/relic win popped up over the still-
  // playing death animation instead of after "Game Over" showed.
  const [gameOverRevealed, setGameOverRevealed] = useState(false);

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
    gameOverRevealed &&
    (localState?.boss_fight ?? false) &&
    (myPlayer?.pending_relic_nudge ?? false);
  // Not gated on boss_fight -- the Wheel drops on any match end (PvP or
  // boss fight), unlike relics which are Hades-bossfight-only.
  const showWheelNudge =
    !wheelNudgeDismissed &&
    gameOverRevealed &&
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
        onResourceChange={onResourceChange}
        spinEnabled={spinEnabled}
        onToggleSpin={onToggleSpin}
        onOpenRules={() => setShowRules(true)}
        onGameOverRevealed={setGameOverRevealed}
        cameraMoved={cameraMoved}
        onResetCamera={onResetCamera}
        instakillActive={instakillActive}
      />
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
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
