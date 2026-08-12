// Use env in production; default to the local dev backend when unset. A
// production build with no NEXT_PUBLIC_BACKEND_URL fails loudly instead of
// silently falling back to some other environment's backend.
function resolveBackendUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_BACKEND_URL is not set. Refusing to fall back to a default backend in a production build."
    );
  }
  return "http://localhost:5000";
}

export const BACKEND_URL = resolveBackendUrl();

// Support contact shown on the shop/terms/refunds pages
// (docs/MONETIZATION_PLAN.md §12 2f's launch checklist: "support email
// published on the shop pages"). Env-overridable but defaults to a real
// address rather than throwing like BACKEND_URL above -- a missing value
// here doesn't break the app, just the contact info a player sees.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@worldofmythos.net";

// --- Build/wire-protocol identity (docs/MOBILE_AND_STEAM_PLAN.md §4.2, §2.3) ---

// Set in CI from `git describe --tags` / `git rev-list --count HEAD`
// (.github/workflows/deploy.yml), the way NEXT_PUBLIC_BACKEND_URL is above.
// Unset locally -- "dev" isn't a real semver, which is the point: it should
// never be mistaken for a shipped build in a support ticket.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
export const BUILD_NUMBER = process.env.NEXT_PUBLIC_BUILD_NUMBER || "0";

// Bumped in the same PR as any change to the wire shapes documented in
// wom-be/docs/PROTOCOL.md, alongside that repo's own config.PROTOCOL_VERSION
// -- the two are independent constants that must be changed together by
// convention, not by any shared source. Sent on every request/connection so
// the backend can recognize and reject a client it no longer supports (see
// lib/http.ts and lib/socket.ts) instead of failing in some less legible way.
export const PROTOCOL_VERSION = 1;
