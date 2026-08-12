#!/usr/bin/env node
import { readSession, updateLease } from "./lib/local-supabase-coordinator.mjs";

if (process.env.CI !== "true") {
  try {
    const session = readSession(process.cwd());
    await updateLease({ repoPath: process.cwd(), token: session.token });
  } catch (error) {
    console.error(`Local database-capable tests require a current fenced lease: ${error.message}`);
    console.error("Run `npm run db:acquire -- LAN-###` from the issue worktree.");
    process.exit(1);
  }
}
