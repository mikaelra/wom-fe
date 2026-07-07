import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the production Docker image ship just the server + traced deps
  // (.next/standalone) instead of the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
