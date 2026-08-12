#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  acquireLease,
  cleanupStale,
  coordinatorStatus,
  readSession,
  releaseLease,
  transferLeaseOwner,
  updateLease,
} from "./lib/local-supabase-coordinator.mjs";

const repoPath = process.cwd();
const [operation, argument] = process.argv.slice(2);

try {
  if (operation === "status") console.log(JSON.stringify(coordinatorStatus(repoPath), null, 2));
  else if (operation === "acquire") {
    const lease = await acquireLease({ issueId: argument, repoPath });
    if (!lease) {
      console.log(
        "Both local Supabase slots are legitimately occupied. Continue database-independent work and retry later.",
      );
      process.exitCode = 2;
    } else {
      const keeper = spawn(
        process.execPath,
        [path.join(repoPath, "scripts", "local-supabase-lease-keeper.mjs"), repoPath, lease.token],
        { detached: true, stdio: "ignore" },
      );
      keeper.unref();
      await transferLeaseOwner({ repoPath, token: lease.token, pid: keeper.pid });
      console.log(
        `Acquired ${lease.slot} for ${lease.issueId} (application http://localhost:${lease.applicationPort}).`,
      );
    }
  } else if (operation === "heartbeat") {
    const session = readSession(repoPath);
    const lease = await updateLease({ repoPath, token: session.token });
    console.log(`Heartbeat recorded for ${lease.slot}.`);
  } else if (operation === "review-ready") {
    const session = readSession(repoPath);
    const lease = await updateLease({ repoPath, token: session.token, state: "review-ready" });
    console.log(`${lease.slot} is protected as review-ready.`);
  } else if (operation === "release") {
    const session = readSession(repoPath);
    const lease = await releaseLease({ repoPath, token: session.token });
    console.log(`Released ${lease.slot}.`);
  } else if (operation === "cleanup-stale") {
    console.log(`Marked stale: ${(await cleanupStale({ repoPath })).join(", ") || "none"}.`);
  } else
    throw new Error(
      "Usage: coordinator <status|acquire LAN-###|heartbeat|review-ready|release|cleanup-stale>",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
