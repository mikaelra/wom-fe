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
// game starts, Blimkin brings a cloud with Join Lobby.
//
// Every cloud stays up until the cross in its corner closes it.

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
  /** A small header over the lines, in dark red. */
  header?: string;
  lines: string[];
  /** The button under the lines, if any. */
  action?: string;
}

export const GAME_STARTED = 'Game started.';
export const GAME_FOUND = 'Game found!';
/** Blimkin's cloud on the Earth screen while queued for ranked (Mikael,
 *  2026-10-17): "Searching" in black, "Ranked" in red. */
export const SEARCHING = 'Searching';
export const RANKED = 'Ranked';
export const JOIN_GAME = 'Join Game';
export const JOIN_LOBBY = 'Join Lobby';

/** The ranked cloud: who you're up against, or (tapped) the countdown and the
 *  headcount -- with Join Lobby, so you can go in before it starts (Mikael,
 *  2026-10-17) -- or that the game has started, with Join Game. */
export function rankedCloud(match: RankedMatch, secondsLeft: number | null, expanded: boolean): CloudContent {
  if (match.started) return { lines: [GAME_STARTED], action: JOIN_GAME };
  if (expanded) {
    return {
      lines: [secondsLeft != null ? `Starts in ${secondsLeft}s` : 'Starting soon', countLine(match)],
      action: JOIN_LOBBY,
    };
  }
  const lines = ['You are currently in a lobby.'];
  if (match.players.length) lines.push(`Against: ${match.players.join(', ')}`);
  // The match was just found: said first, in a small dark red header (Mikael, 2026-10-17).
  return { header: GAME_FOUND, lines, action: JOIN_LOBBY };
}

/** The ranked arm's second line while a match is on, in the signpost's own
 *  capitals: the countdown (or GAME STARTED!) over the headcount. */
export function rankedSignSublabel(match: RankedMatch, secondsLeft: number | null): string {
  if (match.started) return 'GAME STARTED!';
  const clock = secondsLeft != null ? `STARTS IN ${secondsLeft}s` : 'STARTING SOON';
  return `${clock}\n${countLine(match)}`;
}

export type SeatKind = 'bossfight' | 'bot_ranked' | 'casual';

/** The cloud when a bossfight, bot-ranked or casual (private) game you're
 *  seated in starts while you're elsewhere. */
export function lobbyStartedCloud(kind: SeatKind): CloudContent {
  const line = { bossfight: 'Bossfight started.', bot_ranked: 'Bot ranked game started.', casual: 'Casual game started.' }[kind];
  return { lines: [line], action: JOIN_LOBBY };
}

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
/** How often the app tells wom-be the queue is still with it -- only while
 *  the app is open and showing. */
export const RENEW_EVERY_MS = 30 * 1000;
/** wom-be's RANKED_QUEUE_AWAY_SECONDS: once the app has been away this long
 *  (in the background, closed, phone locked) the server drops the queue, so
 *  nobody is matched into a game they aren't there for (Mikael, 2026-10-17). */
export const QUEUE_STALE_MS = 2 * 60 * 1000;

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

/** Whether to renew now. While the 30-minute question is open the queue is
 *  kept for another 30 minutes, then left to lapse if nobody answers. */
export function renewDue(q: StoredQueue, now: number): boolean {
  if (q.askedAt !== undefined && now - q.askedAt >= STILL_QUEUING_AFTER_MS) return false;
  return now - q.heardAt >= RENEW_EVERY_MS;
}

/** The question went unanswered long enough that the queue has lapsed. */
export function questionLapsed(q: StoredQueue, now: number): boolean {
  return q.askedAt !== undefined && now - q.askedAt >= STILL_QUEUING_AFTER_MS + QUEUE_STALE_MS;
}

// --- the bot-ranked queue, remembered so a match found away is noticed -------

export const BOT_QUEUE_KEY = 'wom.botRankedQueue';
/** wom-be's AI_RANKED_QUEUE_STALE_SECONDS: by then the entry is gone. */
export const BOT_QUEUE_MAX_AGE_MS = 15 * 60 * 1000;

/** Queued for bot ranked. The queue hook lives on the city page, so once
 *  the player walks off (the market, say) nothing hears the match-found
 *  push; this lets the seat watcher find the match instead (Mikael,
 *  2026-10-17: queued for a bot match, crafting a trade, no notice). */
export function rememberBotQueue(now = Date.now(), storage: Storage | null = local()) {
  writeJson(BOT_QUEUE_KEY, { at: now }, storage);
}

export function readBotQueue(now = Date.now(), storage: Storage | null = local()): boolean {
  const q = readJson<{ at: number }>(BOT_QUEUE_KEY, storage);
  return !!q && typeof q.at === 'number' && now - q.at <= BOT_QUEUE_MAX_AGE_MS;
}

export function forgetBotQueue(storage: Storage | null = local()) {
  remove(BOT_QUEUE_KEY, storage);
}

// --- a seat in a bossfight, bot-ranked or casual lobby ---------------------

export const SEAT_KEY = 'wom.seatedLobby';
/** A seat older than this is forgotten: no game waits that long. */
export const SEAT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface Seat {
  kind: SeatKind;
  lobbyId: string;
  at: number;
}

/** Which seat Blimkin speaks for first when several have news: bot ranked,
 *  then bossfight, then casual (Mikael, 2026-10-17; a ranked match comes
 *  before all of them, through the queue). Lower is more pressing. */
const SEAT_ORDER: readonly SeatKind[] = ['bot_ranked', 'bossfight', 'casual'];

export function seatPriority(kind: SeatKind): number {
  return SEAT_ORDER.indexOf(kind);
}

type SeatEntry = { lobbyId: string; at: number };
type SeatMap = Partial<Record<SeatKind, SeatEntry>>;

/** One seat per kind. (An older build wrote a single seat; it is read as one.) */
function readSeats(storage: Storage | null): SeatMap {
  const raw = readJson<Record<string, unknown>>(SEAT_KEY, storage);
  if (!raw || typeof raw !== 'object') return {};
  if (typeof raw.kind === 'string') return { [raw.kind]: { lobbyId: raw.lobbyId, at: raw.at } } as SeatMap;
  return raw as SeatMap;
}

export function rememberSeat(kind: SeatKind, lobbyId: string, now = Date.now(), storage: Storage | null = local()) {
  writeJson(SEAT_KEY, { ...readSeats(storage), [kind]: { lobbyId, at: now } }, storage);
}

/** The most pressing seat still held, if any. */
export function readSeat(now = Date.now(), storage: Storage | null = local()): Seat | null {
  const seats = readSeats(storage);
  for (const kind of SEAT_ORDER) {
    const e = seats[kind];
    if (e && typeof e.lobbyId === 'string' && typeof e.at === 'number' && now - e.at <= SEAT_MAX_AGE_MS) {
      return { kind, lobbyId: e.lobbyId, at: e.at };
    }
  }
  return null;
}

/** Forget the seat -- only that lobby's, so a newer seat isn't dropped by a
 *  late answer about an old one. */
export function forgetSeat(lobbyId: string, storage: Storage | null = local()) {
  const seats = readSeats(storage);
  let changed = false;
  for (const kind of SEAT_ORDER) {
    if (seats[kind]?.lobbyId === lobbyId) {
      delete seats[kind];
      changed = true;
    }
  }
  if (!changed) return;
  if (Object.keys(seats).length) writeJson(SEAT_KEY, seats, storage);
  else remove(SEAT_KEY, storage);
}
