/**
 * Durable mission state: an append-only NDJSON journal, replayed on read.
 *
 * There is deliberately no persisted snapshot. `reduce(events)` is a pure
 * function from the journal to the current state, so a fresh Mission Lead —
 * after a kill, a compaction, a disconnect, or a subscription stop — holds
 * exactly the state the journal proves, and the snapshot/journal-divergence
 * failure class does not exist. Mission memory never depends on chat history.
 *
 * Every write validates the event against the state replayed at that moment,
 * under the same short mkdir lock the local Supabase coordinator uses, so the
 * control-plane refusals (no third worker, no colliding dispatch, no dispatch
 * before Linear sync, no replacement implementer for an ordinary correction,
 * no unapproved rule promotion) are enforced at the only place state changes.
 *
 * Storage follows scripts/lib/local-supabase-coordinator.mjs: a machine-local
 * root keyed by repository identity, shared by every clone and worktree,
 * overridable with LANCERS_MISSION_ROOT for hermetic tests.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { validatePacket, validatePackage } from "./packet.mjs";

export const MAX_ACTIVE_WORKERS = 2;
export const LEAD_TTL_MS = 120_000;

export const EVENT_TYPES = [
  "mission-init",
  "lead-heartbeat",
  "plan-recorded",
  "linear-preflight",
  "linear-sync-intent",
  "linear-sync-result",
  "worker-dispatched",
  "worker-receipt",
  "worker-abandoned",
  "correction-dispatched",
  "pr-opened",
  "review-receipt",
  "visual-approval",
  "owner-question",
  "owner-answer",
  "rule-applied",
  "merge-recorded",
  "checkpoint",
  "scope-drift",
  "packet-revised",
  "mission-stopped",
  "mission-resumed",
];

function repositoryIdentity(repoPath) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return path.basename(repoPath);
  }
}

export function missionPaths(repoPath, missionId, env = process.env) {
  const identity = crypto
    .createHash("sha256")
    .update(repositoryIdentity(repoPath))
    .digest("hex")
    .slice(0, 16);
  const base =
    env.LANCERS_MISSION_ROOT ||
    path.join(
      env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
      "lancers-operations-platform",
    );
  const root = path.join(base, identity);
  const missionRoot = missionId ? path.join(root, "missions", missionId) : null;
  return {
    root,
    missionsRoot: path.join(root, "missions"),
    missionRoot,
    journal: missionRoot ? path.join(missionRoot, "journal.ndjson") : null,
    lock: missionRoot ? path.join(missionRoot, "mission.lock") : null,
    ownerRules: path.join(root, "owner-rules.json"),
    ownerRulesLock: path.join(root, "owner-rules.lock"),
  };
}

export async function withLock(lockPath, action) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await action();
  } finally {
    fs.rmdirSync(lockPath);
  }
}

export function readJournal(journalPath) {
  let raw;
  try {
    raw = fs.readFileSync(journalPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export function ownerAlive(pid, probe = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

export const WORKER_RESULTS = [
  "completed",
  "blocked",
  "owner-decision-required",
  "failed-recoverably",
];

const WORKER_RECEIPT_FIELDS = [
  "branch",
  "worktree",
  "surfaces",
  "acceptance_criteria",
  "verification",
  "ci_state",
  "visual_state",
  "migration_implications",
  "limitations",
  "result",
];

const REVIEW_RECEIPT_FIELDS = ["review_mode", "reviewed_head_sha", "round", "result"];

/** The unanswered questions whose affected set names this package. */
function openQuestionsAffecting(state, packageId) {
  return Object.values(state.questions).filter(
    (question) => question.status === "open" && question.affected_packages.includes(packageId),
  );
}

function activeWorkerFor(state, packageId) {
  return state.activeWorkers.find((worker) => worker.package_id === packageId);
}

/**
 * The scheduling conjuncts every worker start shares — a fresh dispatch and a
 * correction resumption alike. A correction runs the same worker on the same
 * package, but it still occupies a slot, still collides on its domain, still
 * competes for the single migration slot, and still may not resume execution
 * that an unanswered owner question or unresolved source drift has paused.
 */
