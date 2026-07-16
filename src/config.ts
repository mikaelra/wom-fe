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
