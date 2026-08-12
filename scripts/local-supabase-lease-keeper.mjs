#!/usr/bin/env node
import { updateLease } from "./lib/local-supabase-coordinator.mjs";

const [repoPath, token] = process.argv.slice(2);

async function heartbeat() {
  try {
    await updateLease({ repoPath, token });
  } catch {
    process.exit(0);
  }
}

await heartbeat();
setInterval(heartbeat, 30_000);
