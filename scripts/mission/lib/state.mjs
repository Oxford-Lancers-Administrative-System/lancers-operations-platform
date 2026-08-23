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

import { validateDecomposition, validatePacket, validatePackage } from "./packet.mjs";
import { parseNameStatus } from "../../fast-lane/classify.mjs";
import { classifyVisualDelta, loadRules } from "../merge-gate.mjs";

export const MAX_ACTIVE_WORKERS = 2;
export const LEAD_TTL_MS = 120_000;

export const EVENT_TYPES = [
  "mission-init",
  "lead-heartbeat",
  "plan-recorded",
  "plan-approved",
  "linear-preflight",
  "dispatch-deferred",
  "linear-sync-intent",
  "linear-sync-result",
  "worker-dispatched",
  "worker-receipt",
  "worker-abandoned",
  "correction-dispatched",
  "pr-opened",
  "review-receipt",
  "integrated-review",
  "visual-approval",
  "owner-question",
  "owner-answer",
  "rule-applied",
  "journal-annotation",
  "merge-recorded",
  "checkpoint",
  "scope-drift",
  "packet-revised",
  "package-reclaimed",
  "mission-closeout",
  "mission-finalized",
  "mission-abandoned",
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

function carryForwardCovers(chain, fromSha, toSha) {
  if (fromSha === toSha) return true;
  let current = fromSha;
  for (const link of chain ?? []) {
    if (link.from_sha !== current || link.verdict !== "non-rendered") continue;
    current = link.to_sha;
    if (current === toSha) return true;
  }
  return false;
}

export function visualApprovalCovers(pkg, headSha = pkg?.head_sha) {
  return Boolean(
    pkg?.visual_approved &&
    !pkg.visual_evidence_pending &&
    pkg.visual_approval?.head_sha &&
    carryForwardCovers(pkg.visual_carry_forward_chain, pkg.visual_approval.head_sha, headSha),
  );
}

function clearWalkerCovers(state, pkg, headSha = pkg?.head_sha) {
  return state.integratedReviews.some(
    (review) =>
      review.mode === "workflow-walker" &&
      review.result === "clear" &&
      carryForwardCovers(pkg.visual_carry_forward_chain, review.head_sha, headSha),
  );
}

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

/**
 * The two reviews that only make sense against the whole mission (LAN-148 §D).
 *
 * Package-scoped review caught serious defects in the first live run and missed
 * twelve usability and consistency ones, because nobody reviewed the thing the
 * packages add up to. A walker completes the mission's actual user jobs end to
 * end before Brian is asked to look at anything; a cross-surface pass compares
 * the repeated facts, states, dates, permissions and copy across the surfaces
 * once they have all integrated.
 */
export const INTEGRATED_REVIEW_MODES = ["workflow-walker", "cross-surface"];

/**
 * The four sources a UI brief must name (LAN-148 §E).
 *
 * Root AGENTS.md has always required user-facing work to read them. The Mission
 * Lead's brief did not name them, so mission-delegated UI work could — and in
 * the first live run did — reach implementation with the packet as its only
 * contract, and the durable contract directory never learned what shipped.
 */
export const UX_SOURCE_KEYS = ["slice_ux", "standards", "ticket_contract", "wireframes"];

const UX_TICKET_PATTERN = /^docs\/ux\/tickets\/LAN-\d+-[a-z0-9-]+\.md$/;

function uxDefects(receipt, packageId) {
  const sources = receipt.ux_sources;
  if (sources === null || typeof sources !== "object" || Array.isArray(sources)) {
    return [
      `${packageId}: user-facing work names its UX sources — docs/ux/slice-ux.md, docs/ux/standards.md, the applicable docs/ux/tickets/ contract, and the desktop and 375px wireframes.`,
    ];
  }
  const defects = [];
  for (const key of UX_SOURCE_KEYS) {
    if (!isNonEmptyString(sources[key])) {
      defects.push(`${packageId}: \`ux_sources.${key}\` is not named.`);
    }
  }
  // When the packet was the only contract, delivery writes what was actually
  // built into the durable directory, so the next mission reads a contract
  // rather than re-deriving one from a packet that has been superseded.
  if (!UX_TICKET_PATTERN.test(sources.ticket_contract ?? "")) {
    defects.push(
      `${packageId}: ux_sources.ticket_contract must be a durable contract at docs/ux/tickets/<LINEAR-ID>-<slug>.md. If the packet was the only contract, delivery writes the implemented one there.`,
    );
  }
  return defects;
}

/** What an unresolved finding has to carry to survive the mission (§G). */
const FINDING_FIELDS = [
  "id",
  "impact_severity",
  "gate_disposition",
  "consequence",
  "evidence",
  "recommendation",
  "owner_disposition",
];

/** Bounded injection proof: the defect came back, the named test failed, the
 * fix was restored, the test passed. Not a mutation-testing framework — four
 * recorded facts about one fix (§D). */
const INJECTION_FIELDS = ["finding_id", "test", "command", "failing_output", "restored_pass"];

function injectionDefects(entry) {
  const label = entry?.finding_id ?? "a correction";
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`${label}: injection evidence must be an object.`];
  }
  const defects = [];
  for (const field of INJECTION_FIELDS) {
    if (!isNonEmptyString(entry[field])) {
      defects.push(`${label}: injection evidence is missing \`${field}\`.`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(entry.sha ?? "")) {
    defects.push(`${label}: injection evidence records the exact SHA it was produced at.`);
  }
  return defects;
}

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
 * Whether downstream work may be built on this dependency yet (LAN-148 §F).
 *
 * Merged is the obvious answer. The one the first live run needed and did not
 * have is the other: a dependency that has been independently reviewed clean at
 * exactly the head its pull request carries, and — if it is visual — approved at
 * that same head, is a deterministic, verified base. Waiting for Brian to click
 * merge adds no safety, and in the first mission it idled downstream packages
 * for hours at a time. His merge authority is untouched; only the *scheduling*
 * dependency on his timing is removed.
 */
export function dependencyUsable(state, packageId) {
  const pkg = state.packages[packageId];
  if (!pkg) return { usable: false, basis: null, why: `${packageId} is not planned.` };
  if (pkg.status === "merged") return { usable: true, basis: "merged" };
  const review = pkg.review;
  if (!review || review.result !== "clear") {
    return { usable: false, basis: null, why: `${packageId} has no clear independent review.` };
  }
  if (!pkg.head_sha || review.reviewed_head_sha !== pkg.head_sha) {
    return {
      usable: false,
      basis: null,
      why: `${packageId} was reviewed at ${review.reviewed_head_sha ?? "no recorded head"}, but its pull request now carries ${pkg.head_sha ?? "no recorded head"}.`,
    };
  }
  if (pkg.visual !== "nonvisual" && !visualApprovalCovers(pkg)) {
    return {
      usable: false,
      basis: null,
      why: `${packageId} is visual and has no recorded approval at its current head.`,
    };
  }
  return { usable: true, basis: "reviewed-at-head", head_sha: pkg.head_sha };
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
 * Why this package may not travel the guarded lane, from mission state alone.
 *
 * LAN-148 §F separates three things the harness used to conflate. Review grade
 * says how rigorously a change is reviewed. Merge route is decided by the
 * protected surface the diff actually touches plus the evidence — which the
 * workflow re-derives from the real diff, and which no receipt can talk its way
 * past. Dispatch state is a third thing again.
 *
 * The blanket "highest risk never auto-merges" made the checkpoint-approval
 * tier unreachable for exactly the work it was designed for: authorization
 * rules are graded Highest, so the tier Brian approved on 2026-08-18 could
 * never fire. Highest-risk work now travels the lane only when an answered
 * owner checkpoint names the package — he still hears about it before it
 * merges — while migrations, and every path in the prohibited list, stay his.
 */
export function guardedLaneRefusals(state, packageId, sha) {
  const pkg = state.packages[packageId];
  if (!pkg) return [`No planned package ${packageId}.`];
  const refusals = [];
  if (pkg.migration_owner) {
    refusals.push("A migration-owning package is owner-merged, never autonomous.");
  }
  if (pkg.risk_class === "highest" && !answeredQuestionNaming(state, packageId)) {
    refusals.push(
      `${packageId} is highest risk. It may use the guarded lane only when an answered owner checkpoint names it, so that Brian has heard about it before it merges.`,
    );
  }
  const review = pkg.review;
  if (!review || review.result !== "clear" || review.reviewed_head_sha !== sha) {
    refusals.push(
      `A guarded merge requires a clear review receipt at exactly ${sha ?? "the merged SHA"}.`,
    );
  }
  if (pkg.visual !== "nonvisual" && !visualApprovalCovers(pkg, sha)) {
    refusals.push("Visual work merges only after Brian's recorded visual approval.");
  }
  for (const question of openQuestionsAffecting(state, packageId)) {
    refusals.push(`Unresolved owner question ${question.id} affects ${packageId}.`);
  }
  if (state.stopped) {
    refusals.push(`The mission is stopped (${state.stopped.reason}); nothing merges.`);
  }
  return refusals;
}

/** An answered owner question that names this package — the checkpoint tier. */
function answeredQuestionNaming(state, packageId) {
  return Object.values(state.questions).some(
    (question) => question.status === "answered" && question.affected_packages.includes(packageId),
  );
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
      // LAN-148 §A: one coherent issue defaults to one implementation package,
      // so a plan proposing more than one must say what boundary each split
      // buys and what it costs Brian.
      const requireSeparation = event.packages.length > 1;
      for (const pkg of event.packages) {
        errors.push(...validatePackage(pkg, state.packet, { requireSeparation }));
        if (pkg.id && seen.has(pkg.id)) errors.push(`Package id ${pkg.id} is duplicated.`);
        if (pkg.id) seen.add(pkg.id);
      }
      errors.push(...validateDecomposition(event.decomposition, event.packages));

      // Stable IDs across replans — but a plan that has not been synchronized
      // or dispatched is still a proposal. Before LAN-148 an over-split plan
      // could never be combined, because the first recording of it was final;
      // the reversibility the issue asks for is exactly this branch.
      const removals = new Map(
        (Array.isArray(event.removals) ? event.removals : []).map((entry) => [
          entry?.package_id,
          entry,
        ]),
      );
      for (const [existingId, existing] of Object.entries(state.packages)) {
        if (seen.has(existingId) || existing.status === "removed") continue;
        const removal = removals.get(existingId);
        if (!removal) {
          errors.push(
            `Replanning dropped ${existingId} without recording it. A package may be combined or removed before it is synchronized, but never silently.`,
          );
          continue;
        }
        if (!isNonEmptyString(removal.reason)) {
          errors.push(`Removing ${existingId} records why it was combined or dropped.`);
        }
        const durable =
          existing.linear_issue_id ||
          existing.worker_id ||
          existing.pr_number ||
          existing.status !== "planned";
        if (durable) {
          errors.push(
            `${existingId} has already become durable (${existing.linear_issue_id ?? existing.status}); its identity and lineage are protected once execution begins.`,
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

    case "plan-approved": {
      if (Object.keys(state.packages).length === 0) {
        errors.push("There is no recorded plan to approve.");
      }
      if (state.planApproved) {
        errors.push("This plan is already approved; record a revised plan before approving again.");
      }
      if (!isNonEmptyString(event.approved_by)) {
        errors.push("A plan approval records who approved the decomposition.");
      }
      if (!isNonEmptyString(event.evidence)) {
        errors.push(
          "A plan approval records where the decomposition and its owner cost were presented.",
        );
      }
      break;
    }

    case "dispatch-deferred": {
      if (!state.packages[event.package_id]) {
        errors.push(`No planned package ${event.package_id}.`);
      }
      if (!isNonEmptyString(event.reason)) {
        errors.push(
          "Waiting for a merge that the evidence does not require is a choice; it records the concrete safety or integration reason.",
        );
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
      // Nothing durable — no Linear issue, no branch, no work package — is
      // created before the decomposition has been presented and approved.
      if (!state.planApproved) {
        errors.push(
          "The plan is not approved. Present the decomposition, its collision evidence, its achievable concurrency and its owner cost, and record the approval before creating anything durable.",
        );
      }
      if (pkg.status === "removed") {
        errors.push(`${event.package_id} was removed from the plan.`);
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
      const declaredBasis = new Map(
        (Array.isArray(event.dependency_basis) ? event.dependency_basis : []).map((entry) => [
          entry?.package_id,
          entry,
        ]),
      );
      for (const dep of pkg.depends_on) {
        const verdict = dependencyUsable(state, dep);
        if (!verdict.usable) {
          errors.push(`${event.package_id} cannot start on ${dep}: ${verdict.why}`);
          continue;
        }
        if (verdict.basis === "merged") continue;
        // Building on an unmerged dependency is allowed, but it is a decision
        // the journal has to be able to show, pinned to the exact commit it
        // was taken against.
        const declared = declaredBasis.get(dep);
        if (!declared) {
          errors.push(
            `${event.package_id} builds on unmerged ${dep}; the dispatch records that basis and the exact head it relies on.`,
          );
        } else if (declared.head_sha !== verdict.head_sha) {
          errors.push(
            `${event.package_id} records ${dep} at ${declared.head_sha ?? "no head"}, but the reviewed head is ${verdict.head_sha}.`,
          );
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
      // LAN-148 §D. A correction that says it fixed something has to show that
      // the defect can be put back and that a named test notices. Only for
      // corrections, and only for the findings this one was dispatched to fix —
      // this is four recorded facts about one fix, not a mutation platform.
      // LAN-148 §E: user-facing work says which contract it was built against.
      if (
        receipt.result === "completed" &&
        state.packages[event.package_id]?.visual !== "nonvisual"
      ) {
        errors.push(...uxDefects(receipt, event.package_id));
      }
      if (worker.kind === "correction" && receipt.result === "completed") {
        const evidence = Array.isArray(receipt.injection_evidence)
          ? receipt.injection_evidence
          : [];
        const proved = new Set(evidence.map((entry) => entry?.finding_id));
        for (const findingId of worker.finding_ids ?? []) {
          if (!proved.has(findingId)) {
            errors.push(
              `${findingId} was corrected without injection evidence: reintroduce the defect, run the named regression test and observe it fail, restore the fix, and run it again.`,
            );
          }
        }
        for (const entry of evidence) errors.push(...injectionDefects(entry));
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

    case "integrated-review": {
      if (!INTEGRATED_REVIEW_MODES.includes(event.mode)) {
        errors.push(`An integrated review's mode is one of ${INTEGRATED_REVIEW_MODES.join(", ")}.`);
      }
      if (!/^[0-9a-f]{40}$/.test(event.head_sha ?? "")) {
        errors.push("An integrated review records the exact integrated head it ran against.");
      }
      if (!["clear", "blocked"].includes(event.result)) {
        errors.push('An integrated review result is "clear" or "blocked".');
      }
      if (event.mode === "workflow-walker" && !isNonEmptyString(event.jobs_completed)) {
        errors.push(
          "A workflow walker records the user jobs it completed end to end, not the screens it visited.",
        );
      }
      if (
        event.result === "blocked" &&
        (!Array.isArray(event.findings) || event.findings.length === 0)
      ) {
        errors.push("A blocked integrated review names its findings.");
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
      // LAN-148 §D: Brian looks at the integrated result, not at one package in
      // isolation. The walker runs first, at the head he will be shown.
      if (!clearWalkerCovers(state, pkg)) {
        errors.push(
          `No clear workflow-walker review covers ${pkg.head_sha ?? "this package's head"}. The mission's own user jobs are completed end to end before Brian is asked to judge presentation.`,
        );
      }
      if (!isNonEmptyString(event.approved_by) || !isNonEmptyString(event.evidence)) {
        errors.push("A visual approval records who approved and where (the live review).");
      }
      break;
    }

    case "journal-annotation": {
      if (!Number.isInteger(event.target_event) || event.target_event < 0) {
        errors.push("A journal annotation names an existing zero-based target_event index.");
      } else if (event.target_event >= state.eventCount) {
        errors.push(
          `Journal event ${event.target_event} does not exist; append-only annotations cannot correct an absent entry.`,
        );
      }
      if (!["disputed", "corrected"].includes(event.disposition)) {
        errors.push('A journal annotation disposition is "disputed" or "corrected".');
      }
      if (!isNonEmptyString(event.reason)) {
        errors.push(
          "A journal annotation records why the existing entry is disputed or corrected.",
        );
      }
      if (event.disposition === "corrected" && !isNonEmptyString(event.correction)) {
        errors.push("A corrected journal entry records the correction without rewriting history.");
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
        errors.push(...guardedLaneRefusals(state, event.package_id, event.sha));
      }
      // LAN-148 §F: sending work to Brian that the lane could have taken is a
      // harness defect, not a neutral choice — it is what turned the first live
      // mission's merges into a queue. It is allowed, and it is recorded.
      if (event.route === "owner") {
        const qualified = guardedLaneRefusals(state, event.package_id, event.sha).length === 0;
        if (qualified && !isNonEmptyString(event.owner_route_reason)) {
          errors.push(
            `${event.package_id} qualified for the guarded lane; routing it to Brian anyway records why, and is counted as a harness defect.`,
          );
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

    case "package-reclaimed": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      // Reclaiming is not a judgement call. It follows a terminal state that
      // the repository can be asked about — the mission-merge lane merges
      // without a human, so "Brian merged it" is not a state anyone can infer.
      if (!["merged", "removed"].includes(pkg.status) && !event.abandoned) {
        errors.push(
          `${event.package_id} is ${pkg.status}. A package's worktree and branch are reclaimed after it merges, is removed from the plan, or is explicitly abandoned — never on the strength of a receipt.`,
        );
      }
      if (pkg.status === "merged" && !/^[0-9a-f]{40}$/.test(event.merge_sha ?? "")) {
        errors.push(
          "Reclaiming a merged package records the merge commit it was proved against, read from the repository.",
        );
      }
      if (event.abandoned && !isNonEmptyString(event.reason)) {
        errors.push("Abandoning a package's worktree records why, and that its branch is pushed.");
      }
      if (activeWorkerFor(state, event.package_id)) {
        errors.push(
          `${event.package_id} still has an active worker; its worktree is not debris yet.`,
        );
      }
      break;
    }

    case "mission-finalized": {
      // Everything the mission took out has been given back, and the evidence
      // exists somewhere Brian will find it.
      if (!state.closeout) {
        errors.push(
          "The mission has no recorded closeout. Write the evidence into the Notion mission record before declaring the mission finished; reclaiming resources is not the same act.",
        );
      }
      const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
      const unfinished = live.filter((pkg) => pkg.status !== "merged");
      if (unfinished.length > 0) {
        errors.push(
          `${unfinished.map((pkg) => pkg.id).join(", ")} has not merged. A mission is finalized only when every live package has; anything else is abandonment and is recorded as that.`,
        );
      }
      const unreclaimed = live.filter((pkg) => !state.reclaimed.includes(pkg.id));
      if (unreclaimed.length > 0) {
        errors.push(
          `${unreclaimed.map((pkg) => pkg.id).join(", ")} still holds a worktree or branch.`,
        );
      }
      if (state.activeWorkers.length > 0) {
        errors.push("Workers are still running.");
      }
      if (!isNonEmptyString(event.stack_disposition)) {
        errors.push(
          "Finalizing records what happened to the mission-owned stack — retired, or left because another attachment still needs it.",
        );
      }
      break;
    }

    case "mission-abandoned": {
      if (!isNonEmptyString(event.reason)) {
        errors.push("Abandoning a mission records why it is being reclaimed unfinished.");
      }
      if (!isNonEmptyString(event.preserved)) {
        errors.push(
          "Abandonment records what was deliberately preserved — pushed branches, open pull requests, the journal itself — so a later reader can tell debris from evidence.",
        );
      }
      if (state.activeWorkers.length > 0) {
        errors.push("Workers are still running; stop or abandon them before the mission.");
      }
      break;
    }

    case "mission-closeout": {
      if (!["delivered", "delivered-with-residue", "stopped-incomplete"].includes(event.outcome)) {
        errors.push(
          'A mission closes as "delivered", "delivered-with-residue" or "stopped-incomplete" — the three labels that can be true.',
        );
      }
      if (!isNonEmptyString(event.notion_record)) {
        errors.push(
          "Closeout records the existing Notion mission record it was written to. It extends that record; it never creates a Linear planning document or an automatic deferred-findings issue.",
        );
      }
      if (!isNonEmptyString(event.next_action)) {
        errors.push("Closeout records the next action, even when that is 'none'.");
      }
      if (!Array.isArray(event.shipped) || event.shipped.length === 0) {
        errors.push("Closeout lists what shipped.");
      } else {
        for (const entry of event.shipped) {
          if (!isNonEmptyString(entry?.linear_issue_id) || !Number.isInteger(entry?.pr_number)) {
            errors.push("Each shipped entry names its Linear issue and pull request.");
          }
          if (!/^[0-9a-f]{40}$/.test(entry?.sha ?? "")) {
            errors.push("Each shipped entry records the exact merged SHA.");
          }
        }
      }
      // Every unresolved finding survives the mission in a form Brian can
      // triage once — the alternative is LAN-146, an issue created to hold
      // eleven findings because nothing durable would.
      for (const finding of Array.isArray(event.unresolved_findings)
        ? event.unresolved_findings
        : []) {
        for (const field of FINDING_FIELDS) {
          if (!isNonEmptyString(finding?.[field])) {
            errors.push(
              `Unresolved finding ${finding?.id ?? "(unidentified)"} is missing \`${field}\`.`,
            );
          }
        }
      }
      if (!isNonEmptyString(event.owner_actions)) {
        errors.push("Closeout states what Brian or an external service must do, or 'none'.");
      }
      if (event.outcome !== "stopped-incomplete") {
        const crossSurface = state.integratedReviews.find(
          (review) => review.mode === "cross-surface" && review.result === "clear",
        );
        if (!crossSurface) {
          errors.push(
            "No clear cross-surface review covers the integrated result. Repeated facts, states, dates, permissions and copy are compared across the surfaces once they have all landed.",
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
 *   planApproved: { at: string, by: string, evidence: string } | null,
 *   decomposition: Record<string, any> | null,
 *   dispatchDeferrals: Array<Record<string, any>>,
 *   laneBypasses: Array<Record<string, any>>,
 *   integratedReviews: Array<Record<string, any>>,
 *   annotations: Array<Record<string, any>>,
 *   closeout: Record<string, any> | null,
 *   reclaimed: string[],
 *   terminal: { at: string, state: "finalized" | "abandoned" } | null,
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
    planApproved: null,
    decomposition: null,
    dispatchDeferrals: [],
    laneBypasses: [],
    integratedReviews: [],
    annotations: [],
    closeout: null,
    reclaimed: [],
    terminal: null,
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
      case "plan-recorded": {
        const proposed = new Set(event.packages.map((pkg) => pkg.id));
        for (const [id, existing] of Object.entries(state.packages)) {
          if (proposed.has(id) || existing.status === "removed") continue;
          // Kept, not deleted: the lineage of a combined-away package stays
          // readable, and the journal above records why.
          existing.status = "removed";
          existing.removed = {
            at: event.at,
            reason: (event.removals ?? []).find((entry) => entry.package_id === id)?.reason ?? null,
          };
        }
        // A revised plan is a different plan; whatever was approved no longer
        // describes it. Same pinning as a visual approval against a new head.
        state.planApproved = null;
        state.decomposition = event.decomposition ?? null;
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
            visual_approval: existing?.visual_approval ?? null,
            visual_carry_forward_chain: existing?.visual_carry_forward_chain ?? [],
            visual_evidence_pending: existing?.visual_evidence_pending ?? false,
            driftStopped: existing?.driftStopped ?? false,
          };
        }
        break;
      }
      case "plan-approved":
        state.planApproved = {
          at: event.at,
          by: event.approved_by,
          evidence: event.evidence,
        };
        break;
      case "dispatch-deferred":
        state.dispatchDeferrals.push({
          at: event.at,
          package_id: event.package_id,
          reason: event.reason,
        });
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
        // A dispatch has no new head to classify. Keep the evidence but mark it
        // pending so it cannot satisfy a gate until `pr-opened` records and
        // classifies the actual old-head..new-head delta.
        pkg.visual_evidence_pending = true;
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
        const previousHead = pkg.head_sha;
        if (previousHead && previousHead !== event.head_sha) {
          const delta = event.visual_delta;
          if (
            delta?.previous_head === previousHead &&
            delta?.new_head === event.head_sha &&
            delta?.verdict === "non-rendered" &&
            delta?.fact === `carried-forward-from ${previousHead}`
          ) {
            pkg.visual_carry_forward_chain.push({
              from_sha: previousHead,
              to_sha: event.head_sha,
              verdict: delta.verdict,
              files: delta.files,
              fact: delta.fact,
            });
          } else {
            // Unknown and rendered deltas both fail closed. Brian approved what
            // he saw, not an unclassified or presentation-changing head.
            pkg.visual_approved = false;
            pkg.visual_approval = null;
            pkg.visual_carry_forward_chain = [];
          }
        }
        pkg.visual_evidence_pending = false;
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
      case "integrated-review":
        state.integratedReviews.push({
          at: event.at,
          mode: event.mode,
          head_sha: event.head_sha,
          result: event.result,
          jobs_completed: event.jobs_completed ?? null,
          findings: event.findings ?? [],
        });
        break;
      case "package-reclaimed": {
        const pkg = state.packages[event.package_id];
        state.reclaimed.push(event.package_id);
        pkg.reclaimed = {
          at: event.at,
          merge_sha: event.merge_sha ?? null,
          abandoned: Boolean(event.abandoned),
          reason: event.reason ?? null,
        };
        break;
      }
      case "mission-finalized":
        state.terminal = {
          at: event.at,
          state: "finalized",
          stack_disposition: event.stack_disposition,
        };
        break;
      case "mission-abandoned":
        state.terminal = {
          at: event.at,
          state: "abandoned",
          reason: event.reason,
          preserved: event.preserved,
        };
        break;
      case "mission-closeout":
        state.closeout = {
          at: event.at,
          outcome: event.outcome,
          notion_record: event.notion_record,
          shipped: event.shipped,
          unresolved_findings: event.unresolved_findings ?? [],
          owner_actions: event.owner_actions,
          next_action: event.next_action,
          elapsed: event.elapsed ?? null,
          cost: event.cost ?? null,
        };
        break;
      case "visual-approval": {
        const pkg = state.packages[event.package_id];
        pkg.visual_approved = true;
        pkg.visual_evidence_pending = false;
        pkg.visual_carry_forward_chain = [];
        pkg.visual_approval = {
          at: event.at,
          by: event.approved_by,
          evidence: event.evidence,
          // Approval is pinned to the head that was live when Brian looked.
          head_sha: pkg.head_sha ?? null,
        };
        break;
      }
      case "journal-annotation":
        state.annotations.push({
          at: event.at,
          target_event: event.target_event,
          disposition: event.disposition,
          reason: event.reason,
          correction: event.correction ?? null,
        });
        break;
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
        if (event.route === "owner" && event.owner_route_reason) {
          state.laneBypasses.push({
            at: event.at,
            package_id: event.package_id,
            reason: event.owner_route_reason,
          });
        }
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

function prepareJournalEvent(repoPath, event, state) {
  if (event.type !== "pr-opened") return event;
  const previousHead = state.packages[event.package_id]?.head_sha;
  if (!previousHead || previousHead === event.head_sha) return event;

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-status", previousHead, event.head_sha, "--"],
      {
        cwd: repoPath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const classified = classifyVisualDelta(parseNameStatus(output), loadRules());
    return {
      ...event,
      visual_delta: {
        previous_head: previousHead,
        new_head: event.head_sha,
        ...classified,
        ...(classified.verdict === "non-rendered"
          ? { fact: `carried-forward-from ${previousHead}` }
          : {}),
      },
    };
  } catch {
    // A missing commit, invalid repository, or failed diff is not evidence that
    // presentation stayed unchanged. Record the unknown verdict and invalidate.
    return {
      ...event,
      visual_delta: {
        previous_head: previousHead,
        new_head: event.head_sha,
        verdict: "unknown",
        files: [],
      },
    };
  }
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
  return withLock(paths.lock, () => {
    const events = readJournal(paths.journal);
    const state = reduce(events);
    // Caller-supplied classifier fields are overwritten. Carry-forward is a
    // machine decision derived from the repository, never a Lead assertion.
    const prepared = prepareJournalEvent(repoPath, event, state);
    const stamped = { at: new Date(now).toISOString(), ...prepared };
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
  if (!state.planApproved) {
    actions.push({
      action: "plan-approval",
      detail:
        "Present the decomposition — packages, split boundaries and their evidence, achievable concurrency, critical path, expected owner merges and visual approvals, and what was considered for combination — and record the approval. Nothing durable is created first.",
    });
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
    if (pkg.driftStopped || pkg.status === "removed") continue;
    const questionBlocked = Object.values(state.questions).some(
      (question) => question.status === "open" && question.affected_packages.includes(pkg.id),
    );
    if (questionBlocked) continue;
    if (pkg.status === "planned" && state.preflight && state.planApproved && !pkg.linear_issue_id) {
      actions.push({
        action: "sync",
        package_id: pkg.id,
        detail: "Create or reconcile the Linear issue.",
      });
    }
    if (pkg.status === "synced") {
      const verdicts = pkg.depends_on.map((dep) => [dep, dependencyUsable(state, dep)]);
      const blocked = verdicts.filter(([, verdict]) => !verdict.usable);
      if (blocked.length === 0) {
        const unmerged = verdicts.filter(([, verdict]) => verdict.basis === "reviewed-at-head");
        actions.push({
          action: "dispatch",
          package_id: pkg.id,
          detail: unmerged.length
            ? `Dispatch when a worker slot and collision domain are free, recording the reviewed head of ${unmerged
                .map(([dep]) => dep)
                .join(
                  ", ",
                )} as its basis. Waiting for the merge instead is a choice that records its reason.`
            : "Dispatch when a worker slot and collision domain are free.",
        });
      }
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
    // The walker runs against the head Brian will be shown, before he is asked.
    if (
      pkg.visual !== "nonvisual" &&
      pkg.head_sha &&
      !visualApprovalCovers(pkg) &&
      ["implemented", "reviewed"].includes(pkg.status) &&
      !clearWalkerCovers(state, pkg)
    ) {
      actions.push({
        action: "workflow-walker",
        package_id: pkg.id,
        detail: `Complete the mission's user jobs end to end against ${pkg.head_sha} before asking Brian to judge presentation.`,
      });
    }
  }

  const live = packages.filter((pkg) => pkg.status !== "removed");
  if (live.length > 0 && live.every((pkg) => pkg.status === "merged")) {
    if (!state.integratedReviews.some((review) => review.mode === "cross-surface")) {
      actions.push({
        action: "cross-surface-review",
        detail:
          "Every package has landed. Compare the repeated facts, states, dates, permissions and copy across the surfaces they add up to.",
      });
    } else if (!state.closeout) {
      actions.push({
        action: "closeout",
        detail:
          "Write the closeout into the existing Notion mission record: outcome, shipped issues, pull requests and exact SHAs, acceptance and injection evidence, unresolved findings and their dispositions, owner and external actions, elapsed time and cost, and the next action.",
      });
    }
  }
  // A resumed Lead must be able to tell a finished mission from an abandoned
  // one, and neither from a mission still running. The terminal event is what
  // says so; until it exists there is debris to reclaim.
  if (state.terminal) {
    return [
      {
        action: "none",
        detail: `The mission is ${state.terminal.state}. Nothing further is owed.`,
      },
    ];
  }
  for (const pkg of live) {
    if (pkg.status === "merged" && !state.reclaimed.includes(pkg.id)) {
      actions.push({
        action: "reclaim",
        package_id: pkg.id,
        detail:
          "Merged. `npm run mission:finish` proves the merge from the repository, then releases its worktree, branch and attachment to the mission stack. Reclamation does not wait for the mission to end.",
      });
    }
  }
  if (
    state.closeout &&
    live.length > 0 &&
    live.every((pkg) => pkg.status === "merged" && state.reclaimed.includes(pkg.id))
  ) {
    actions.push({
      action: "finalize",
      detail:
        "Every package has merged and been reclaimed and the closeout is written. `npm run mission:finish` retires the mission stack if this is its last attachment and records the mission finalized.",
    });
  }
  return actions;
}
