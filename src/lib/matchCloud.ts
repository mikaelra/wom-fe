// What Blimkin's cloud says, and what the city signpost says instead, about a
// match the player is in while they are somewhere else in the app -- plus the
// small stores that let a ranked queue and a seat in a lobby follow the player
// around (Mikael, 2026-10-17). Pure apart from localStorage, so every rule is
// tested here and the components (components/match/) only wire it up.
//
// Ranked: the queue is always with you. When a match is found Blimkin comes
// out of a void and breathes out a cloud: you are in a lobby, and who you are
// up against. Tap it for the countdown and "X/6" (X never under 2). When the
// game starts the cloud says "Game started." with Join Game. At a signpost the
// cloud stays away and the signpost says it instead. After 30 minutes in the
// queue Blimkin asks whether you still want to be in it.
//
// Bossfight and bot ranked: seated in the lobby but somewhere else when the
// game starts, Blimkin gives a 5 second cloud with Join Lobby.

/** A ranked match found for this player, as /ranked/active reports it. */
export interface RankedMatch {
  lobbyId: string;
  /** Everyone else seated in the lobby. */
  players: string[];
  /** Everyone seated, the player too. */
  playerCount: number;
  maxPlayers: number;
  deadline: string | null;
  started: boolean;
}

/** The lobby only forms around two players, so it never shows fewer. */
export function shownCount(playerCount: number): number {
  return Math.max(2, playerCount);
}

/** "3/6". */
export function countLine(match: Pick<RankedMatch, 'playerCount' | 'maxPlayers'>): string {
  return `${shownCount(match.playerCount)}/${match.maxPlayers}`;
}

export interface CloudContent {
  lines: string[];
  /** The button under the lines, if any. */
  action?: string;
}

export const GAME_STARTED = 'Game started.';
export const JOIN_GAME = 'Join Game';
export const JOIN_LOBBY = 'Join Lobby';

/** The ranked cloud: who you're up against, or (tapped) the countdown and the
 *  headcount, or that the game has started. */
export function rankedCloud(match: RankedMatch, secondsLeft: number | null, expanded: boolean): CloudContent {
  if (match.started) return { lines: [GAME_STARTED], action: JOIN_GAME };
  if (expanded) {
    return { lines: [secondsLeft != null ? `Starts in ${secondsLeft}s` : 'Starting soon', countLine(match)] };
  }
  const lines = ['You are currently in a lobby.'];
  if (match.players.length) lines.push(`Against: ${match.players.join(', ')}`);
  return { lines };
}

/** The ranked arm's second line while a match is on, in the signpost's own
 *  capitals: the countdown (or GAME STARTED!) over the headcount. */
export function rankedSignSublabel(match: RankedMatch, secondsLeft: number | null): string {
  if (match.started) return 'GAME STARTED!';
  const clock = secondsLeft != null ? `STARTS IN ${secondsLeft}s` : 'STARTING SOON';
  return `${clock}\n${countLine(match)}`;
}

export type SeatKind = 'bossfight' | 'bot_ranked';

/** The 5 second cloud when a bossfight or bot-ranked game you're seated in
 *  starts while you're elsewhere. */
export function lobbyStartedCloud(kind: SeatKind): CloudContent {
  return { lines: [kind === 'bossfight' ? 'Bossfight started.' : 'Bot ranked game started.'], action: JOIN_LOBBY };
}

export const LOBBY_START_NOTICE_MS = 5000;

export const STILL_QUEUING = {
  question: 'Do you still want to be in the queue?',
  yes: 'Yes',
  no: 'No',
  dontAsk: 'Do not ask me again',
};

/** Whether the page shown is that lobby's. */
export function onLobbyPage(pathname: string | null, search: string, lobbyId: string): boolean {
  if (!pathname || !pathname.startsWith('/lobby')) return false;
  return new URLSearchParams(search).get('id') === lobbyId;
}

// --- storage ---------------------------------------------------------------

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, storage: Storage | null): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, storage: Storage | null) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full: the queue still works for this page's life.
  }
}

