import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the production Docker image ship just the server + traced deps
  // (.next/standalone) instead of the full node_modules tree.
  output: "standalone",

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

export default nextConfig;
