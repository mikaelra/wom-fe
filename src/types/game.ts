export interface Player {
  name: string;
  admin: boolean;
  hp: number;
  coins: number;
  attackDamage: number;
  alive: boolean;
  messages: (string | string[])[];
  idle_rounds: number;
  boss?: boolean;
  gremlin?: boolean;
  lost_soul?: boolean;
  spectator: boolean;
  title?: string;
  submittedAction?: string;
  submittedResource?: string;
  target?: string;
}

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp: string;
}

export interface LobbyState {
  round: number;
  players: Player[];
  winner: string | null;
  raidwinner: string | null;
  pending_deny: string | null;
  deny_target: string | null;
  readyPlayers: string[];
  round_end_time: string | null;
  start_time: number;
  boss_fight: boolean | null;
  gremlin_fight?: boolean | null;
  gameover: boolean | null;
  replay_votes_count?: number;
  replay_votes_needed?: number;
  next_lobby_id?: string | null;
  chat?: ChatMessage[];
}

export interface Relic {
  id: string | number;
  name: string;
  flavour_text?: string;
  count: number;
}