function remove(key: string, storage: Storage | null) {
  try {
    storage?.removeItem(key);
  } catch {
    // As above.
  }
}

// --- the ranked queue that follows you -------------------------------------

export const QUEUE_KEY = 'wom.rankedQueue';
export const DONT_ASK_KEY = 'wom.rankedQueue.dontAsk';

/** When Blimkin asks whether you still want to be in the queue. */
export const STILL_QUEUING_AFTER_MS = 30 * 60 * 1000;
/** How often the app tells wom-be the queue is still with it. */
export const RENEW_EVERY_MS = 5 * 60 * 1000;
/** wom-be's RANKED_QUEUE_STALE_SECONDS: unheard from this long, the server
 *  has dropped the entry. */
export const QUEUE_STALE_MS = 30 * 60 * 1000;

export interface StoredQueue {
  name: string;
  /** When the current 30 minutes started: the join, or the last "Yes". */
  queuedAt: number;
  /** When wom-be last heard from this queue (join or renew). */
  heardAt: number;
  /** Set while the question is open. */
  askedAt?: number;
}

export function readQueue(storage: Storage | null = local()): StoredQueue | null {
  const q = readJson<StoredQueue>(QUEUE_KEY, storage);
  return q && typeof q.name === 'string' && typeof q.queuedAt === 'number' && typeof q.heardAt === 'number' ? q : null;
}

export function writeQueue(q: StoredQueue, storage: Storage | null = local()) {
  writeJson(QUEUE_KEY, q, storage);
}

export function clearQueue(storage: Storage | null = local()) {
  remove(QUEUE_KEY, storage);
}

export function readDontAsk(storage: Storage | null = local()): boolean {
  return readJson<boolean>(DONT_ASK_KEY, storage) === true;
}

export function writeDontAsk(storage: Storage | null = local()) {
  writeJson(DONT_ASK_KEY, true, storage);
}

/** Whether a stored queue is still alive on the server, so a reload or a
 *  relaunch picks it back up. */
export function resumable(q: StoredQueue | null, now: number): q is StoredQueue {
  return !!q && now - q.heardAt < QUEUE_STALE_MS;
}

/** Whether it's time to ask "still want to be in the queue?". */
export function askDue(q: StoredQueue, now: number, dontAsk: boolean): boolean {
  return !dontAsk && q.askedAt === undefined && now - q.queuedAt >= STILL_QUEUING_AFTER_MS;
}

/** Whether to renew now. Not while the question is open: unanswered, the
 *  queue lapses on the server. */
export function renewDue(q: StoredQueue, now: number): boolean {
  return q.askedAt === undefined && now - q.heardAt >= RENEW_EVERY_MS;
}

// --- a seat in a bossfight or bot-ranked lobby -----------------------------

export const SEAT_KEY = 'wom.seatedLobby';
/** A seat older than this is forgotten: no game waits that long. */
export const SEAT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface Seat {
  kind: SeatKind;
  lobbyId: string;
  at: number;
}

export function rememberSeat(kind: SeatKind, lobbyId: string, now = Date.now(), storage: Storage | null = local()) {
  writeJson(SEAT_KEY, { kind, lobbyId, at: now }, storage);
}

export function readSeat(now = Date.now(), storage: Storage | null = local()): Seat | null {
  const seat = readJson<Seat>(SEAT_KEY, storage);
  if (!seat || (seat.kind !== 'bossfight' && seat.kind !== 'bot_ranked') || typeof seat.lobbyId !== 'string') return null;
  if (typeof seat.at !== 'number' || now - seat.at > SEAT_MAX_AGE_MS) return null;
  return seat;
}

/** Forget the seat -- only that lobby's, so a newer seat isn't dropped by a
 *  late answer about an old one. */
export function forgetSeat(lobbyId: string, storage: Storage | null = local()) {
  const seat = readJson<Seat>(SEAT_KEY, storage);
  if (seat?.lobbyId === lobbyId) remove(SEAT_KEY, storage);
}
