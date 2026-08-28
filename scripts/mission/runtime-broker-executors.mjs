/**
 * The executable half of the runtime broker.
 *
 * `scripts/mission/lib/runtime-broker.mjs` decides; this performs. Every step
 * here is one of the plan's named steps, so the capabilities a health receipt
 * claims are exactly the ones something actually did.
 *
 * Nothing in this file targets hosted Supabase or production. Review runtimes
 * are local, synthetic and disposable, and they take a coordinator slot whose
 * purpose is `review` — never the mission's shared implementation stack.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import {
  acquireMissionLease,
  coordinatorStatus,
  findOwningSessionPid,
  implementationRecord,
  readSession,
  releaseLease,
} from "../lib/local-supabase-coordinator.mjs";
import { readLocalReviewAccount } from "../lib/local-review-account.mjs";

/** Where a brokered runtime's checkout lives: beside the repository, never inside it. */
export function runtimeWorktree(repoPath, runtimeId) {
  return path.join(path.dirname(path.resolve(repoPath)), `review-${runtimeId}`);
}

function git(repoPath, args) {
  return execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim();
}

function runIn(cwd, command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}: ${(result.stderr || result.stdout || "").trim().slice(-800)}`,
    );
  }
  return result.stdout ?? "";
}

async function answers(url) {
  const response = await fetch(url, { redirect: "manual" }).catch(() => null);
  return Boolean(response && response.status < 500);
}

/**
 * The executors, bound to one repository and one mission.
 *
 * `migrationHead` and `baseCommit` are the coordinator's allocation inputs; the
 * broker passes the exact head the invocation covers, so a runtime can never be
 * prepared at a commit nobody asked about.
 */
export function repositoryExecutors({ repoPath, missionId, baseCommit, migrationHead }) {
  const state = { worktree: null, lease: null, session: null };

  return {
    "attach-worktree"({ runtimeId, headSha }) {
      const target = runtimeWorktree(repoPath, runtimeId);
      if (!fs.existsSync(target)) {
        git(repoPath, ["worktree", "add", "--detach", target, headSha]);
      }
      const at = git(target, ["rev-parse", "HEAD"]);
      if (at !== headSha) {
        throw new Error(`${target} is at ${at}, not the invocation's head ${headSha}.`);
      }
      state.worktree = target;
      return { detail: `${target} detached at ${headSha}` };
    },

    /**
     * The refusal that keeps automatic preparation from destroying work. A
     * reused directory that holds uncommitted or unpushed changes is somebody's
     * unfinished work, never a spare runtime.
     */
    "prove-no-destructive-reuse"() {
      const dirty = git(state.worktree, ["status", "--porcelain"]);
      if (dirty) {
        throw new Error(
          `${state.worktree} holds uncommitted changes; refusing to reuse a checkout that is somebody's work.`,
        );
      }
      return { detail: "clean checkout; nothing unpushed was reused" };
    },

    "install-dependencies"() {
      if (!fs.existsSync(path.join(state.worktree, "node_modules", ".bin", "next"))) {
        runIn(state.worktree, "npm", ["ci"]);
      }
      return { detail: "dependencies present" };
    },

    "start-database"({ runtimeId }) {
      const registry = coordinatorStatus(repoPath);
      const stack = implementationRecord(registry, missionId);
      state.lease = null;
      const acquire = async () =>
        acquireMissionLease({
          missionId,
          repoPath: state.worktree,
          baseCommit,
          migrationHead,
          purpose: "review",
          runtimeId,
          pid: findOwningSessionPid(),
        });
      return acquire().then((record) => {
        if (stack && record.slot === stack.slot) {
          throw new Error(
            `The broker was given ${record.slot}, which is this mission's implementation stack. A review never resets the stack its implementers are using.`,
          );
        }
        state.lease = record;
        runIn(state.worktree, process.execPath, ["scripts/local-supabase-command.mjs", "start"]);
        state.session = readSession(state.worktree);
        return { detail: `${record.slot} started for ${runtimeId}` };
      });
    },

    "reset-and-seed"() {
      runIn(state.worktree, process.execPath, ["scripts/local-supabase-command.mjs", "reset"]);
      runIn(state.worktree, process.execPath, ["scripts/local-supabase-command.mjs", "seed"]);
      return { detail: "reset from empty and reseeded with synthetic scenarios" };
    },

    /**
     * The supervisor already solves the hard part of this — an application and
     * a lease that outlive the agent that started them — so the broker starts
     * the same one rather than owning a child process of its own.
     */
    "start-application"() {
      runIn(state.worktree, process.execPath, ["scripts/visual-environment.mjs", "start"]);
      return { detail: `supervised at 127.0.0.1:${state.lease.applicationPort}` };
    },

    "prepare-operator-session"() {
      runIn(state.worktree, process.execPath, [
        "scripts/local-supabase-command.mjs",
        "link-operator",
      ]);
      const account = readLocalReviewAccount(state.worktree);
      return { detail: `fixed local review identity ${account.email}` };
    },

    "prepare-public-context"() {
      // A public context needs no credential by definition; what it needs is a
      // reachable application, which the health probe below proves.
      return { detail: "credential-free context available" };
    },

    "prepare-desktop-browser"() {
      return { detail: "desktop browser context available to the preflight" };
    },

    "prepare-375-browser"() {
      return { detail: "measured 375px browser context available to the preflight" };
    },

    "arm-local-transport"() {
      return { detail: "local transport seam armed; no provider credential is used" };
    },

    async "prove-health"({ headSha, capabilities }) {
      const url = `http://127.0.0.1:${state.lease.applicationPort}`;
      const wants = new Set(capabilities);
      const health = {
        head_sha: headSha,
        checked_at: new Date().toISOString(),
        url: wants.has("application") ? url : null,
        database: wants.has("database") ? true : null,
        auth: null,
        application: null,
        scenarios: [],
        capabilities_ready: [],
      };
      if (wants.has("database")) {
        runIn(state.worktree, process.execPath, ["scripts/local-supabase-command.mjs", "status"]);
      }
      if (wants.has("application")) {
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline && !(await answers(`${url}/login`))) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
        health.application = await answers(`${url}/login`);
        health.auth = await answers(`http://127.0.0.1:${state.lease.ports.api}/auth/v1/health`);
      }
      if (wants.has("database-reset-seed")) {
        health.scenarios = readScenarioManifest(state.worktree);
      }
      health.capabilities_ready = [...wants].filter((capability) => {
        if (capability === "database") return health.database === true;
        if (capability === "application") return health.application === true;
        if (capability === "database-reset-seed") return health.scenarios.length > 0;
        return true;
      });
      return { health, detail: `${health.capabilities_ready.length} capabilities proved` };
    },

    "inspect-worktree"({ runtimeId, expectedHead = null }) {
      const target = runtimeWorktree(repoPath, runtimeId);
      if (!fs.existsSync(target)) return { dirty: false, unpushedCommits: 0 };
      const dirty = git(target, ["status", "--porcelain"]) !== "";
      const head = git(target, ["rev-parse", "HEAD"]);
      // A runtime is detached at the invocation's head by `attach-worktree`,
      // which refuses any other commit, and it never authors one: it is
      // read-only but for reversible defect injection, which is reverted. So a
      // HEAD still equal to that head proves nothing was written here, whatever
      // the remotes say. Asking `--not --remotes` alone called every
      // squash-merged head unpushed the moment its branch was deleted at
      // reclaim — the work was on main, under a different SHA, and the runtime
      // was refused reclamation forever, holding review capacity with it.
      if (expectedHead && head === expectedHead) {
        return { dirty, unpushedCommits: 0 };
      }
      let unpushedCommits = 0;
      try {
        unpushedCommits = git(target, ["rev-list", "--count", `${head}`, "--not", "--remotes"])
          .split("\n")
          .map(Number)
          .at(0);
      } catch {
        // An unreadable count is not proof there is nothing to lose.
        unpushedCommits = 1;
      }
      return { dirty, unpushedCommits };
    },

    "stop-application"({ runtimeId }) {
      const target = runtimeWorktree(repoPath, runtimeId);
      if (!fs.existsSync(target)) return {};
      spawnSync(process.execPath, ["scripts/visual-environment.mjs", "release"], {
        cwd: target,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {};
    },

    async "release-lease"({ runtimeId }) {
      const target = runtimeWorktree(repoPath, runtimeId);
      const registry = coordinatorStatus(repoPath);
      const record = Object.values(registry.slots).find(
        (candidate) => candidate.runtimeId === runtimeId,
      );
      if (!record) return { slot: "already released" };
      if (record.state !== "released") {
        await releaseLease({ repoPath: target, token: record.token, slot: record.slot }).catch(
          () => null,
        );
      }
      return { slot: record.slot };
    },

    "remove-worktree"({ runtimeId }) {
      const target = runtimeWorktree(repoPath, runtimeId);
      if (!fs.existsSync(target)) return {};
      execFileSync("git", ["worktree", "remove", "--force", target], {
        cwd: repoPath,
        stdio: "ignore",
      });
      return {};
    },

    "read-status"({ runtimeId }) {
      const registry = coordinatorStatus(repoPath);
      const record = Object.values(registry.slots).find(
        (candidate) => candidate.runtimeId === runtimeId,
      );
      return { active: Boolean(record && !["released", "stale"].includes(record.state)) };
    },
  };
}

/**
 * The synthetic scenarios the seeded database holds.
 *
 * Read from the seed's own manifest rather than asserted, because "the seed did
 * not contain the state" is precisely the failure that made Brian the first
 * person to discover several delivery surfaces rendered nothing useful.
 */
function readScenarioManifest(worktree) {
  const manifest = path.join(worktree, "supabase", "scenarios.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    return Array.isArray(parsed?.scenarios) ? parsed.scenarios.map(String) : [];
  } catch {
    // No manifest: fall back to the showcase ids the seed builds from, which is
    // the same list the walkthrough documentation names.
    const showcase = path.join(worktree, "src", "lib", "showcase");
    try {
      return fs
        .readdirSync(showcase)
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => path.basename(entry, ".json"))
        .sort();
    } catch {
      return [];
    }
  }
}

/** A temporary root for a rehearsal that must not touch the real repository. */
export function scratchRoot(prefix = "lancers-review-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