function schedulingRefusals(state, pkg, packageId) {
  const errors = [];
  if (state.activeWorkers.length >= MAX_ACTIVE_WORKERS) {
    errors.push(
      `Maximum implementation concurrency is ${MAX_ACTIVE_WORKERS}; a further package waits for a slot.`,
    );
  }
  for (const worker of state.activeWorkers) {
    const other = state.packages[worker.package_id];
    if (other?.collision_domain === pkg.collision_domain) {
      errors.push(
        `${packageId} collides with ${worker.package_id} on domain "${pkg.collision_domain}"; colliding work is serialized.`,
      );
    }
    if (pkg.migration_owner && other?.migration_owner) {
      errors.push(
        `${worker.package_id} already owns the migration slot; only one migration-owning package runs at a time.`,
      );
    }
  }
  for (const question of openQuestionsAffecting(state, packageId)) {
    errors.push(
      `${packageId} is affected by unanswered owner question ${question.id}; the answer is persisted before dependent execution resumes.`,
    );
  }
  if (pkg.driftStopped) {
    errors.push(
      `${packageId} is stopped by source drift; it needs a revised approved packet before work resumes.`,
    );
  }
  return errors;
}

/**
 * Validate one event against the current replayed state. Returns every
 * refusal; the event is appended only when the list is empty. This is the
 * control plane's constitution at runtime — each rule here has a matching
 * harness-test assertion.
 */
