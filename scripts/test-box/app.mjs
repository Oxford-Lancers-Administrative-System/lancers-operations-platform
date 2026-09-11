#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import { runtime } from "./runtime.mjs";

try {
  const { env, lease } = await runtime();
  const child = spawn(
    path.resolve("node_modules/.bin/next"),
    ["dev", "-p", String(lease.applicationPort), "--hostname", "127.0.0.1"],
    {
      env: { ...process.env, ...env, NODE_ENV: "development", LANCERS_TEST_BOX: "1" },
      stdio: "inherit",
    },
  );
  const stop = (signal) => child.kill(signal);
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
} catch {
  console.error(
    "The local test app could not start. Check this worktree’s lease and configuration.",
  );
  process.exitCode = 1;
}
