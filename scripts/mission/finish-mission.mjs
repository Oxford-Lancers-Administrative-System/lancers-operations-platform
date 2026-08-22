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
import { coordinatorStatus, detachMissionLease } from "../lib/local-supabase-coordinator.mjs";

const repoPath = process.cwd();
const [missionId, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
};
const present = (name) => rest.includes(name);
const leadId = process.env.LANCERS_MISSION_LEAD_ID;

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

/** Ask the repository, never the pull-request body and never Linear. The
 * mission-merge lane merges without a human, so "Brian merged it" is not a
 * state anyone may infer. */
function mergeProof(pkg) {
  const reasons = [];
  let mergeSha = null;
  try {
    const raw = execFileSync(
      "gh",
      ["pr", "view", String(pkg.pr_number), "--json", "state,mergeCommit"],
      { cwd: repoPath, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const view = JSON.parse(raw);
    if (view.state !== "MERGED") reasons.push(`pull request #${pkg.pr_number} is ${view.state}`);
    mergeSha = view.mergeCommit?.oid ?? null;
  } catch (error) {
    reasons.push(`could not read pull request #${pkg.pr_number} (${error.message.split("\n")[0]})`);
  }
  if (pkg.head_sha) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", pkg.head_sha, "origin/main"], {
        cwd: repoPath,
        stdio: "ignore",
      });
    } catch {
      reasons.push(`${pkg.head_sha} is not an ancestor of origin/main`);
    }
  }
  return { merged: reasons.length === 0, reasons, mergeSha };
}

/** A worktree is only debris when nothing in it is unsaved or unpushed. */
function worktreeDefects(worktree, branch) {
  const defects = [];
  if (!fs.existsSync(worktree)) return { defects, gone: true };
  if (git(["status", "--porcelain"], worktree) !== "") {
    defects.push("its working tree is dirty");
  }
  try {
    const unpushed = git(["log", "--oneline", `origin/${branch}..${branch}`], worktree);
    if (unpushed !== "") defects.push(`it has ${unpushed.split("\n").length} unpushed commit(s)`);
  } catch {
    defects.push(`its branch ${branch} has no pushed counterpart`);
  }
  if (git(["stash", "list"], worktree) !== "") defects.push("it has stash entries");
  return { defects, gone: false };
}

try {
  if (!missionId || !/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
    fail("Usage: mission:finish M-<id> [--abandon --reason <why> --preserved <what>]");
  }
  if (!leadId) fail("LANCERS_MISSION_LEAD_ID must hold this session's stable UUID.");

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
  const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
  const blocked = [];
  const reclaimedNow = [];

  for (const pkg of live) {
    if (state.reclaimed.includes(pkg.id)) continue;
    if (pkg.status !== "merged") {
      if (!abandoning) blocked.push(`${pkg.id} is ${pkg.status}, not merged`);
      continue;
    }
    const proof = mergeProof(pkg);
    if (!proof.merged) {
      blocked.push(`${pkg.id}: ${proof.reasons.join("; ")}`);
      continue;
    }
    const { defects, gone } = worktreeDefects(pkg.worktree, pkg.branch);
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
    console.error(`Mission ${missionId} is not finished. Nothing further was released:`);
    for (const reason of blocked) console.error(`  - ${reason}`);
    console.error(
      "\nFinish or abandon those packages first. Absence of evidence is never permission.",
    );
    process.exitCode = 2;
    process.exit();
  }

  if (!state.closeout) {
    fail(
      `Mission ${missionId} has no recorded closeout. Write the evidence into the Notion mission record first — reclaiming resources is a different act from finishing the mission.`,
    );
  }

  // Retire the stack only when this was its last attachment. Whoever detaches
  // last does it, so a mission whose acquiring worktree is already gone can
  // still be tidied up.
  const registry = coordinatorStatus(repoPath);
  const stack = Object.values(registry.slots).find((record) => record.missionId === missionId);
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
        disposition = `retired ${stack.slot}`;
      } catch (error) {
        disposition = `${stack.slot} could not be stopped (${error.message.split("\n")[0]}); it holds no lease and can be stopped by hand`;
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
