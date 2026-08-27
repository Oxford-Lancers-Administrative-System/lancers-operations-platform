// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendEvent, replayState } from "../scripts/mission/lib/state.mjs";
import { coordinatorPaths, coordinatorStatus } from "../scripts/lib/local-supabase-coordinator.mjs";

const packet = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
);
const sourcePlan = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
);
const MISSION = packet.mission_id as string;

// Real git repositories, real child processes, and since LAN-178 a Lead epoch
// handover before the merge can be recorded. Slow by construction, not hung.
vi.setConfig({ testTimeout: 60_000 });
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

async function fixture(dirty: boolean, recordMerge = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-finish-mission-"));
  roots.push(root);
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  const worktree = path.join(root, "package-worktree");
  const branch = "chore/rehearsal-package";
  fs.mkdirSync(repo);
  git(root, ["init", "--bare", "--quiet", origin]);
  git(repo, ["init", "--quiet"]);
  git(repo, ["config", "user.email", "rehearsal@example.invalid"]);
  git(repo, ["config", "user.name", "Finish Mission Rehearsal"]);
  fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "baseline"]);
  git(repo, ["branch", "-M", "main"]);
  git(repo, ["remote", "add", "origin", origin]);
  git(repo, ["push", "-u", "origin", "main"]);
  git(repo, ["branch", branch]);
  git(repo, ["worktree", "add", worktree, branch]);
  fs.writeFileSync(path.join(worktree, "package.txt"), "implemented\n");
  git(worktree, ["add", "package.txt"]);
  git(worktree, ["commit", "-m", "implement package"]);
  git(worktree, ["push", "-u", "origin", branch]);
  const headSha = git(worktree, ["rev-parse", "HEAD"]);
  git(repo, ["merge", "--no-ff", branch, "-m", "merge package"]);
  const mergeSha = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["push", "origin", "main"]);
  if (dirty) fs.writeFileSync(path.join(worktree, "dirty.txt"), "leave me alone\n");

  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const gh = path.join(bin, "gh");
  fs.writeFileSync(
    gh,
    `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ state: "MERGED", mergeCommit: { oid: mergeSha } })}'\n`,
    { mode: 0o755 },
  );

  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    LANCERS_MISSION_ROOT: path.join(root, "mission-state"),
    LANCERS_COORDINATOR_ROOT: path.join(root, "coordinator-state"),
    LANCERS_MISSION_LEAD_ID: "lead-finish-rehearsal",
  };
  const pkg = {
    ...sourcePlan.packages[0],
    id: "WP-rehearsal",
    depends_on: [],
    visual: "nonvisual",
  };
  const decomposition = {
    ...sourcePlan.decomposition,
    critical_path: [pkg.id],
  };
  let now = 1_700_000_000_000;
  const append = (event: object) => appendEvent(repo, MISSION, event, { env, now: (now += 1_000) });
  await append({
    type: "mission-init",
    packet,
    lead_id: env.LANCERS_MISSION_LEAD_ID,
    pid: process.pid,
  });
  await append({ type: "plan-recorded", packages: [pkg], decomposition });
  await append({ type: "plan-approved", approved_by: "Brian", evidence: "rehearsal" });
  await append({ type: "linear-preflight", result: "reachable", detail: "rehearsal" });
  await append({ type: "linear-sync-intent", package_id: pkg.id });
  await append({ type: "linear-sync-result", package_id: pkg.id, issue_id: "LAN-999" });
  await append({
    type: "worker-dispatched",
    package_id: pkg.id,
    worker_id: "worker-rehearsal",
    worktree,
    branch,
  });
  await append({
    type: "worker-receipt",
    package_id: pkg.id,
    worker_id: "worker-rehearsal",
    receipt: {
      branch,
      worktree,
      surfaces: ["package.txt"],
      acceptance_criteria: ["rehearsal"],
      verification: "rehearsal",
      ci_state: "green",
      visual_state: "nonvisual",
      migration_implications: "none",
      limitations: "none",
      result: "completed",
    },
  });
  await append({
    type: "pr-opened",
    package_id: pkg.id,
    pr_number: 999,
    head_sha: headSha,
  });
  if (recordMerge) {
    await append({
      type: "merge-recorded",
      package_id: pkg.id,
      pr_number: 999,
      sha: headSha,
      route: "owner",
    });
  }
  return { repo, worktree, branch, env, packageId: pkg.id, headSha };
}

function executeFinish(input: Awaited<ReturnType<typeof fixture>>) {
  return spawnSync(
    process.execPath,
    [
      path.join(__dirname, "..", "scripts", "mission", "finish-mission.mjs"),
      MISSION,
      "--package",
      input.packageId,
      "--reclaim-only",
    ],
    { cwd: input.repo, env: input.env, encoding: "utf8" },
  );
}

