import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load .env.local so tests that need the local Supabase stack (tests/rls-posture)
// find it, exactly as `next dev` would. CI provides the same variables directly.
loadEnv({ path: path.resolve(import.meta.dirname, ".env.local"), quiet: true });

// JSX is compiled by Vite's built-in esbuild using the automatic runtime from
// tsconfig (`"jsx": "react-jsx"`). No React plugin is needed: these tests do not
// use Fast Refresh, and adding one pulls in a second, conflicting Vite version.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
