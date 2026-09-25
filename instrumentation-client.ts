import * as Sentry from "@sentry/nextjs";

// Web, Steam (Electron) and mobile (Capacitor) all ship the same bundle from
// the same Sentry project, so without this every shell's errors land in one
// undifferentiated stream. Split them by `environment` so the Steam build's
// crashes don't move the web error rate (docs/MOBILE_AND_STEAM_PLAN.md §5.3,
// "keyed per platform").
function resolveEnvironment(): string {
  if (process.env.NODE_ENV !== "production") {
    return process.env.NODE_ENV ?? "development";
  }
  // BUILD_TARGET=native marks a static export wrapped in a shell; the web
  // deploy leaves it unset. See src/lib/buildTarget.ts / next.config.ts.
  if (process.env.NEXT_PUBLIC_BUILD_TARGET !== "native") {
    return "production";
  }
  if (typeof window !== "undefined") {
    if (window.wom?.isSteam) return "steam";
    if ("Capacitor" in window) return "capacitor";
  }
  // A native build whose shell hasn't identified itself (preload not run yet,
  // or a shell we don't special-case) -- still worth separating from web.
  return "native";
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: resolveEnvironment(),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
