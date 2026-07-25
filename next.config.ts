import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Lets the production Docker image ship just the server + traced deps
  // (.next/standalone) instead of the full node_modules tree.
  output: "standalone",

  // The dev container is reached through a proxy, so the browser's origin
  // doesn't match localhost -- Next 15+ blocks HMR/dev-resource requests
  // from any origin not listed here.
  allowedDevOrigins: ["158.178.151.93"],

  // Next serves /public with `Cache-Control: public, max-age=0` — Netlify's
  // CDN used to absorb that, but self-hosted every visit re-downloads all the
  // models/textures. These assets are versioned by filename (v1, -hd, ...),
  // so cache them hard and ship changes under a new filename.
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