export function validateEvent(event, state) {
  const errors = [];
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return ["The event is not an object."];
  }
  if (!EVENT_TYPES.includes(event.type)) {
    return [`Unknown event type "${event.type}". Unclassified events are refused, not ignored.`];
  }
  if (!isNonEmptyString(event.at)) errors.push("Every event carries an ISO timestamp in `at`.");

  if (event.type !== "mission-init" && !state.initialized) {
    return ["The mission is not initialized; only mission-init may be the first event."];
  }

  const stopped = state.stopped !== null;
  const stopAllowed = ["mission-resumed", "checkpoint", "lead-heartbeat", "owner-answer"];
  if (stopped && !stopAllowed.includes(event.type)) {
    errors.push(
      `The mission is stopped (${state.stopped.reason}); only resume, checkpoint, heartbeat and owner answers are accepted.`,
    );
  }

  switch (event.type) {
    case "mission-init": {
      if (state.initialized) errors.push("The mission is already initialized.");
      // LAN-148: the fence exists from the first event. The first live mission
      // advertised a fenced Lead but held none until a manual heartbeat
      // happened to be recorded, so a second Lead could have initialized over
      // it during that window.
      if (!Number.isInteger(event.pid) || event.pid <= 0) {
        errors.push("Initialization records the Lead session's live pid.");
      }
      if (!isNonEmptyString(event.lead_id)) {
        errors.push("Initialization records the stable Lead identity that fences the mission.");
      }
      const packetErrors = validatePacket(event.packet);
      errors.push(...packetErrors.map((error) => `Invalid packet: ${error}`));
      if (packetErrors.length === 0 && event.packet.status !== "approved") {
        errors.push(
          `The packet's status is "${event.packet.status}"; a draft or not_ready packet cannot initialize execution.`,
        );
      }
      break;
    }

    case "lead-heartbeat": {
      if (!Number.isInteger(event.pid) || event.pid <= 0) errors.push("A live pid is required.");
      if (!isNonEmptyString(event.lead_id)) errors.push("A stable Lead identity is required.");
      break;
    }

    case "plan-recorded": {
      if (!Array.isArray(event.packages) || event.packages.length === 0) {
        errors.push("A plan records at least one work package.");
        break;
      }
      const seen = new Set();
      for (const pkg of event.packages) {
        errors.push(...validatePackage(pkg, state.packet));
        if (pkg.id && seen.has(pkg.id)) errors.push(`Package id ${pkg.id} is duplicated.`);
        if (pkg.id) seen.add(pkg.id);
      }
      // Stable IDs across replans: every already-planned package must survive.
      for (const existing of Object.keys(state.packages)) {
        if (!seen.has(existing)) {
          errors.push(
            `Replanning removed ${existing}. Work-package ids are stable; a package may be revised but never silently dropped.`,
          );
        }
      }
      // A replan may not mutate what a running worker depends on.
      for (const pkg of event.packages) {
        const current = state.packages[pkg.id];
        if (!current || !activeWorkerFor(state, pkg.id)) continue;
        if (
          current.collision_domain !== pkg.collision_domain ||
          current.migration_owner !== pkg.migration_owner
        ) {
          errors.push(
            `${pkg.id} has an active worker; its collision domain and migration ownership cannot change mid-flight.`,
          );
        }
      }
      // Dependency edges resolve inside the plan, and the graph is acyclic.
      for (const pkg of event.packages) {
        for (const dep of pkg.depends_on ?? []) {
          if (!seen.has(dep)) errors.push(`${pkg.id} depends on ${dep}, which is not planned.`);
        }
      }
      const visiting = new Set();
      const done = new Set();
      const byId = new Map(event.packages.map((pkg) => [pkg.id, pkg]));
      const visit = (id) => {
        if (done.has(id)) return false;
        if (visiting.has(id)) return true;
        visiting.add(id);
        const cyclic = (byId.get(id)?.depends_on ?? []).some(visit);
        visiting.delete(id);
        done.add(id);
        return cyclic;
      };
      if ([...byId.keys()].some(visit)) {
        errors.push("The dependency graph contains a cycle.");
      }
      break;
    }

    case "linear-preflight": {
      if (event.result !== "reachable") {
        errors.push(
          'A preflight is recorded only when the configured Linear integration answered a read-only query (`result: "reachable"`).',
        );
      }
      if (!isNonEmptyString(event.detail)) {
        errors.push("Preflight detail must record what was queried and what answered.");
      }
      break;
    }

    case "linear-sync-intent": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (pkg.linear_issue_id) {
        errors.push(
          `${event.package_id} is already synchronized to ${pkg.linear_issue_id}; a second issue would be a duplicate.`,
        );
      } else if (state.pendingSyncIntents.includes(event.package_id)) {
        errors.push(
          `${event.package_id} has a pending sync intent. Reconcile against Linear and record the result instead of retrying the create.`,
        );
      }
      break;
    }

    case "linear-sync-result": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!state.pendingSyncIntents.includes(event.package_id)) {
        errors.push(
          `No pending sync intent for ${event.package_id}. Record the intent before the result so a crash between the two is detectable.`,
        );
      }
      if (pkg.linear_issue_id) {
        errors.push(`${event.package_id} is already synchronized to ${pkg.linear_issue_id}.`);
      }
      if (!isNonEmptyString(event.issue_id)) {
        errors.push("A sync result records the created or reconciled Linear issue id.");
      }
      break;
    }

    case "worker-dispatched": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!isNonEmptyString(event.worker_id)) errors.push("A dispatch names its worker.");
      if (!isNonEmptyString(event.worktree) || !isNonEmptyString(event.branch)) {
        errors.push("A dispatch records the worker's dedicated worktree and branch.");
      }
      if (!state.preflight) {
        errors.push("No Linear connectivity preflight is recorded; dispatch is refused.");
      }
      if (!pkg.linear_issue_id) {
        errors.push(
          `${event.package_id} has no created or reconciled Linear issue. No implementation worker starts before its work package is synchronized.`,
        );
      }
      if (activeWorkerFor(state, event.package_id)) {
        errors.push(`${event.package_id} already has an active worker.`);
      }
      if (pkg.status === "merged") errors.push(`${event.package_id} is already merged.`);
      errors.push(...schedulingRefusals(state, pkg, event.package_id));
      for (const dep of pkg.depends_on) {
        if (state.packages[dep]?.status !== "merged") {
          errors.push(`${event.package_id} depends on ${dep}, which is not merged yet.`);
        }
      }
      break;
    }

    case "worker-receipt": {
      const worker = activeWorkerFor(state, event.package_id);
      if (!worker) {
        errors.push(`No active worker for ${event.package_id}.`);
        break;
      }
      // LAN-148, matching the rule review receipts already carry: a worker that
      // returns after its package merged must not drag the package back to
      // "implemented" and re-open a merged lifecycle.
      if (state.packages[event.package_id]?.status === "merged") {
        errors.push(
          `${event.package_id} is already merged; a late worker receipt is refused rather than regressing merged work.`,
        );
      }
      if (event.worker_id !== worker.worker_id) {
        errors.push(
          `Receipt worker ${event.worker_id} does not match the dispatched worker ${worker.worker_id}.`,
        );
      }
      const receipt = event.receipt;
      if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
        errors.push("A worker returns a structured receipt.");
        break;
      }
      for (const field of WORKER_RECEIPT_FIELDS) {
        if (!(field in receipt)) errors.push(`Worker receipt is missing \`${field}\`.`);
      }
      if (!WORKER_RESULTS.includes(receipt.result)) {
        errors.push(`Worker receipt result must be one of ${WORKER_RESULTS.join(", ")}.`);
      }
      break;
    }

    case "worker-abandoned": {
      const worker = activeWorkerFor(state, event.package_id);
      if (!worker) errors.push(`No active worker for ${event.package_id}.`);
      if (!isNonEmptyString(event.reason)) errors.push("Abandonment records why the worker ended.");
      break;
    }

    case "correction-dispatched": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!pkg.worker_id) {
        errors.push(`${event.package_id} has no prior implementation worker to resume.`);
      } else if (event.worker_id !== pkg.worker_id) {
        errors.push(
          `An ordinary review correction resumes the original implementation worker (${pkg.worker_id}); dispatching replacement implementer ${event.worker_id} is refused.`,
        );
      }
      if (!Array.isArray(event.finding_ids) || event.finding_ids.length === 0) {
        errors.push("A correction dispatch carries the blocking finding ids for lineage.");
      }
      if (activeWorkerFor(state, event.package_id)) {
        errors.push(`${event.package_id} already has an active worker.`);
      }
      if (pkg.status === "merged") errors.push(`${event.package_id} is already merged.`);
      errors.push(...schedulingRefusals(state, pkg, event.package_id));
      break;
    }

    case "pr-opened": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!Number.isInteger(event.pr_number) || event.pr_number <= 0) {
        errors.push("pr_number must be a positive integer.");
      }
      if (!/^[0-9a-f]{40}$/.test(event.head_sha ?? "")) {
        errors.push("head_sha must be the full 40-character commit SHA.");
      }
      break;
    }

    case "review-receipt": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!pkg.pr_number) {
        errors.push(`${event.package_id} has no recorded pull request to review.`);
      }
      if (pkg.status === "merged") {
        errors.push(
          `${event.package_id} is already merged; a late or duplicate review receipt is refused rather than regressing merged work.`,
        );
      }
      const receipt = event.receipt;
      if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
        errors.push("A review returns a structured receipt.");
        break;
      }
      for (const field of REVIEW_RECEIPT_FIELDS) {
        if (!(field in receipt)) errors.push(`Review receipt is missing \`${field}\`.`);
      }
      break;
    }

    case "visual-approval": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (pkg.visual === "nonvisual") {
        errors.push(`${event.package_id} is nonvisual; there is nothing to visually approve.`);
      }
      if (!isNonEmptyString(event.approved_by) || !isNonEmptyString(event.evidence)) {
        errors.push("A visual approval records who approved and where (the live review).");
      }
      break;
    }

    case "owner-question": {
      if (!isNonEmptyString(event.id) || !/^Q-[A-Za-z0-9-]+$/.test(event.id)) {
        errors.push("A question id must match Q-<slug>.");
      } else if (state.questions[event.id]) {
        errors.push(`Question ${event.id} already exists.`);
      }
      if (!["immediate", "hourly"].includes(event.classification)) {
        errors.push('A question is classified "immediate" or "hourly" when it is recorded.');
      }
      if (!isNonEmptyString(event.text) || !isNonEmptyString(event.source)) {
        errors.push("A question records its text and its source.");
      }
      if (
        !Array.isArray(event.affected_packages) ||
        event.affected_packages.some((id) => !state.packages[id])
      ) {
        errors.push("affected_packages must list planned package ids (it may be empty).");
      }
      break;
    }

    case "owner-answer": {
      const question = state.questions[event.question_id];
      if (!question) {
        errors.push(`No question ${event.question_id}.`);
        break;
      }
      if (question.status === "answered") {
        errors.push(`Question ${event.question_id} is already answered.`);
      }
      if (!isNonEmptyString(event.answer) || !isNonEmptyString(event.answered_by)) {
        errors.push("An answer records its text and who gave it.");
      }
      if (typeof event.reusable !== "boolean") {
        errors.push(
          "An answer states whether it is instance-specific or proposed as a reusable rule.",
        );
      }
      break;
    }

    case "rule-applied": {
      if (!isNonEmptyString(event.rule_id)) errors.push("rule_id is required.");
      if (!isNonEmptyString(event.context)) {
        errors.push("Applying a rule records the situation it answered without asking Brian.");
      }
      break;
    }

    case "merge-recorded": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!["guarded-auto", "owner"].includes(event.route)) {
        errors.push('A merge is recorded with route "guarded-auto" or "owner".');
      }
      if (!/^[0-9a-f]{40}$/.test(event.sha ?? "")) {
        errors.push("A merge records the exact merged head SHA.");
      }
      if (event.route === "guarded-auto") {
        if (pkg.risk_class === "highest") {
          errors.push("Highest-risk work cannot autonomous-merge in v1.");
        }
        if (pkg.migration_owner) {
          errors.push("A migration-owning package is owner-merged, never autonomous.");
        }
        const review = pkg.review;
        if (!review || review.result !== "clear" || review.reviewed_head_sha !== event.sha) {
          errors.push(
            `A guarded merge requires a clear review receipt at exactly ${event.sha ?? "the merged SHA"}.`,
          );
        }
        if (pkg.visual !== "nonvisual" && !pkg.visual_approved) {
          errors.push("Visual work merges only after Brian's recorded visual approval.");
        }
        for (const question of openQuestionsAffecting(state, event.package_id)) {
          errors.push(`Unresolved owner question ${question.id} affects ${event.package_id}.`);
        }
      }
      break;
    }

    case "checkpoint": {
      if (!Number.isInteger(event.number) || event.number !== state.checkpoints + 1) {
        errors.push(`Checkpoints are numbered in order; expected ${state.checkpoints + 1}.`);
      }
      break;
    }

    case "scope-drift": {
      if (!isNonEmptyString(event.detail)) errors.push("Drift records what changed.");
      if (
        !Array.isArray(event.affected_packages) ||
        event.affected_packages.length === 0 ||
        event.affected_packages.some((id) => !state.packages[id])
      ) {
        errors.push("Drift stops only affected work: it must name the affected planned packages.");
      }
      break;
    }

    case "packet-revised": {
      const packetErrors = validatePacket(event.packet);
      errors.push(...packetErrors.map((error) => `Invalid revised packet: ${error}`));
      if (packetErrors.length === 0) {
        if (event.packet.status !== "approved") {
          errors.push("A revised packet resumes work only once it is approved.");
        }
        if (event.packet.mission_id !== state.packet.mission_id) {
          errors.push("A revised packet keeps the mission id.");
        }
        if (event.packet.packet_version <= state.packet.packet_version) {
          errors.push(
            `A revised packet increments packet_version (current ${state.packet.packet_version}).`,
          );
        }
      }
      break;
    }

    case "mission-stopped": {
      if (!["usage-exhausted", "owner-stop", "blocked"].includes(event.reason)) {
        errors.push('A stop reason is "usage-exhausted", "owner-stop" or "blocked".');
      }
      if (!isNonEmptyString(event.detail)) errors.push("A stop records why.");
      break;
    }

    case "mission-resumed": {
      if (!state.stopped) errors.push("The mission is not stopped.");
      if (!Number.isInteger(event.pid) || event.pid <= 0) {
        errors.push("A resume records the fresh session's pid.");
      }
      if (!isNonEmptyString(event.lead_id))
        errors.push("A resume records the stable Lead identity.");
      break;
    }

    default:
      break;
  }

  return errors;
}

