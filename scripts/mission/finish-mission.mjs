#!/usr/bin/env node
/**
 * Reclaim what a mission took out, and record how it ended.
 *
 * `/run-mission` deliberately stops short of this, for the same reason
 * `/start-issue` does: while work is in flight, a worktree is not debris, and an
 * agent must never delete a dirty or unmerged one. But once a package has
 * merged, its worktree, branch and attachment to the mission stack are debris,
 * and nothing reclaimed them — the first live mission left both database slots
 * held and its worktrees on disk.
 *
 * This is a separate invocation rather than a step inside `/run-mission`
 * (Brian, 2026-08-22) because the case that matters most is the one where the
 * Lead is gone: a mission whose session died mid-run leaves exactly this debris
 * and has nothing left to run an exit step.
 *
 * Reclamation is per package and does not wait for the mission — a package's
 * worktree goes the moment its pull request merges. The mission-owned stack is
 * retired only by whoever detaches last, because several workers share it.
 *
 * It takes no action this harness forbids: it never merges, un-drafts, deploys,
 * touches hosted Supabase, or writes to production. It runs strictly after a
 * merge that it proves from the repository.
 */
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { appendEvent, leadLeaseAvailable, replayState } from "./lib/state.mjs";
import { mergeProof, worktreeDefects } from "./lib/merge-proof.mjs";
import {
  coordinatorStatus,
  detachMissionLease,
  releaseLease,
} from "../lib/local-supabase-coordinator.mjs";

const repoPath = process.cwd();
const [missionId, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
};
const present = (name) => rest.includes(name);
const leadId = process.env.LANCERS_MISSION_LEAD_ID;
const targetPackageId = flag("--package");
const reclaimOnly = present("--reclaim-only");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

