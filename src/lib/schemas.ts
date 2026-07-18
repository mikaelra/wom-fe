import { z } from 'zod';
import { RelicSchema } from '@/types/game';
import { GameEventSchema } from '@/lib/gameEvents';

// Response/payload schemas for every server-sent shape the frontend
// actually consumes, built directly against wom-be's docs/PROTOCOL.md (the
// golden-tested source of truth) rather than assumption. Routes the
// frontend never calls (get_history, get_player_history, the HTTP
// join_lobby route) and routes that don't exist on the backend at all
// (get_state, request_replay) intentionally have no schema here — see
// docs/CODEBASE_HARDENING_PLAN.md's Phase 1 writeup.

// ── HTTP response schemas ───────────────────────────────────────────────────

export const CreateLobbyResponseSchema = z.object({
  lobby_id: z.string(),
  token: z.string(),
});

export const GetBossfightLobbyResponseSchema = z.object({
  lobby_id: z.string(),
  start_time: z.string(),
  // Absent entirely (not null) when the caller already had a token from an
  // earlier join and is just re-checking in (e.g. a page refresh) — see
  // api.ts's getBossfightLobby.
  token: z.string().optional(),
});

export const GetNextBossfightTimeResponseSchema = z.object({
  start_time: z.string(),
});

export const GetPlayerRelicsResponseSchema = z.object({
  relics: z.array(RelicSchema),
});

// `messages` is a genuine mix of plain strings and single/multi-element
// string arrays — confirmed directly against wom-be's engine code: most
// entries are appended as plain strings (e.g. engine/phases/attacks.py's
// `p["messages"] += ["..."]`), but several are inserted as one-element
// lists (e.g. engine/rewards.py's `winner["messages"].insert(1, ["You got
// 2 coins!"])`). The existing `.flat()` call in SceneOverlay.tsx already
// handles both shapes; this schema just makes that contract explicit.
export const GetPlayerMessagesResponseSchema = z.object({
  player: z.string(),
  messages: z.array(z.union([z.string(), z.array(z.string())])),
  events: z.array(GameEventSchema),
});

export const CheckNameResponseSchema = z.object({
  claimed: z.boolean(),
});

export const LogInResponseSchema = z.object({
  success: z.boolean(),
  requires_code: z.boolean().optional(),
  always_verify_email: z.boolean().optional(),
  session_token: z.string().optional(),
});

export const VerifyLoginCodeResponseSchema = z.object({
  success: z.boolean(),
  always_verify_email: z.boolean().optional(),
  session_token: z.string().nullable().optional(),
});

export const ResolveAccountSessionResponseSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  always_verify_email: z.boolean(),
  email_verified: z.boolean(),
});

export const LogOutResponseSchema = z.object({
  success: z.boolean(),
});

export const GetAlwaysVerifyEmailFlagResponseSchema = z.object({
  always_verify_email: z.boolean(),
});

export const RequestToggleVerifyEmailResponseSchema = z.object({
  success: z.boolean(),
});

export const ConfirmToggleVerifyEmailResponseSchema = z.object({
  success: z.boolean(),
  always_verify_email: z.boolean(),
});

export const ClaimNameResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
});

export const ClaimPendingRelicResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
  relic_name: z.string().optional(),
});

export const ConfirmEmailVerificationResponseSchema = z.object({
  success: z.boolean(),
  purpose: z.enum(['claim_name', 'claim_relic', 'claim_wheel']),
  relic_name: z.string().nullable().optional(),
  session_token: z.string().optional(),
});

export const ForgotUsernameResponseSchema = z.object({
  success: z.boolean(),
});

export const ClaimPendingWheelResponseSchema = z.object({
  success: z.boolean(),
  pending_verification: z.boolean().optional(),
});

export const InventoryResponseSchema = z.object({
  equipped_skin: z.string(),
  skins: z.array(z.object({ skin: z.string(), count: z.number().int() })),
  wheels: z.array(z.object({ id: z.number().int(), kind: z.string() })),
});

export const EquipSkinResponseSchema = z.object({
  success: z.boolean(),
  equipped_skin: z.string(),
});

export const SpinWheelResponseSchema = z.object({
  success: z.boolean(),
  result_skin: z.string(),
});

// ── Socket.IO payload schemas (not already in @/types/game) ────────────────

export const JoinedLobbyPayloadSchema = z.object({
  lobby_id: z.string(),
  token: z.string(),
});

export const JoinedPayloadSchema = z.object({
  lobby_id: z.string(),
  name: z.string(),
});

export const LeftPayloadSchema = z.object({
  lobby_id: z.string(),
  name: z.string().nullable(),
});

export const ErrorPayloadSchema = z.object({
  message: z.string(),
});
