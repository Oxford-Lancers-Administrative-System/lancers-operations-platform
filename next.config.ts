import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server and only the traced
  // node_modules. This is what the Cloud Run container ships.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // Surfaced on /api/health so a running revision can be tied back to a commit.
  env: {
    GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA ?? "unknown",
  },
};

export default nextConfig;
