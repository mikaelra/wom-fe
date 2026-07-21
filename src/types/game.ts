import { z } from 'zod';

// Wire types for every payload the backend actually sends (see wom-be's
// docs/PROTOCOL.md, the golden-tested source of truth). Schemas are the
// source; the exported interfaces are `z.infer` so every existing import of
// `Player`/`LobbyState`/`ChatMessage`/`Relic` keeps working unchanged.
//
// Corrected against real drift found while introducing these schemas
// (Phase 1 of docs/CODEBASE_HARDENING_PLAN.md): the previous hand-written
// Player interface had `messages`/`submittedAction`/`submittedResource`/
// `target` fields that the backend's state_update broadcast never sends
// (deliberately excluded by the backend's hidden-info fix) and that nothing
// on this side ever read either -- dropped. It was missing `bot`, which the
// backend always sends -- added. `start_time` was typed `number` but the
// backend always sends an ISO8601 string -- fixed (this "worked" before
// only because `new Date()` silently accepts either). `replay_votes*`/
// `next_lobby_id` never existed on the wire at all -- the backend has never
// implemented the rematch endpoint these fields depended on; dropped along
// with the UI that read them (see SceneOverlay.tsx/LobbyOverlay.tsx).

export const PlayerSchema = z.object({
  name: z.string(),
  hp: z.number().int(),
  coins: z.number().int(),
  attackDamage: z.number().int(),
  alive: z.boolean(),
  admin: z.boolean(),
  spectator: z.boolean(),
  bot: z.boolean(),
  boss: z.boolean(),
  lost_soul: z.boolean().nullable(),
  title: z.string().nullable(),
  idle_rounds: z.number().int(),
  pending_relic_nudge: z.boolean().nullable(),
  // Optional, not just nullable: wom-fe and wom-be deploy independently, and
  // these three are new enough that a currently-deployed wom-be can omit
  // the key entirely rather than send it as null (see e.g. the E2E CI job,
  // which runs this schema against ghcr.io/mikaelra/wom-be:latest --
  // whatever wom-be's main branch happens to be built from, not necessarily
  // whatever wom-fe branch/PR is being tested). Every consumer already
  // treats a missing value the same as null (`?? 'frog_green_v1'`, `?.`).
  skin: z.string().nullable().optional(),
  wheel_awarded: z.boolean().nullable().optional(),
  pending_wheel_nudge: z.boolean().nullable().optional(),
  // Same deploy-independence reasoning as skin/wheel_awarded above.
  selected_relic_ids: z.array(z.number().int()).optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

// Only relic with a wired-up start_game effect today (+1 coins) -- must
// match wom-be's config.COIN_RELIC_ID (db/init/001_supabase_dump.sql's
// relics table, name="Hades' Coin", boss_id=6/Hades).
export const COIN_RELIC_ID = 1;

export const ChatMessageSchema = z.object({
  sender: z.string(),
  message: z.string(),
  timestamp: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const LobbyStateSchema = z.object({
  round: z.number().int(),
  players: z.array(PlayerSchema),
  winner: z.string().nullable(),
  wellwinner: z.string().nullable(),
  pending_deny: z.string().nullable(),
  deny_target: z.string().nullable(),
  readyPlayers: z.array(z.string()),
  history: z.array(z.string()),
  round_end_time: z.string().nullable(),
  boss_fight: z.boolean(),
  start_time: z.string().nullable(),
  gameover: z.boolean(),
  chat: z.array(ChatMessageSchema),
});
export type LobbyState = z.infer<typeof LobbyStateSchema>;

export const RelicSchema = z.object({
  id: z.union([z.string(), z.number()]),
  boss_id: z.number().int(),
  created_at: z.string(),
  name: z.string(),
  power_category: z.string(),
  // Kept optional even though docs/PROTOCOL.md doesn't mark it so: nothing
  // on this side reads it today, and the cost of guessing wrong here (every
  // relic fetch failing to parse over one unused field) outweighs the
  // accuracy gain of asserting it's always present.
  flavour_text: z.string().optional(),
  count: z.number().int(),
});
export type Relic = z.infer<typeof RelicSchema>;