function git(args, cwd = repoPath) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** The real repository, behind the seam the proof is tested against. */
const io = {
  pullRequest(number) {
    const raw = execFileSync("gh", ["pr", "view", String(number), "--json", "state,mergeCommit"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  },
  isAncestor(sha, ref) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, ref], {
        cwd: repoPath,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  },
  exists: (candidate) => fs.existsSync(candidate),
  status: (worktree) => git(["status", "--porcelain"], worktree),
  stashList: (worktree) => git(["stash", "list"], worktree),
  hasRemoteBranch(worktree, branch) {
    try {
      git(["rev-parse", "--verify", `refs/remotes/origin/${branch}`], worktree);
      return true;
    } catch {
      return false;
    }
  },
  unpushed: (worktree, branch) =>
    git(["log", "--oneline", `origin/${branch}..${branch}`], worktree),
};

try {
  if (!missionId || !/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
    fail(
      "Usage: mission:finish M-<id> [--abandon --reason <why> --preserved <what>] [--package <WP-id> --reclaim-only]",
    );
  }
  if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this session's stable UUID.");

  // A stale origin/main reports merged work as unmerged and reclaims nothing.
  try {
    execFileSync("git", ["fetch", "origin", "main", "--quiet"], { cwd: repoPath, stdio: "ignore" });
  } catch {
    console.warn("Could not fetch origin/main; proving merges against the local view.");
  }

  const state = replayState(repoPath, missionId);
  if (!state.initialized) fail(`Mission ${missionId} has no durable state to finish.`);

  // Idempotent: a second run reports rather than double-acting.
  if (state.terminal) {
    console.log(`Mission ${missionId} is already ${state.terminal.state}. Nothing to do.`);
    process.exit(0);
  }

  // A live Lead owns its own mission. Reclaiming under one is the mission-scale
  // version of resetting another worktree's stack.
  if (!leadLeaseAvailable(state, { leadId, pid: process.pid })) {
    fail(
      `Mission ${missionId} is fenced to a live Lead (${state.lead.lead_id}). Reclamation waits for that session to end or its fence to expire.`,
    );
  }

  const abandoning = present("--abandon");
  const allLive = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
  const live = targetPackageId ? allLive.filter((pkg) => pkg.id === targetPackageId) : allLive;
  if (targetPackageId && live.length === 0) fail(`Mission ${missionId} has no ${targetPackageId}.`);
  const blocked = [];
  const reclaimedNow = [];

  for (const pkg of live) {
    if (state.reclaimed.includes(pkg.id)) continue;
    if (pkg.status !== "merged") {
      if (!abandoning) blocked.push(`${pkg.id} is ${pkg.status}, not merged`);
      continue;
    }
    if (state.activeWorkers.some((worker) => worker.package_id === pkg.id)) {
      blocked.push(`${pkg.id}: an implementation worker is still active`);
      continue;
    }
    const proof = mergeProof(pkg, io);
    if (!proof.merged) {
      blocked.push(`${pkg.id}: ${proof.reasons.join("; ")}`);
      continue;
    }
    const { defects, gone } = worktreeDefects(pkg.worktree, pkg.branch, io);
    if (defects.length > 0) {
      blocked.push(`${pkg.id}: ${defects.join(", ")}`);
      continue;
    }

    // Detach before removing: the registry is keyed by a real path. Whether
    // this was the last attachment is read back from the registry once, after
    // every package has let go, rather than trusted from any single detach.
    if (!gone) {
      try {
        await detachMissionLease({ missionId, repoPath: pkg.worktree });
      } catch {
        // A mission that never allocated a stack has nothing to detach from.
      }
      git(["worktree", "remove", pkg.worktree]);
    }
    git(["worktree", "prune"]);
    try {
      git(["branch", "-D", pkg.branch]);
    } catch {
      // Already gone, or never local here. Not a reason to stop.
    }

    await appendEvent(repoPath, missionId, {
      type: "package-reclaimed",
      package_id: pkg.id,
      merge_sha: proof.mergeSha ?? pkg.head_sha,
    });
    reclaimedNow.push(pkg.id);
    console.log(`Reclaimed ${pkg.id}: worktree removed, branch ${pkg.branch} deleted.`);
  }

  if (blocked.length > 0) {
    console.error(`${blocked.length} package(s) were left alone:`);
    for (const reason of blocked) console.error(`  - ${reason}`);
  }

  if (reclaimOnly) {
    if (blocked.length > 0) {
      console.error(`Automatic reclamation left ${targetPackageId ?? "the package"} alone.`);
      process.exit(2);
    }
    console.log(`Automatic reclamation completed for ${targetPackageId}.`);
    process.exit(0);
  }

  if (abandoning) {
    const reason = flag("--reason");
    const preserved = flag("--preserved");
    if (!reason || !preserved) {
      fail(
        "Abandoning records --reason <why it is unfinished> and --preserved <what was deliberately kept: pushed branches, open pull requests, the journal>.",
      );
    }
    await appendEvent(repoPath, missionId, {
      type: "mission-abandoned",
      reason,
      preserved,
    });
    console.log(
      `Mission ${missionId} recorded as abandoned. ${reclaimedNow.length} package(s) reclaimed; everything else was left where it is.`,
    );
    process.exit(0);
  }

  if (blocked.length > 0) {
    console.error(
      `\nMission ${missionId} is not finished. Finish or abandon those packages first; absence of evidence is never permission.`,
    );
    process.exit(2);
  }

  if (!state.closeout) {
    fail(
      `Mission ${missionId} has no recorded closeout. Write the evidence into the Notion mission record first — reclaiming resources is a different act from finishing the mission.`,
    );
  }

  // Retire the stack only when this was its last attachment. Whoever detaches
  // last does it, so a mission whose acquiring worktree is already gone can
  // still be tidied up.
  let stack = Object.values(coordinatorStatus(repoPath).slots).find(
    (record) => record.missionId === missionId,
  );
  // The Lead's own repository is an attachment too — `acquireMissionLease` puts
  // it in the list — and nothing else will ever let go of it.
  if (stack) {
    try {
      await detachMissionLease({ missionId, repoPath });
    } catch {
      // Already detached.
    }
    stack = Object.values(coordinatorStatus(repoPath).slots).find(
      (record) => record.missionId === missionId,
    );
  }
  let disposition = "no mission-owned stack was allocated";
  if (stack) {
    const attached = stack.attachedRepoPaths ?? [];
    if (attached.length > 0) {
      disposition = `left running; ${attached.length} attachment(s) still hold it`;
    } else {
      try {
        execFileSync(
          path.join(repoPath, "node_modules", ".bin", "supabase"),
          ["stop", "--no-backup", "--workdir", stack.runtimeRoot],
          { cwd: repoPath, stdio: "ignore" },
        );
        // Hand the ports back as well, or the record holds them until the
        // heartbeat window expires and someone runs cleanup-stale. Failure is
        // loud: a stopped stack with a live lease is still a leaked slot.
        await releaseLease({ repoPath, token: stack.token, slot: stack.slot });
        disposition = `retired ${stack.slot}`;
      } catch (error) {
        throw new Error(
          `${stack.slot} retirement failed: ${error.message.split("\n")[0]}. The mission is not finalized and the lease remains visible for recovery.`,
        );
      }
    }
  }

  await appendEvent(repoPath, missionId, {
    type: "mission-finalized",
    stack_disposition: disposition,
  });
  console.log(
    `Mission ${missionId} finalized. ${reclaimedNow.length} package(s) reclaimed this run; stack ${disposition}.`,
  );
} catch (error) {
  fail(error.message);
}
