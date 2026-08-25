#!/usr/bin/env node
import process from "node:process";
import {
  acquireLease,
  acquireMissionLease,
  assertConfigApplied,
  attachMissionLease,
  cleanupStale,
  coordinatorStatus,
  findOwningSessionPid,
  readSession,
  releaseLease,
  updateLease,
} from "./lib/local-supabase-coordinator.mjs";
import { requireVisualReviewReadiness } from "./lib/visual-review-readiness.mjs";

const repoPath = process.cwd();
const [operation, argument, ...rest] = process.argv.slice(2);
const option = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
};

try {
  if (operation === "status") {
    const registry = coordinatorStatus(repoPath);
    const slots = Object.fromEntries(
      Object.entries(registry.slots).map(([name, record]) => {
        const safeRecord = { ...record };
        delete safeRecord.token;
        return [name, safeRecord];
      }),
    );
    console.log(JSON.stringify({ ...registry, slots }, null, 2));
  } else if (operation === "acquire") {
    const lease = await acquireLease({ issueId: argument, repoPath, pid: findOwningSessionPid() });
    if (!lease) {
      console.log(
        "Both local Supabase slots are legitimately occupied. Continue database-independent work and retry later.",
      );
      process.exitCode = 2;
    } else {
      console.log(
        `Acquired ${lease.slot} for ${lease.issueId} (application http://localhost:${lease.applicationPort}).`,
      );
    }
  } else if (operation === "acquire-mission") {
    await cleanupStale({ repoPath });
    const lease = await acquireMissionLease({
      missionId: argument,
      repoPath,
      baseCommit: option("--base-commit"),
      migrationHead: option("--migration-head"),
      pid: findOwningSessionPid(),
    });
    console.log(
      `Acquired ${lease.slot} for ${lease.missionId} (application http://localhost:${lease.applicationPort}).`,
    );
  } else if (operation === "attach-mission") {
    const lease = await attachMissionLease({
      missionId: argument,
      repoPath,
      token: option("--token"),
    });
    console.log(`Attached this worktree to ${lease.slot} for ${lease.missionId}.`);
  } else if (operation === "heartbeat") {
    const session = readSession(repoPath);
    const lease = await updateLease({ repoPath, token: session.token });
    console.log(`Heartbeat recorded for ${lease.slot}.`);
  } else if (operation === "review-ready") {
    const session = readSession(repoPath);
    const current = await updateLease({ repoPath, token: session.token });
    // LAN-148: the containers must be running this holder's rendered Auth
    // configuration before anyone is told the environment is ready.
    assertConfigApplied(repoPath, current);
    requireVisualReviewReadiness(repoPath, current.applicationPort);
    const lease = await updateLease({ repoPath, token: session.token, state: "review-ready" });
    console.log(`${lease.slot} is protected as review-ready.`);
  } else if (operation === "release") {
    const session = readSession(repoPath);
    const lease = await releaseLease({ repoPath, token: session.token, slot: session.slot });
    console.log(`Released ${lease.slot}.`);
  } else if (operation === "cleanup-stale") {
    console.log(`Retired: ${(await cleanupStale({ repoPath })).join(", ") || "none"}.`);
  } else
    throw new Error(
      "Usage: coordinator <status|acquire LAN-###|acquire-mission M-... --base-commit SHA --migration-head N|attach-mission M-... --token TOKEN|heartbeat|review-ready|release|cleanup-stale>",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
