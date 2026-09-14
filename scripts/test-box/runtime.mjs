import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import { readSession, updateLease } from "../lib/local-supabase-coordinator.mjs";
import { resolveLocalDatabaseUrl } from "../lib/local-db.mjs";

export function assertTargets(env, lease) {
  const databaseUrl = resolveLocalDatabaseUrl(env.SUPABASE_DB_URL);
  if (Number(new URL(databaseUrl).port) !== lease.ports.db) {
    throw new Error("Database port does not match this worktree's lease.");
  }
  if (Number(env.PORT) !== lease.applicationPort) {
    throw new Error("Application port does not match this worktree's lease.");
  }
  if (env.K_SERVICE) throw new Error("The test box cannot run in a deployed runtime.");
  return { databaseUrl, baseUrl: `http://127.0.0.1:${lease.applicationPort}` };
}

export function isLoopbackApp(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export async function runtime(repoPath = process.cwd()) {
  const session = readSession(repoPath);
  const lease = await updateLease({ repoPath, token: session.token });
  // Match the app's private file. Do not inherit a shell's database or provider
  // overrides that could disagree with the environment under review.
  const env = parse(fs.readFileSync(path.join(repoPath, ".env.local")));
  if (process.env.K_SERVICE) throw new Error("The test box cannot run in a deployed runtime.");
  return { env, lease, ...assertTargets(env, lease) };
}