function recordMissionStack(input: Awaited<ReturnType<typeof fixture>>) {
  const slot = "mission-rehearsal-0";
  const marker = path.join(path.dirname(input.repo), "stopped-project.txt");
  const paths = coordinatorPaths(input.repo, input.env);
  fs.mkdirSync(path.dirname(paths.registry), { recursive: true });
  fs.writeFileSync(
    paths.registry,
    `${JSON.stringify({
      version: 1,
      slots: {
        [slot]: {
          missionId: MISSION,
          repoPath: fs.realpathSync(input.worktree),
          attachedRepoPaths: [fs.realpathSync(input.worktree)],
          token: "rehearsal-token",
          state: "review-ready",
          slot,
          projectId: "lancers-rehearsal",
          ports: { api: 56321, db: 56322 },
          applicationPort: 3100,
        },
      },
    })}\n`,
  );
  const bin = path.join(input.repo, "node_modules", ".bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "supabase"),
    `#!/bin/sh\n[ -d '${input.worktree}' ] || exit 9\nprintf '%s\\n' "$@" > '${marker}'\n`,
    { mode: 0o755 },
  );
  return { marker, slot };
}

describe("finish-mission executable reclamation", () => {
  it("auto-reclaims through the real merge-record command", async () => {
    const input = await fixture(false, false);
    // This journal predates Lead epochs and carries Mission 4's shape: a plan
    // approved, and execution continued under the same Lead without the
    // recycle. Adopting an epoch projects it onto the post-plan boundary, so
    // the merge cannot be recorded until a fresh Lead takes the mission on
    // (LAN-178 §8). Nothing in its history is rewritten.
    const cli = path.join(__dirname, "..", "scripts", "mission", "cli.mjs");
    const mission = (env: NodeJS.ProcessEnv, ...args: string[]) =>
      spawnSync(process.execPath, [cli, ...args], { cwd: input.repo, env, encoding: "utf8" });

    const adopted = mission(input.env, "resume", MISSION);
    expect(adopted.status, adopted.stderr).toBe(0);
    expect(JSON.parse(adopted.stdout).epoch).toMatchObject({
      phase: "post-plan-boundary",
      bootstrapped: true,
    });

    const closed = mission(input.env, "epoch", "close", MISSION);
    expect(closed.status, closed.stderr).toBe(0);
    const token = /--token (\S+)/.exec(closed.stdout)?.[1];
    expect(token, closed.stdout).toBeTruthy();
    const fresh = { ...input.env, LANCERS_MISSION_LEAD_ID: "lead-finish-rehearsal-2" };
    const resumed = mission(fresh, "resume", MISSION, "--token", String(token));
    expect(resumed.status, resumed.stderr).toBe(0);
    expect(JSON.parse(resumed.stdout).epoch).toMatchObject({
      phase: "implementation-wave",
      scope: { packages: [input.packageId] },
    });

    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, "..", "scripts", "mission", "cli.mjs"),
        "merge-record",
        MISSION,
        input.packageId,
        "999",
        input.headSha,
        "--route",
        "owner",
      ],
      { cwd: input.repo, env: fresh, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Merge recorded for WP-rehearsal/);
    expect(result.stdout).toMatch(/Reclaimed WP-rehearsal/);
    expect(fs.existsSync(input.worktree)).toBe(false);
    expect(replayState(input.repo, MISSION, input.env).reclaimed).toEqual([input.packageId]);
  });

  it("removes a merged package's worktree, branch, and attachment through the real script", async () => {
    const input = await fixture(false);
    const result = executeFinish(input);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Reclaimed WP-rehearsal/);
    expect(result.stdout).toMatch(/Automatic reclamation completed/);
    expect(fs.existsSync(input.worktree)).toBe(false);
    expect(git(input.repo, ["branch", "--list", input.branch])).toBe("");
    expect(replayState(input.repo, MISSION, input.env).reclaimed).toEqual([input.packageId]);
  });

  it("retires a last attachment before removing its merged package worktree", async () => {
    const input = await fixture(false);
    const stack = recordMissionStack(input);
    const result = executeFinish(input);

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(stack.marker, "utf8")).toContain("--project-id\nlancers-rehearsal");
    expect(fs.existsSync(input.worktree)).toBe(false);
    expect(coordinatorStatus(input.repo, input.env).slots[stack.slot]).toBeUndefined();
  });

  it("leaves a dirty merged worktree and branch untouched and reports the refusal", async () => {
    const input = await fixture(true);
    const result = executeFinish(input);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/working tree is dirty/);
    expect(result.stderr).toMatch(/left WP-rehearsal alone/);
    expect(fs.existsSync(input.worktree)).toBe(true);
    expect(git(input.repo, ["branch", "--list", input.branch])).toContain(input.branch);
    expect(replayState(input.repo, MISSION, input.env).reclaimed).toEqual([]);
  });
});