/**
 * @typedef {Record<string, any>} MissionEvent
 * @typedef {{
 *   initialized: boolean,
 *   packet: any,
 *   packages: Record<string, any>,
 *   activeWorkers: Array<Record<string, any>>,
 *   questions: Record<string, any>,
 *   preflight: { at: string, detail: string } | null,
 *   pendingSyncIntents: string[],
 *   checkpoints: number,
 *   lastCheckpointIndex: number,
 *   stopped: { at: string, reason: string, detail: string } | null,
 *   lead: { lead_id: string, pid: number, at: string } | null,
 *   rulesApplied: Array<Record<string, any>>,
 *   eventCount: number,
 * }} MissionState
 * @typedef {{ action: string, detail: string, package_id?: string, question_id?: string }} MissionAction
 */

function emptyState() {
  return {
    initialized: false,
    packet: null,
    packages: {},
    activeWorkers: [],
    questions: {},
    preflight: null,
    pendingSyncIntents: [],
    checkpoints: 0,
    lastCheckpointIndex: -1,
    stopped: null,
    lead: null,
    rulesApplied: [],
    eventCount: 0,
  };
}

/**
 * Replay the journal into the current state. Pure.
 * @param {MissionEvent[]} events
 * @returns {MissionState}
 */
export function reduce(events) {
  const state = emptyState();
  for (const [index, event] of events.entries()) {
    switch (event.type) {
      case "mission-init":
        state.initialized = true;
        state.packet = event.packet;
        // The fence exists from here, not from the first heartbeat.
        if (event.lead_id) state.lead = { lead_id: event.lead_id, pid: event.pid, at: event.at };
        break;
      case "lead-heartbeat":
        state.lead = { lead_id: event.lead_id, pid: event.pid, at: event.at };
        break;
      case "plan-recorded":
        for (const pkg of event.packages) {
          const existing = state.packages[pkg.id];
          state.packages[pkg.id] = {
            ...pkg,
            status: existing?.status ?? "planned",
            worker_id: existing?.worker_id ?? null,
            linear_issue_id: existing?.linear_issue_id ?? null,
            pr_number: existing?.pr_number ?? null,
            head_sha: existing?.head_sha ?? null,
            receipts: existing?.receipts ?? [],
            review: existing?.review ?? null,
            visual_approved: existing?.visual_approved ?? false,
            driftStopped: existing?.driftStopped ?? false,
          };
        }
        break;
      case "linear-preflight":
        state.preflight = { at: event.at, detail: event.detail };
        break;
      case "linear-sync-intent":
        state.pendingSyncIntents.push(event.package_id);
        break;
      case "linear-sync-result": {
        state.pendingSyncIntents = state.pendingSyncIntents.filter((id) => id !== event.package_id);
        const pkg = state.packages[event.package_id];
        pkg.linear_issue_id = event.issue_id;
        if (pkg.status === "planned") pkg.status = "synced";
        break;
      }
      case "worker-dispatched": {
        const pkg = state.packages[event.package_id];
        pkg.worker_id = event.worker_id;
        pkg.worktree = event.worktree;
        pkg.branch = event.branch;
        pkg.status = "active";
        state.activeWorkers.push({
          worker_id: event.worker_id,
          package_id: event.package_id,
          dispatched_at: event.at,
          kind: "implementation",
        });
        break;
      }
      case "correction-dispatched": {
        const pkg = state.packages[event.package_id];
        pkg.status = "correction";
        // The correction will produce a new head; whatever Brian visually
        // approved is no longer what would merge. Approval is re-earned.
        pkg.visual_approved = false;
        state.activeWorkers.push({
          worker_id: event.worker_id,
          package_id: event.package_id,
          dispatched_at: event.at,
          kind: "correction",
          finding_ids: event.finding_ids,
        });
        break;
      }
      case "worker-receipt": {
        const pkg = state.packages[event.package_id];
        pkg.receipts.push({ at: event.at, worker_id: event.worker_id, ...event.receipt });
        state.activeWorkers = state.activeWorkers.filter(
          (worker) => worker.package_id !== event.package_id,
        );
        // Guarded on the current status, like the review-receipt branch: a
        // receipt that arrives after the merge keeps its place in the evidence
        // above, but never regresses the package's lifecycle.
        if (pkg.status !== "merged") {
          pkg.status =
            {
              completed: "implemented",
              blocked: "blocked",
              "owner-decision-required": "owner-decision",
              "failed-recoverably": "synced",
            }[event.receipt.result] ?? pkg.status;
        }
        break;
      }
      case "worker-abandoned": {
        const pkg = state.packages[event.package_id];
        state.activeWorkers = state.activeWorkers.filter(
          (worker) => worker.package_id !== event.package_id,
        );
        pkg.status = "synced";
        pkg.abandoned_workers = [
          ...(pkg.abandoned_workers ?? []),
          { at: event.at, worker_id: pkg.worker_id, reason: event.reason },
        ];
        pkg.worker_id = null;
        break;
      }
      case "pr-opened": {
        const pkg = state.packages[event.package_id];
        // A new head invalidates a visual approval given at an older one —
        // Brian approved what he saw, not whatever came later.
        if (pkg.visual_approved && pkg.visual_approval?.head_sha !== event.head_sha) {
          pkg.visual_approved = false;
        }
        pkg.pr_number = event.pr_number;
        pkg.head_sha = event.head_sha;
        break;
      }
      case "review-receipt": {
        const pkg = state.packages[event.package_id];
        pkg.review = { at: event.at, ...event.receipt };
        if (event.receipt.result === "clear" && pkg.status === "implemented") {
          pkg.status = "reviewed";
        } else if (event.receipt.result === "blocked" && pkg.status === "implemented") {
          // A blocking review pauses the package for a correction resumption
          // of the original worker — not for another review of the same SHA.
          // Guarded on the current status, like the clear branch beside it: a
          // late or duplicate receipt must never regress merged work.
          pkg.status = "blocked";
        }
        break;
      }
      case "visual-approval": {
        const pkg = state.packages[event.package_id];
        pkg.visual_approved = true;
        pkg.visual_approval = {
          at: event.at,
          by: event.approved_by,
          evidence: event.evidence,
          // Approval is pinned to the head that was live when Brian looked.
          head_sha: pkg.head_sha ?? null,
        };
        break;
      }
      case "owner-question":
        state.questions[event.id] = {
          id: event.id,
          classification: event.classification,
          text: event.text,
          source: event.source,
          affected_packages: event.affected_packages,
          urgency: event.urgency ?? null,
          asked_at: event.at,
          status: "open",
          answer: null,
        };
        break;
      case "owner-answer": {
        const question = state.questions[event.question_id];
        question.status = "answered";
        question.answer = {
          text: event.answer,
          by: event.answered_by,
          at: event.at,
          reusable: event.reusable,
        };
        break;
      }
      case "rule-applied":
        state.rulesApplied.push({ at: event.at, rule_id: event.rule_id, context: event.context });
        break;
      case "merge-recorded": {
        const pkg = state.packages[event.package_id];
        pkg.status = "merged";
        pkg.merged = { at: event.at, sha: event.sha, route: event.route };
        break;
      }
      case "checkpoint":
        state.checkpoints = event.number;
        state.lastCheckpointIndex = index;
        break;
      case "scope-drift":
        for (const id of event.affected_packages) {
          state.packages[id].driftStopped = true;
        }
        break;
      case "packet-revised":
        state.packet = event.packet;
        for (const pkg of Object.values(state.packages)) pkg.driftStopped = false;
        break;
      case "mission-stopped":
        state.stopped = { at: event.at, reason: event.reason, detail: event.detail };
        break;
      case "mission-resumed":
        state.stopped = null;
        state.lead = { lead_id: event.lead_id, pid: event.pid, at: event.at };
        break;
      default:
        break;
    }
    state.eventCount = index + 1;
  }
  return state;
}

