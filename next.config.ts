import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 'standalone' outputs a self-contained bundle (server.js + minimal
  // node_modules) at .next/standalone — the small runtime image
  // (Dockerfile) copies just that + .next/static + public.
  output: "standalone",
};

export default nextConfig;
