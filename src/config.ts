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