/** Replay the journal on disk. */
export function replayState(repoPath, missionId, env = process.env) {
  const paths = missionPaths(repoPath, missionId, env);
  return reduce(readJournal(paths.journal));
}

/**
 * Validate-then-append under the mission lock. Returns the replayed state
 * after the append. Throws with every refusal when the event is invalid —
 * a throw is a refusal, not a crash into an accepting default.
 */
export async function appendEvent(repoPath, missionId, event, options = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const paths = missionPaths(repoPath, missionId, env);
  const stamped = { at: new Date(now).toISOString(), ...event };
  return withLock(paths.lock, () => {
    const events = readJournal(paths.journal);
    const state = reduce(events);
    const errors = validateEvent(stamped, state);
    if (errors.length > 0) {
      const error = new Error(`Refused ${event.type}:\n- ${errors.join("\n- ")}`);
      error.refusals = errors;
      throw error;
    }
    fs.mkdirSync(paths.missionRoot, { recursive: true, mode: 0o700 });
    fs.appendFileSync(paths.journal, `${JSON.stringify(stamped)}\n`, { mode: 0o600 });
    return reduce([...events, stamped]);
  });
}

/**
 * The Mission Lead lease: one live Lead per mission. A fresh Lead may take
 * over only when the recorded Lead's process is dead or its heartbeat has
 * expired with the process gone — permission uncertainty counts as alive,
 * exactly as the database coordinator treats worker ownership.
 */
