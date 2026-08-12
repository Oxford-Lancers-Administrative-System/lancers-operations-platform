#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "dotenv";
import { readSession, updateLease } from "./lib/local-supabase-coordinator.mjs";

const repoPath = process.cwd();

try {
  const session = readSession(repoPath);
  const lease = await updateLease({ repoPath, token: session.token });
  config({ path: path.join(repoPath, ".env.local"), quiet: true });
  const child = spawn(
    path.join(repoPath, "node_modules", ".bin", "next"),
    ["dev", "-p", String(lease.applicationPort)],
    {
      cwd: repoPath,
      env: { ...process.env, PORT: String(lease.applicationPort) },
      stdio: "inherit",
    },
  );
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
