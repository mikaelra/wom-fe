import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Capacitor (mobile) / Electron (Steam) builds load a static export from
// disk, not this Next server -- docs/MOBILE_AND_STEAM_PLAN.md §5.3. The web
// deploy is untouched: BUILD_TARGET is unset there, so every branch below
// falls back to today's behavior.
const isNative = process.env.BUILD_TARGET === "native";

const nextConfig: NextConfig = {
  // "standalone" lets the production Docker image ship just the server +
  // traced deps (.next/standalone) instead of the full node_modules tree.
  // "export" produces a bundled `out/` dir with no server at all, which is
  // what a native shell wraps -- this also requires every dynamic route to
  // have generateStaticParams (see src/app/lobby/[lobbyId]/page.tsx).
  output: isNative ? "export" : "standalone",

  // next/image's optimizer needs a running server to resize on request;
  // static export has none, so images ship unoptimized (already-optimized
  // source assets, same as everything else under public/).
  images: isNative ? { unoptimized: true } : undefined,

  // The dev container is reached through a proxy, so the browser's origin
  // doesn't match localhost -- Next 15+ blocks HMR/dev-resource requests
  // from any origin not listed here.
  allowedDevOrigins: ["158.178.151.93"],

  // Next serves /public with `Cache-Control: public, max-age=0` — Netlify's
  // CDN used to absorb that, but self-hosted every visit re-downloads all the
  // models/textures. These assets are versioned by filename (v1, -hd, ...),
  // so cache them hard and ship changes under a new filename. Omitted
  // entirely under "export": headers() has no server response to attach to
  // there, and merely *defining* the key (even returning []) makes Next
  // warn it will silently do nothing -- a native build's assets are local
  // files anyway, and remote ones are served by the origin that already
  // applies this rule.
  ...(isNative
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:prefix(models|textures|audio|images|hdri|sounds|draco)/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=31536000, immutable",
                },
              ],
            },
          ];
        },
      }),
};

export default withSentryConfig(nextConfig, {
  // Source-map upload needs SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN at
  // build time (not set until a Sentry account exists) -- the plugin skips
  // it silently when they're unset, so this is safe to leave wired up now.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