/** @param {MissionState} state @param {{ leadId?: string, pid?: number, now?: number, probe?: (pid: number, signal?: number) => unknown }} [options] */
export function leadLeaseAvailable(state, { leadId, now = Date.now(), probe = process.kill } = {}) {
  if (!state.lead) return true;
  if (state.lead.lead_id === leadId) return true;
  const expired = now - Date.parse(state.lead.at) > LEAD_TTL_MS;
  return expired && !ownerAlive(state.lead.pid, probe);
}

/**
 * The executable frontier: what a Lead may safely do next, derived purely
 * from state. A fresh Mission Lead reconstructs this without any chat
 * context — the kill-and-resume rehearsal asserts it is identical before and
 * after the previous Lead dies.
 */
/** @param {MissionState} state @returns {MissionAction[]} */
export function nextActions(state) {
  const actions = [];
  if (!state.initialized) return [{ action: "init", detail: "Validate and record the packet." }];
  if (state.stopped) {
    return [
      {
        action: "resume",
        detail: `The mission is stopped (${state.stopped.reason}); a fresh Lead resumes from this checkpoint.`,
      },
    ];
  }
  const packages = Object.values(state.packages);
  if (packages.length === 0) {
    return [{ action: "plan", detail: "Derive the work-package DAG from the packet." }];
  }
  if (!state.preflight) {
    actions.push({
      action: "linear-preflight",
      detail: "Run the non-mutating Linear connectivity check and record it.",
    });
  }
  for (const question of Object.values(state.questions)) {
    if (question.status === "open" && question.classification === "immediate") {
      actions.push({
        action: "escalate",
        detail: `Immediate owner question ${question.id} blocks its packages.`,
        question_id: question.id,
      });
    }
  }
  for (const pkg of packages) {
    if (pkg.driftStopped) continue;
    const questionBlocked = Object.values(state.questions).some(
      (question) => question.status === "open" && question.affected_packages.includes(pkg.id),
    );
    if (questionBlocked) continue;
    if (pkg.status === "planned" && state.preflight && !pkg.linear_issue_id) {
      actions.push({
        action: "sync",
        package_id: pkg.id,
        detail: "Create or reconcile the Linear issue.",
      });
    }
    if (
      pkg.status === "synced" &&
      pkg.depends_on.every((dep) => state.packages[dep]?.status === "merged")
    ) {
      actions.push({
        action: "dispatch",
        package_id: pkg.id,
        detail: "Dispatch when a worker slot and collision domain are free.",
      });
    }
    if (pkg.status === "implemented" && pkg.risk_class !== "low") {
      actions.push({
        action: "review",
        package_id: pkg.id,
        detail: "Route one fresh-context independent review.",
      });
    }
    if (pkg.status === "implemented" && pkg.risk_class === "low") {
      // The guarded lane always requires a clear review receipt, so low-risk
      // work either earns one to qualify, or goes to Brian as a normal draft.
      actions.push({
        action: "low-risk-disposition",
        package_id: pkg.id,
        detail:
          "Low risk: verify the worker's evidence deterministically, then either route a review to qualify for the guarded lane or hand the draft PR to Brian.",
      });
    }
    if (pkg.status === "blocked" && pkg.review?.result === "blocked") {
      actions.push({
        action: "correction",
        package_id: pkg.id,
        detail: `Resume original worker ${pkg.worker_id}.`,
      });
    }
    if (pkg.status === "reviewed") {
      actions.push({
        action: "merge-gate",
        package_id: pkg.id,
        detail: "Evaluate the guarded merge gate.",
      });
    }
  }
  return actions;
}
