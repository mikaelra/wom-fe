import type { LobbyState, Player } from '@/types/game';

export type LobbyPhase = 'loading' | 'lobby' | 'playing' | 'gameover';

export interface UseLobbyGameResult {
  phase: LobbyPhase;
  round: number;
  myPlayer: Player | undefined;
  isAlive: boolean;
  isAdmin: boolean;
  /** Has this player submitted both action and resource this round. */
  isReady: boolean;
  /** The boss-fight boss, if any. */
  enemy: Player | undefined;
  /** The game's overall winner, once decided. Kept separate from
   *  `wellWinner` -- they answer different questions and merging them
   *  under one name (as some call sites used to) obscures which one a
   *  given piece of UI actually means. */
  winner: string | null;
  /** Whoever most recently won the Well this round. */
  wellWinner: string | null;
  /** Is this player the one who was denied their choices this round. */
  isDenied: boolean;
  /** Name of the player who must currently pick a deny target, if any. */
  pendingDenyName: string | null;
  /** Is this player the one holding the pending deny. */
  isPendingDenyChooser: boolean;
  /** Players this player could pick as a deny target: alive, not self. */
  eligibleDenyTargets: Player[];
  /** Can this player submit an action right now (alive, not a spectator,
   *  not denied, game in progress and not over). The same 5-condition
   *  check that used to live under two different names
   *  (SceneOverlay.tsx's `showActions`, LobbyScene.tsx's
   *  `showAttackButtons`) -- identical formula, unified here. */
  canAct: boolean;
}

/**
 * Derives the client-side game phase and every "find my player"/"can I
 * act"-style value from a `LobbyState` snapshot. Pure function of its
 * arguments -- no subscription, no owned state (that's
 * `useLobbyConnection`'s job) -- so it's safe to call once per component
 * that already holds its own `state` reference (`SceneOverlay`,
 * `LobbyScene`, `LobbyOverlay` each do, via different plumbing).
 */
export function useLobbyGame(state: LobbyState | null, playerName: string): UseLobbyGameResult {
  const round = state?.round ?? 0;
  const gameOver = state?.gameover ?? false;
  const phase: LobbyPhase = state === null ? 'loading' : gameOver ? 'gameover' : round > 0 ? 'playing' : 'lobby';

  const myPlayer = state?.players.find((p) => p.name === playerName);
  const isAlive = (myPlayer?.hp ?? 0) > 0;
  const isAdmin = myPlayer?.admin ?? false;
  const isReady = state?.readyPlayers?.includes(playerName) ?? false;
  const enemy = state?.players.find((p) => p.boss);

  const winner = state?.winner ?? null;
  const wellWinner = state?.wellwinner ?? null;

  const isDenied = playerName === state?.deny_target;
  const pendingDenyName = state?.pending_deny ?? null;
  const isPendingDenyChooser = pendingDenyName === playerName;
  const eligibleDenyTargets = state?.players.filter((p) => p.name !== playerName && p.hp > 0) ?? [];

  const canAct = !gameOver && !isDenied && isAlive && !myPlayer?.spectator && round > 0;

  return {
    phase,
    round,
    myPlayer,
    isAlive,
    isAdmin,
    isReady,
    enemy,
    winner,
    wellWinner,
    isDenied,
    pendingDenyName,
    isPendingDenyChooser,
    eligibleDenyTargets,
    canAct,
  };
}
