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
import {
  ADJUSTMENT_KINDS,
  BOUNDARY_PERMITTED_CLASSES,
  EPOCH_EVENT_TYPES,
  EPOCH_LIMITS,
  PACKAGE_SCOPED_CLASSES,
  PHASE_PERMITS,
  REVIEW_INVOCATION_EVENT_TYPES,
  actionClassFor,
  buildResumeDossier,
  emptyEpochSignals,
  epochHealth,
} from "./epochs.mjs";
import {
  INVOCATION_ROLES,
  buildPackageReviewContract,
  buildWalkerContract,
  contractHash,
  jobResultDefects,
} from "./review-contract.mjs";
import { RUNTIME_STATES, healthDefects, reclamationDefects } from "./runtime-broker.mjs";
import { parseNameStatus } from "../../fast-lane/classify.mjs";
import { buildMissionReceipt, classifyVisualDelta, loadRules } from "../merge-gate.mjs";

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
  "package-gate-passed",
  "package-gate-invalidated",
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
  ...EPOCH_EVENT_TYPES,
  ...REVIEW_INVOCATION_EVENT_TYPES,
];

export const PHASE_BOUNDARIES = ["plan-approved"];

export {
  ADJUSTMENT_KINDS,
  EPOCH_LIMITS,
  EPOCH_PHASES,
  EPOCH_STATUSES,
  EVENT_ACTION_CLASSES,
  HEALTH_COLORS,
  PHASE_PERMITS,
} from "./epochs.mjs";

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

function packageHeadCovers(record, pkg, headSha = pkg?.head_sha) {
  const recorded = record?.package_heads?.[pkg?.id];
  return Boolean(
    recorded && carryForwardCovers(pkg?.visual_carry_forward_chain, recorded, headSha),
  );
}

export function missionReviewCovers(state, pkg, headSha = pkg?.head_sha) {
  return state.integratedReviews.some(
    (review) =>
      review.mode === "security-tier" &&
      review.result === "clear" &&
      packageHeadCovers(review, pkg, headSha),
  );
}

function uxConformanceClear(review) {
  return Boolean(
    review?.ux_conformance?.result === "clear" &&
    Array.isArray(review.ux_conformance.mockup_states) &&
    review.ux_conformance.mockup_states.length > 0 &&
    review.ux_conformance.mockup_states.every(isNonEmptyString) &&
    isNonEmptyString(review.ux_conformance.comparison_method),
  );
}

export function missionVisualApprovalCovers(state, pkg, headSha = pkg?.head_sha) {
  return state.missionVisualApprovals.some((approval) => packageHeadCovers(approval, pkg, headSha));
}

function reviewCovers(state, pkg, headSha = pkg?.head_sha) {
  const packageReview =
    pkg?.review?.result === "clear" &&
    pkg.review.ci_state === "green" &&
    pkg.review.reviewed_head_sha === headSha &&
    (pkg.visual === "nonvisual" || uxConformanceClear(pkg.review));
  return Boolean(
    packageReview || (pkg?.visual === "nonvisual" && missionReviewCovers(state, pkg, headSha)),
  );
}

function approvalCovers(state, pkg, headSha = pkg?.head_sha) {
  return (
    pkg?.visual === "nonvisual" ||
    visualApprovalCovers(pkg, headSha) ||
    missionVisualApprovalCovers(state, pkg, headSha)
  );
}

function finalMissionSmoke(state) {
  const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
  if (live.length === 0 || live.some((pkg) => pkg.status !== "merged")) return null;
  const lastMerge = Math.max(...live.map((pkg) => pkg.merged?.event_index ?? -1));
  return (
    state.integratedReviews
      .filter((review) => review.mode === "workflow-walker" && review.event_index > lastMerge)
      .at(-1) ?? null
  );
}

function missionWorkflowSmokes(state, afterEventIndex = -1) {
  return state.integratedReviews.filter(
    (review) => review.mode === "workflow-walker" && review.event_index > afterEventIndex,
  );
}

function finalMissionSmokeClear(state) {
  return finalMissionSmoke(state)?.result === "clear";
}

/**
 * Every review or walker invocation this mission has opened, newest last.
 *
 * LAN-179. Before this, reviewer dispatch left no trace at all: the journal
 * could not say who reviewed a package, whether their environment was fresh, or
 * which capabilities they were given. A receipt was therefore accepted on the
 * strength of its own contents, which is exactly how a review that had done no
 * live checking cleared a package that depended on them.
 */
export const INVOCATION_DISPOSITIONS = [
  "requested",
  "dispatched",
  "completed",
  "blocked",
  "abandoned",
];

/** Runtimes this mission is still holding, so capacity can be counted. */
export function liveReviewRuntimes(state) {
  return Object.values(state.reviewRuntimes).filter(
    (runtime) => !["released", "abandoned", "provisioning-failed"].includes(runtime.state),
  );
}

/** The invocations that are waiting for infrastructure rather than a verdict. */
export function reviewQueue(state) {
  return Object.values(state.reviewInvocations)
    .filter((invocation) => invocation.disposition === "requested")
    .map((invocation) => ({
      invocation_id: invocation.invocation_id,
      role: invocation.role,
      package_id: invocation.package_id ?? null,
      head_sha: invocation.head_sha,
      round: invocation.round,
      runtime_state: invocation.runtime_state ?? "unprovisioned",
      runtime_id: invocation.runtime_id ?? null,
      reason: invocation.runtime_reason ?? null,
    }));
}

/**
 * The contract the harness would generate for this request right now.
 *
 * The Lead sends its derivation; this recomputes it and the validator refuses
 * any difference, exactly as `package-gate-passed` re-derives the merge receipt.
 * That is what makes "the Lead may add a diagnostic question but cannot remove a
 * generated capability or job" a property of the state machine.
 */
function deriveRequestedContract(event, state) {
  if (event.role === "workflow-walker") {
    return buildWalkerContract({
      state,
      headSha: event.head_sha,
      affectedJobIds: Array.isArray(event.affected_job_ids) ? event.affected_job_ids : null,
    });
  }
  return buildPackageReviewContract({
    state,
    packageId: event.package_id,
    headSha: event.head_sha,
    round: event.round,
    files: Array.isArray(event.changed_files) ? event.changed_files : [],
    rules: loadRules(),
    findingIds: Array.isArray(event.finding_ids) ? event.finding_ids : [],
  });
}

/**
 * Whether this agent identity is fresh enough to file this role's evidence.
 *
 * The host exposes no way to prove a model context is new, and a pid proves
 * nothing — every agent in one session shares it. So the harness enforces the
 * strongest boundary it actually has: an identity that has already acted in
 * another role, or in an earlier invocation on this mission, is refused. That is
 * a real fence against the Mission 4 shape, where the Lead derived a package's
 * fixture clearance itself, and it is deliberately not advertised as proof of a
 * fresh model.
 */
function freshnessRefusals(state, invocation, agentId) {
  const refusals = [];
  const where = invocation.role === "workflow-walker" ? "walker" : "reviewer";
  if (state.lead?.lead_id && agentId === state.lead.lead_id) {
    refusals.push(
      `The Mission Lead's own identity cannot be dispatched as the ${where}. The Lead declares what proof is required and reacts to the outcome; it never files the evidence.`,
    );
  }
  const pkg = invocation.package_id ? state.packages[invocation.package_id] : null;
  const implementers = new Set(
    [pkg?.worker_id, ...(pkg?.abandoned_workers ?? []).map((entry) => entry.worker_id)].filter(
      Boolean,
    ),
  );
  if (invocation.role === "workflow-walker") {
    for (const candidate of Object.values(state.packages)) {
      if (candidate.worker_id) implementers.add(candidate.worker_id);
      for (const entry of candidate.abandoned_workers ?? []) implementers.add(entry.worker_id);
    }
  }
  if (implementers.has(agentId)) {
    refusals.push(
      `${agentId} implemented this work. An implementer cannot review or walk it; the evidence would be the same agent agreeing with itself.`,
    );
  }
  const priorAgents = Object.values(state.reviewInvocations)
    .filter((other) => other.invocation_id !== invocation.invocation_id && other.agent_id)
    .map((other) => other.agent_id);
  if (priorAgents.includes(agentId)) {
    refusals.push(
      `${agentId} already held an invocation on this mission. Every review invocation — including each correction round — receives a fresh identity and a freshly prepared environment.`,
    );
  }
  return refusals;
}

/** The blocked smoke whose findings a targeted re-walk may be derived from. */
function lastBlockedSmoke(state) {
  return (
    state.integratedReviews
      .filter((review) => review.mode === "workflow-walker" && review.result === "blocked")
      .at(-1) ?? null
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

const REVIEW_RECEIPT_FIELDS = ["review_mode", "reviewed_head_sha", "round", "result", "ci_state"];

/** Reviews that make sense only against the whole mission. */
export const INTEGRATED_REVIEW_MODES = ["workflow-walker"];

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

function uxConformanceDefects(receipt, packageId) {
  const evidence = receipt.ux_conformance;
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [
      `${packageId}: a clear visual review records \`ux_conformance\` with the approved mockup states and comparison method.`,
    ];
  }
  const defects = [];
  if (
    !Array.isArray(evidence.mockup_states) ||
    evidence.mockup_states.length === 0 ||
    !evidence.mockup_states.every(isNonEmptyString)
  ) {
    defects.push(`${packageId}: ux_conformance.mockup_states names every compared state.`);
  }
  if (!isNonEmptyString(evidence.comparison_method)) {
    defects.push(
      `${packageId}: ux_conformance.comparison_method says how desktop and measured 375px were compared.`,
    );
  }
  if (evidence.result !== "clear") {
    defects.push(`${packageId}: ux_conformance.result is \"clear\" before owner handoff.`);
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

/**
 * The shape, said once, in the refusal that first asks for it.
 *
 * A worker cannot read this file, and nothing in its own instructions carries
 * the field list — so a receipt that had done the work honestly was refused
 * three times over the shape rather than the substance, and each round trip
 * cost a resumption of a worker whose branch was already green. Naming the
 * shape in the refusal is the difference between a validator that gates and
 * one that teaches.
 */
const INJECTION_SHAPE =
  'Each entry is {"finding_id", "test", "command", "failing_output", "restored_pass", "sha"} — every value a non-empty string, and `sha` exactly the 40-character commit the run was produced at.';

function injectionDefects(entry) {
  const label = entry?.finding_id ?? "a correction";
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return [`${label}: injection evidence must be an object.`];
  }
  const defects = [];
  for (const field of INJECTION_FIELDS) {
    if (!isNonEmptyString(entry[field])) {
      defects.push(`${label}: injection evidence is missing \`${field}\`. ${INJECTION_SHAPE}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(entry.sha ?? "")) {
    defects.push(
      `${label}: injection evidence records the exact SHA it was produced at, as 40 hex characters and nothing else — a qualifier belongs in \`failing_output\`, not in \`sha\`.`,
    );
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
 * Whether downstream work may be built on this dependency yet.
 *
 * Dependencies land progressively on `main`. Independent packages may still
 * run concurrently, but dependent work starts from the merged trunk rather
 * than an unmerged package branch that would need later reintegration.
 */
export function dependencyUsable(state, packageId) {
  const pkg = state.packages[packageId];
  if (!pkg) return { usable: false, basis: null, why: `${packageId} is not planned.` };
  if (pkg.status === "merged") return { usable: true, basis: "merged" };
  return {
    usable: false,
    basis: null,
    why: `${packageId} has not merged to main; dependent work starts only after that merge.`,
  };
}

/**
 * The scheduling conjuncts every worker start shares — a fresh dispatch and a
 * correction resumption alike. A correction runs the same worker on the same
 * package, but it still occupies a slot, still collides on its domain, still
 * competes for the single migration slot, and still may not resume execution
 * that an unanswered owner question or unresolved source drift has paused.
 */
function executionPauseRefusals(state, pkg, packageId) {
  const errors = [];
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

function schedulingRefusals(state, pkg, packageId, { correction = false } = {}) {
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
  errors.push(...executionPauseRefusals(state, pkg, packageId));
  if (!correction) {
    const queued = Object.values(state.packages).find(
      (other) =>
        other.id !== packageId &&
        other.status === "blocked" &&
        other.review?.result === "blocked" &&
        other.collision_domain === pkg.collision_domain,
    );
    if (queued) {
      errors.push(
        `${queued.id} has a queued correction in collision domain "${pkg.collision_domain}"; correction work outranks a fresh dispatch for that slot.`,
      );
    }
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
  if (!reviewCovers(state, pkg, sha)) {
    refusals.push(
      `A guarded merge requires a clear review receipt at exactly ${sha ?? "the merged SHA"}, either package-scoped or from the mission-level security tier.`,
    );
  }
  if (!approvalCovers(state, pkg, sha)) {
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
 * Whether this package could legitimately be worked on in the next wave.
 *
 * Deliberately independent of the Linear preflight and of worker slots. The
 * wave is an *assignment*, derived once when the epoch opens — before the
 * preflight and the synchronization that assignment then performs. Deriving it
 * from `nextActions` would have made the first execution epoch open with an
 * empty scope, because nothing is dispatchable until a preflight that has not
 * happened yet.
 */
function waveEligible(state, pkg) {
  if (!pkg || ["removed", "merged"].includes(pkg.status)) return false;
  if (pkg.driftStopped) return false;
  if (openQuestionsAffecting(state, pkg.id).length > 0) return false;
  return (pkg.depends_on ?? []).every((dep) => dependencyUsable(state, dep).usable);
}

/**
 * The packages an execution wave may be cut from, in plan order, with anything
 * already carrying a worker first — a rotation drains running work, it never
 * strands it outside the next scope.
 */
export function waveCandidates(state) {
  const order = Object.keys(state.packages);
  const active = state.activeWorkers.map((worker) => worker.package_id);
  return [
    ...new Set([
      ...order.filter((id) => active.includes(id)),
      ...order.filter((id) => waveEligible(state, state.packages[id])),
    ]),
  ];
}

/** The scheduling law a wave obeys however it was grouped. */
function waveInternalRefusals(state, wave, label) {
  const errors = [];
  const domains = new Map();
  let migrationOwners = 0;
  for (const id of wave) {
    const pkg = state.packages[id];
    if (!pkg) {
      errors.push(`${label} names ${id}, which is not planned.`);
      continue;
    }
    if (domains.has(pkg.collision_domain)) {
      errors.push(
        `${label} runs ${id} beside ${domains.get(pkg.collision_domain)} in collision domain "${pkg.collision_domain}"; colliding work is serialized.`,
      );
    } else {
      domains.set(pkg.collision_domain, id);
    }
    if (pkg.migration_owner) migrationOwners += 1;
  }
  if (migrationOwners > 1) {
    errors.push(
      `${label} holds ${migrationOwners} migration-owning packages; only one runs at a time.`,
    );
  }
  return errors;
}

function nextWave(state) {
  const candidates = waveCandidates(state);
  // An owner-approved re-cut only regroups these same packages; it can never
  // introduce one, so intersecting with the candidates is safe and keeps a
  // stale re-cut from resurrecting finished work.
  const planned = (state.epochPlan.futureWaves ?? [])
    .map((wave) => wave.filter((id) => candidates.includes(id)))
    .find((wave) => wave.length > 0);
  return (planned ?? candidates).slice(0, EPOCH_LIMITS.wavePackages);
}

/**
 * The epoch the harness would open right now, derived from durable state alone.
 *
 * `lead-epoch-opened` is validated against this, so a Lead cannot name itself
 * extra packages, skip the post-plan recycle, or promote itself out of an
 * execution wave into the integrated walker.
 */
export function deriveEpochDefinition(state) {
  const definition = (phase, scope, exit_condition) => ({
    phase,
    scope,
    exit_condition,
    permitted_action_classes: PHASE_PERMITS[phase] ?? [],
  });

  if (!state.planApproved) {
    return definition(
      "planning",
      { packages: [], gate: "plan-approval" },
      "Brian's approval of the decomposition is recorded. Nothing durable is created in this epoch.",
    );
  }
  // Mission 4's exact shape: the plan was approved and the same Lead carried
  // straight on into execution. The recycle is owed before anything durable.
  if (!state.phaseRecycles.includes("plan-approved")) {
    return definition(
      "post-plan-boundary",
      { packages: [], gate: "post-plan-recycle" },
      "A fresh Lead opens the first execution epoch. This epoch performs no durable execution.",
    );
  }

  const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
  if (live.length === 0 || live.some((pkg) => pkg.status !== "merged")) {
    const packages = nextWave(state);
    return definition(
      "implementation-wave",
      { packages, gate: null },
      packages.length === 0
        ? "No package on the approved frontier is eligible; a fresh epoch re-derives the frontier once the blocker clears."
        : `${packages.join(" and ")} ${packages.length === 1 ? "has" : "have"} merged to main.`,
    );
  }
  if (!finalMissionSmokeClear(state)) {
    return definition(
      "integration",
      { packages: [], gate: "mission-workflow-smoke" },
      "The one integrated mission workflow smoke is clear at the current main head.",
    );
  }
  const open = Object.values(state.questions).filter((question) => question.status === "open");
  if (open.length > 0) {
    return definition(
      "acceptance-cutover",
      { packages: [], gate: "owner-acceptance" },
      `Every open owner decision (${open.map((question) => question.id).join(", ")}) is answered.`,
    );
  }
  return definition(
    "closeout",
    { packages: [], gate: "mission-closeout" },
    "The closeout is written into the existing Notion mission record and the mission is finalized.",
  );
}

/**
 * Whether the epoch has met its exit condition, from state rather than from the
 * Lead's assent. This is what makes the fence executable: nothing has to be
 * recorded for plan approval to close the planning epoch's execution window.
 */
function exitConditionMet(state, epoch) {
  switch (epoch.phase) {
    case "planning":
      return state.planApproved
        ? "the plan is approved, and the post-plan recycle is owed before anything durable is created"
        : null;
    case "post-plan-boundary":
      return "this epoch exists only to hand the mission to a fresh Lead";
    case "implementation-wave": {
      const scope = epoch.scope?.packages ?? [];
      if (scope.length === 0) return "this wave holds no eligible package";
      return scope.every((id) => ["merged", "removed"].includes(state.packages[id]?.status))
        ? `every package in this wave (${scope.join(", ")}) has merged`
        : null;
    }
    case "integration":
      return finalMissionSmokeClear(state) ? "the integrated mission smoke is clear" : null;
    case "acceptance-cutover":
      return Object.values(state.questions).every((question) => question.status === "answered")
        ? "every open owner decision is answered"
        : null;
    case "closeout":
      return state.terminal ? `the mission is ${state.terminal.state}` : null;
    default:
      return null;
  }
}

const extensions = (epoch) =>
  (epoch.adjustments ?? []).filter((adjustment) => adjustment.kind === "extend-current");

/**
 * The epoch as it stands at one instant: its recorded facts, the status derived
 * from the exit condition and health, and the health evidence itself.
 *
 * Status is computed rather than stored so that `reduce` stays a pure function
 * of the journal. Validation asks for the view at the incoming event's own
 * timestamp; the owner-facing surfaces ask for it at the wall clock.
 */
export function epochView(state, { now = Date.now() } = {}) {
  const epoch = state.epoch;
  if (!epoch) return null;
  const health = epochHealth(epoch, state, { now });
  const granted = extensions(epoch);
  const live = granted.filter((adjustment) => Date.parse(adjustment.expires_at) > now);
  const extension = live.at(-1) ?? null;
  const accepted = new Set(extension?.accepted_reason_codes ?? []);

  let status = "open";
  let boundary_reason = null;
  if (epoch.closed) {
    status = "closed";
    boundary_reason = epoch.closed.reason;
  } else if (epoch.draining) {
    status = "draining";
    boundary_reason = epoch.boundary?.reason ?? "already-active in-scope work is draining";
  } else if (epoch.boundary) {
    status = "boundary-pending";
    boundary_reason = epoch.boundary.reason;
  } else {
    const met = exitConditionMet(state, epoch);
    const unaccepted = health.red
      .map((reason) => reason.code)
      .filter((code) => !accepted.has(code));
    if (met) {
      status = "boundary-pending";
      boundary_reason = `The exit condition is satisfied: ${met}.`;
    } else if (granted.length > 0 && !extension) {
      // An extension is a moved boundary, not a removed one. When it lapses the
      // fence comes back without anyone having to remember to put it back.
      status = "boundary-pending";
      boundary_reason = `The owner-approved extension expired at ${granted.at(-1).expires_at}.`;
    } else if (unaccepted.length > 0) {
      status = "boundary-pending";
      boundary_reason = `Health is red (${unaccepted.join(", ")}); continuing needs Brian's explicit risk-accepting authorization.`;
    }
  }

  return {
    ...epoch,
    status,
    boundary_reason,
    health,
    extension,
    adjustments_used: granted.length,
    next: deriveEpochDefinition(state),
  };
}

/** A correction dispatch that re-scopes the worker already correcting in place. */
function isCorrectionRescope(state, event) {
  const active = activeWorkerFor(state, event.package_id);
  return Boolean(active && active.kind === "correction" && active.worker_id === event.worker_id);
}

/**
 * The one central path every state-changing event passes through.
 *
 * Three questions, in order: does this phase permit this class of work at all;
 * has the epoch reached a boundary that only lets running work finish; and is
 * the named package inside the assignment the harness derived.
 */
function epochRefusals(event, state, view) {
  const epoch = state.epoch;
  const actionClass = actionClassFor(event);
  if (actionClass === "always") return [];
  const where = `Lead epoch ${epoch.epoch_id} (${epoch.phase}, ${view.status})`;
  if (actionClass === undefined) {
    return [
      `${where} has no action class for "${event.type}"; an unclassified event is refused, never waved through.`,
    ];
  }
  if (view.status === "closed") {
    return [
      `${where} is closed. A fresh Lead opens the next epoch — \`mission resume ${state.packet?.mission_id ?? "<mission-id>"} --token <token>\` from a new session — before any further mission mutation.`,
    ];
  }

  const errors = [];
  const permitted = new Set(epoch.permitted_action_classes ?? []);
  const rescoping = actionClass === "correction-dispatch" && isCorrectionRescope(state, event);
  if (!permitted.has(actionClass) && !rescoping) {
    errors.push(
      `${where} permits ${permitted.size > 0 ? `only the ${[...permitted].join(", ")} action ${permitted.size === 1 ? "class" : "classes"}` : "no action class"} beyond status, owner decisions and reclamation; "${event.type}" is ${actionClass} work.`,
    );
  } else if (
    view.status !== "open" &&
    !BOUNDARY_PERMITTED_CLASSES.includes(actionClass) &&
    !rescoping
  ) {
    errors.push(
      `${where} reached its boundary — ${view.boundary_reason} It may drain already-active in-scope work and accept owner decisions, but "${event.type}" starts new ${actionClass} work. Continue with a fresh Lead, pause the mission, or record an owner-approved epoch adjustment.`,
    );
  }

  if (event.package_id && PACKAGE_SCOPED_CLASSES.includes(actionClass)) {
    const draining = view.status === "draining";
    const scope = draining ? (epoch.draining?.packages ?? []) : (epoch.scope?.packages ?? []);
    if (!scope.includes(event.package_id)) {
      errors.push(
        draining
          ? `${event.package_id} was not active and in scope when draining began (${scope.join(", ") || "nothing was"}); draining accepts completion evidence only for that work.`
          : `${event.package_id} is outside this epoch's scope (${scope.join(", ") || "no package"}). The harness derives the wave from durable state; a Lead never enlarges its own assignment.`,
      );
    }
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

  // One central epoch validation path. It is inert until a journal adopts an
  // epoch — existing journals replay unchanged and are never rewritten — and
  // binding from the moment one is opened. The CLI refuses mutating commands on
  // an initialized mission that has not bootstrapped one yet.
  if (state.epoch && !EPOCH_EVENT_TYPES.includes(event.type)) {
    const at = Date.parse(event.at);
    errors.push(
      ...epochRefusals(
        event,
        state,
        epochView(state, { now: Number.isFinite(at) ? at : Date.now() }),
      ),
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
      for (const dep of pkg.depends_on) {
        const verdict = dependencyUsable(state, dep);
        if (!verdict.usable) {
          errors.push(`${event.package_id} cannot start on ${dep}: ${verdict.why}`);
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
              `${findingId} was corrected without injection evidence: reintroduce the defect, run the named regression test and observe it fail, restore the fix, and run it again. Record it under \`injection_evidence\` on the receipt. ${INJECTION_SHAPE}`,
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
      const findingIds = Array.isArray(event.finding_ids) ? event.finding_ids : [];
      const recordOnlyIds = Array.isArray(event.record_only_finding_ids)
        ? event.record_only_finding_ids
        : [];
      if (!Array.isArray(event.finding_ids)) {
        errors.push("Injection-tested correction findings are an array of ids.");
      }
      if (
        event.record_only_finding_ids !== undefined &&
        !Array.isArray(event.record_only_finding_ids)
      ) {
        errors.push("Record-only correction findings are an array of ids.");
      }
      if (findingIds.length + recordOnlyIds.length === 0) {
        errors.push(
          "A correction dispatch carries at least one injection-tested or record-only finding id for lineage.",
        );
      }
      const allFindingIds = [...findingIds, ...recordOnlyIds];
      if (allFindingIds.some((id) => !isNonEmptyString(id))) {
        errors.push("Every correction finding id is a non-empty string.");
      }
      if (new Set(allFindingIds).size !== allFindingIds.length) {
        errors.push(
          "A correction finding id is named exactly once across tested and record-only scope.",
        );
      }
      const active = activeWorkerFor(state, event.package_id);
      const rescoping = active?.kind === "correction" && active.worker_id === event.worker_id;
      if (active && !rescoping) {
        errors.push(`${event.package_id} already has an active worker.`);
      }
      if (pkg.status === "merged") errors.push(`${event.package_id} is already merged.`);
      if (pkg.visual_approval?.head_sha === pkg.head_sha) {
        errors.push(
          `${event.package_id} is owner-approved at its current head. Corrections happen before approval; a later mission-smoke defect becomes new corrective work.`,
        );
      }
      // Re-scoping keeps the same worker, slot, worktree and lifecycle. Its
      // original dispatch already passed scheduling fences; testing those
      // fences against itself would manufacture a collision and force an
      // abandon/re-dispatch cycle that destroys correction lineage.
      if (!rescoping) {
        errors.push(...schedulingRefusals(state, pkg, event.package_id, { correction: true }));
      } else {
        errors.push(...executionPauseRefusals(state, pkg, event.package_id));
      }
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
      if (pkg.visual_approval?.head_sha === pkg.head_sha) {
        errors.push(
          `${event.package_id} is already owner-approved at this head; no model review runs after approval.`,
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
      if (receipt.reviewed_head_sha !== pkg.head_sha) {
        errors.push(
          `Review receipt covers ${receipt.reviewed_head_sha ?? "no head"}, not current package head ${pkg.head_sha ?? "no head"}.`,
        );
      }
      if (!["full", "correction", "security-tier", "package-gate"].includes(receipt.review_mode)) {
        errors.push(
          'Review receipt mode is "full", "correction", "security-tier", or "package-gate".',
        );
      }
      if (!Number.isInteger(receipt.round) || receipt.round < 1) {
        errors.push("Review receipt round is a positive integer.");
      }
      if (!["clear", "blocked"].includes(receipt.result)) {
        errors.push('Review receipt result is "clear" or "blocked".');
      }
      if (receipt.ci_state !== "green") {
        errors.push('Review receipt ci_state is "green" at reviewed_head_sha.');
      }
      if (["security-tier", "package-gate"].includes(receipt.review_mode)) {
        if (!Array.isArray(receipt.sensitive_paths)) {
          errors.push("A package-gate receipt records its sensitive-path intersection.");
        }
        if (!isNonEmptyString(receipt.report)) {
          errors.push("A package-gate receipt records its on-disk report path.");
        }
      }
      if (pkg.visual !== "nonvisual" && receipt.result === "clear") {
        errors.push(...uxConformanceDefects(receipt, event.package_id));
      }

      // LAN-179. Everything above judges the receipt's own contents. What
      // follows judges whether the receipt belongs to an invocation the harness
      // opened, ran in the runtime that invocation was given, and discharged
      // the contract that invocation was bound to. A receipt with no matching
      // dispatch is refused outright — that is the Mission 4 shape where the
      // Lead derived a package's clearance itself.
      const invocation = state.reviewInvocations[receipt.invocation_id];
      if (!invocation) {
        errors.push(
          `Review receipt names invocation ${receipt.invocation_id ?? "nothing"}, which was never dispatched. Request a review, let the broker prepare its runtime, dispatch a fresh reviewer, and file that reviewer's receipt.`,
        );
        break;
      }
      if (invocation.role !== "package-reviewer" || invocation.package_id !== event.package_id) {
        errors.push(
          `Invocation ${invocation.invocation_id} covers ${invocation.role === "workflow-walker" ? "the integrated walk" : invocation.package_id}, not ${event.package_id}. No agent files another role's receipt.`,
        );
        break;
      }
      if (invocation.disposition !== "dispatched") {
        errors.push(
          `Invocation ${invocation.invocation_id} is ${invocation.disposition}, not dispatched.`,
        );
      }
      if (receipt.agent_id !== invocation.agent_id) {
        errors.push(
          `Receipt agent ${receipt.agent_id ?? "(unidentified)"} is not the dispatched reviewer ${invocation.agent_id}.`,
        );
      }
      if (receipt.runtime_id !== invocation.runtime_id) {
        errors.push(
          `Receipt runtime ${receipt.runtime_id ?? "(unidentified)"} is not the runtime brokered for this invocation (${invocation.runtime_id}).`,
        );
      }
      if (receipt.contract_hash !== invocation.contract_hash) {
        errors.push(
          "Receipt contract hash does not match the contract this invocation was bound to.",
        );
      }
      if (receipt.reviewed_head_sha !== invocation.head_sha) {
        errors.push(
          `Receipt covers ${receipt.reviewed_head_sha ?? "no head"}; the invocation was opened at ${invocation.head_sha}.`,
        );
      }
      if (invocation.contract) {
        errors.push(
          ...jobResultDefects(receipt, invocation.contract, invocation.capabilities_ready),
        );
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
      if (event.package_heads !== undefined) {
        if (
          event.package_heads === null ||
          typeof event.package_heads !== "object" ||
          Array.isArray(event.package_heads) ||
          Object.keys(event.package_heads).length === 0
        ) {
          errors.push(
            "An integrated review records the package heads covered by its integrated head.",
          );
        }
        for (const [packageId, packageHead] of Object.entries(event.package_heads)) {
          if (!state.packages[packageId] || !/^[0-9a-f]{40}$/.test(packageHead)) {
            errors.push(`Integrated review package_heads has invalid coverage for ${packageId}.`);
          }
        }
      }
      if (!["clear", "blocked"].includes(event.result)) {
        errors.push('An integrated review result is "clear" or "blocked".');
      }
      // LAN-179 replaces the free-form summary. A nonempty `jobs_completed`
      // string is what let the final Mission 4 walk report four journeys for a
      // packet that named sixteen completion criteria. The contract now carries
      // every criterion and the receipt answers each one by id.
      if (event.mode === "workflow-walker") {
        const invocation = state.reviewInvocations[event.invocation_id];
        if (!invocation) {
          errors.push(
            `The walk names invocation ${event.invocation_id ?? "nothing"}, which was never dispatched. A prose summary of completed jobs is no longer accepted in its place.`,
          );
        } else if (invocation.role !== "workflow-walker") {
          errors.push(
            `Invocation ${invocation.invocation_id} is a ${invocation.role}; no agent files another role's receipt.`,
          );
        } else {
          if (invocation.disposition !== "dispatched") {
            errors.push(
              `Invocation ${invocation.invocation_id} is ${invocation.disposition}, not dispatched.`,
            );
          }
          if (event.agent_id !== invocation.agent_id) {
            errors.push(
              `Walk agent ${event.agent_id ?? "(unidentified)"} is not the dispatched walker ${invocation.agent_id}.`,
            );
          }
          if (event.runtime_id !== invocation.runtime_id) {
            errors.push(
              `Walk runtime ${event.runtime_id ?? "(unidentified)"} is not the runtime brokered for this invocation (${invocation.runtime_id}).`,
            );
          }
          if (event.contract_hash !== invocation.contract_hash) {
            errors.push(
              "The walk's contract hash does not match the contract it was dispatched under.",
            );
          }
          if (event.head_sha !== invocation.head_sha) {
            errors.push(
              `The walk covers ${event.head_sha ?? "no head"}; the invocation was opened at ${invocation.head_sha}.`,
            );
          }
          if (invocation.contract) {
            errors.push(
              ...jobResultDefects(event, invocation.contract, invocation.capabilities_ready),
            );
          }
        }
      }
      if (event.mode === "workflow-walker" && !isNonEmptyString(event.report)) {
        errors.push("A workflow walker records its on-disk report path.");
      }
      const livePackages = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
      if (event.mode === "workflow-walker" && livePackages.some((pkg) => pkg.status !== "merged")) {
        errors.push(
          "The one mission workflow smoke runs only after every live package has merged to main.",
        );
      }
      if (event.mode === "workflow-walker") {
        const latestMerge = Math.max(
          -1,
          ...livePackages.map((pkg) => pkg.merged?.event_index ?? -1),
        );
        const priorSmokes = missionWorkflowSmokes(state, latestMerge);
        if (priorSmokes.length >= 2) {
          errors.push(
            "Mission smoke is capped at the initial run and one targeted re-walk; another failure requires owner adjudication.",
          );
        } else if (
          priorSmokes.length === 1 &&
          (priorSmokes[0].result !== "blocked" || event.head_sha === priorSmokes[0].head_sha)
        ) {
          // The re-walk's evidence that corrective work landed is its own head,
          // not a package merge. A blocker creates one corrective issue and pull
          // request cycle -- an issue, deliberately not a package -- so
          // `latestMerge` can never advance past the initial smoke and the gate
          // was unsatisfiable for exactly the workflow the harness prescribes.
          // A head that differs from the blocked smoke's is proof something
          // merged between them; a head that matches is a re-walk of the same
          // code, which is what this refusal exists to stop.
          errors.push(
            "The one targeted re-walk runs only after the initial smoke was blocked and its corrective work merged to a new head.",
          );
        }
      }
      if (
        event.result === "blocked" &&
        (!Array.isArray(event.findings) || event.findings.length === 0)
      ) {
        errors.push("A blocked integrated review names its findings.");
      }
      break;
    }

    case "review-invocation-requested": {
      if (!isNonEmptyString(event.invocation_id)) {
        errors.push("A review request carries a stable invocation id.");
      } else if (state.reviewInvocations[event.invocation_id]) {
        errors.push(`Invocation ${event.invocation_id} already exists.`);
      }
      if (!INVOCATION_ROLES.includes(event.role)) {
        errors.push(`An invocation's role is one of ${INVOCATION_ROLES.join(", ")}.`);
        break;
      }
      if (!/^[0-9a-f]{40}$/.test(event.head_sha ?? "")) {
        errors.push("A review request records the exact 40-character head it covers.");
      }
      if (!Number.isInteger(event.round) || event.round < 1) {
        errors.push("A review request records its round as a positive integer.");
      }
      if (event.role === "package-reviewer") {
        const pkg = state.packages[event.package_id];
        if (!pkg) {
          errors.push(`No planned package ${event.package_id}.`);
          break;
        }
        if (!pkg.pr_number)
          errors.push(`${event.package_id} has no recorded pull request to review.`);
        if (pkg.status === "merged") errors.push(`${event.package_id} is already merged.`);
        if (event.head_sha !== pkg.head_sha) {
          errors.push(
            `The request covers ${event.head_sha ?? "no head"}, not ${event.package_id}'s current head ${pkg.head_sha ?? "no head"}. A correction head receives its own invocation.`,
          );
        }
        if (!Array.isArray(event.changed_files) || event.changed_files.length === 0) {
          errors.push(
            "A package review request carries the exact-head diff its contract is classified from.",
          );
        }
        const open = Object.values(state.reviewInvocations).find(
          (invocation) =>
            invocation.role === "package-reviewer" &&
            invocation.package_id === event.package_id &&
            ["requested", "dispatched"].includes(invocation.disposition),
        );
        if (open) {
          errors.push(
            `${event.package_id} already has a live invocation (${open.invocation_id}); abandon it before requesting another.`,
          );
        }
      } else {
        const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
        if (live.length === 0 || live.some((pkg) => pkg.status !== "merged")) {
          errors.push(
            "The integrated walk is requested only after every live package has merged to main.",
          );
        }
        if (event.affected_job_ids !== undefined) {
          const blocked = lastBlockedSmoke(state);
          if (!blocked) {
            errors.push(
              "A targeted re-walk narrows the job set, so it is derived only from a blocked smoke's findings.",
            );
          } else {
            const lineage = new Set(
              (blocked.findings ?? []).flatMap((finding) => finding?.affected_jobs ?? []),
            );
            const unnamed = (event.affected_job_ids ?? []).filter((id) => !lineage.has(id));
            if (unnamed.length > 0) {
              errors.push(
                `${unnamed.join(", ")} is not named by any finding of the blocked smoke; a re-walk contains only the criteria the correction affected.`,
              );
            }
          }
        }
      }
      let derived = null;
      try {
        derived = deriveRequestedContract(event, state);
      } catch (error) {
        errors.push(`The contract could not be derived: ${error.message}`);
      }
      if (derived) {
        const expected = contractHash(derived);
        if (contractHash(event.contract ?? null) !== expected) {
          errors.push(
            "A review request records the exact contract the harness derives from durable state and the exact-head diff. A capability or job cannot be added, removed or reworded by whoever asked for the review.",
          );
        }
        if (event.contract_hash !== expected) {
          errors.push("A review request records its contract's hash.");
        }
      }
      break;
    }

    case "review-runtime-ready": {
      const invocation = state.reviewInvocations[event.invocation_id];
      if (!invocation) {
        errors.push(`No invocation ${event.invocation_id ?? "(unidentified)"}.`);
        break;
      }
      if (invocation.role !== event.role) {
        errors.push(
          `Invocation ${invocation.invocation_id} is a ${invocation.role}, not a ${event.role}.`,
        );
      }
      if (invocation.disposition !== "requested") {
        errors.push(
          `Invocation ${invocation.invocation_id} is ${invocation.disposition}; a runtime is prepared while it is still waiting.`,
        );
      }
      if (!isNonEmptyString(event.runtime_id)) {
        errors.push("A brokered runtime carries a stable runtime id.");
      } else if (
        state.reviewRuntimes[event.runtime_id] &&
        state.reviewRuntimes[event.runtime_id].invocation_id !== invocation.invocation_id
      ) {
        errors.push(`Runtime ${event.runtime_id} already belongs to another invocation.`);
      }
      if (!RUNTIME_STATES.includes(event.state)) {
        errors.push(`A runtime's state is one of ${RUNTIME_STATES.join(", ")}.`);
        break;
      }
      if (event.state !== "ready") {
        if (!isNonEmptyString(event.reason)) {
          errors.push(
            `A runtime that is ${event.state} records why. An infrastructure state is never a review result; the invocation keeps its identity and contract and waits.`,
          );
        }
        break;
      }
      if (!isNonEmptyString(event.lease_slot)) {
        errors.push("A ready runtime names the coordinator slot it holds.");
      } else if (event.lease_slot === event.implementation_slot) {
        errors.push(
          `${event.lease_slot} is this mission's shared implementation stack. A review never borrows or resets the stack its implementers are using.`,
        );
      }
      errors.push(
        ...healthDefects(event.health, {
          capabilities: invocation.contract?.capabilities ?? [],
          headSha: invocation.head_sha,
        }),
      );
      break;
    }

    case "reviewer-dispatched":
    case "walker-dispatched": {
      const wanted = event.type === "walker-dispatched" ? "workflow-walker" : "package-reviewer";
      const invocation = state.reviewInvocations[event.invocation_id];
      if (!invocation) {
        errors.push(`No invocation ${event.invocation_id ?? "(unidentified)"}.`);
        break;
      }
      if (invocation.role !== wanted) {
        errors.push(
          `Invocation ${invocation.invocation_id} is a ${invocation.role}; ${event.type} is refused.`,
        );
      }
      if (invocation.disposition !== "requested") {
        errors.push(`Invocation ${invocation.invocation_id} is already ${invocation.disposition}.`);
      }
      if (invocation.runtime_state !== "ready") {
        errors.push(
          `Invocation ${invocation.invocation_id} has ${invocation.runtime_state === undefined ? "no brokered runtime" : `a ${invocation.runtime_state} runtime`}. Nothing is dispatched until the broker proves a healthy runtime at ${invocation.head_sha}; missing capacity waits, and never narrows the review.`,
        );
      }
      if (!isNonEmptyString(event.agent_id) || !isNonEmptyString(event.session_id)) {
        errors.push("A dispatch records the fresh agent identity and its session identity.");
        break;
      }
      if (invocation.contract?.reviewer_required === false && event.deterministic === true) {
        // The empty sensitive/rendered/evidence union LAN-148 introduced and
        // this ticket keeps. The classifier output is journaled either way, so
        // a later reader sees what the machine concluded, not that somebody
        // decided nothing needed looking at.
        break;
      }
      if (event.deterministic === true) {
        errors.push(
          `${invocation.invocation_id}'s contract requires a reviewer: its sensitive, rendered or evidence classification is not empty. Deterministic clearance is refused.`,
        );
      }
      errors.push(...freshnessRefusals(state, invocation, event.agent_id));
      break;
    }

    case "review-invocation-abandoned": {
      const invocation = state.reviewInvocations[event.invocation_id];
      if (!invocation) {
        errors.push(`No invocation ${event.invocation_id ?? "(unidentified)"}.`);
        break;
      }
      if (["completed", "blocked", "abandoned"].includes(invocation.disposition)) {
        errors.push(`Invocation ${invocation.invocation_id} is already ${invocation.disposition}.`);
      }
      if (!isNonEmptyString(event.reason)) {
        errors.push("Abandoning an invocation records why, so a fresh one may be requested.");
      }
      break;
    }

    case "review-runtime-promoted": {
      const invocation = state.reviewInvocations[event.invocation_id];
      if (!invocation) {
        errors.push(`No invocation ${event.invocation_id ?? "(unidentified)"}.`);
        break;
      }
      const pkg = state.packages[invocation.package_id];
      if (invocation.role !== "package-reviewer" || !pkg) {
        errors.push("Only a package review invocation is promoted to an owner-ready environment.");
        break;
      }
      if (invocation.disposition !== "completed" || invocation.result !== "clear") {
        errors.push(
          `Brian's walkthrough begins only from a machine-cleared head; invocation ${invocation.invocation_id} is ${invocation.disposition}${invocation.result ? ` (${invocation.result})` : ""}.`,
        );
      }
      if (event.head_sha !== pkg.head_sha || event.head_sha !== invocation.head_sha) {
        errors.push(
          `An owner-ready environment serves the exact cleared head ${invocation.head_sha}; ${event.head_sha ?? "no head"} would show Brian something else.`,
        );
      }
      for (const field of ["environment_id", "url", "review_identity"]) {
        if (!isNonEmptyString(event[field])) {
          errors.push(`An owner-ready promotion records \`${field}\`.`);
        }
      }
      if (event.owner_commands !== 0) {
        errors.push(
          "An owner-ready environment costs Brian zero commands; `owner_commands` records that as 0.",
        );
      }
      if (!Array.isArray(event.state_manifest) || event.state_manifest.length === 0) {
        errors.push("An owner-ready promotion records the desktop and 375px state manifest.");
      }
      break;
    }

    case "review-runtime-released": {
      const runtime = state.reviewRuntimes[event.runtime_id];
      if (!runtime) {
        errors.push(`No brokered runtime ${event.runtime_id ?? "(unidentified)"}.`);
        break;
      }
      if (runtime.state === "released") {
        errors.push(`Runtime ${runtime.runtime_id} is already released.`);
      }
      const owner = state.reviewInvocations[runtime.invocation_id];
      if (owner && ["requested", "dispatched"].includes(owner.disposition)) {
        errors.push(
          `Invocation ${owner.invocation_id} is still ${owner.disposition} on runtime ${runtime.runtime_id}; cleanup never reclaims capacity somebody is using.`,
        );
      }
      errors.push(...reclamationDefects(event.reclamation, event.runtime_id));
      break;
    }

    case "visual-approval": {
      if (event.package_heads !== undefined || event.head_sha !== undefined) {
        errors.push(
          "Mission-level visual approval is retired; Brian approves each issue after its machine checks and before its immediate merge.",
        );
        break;
      }
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (pkg.visual === "nonvisual") {
        errors.push(`${event.package_id} is nonvisual; there is nothing to visually approve.`);
      }
      if (!pkg.head_sha || !reviewCovers(state, pkg)) {
        errors.push(
          `${event.package_id} is not owner-ready: exact-head CI and required security coverage finish before Brian's walkthrough.`,
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

    case "package-gate-passed": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (!/^[0-9a-f]{40}$/.test(event.head_sha ?? "") || event.head_sha !== pkg.head_sha) {
        errors.push("A gate pass records the package's exact current 40-character head SHA.");
      }
      const expected = buildMissionReceipt(state, event.package_id, event.head_sha);
      if (JSON.stringify(event.receipt) !== JSON.stringify(expected)) {
        errors.push("A gate pass records the exact receipt derived from current mission state.");
      }
      break;
    }

    case "package-gate-invalidated": {
      const pkg = state.packages[event.package_id];
      if (!pkg) {
        errors.push(`No planned package ${event.package_id}.`);
        break;
      }
      if (pkg.gate_passed?.head_sha !== event.head_sha) {
        errors.push("Only the gate pass recorded at this exact head may be invalidated.");
      }
      if (!Array.isArray(event.reasons) || event.reasons.length === 0) {
        errors.push("Gate invalidation records at least one current refusal reason.");
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
      if (
        ["delivered", "delivered-with-residue"].includes(event.outcome) &&
        !finalMissionSmokeClear(state)
      ) {
        errors.push(
          "A delivered mission closes only after every package has merged and the final workflow smoke is clear.",
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
      break;
    }

    case "mission-stopped": {
      if (!["usage-exhausted", "owner-stop", "blocked", "phase-boundary"].includes(event.reason)) {
        errors.push(
          'A stop reason is "usage-exhausted", "owner-stop", "blocked" or "phase-boundary".',
        );
      }
      if (!isNonEmptyString(event.detail)) errors.push("A stop records why.");
      if (event.reason === "phase-boundary") {
        if (!PHASE_BOUNDARIES.includes(event.phase)) {
          errors.push(`A phase-boundary stop names one of ${PHASE_BOUNDARIES.join(", ")}.`);
        } else if (state.phaseRecycles.includes(event.phase)) {
          errors.push(`The Lead already recycled at ${event.phase}.`);
        }
      }
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

    case "lead-epoch-opened": {
      if (!isNonEmptyString(event.epoch_id) || !/^E-[A-Za-z0-9-]+$/.test(event.epoch_id)) {
        errors.push("An epoch id must match E-<slug>.");
      } else if ([...state.epochHistory, state.epoch].some((e) => e?.epoch_id === event.epoch_id)) {
        errors.push(
          `Epoch ${event.epoch_id} already exists; epochs are append-only and never reopened.`,
        );
      }
      if (!isNonEmptyString(event.lead_id)) {
        errors.push("An epoch records the Lead identity it is attached to.");
      }
      if (!Number.isInteger(event.pid) || event.pid <= 0) {
        errors.push("An epoch records the live pid of the session holding it.");
      }
      const previous = state.epoch;
      if (previous && !previous.closed) {
        errors.push(
          `Lead epoch ${previous.epoch_id} is still open; close it at its boundary before opening the next.`,
        );
      }
      if (previous?.closed) {
        // The handshake, and the honest limit of it: this proves a different
        // recorded identity presented a token issued once. It is harness-level
        // fencing plus a user-started fresh session, not proof of model context.
        const token = state.resumeToken;
        if (!token || token.spent) {
          errors.push(
            "The one-use resume token issued when the previous epoch closed has already been spent; a reused token is refused.",
          );
        } else if (event.resume_token !== token.token) {
          const alreadySpent = [...state.epochHistory, previous].some(
            (e) => e.closed?.resume_token === event.resume_token,
          );
          errors.push(
            alreadySpent
              ? "That resume token was spent when a later epoch opened. A token is one use; the current epoch's close issued a new one."
              : "A resume presents the one-use token issued when the previous epoch closed.",
          );
        }
        if (event.lead_id === previous.lead_id) {
          errors.push(
            `Lead ${event.lead_id} closed epoch ${previous.epoch_id}; the same session cannot resume its own closed epoch. Start a fresh session with a new LANCERS_MISSION_LEAD_ID.`,
          );
        }
      } else if (event.resume_token !== undefined) {
        errors.push(
          "A first or bootstrapped epoch presents no resume token; none has been issued.",
        );
      }
      const derived = deriveEpochDefinition(state);
      if (event.phase !== derived.phase) {
        errors.push(
          `The harness derives ${derived.phase} from current mission state; this epoch claims ${event.phase ?? "no phase"}.`,
        );
      } else {
        if (JSON.stringify(event.scope) !== JSON.stringify(derived.scope)) {
          errors.push(
            `A Lead does not choose or enlarge its own assignment. The derived ${derived.phase} scope is ${JSON.stringify(derived.scope)}.`,
          );
        }
        if (event.exit_condition !== derived.exit_condition) {
          errors.push("An epoch records the exit condition the harness derived, verbatim.");
        }
        const permits = PHASE_PERMITS[derived.phase] ?? [];
        if (JSON.stringify(event.permitted_action_classes ?? []) !== JSON.stringify(permits)) {
          errors.push(
            `The permitted action classes for ${derived.phase} are fixed: ${permits.join(", ") || "none beyond the always-permitted classes"}.`,
          );
        }
      }
      if (!isNonEmptyString(event.dossier)) {
        errors.push(
          "An epoch opens against a machine-generated dossier; record its path in the mission state directory.",
        );
      }
      if (!Number.isInteger(event.dossier_source_index)) {
        errors.push("An epoch records the journal index its dossier was generated from.");
      }
      break;
    }

    case "lead-epoch-boundary-reached": {
      const epoch = state.epoch;
      if (!epoch || epoch.closed) {
        errors.push("There is no open Lead epoch to bring to a boundary.");
        break;
      }
      if (epoch.boundary) {
        errors.push(
          `Lead epoch ${epoch.epoch_id} already reached its boundary at ${epoch.boundary.at}.`,
        );
      }
      if (!isNonEmptyString(event.reason)) {
        errors.push("A boundary records the exit condition or safety threshold that was met.");
      }
      break;
    }

    case "lead-epoch-draining": {
      const epoch = state.epoch;
      if (!epoch || epoch.closed) {
        errors.push("There is no open Lead epoch to drain.");
        break;
      }
      if (epoch.draining) errors.push(`Lead epoch ${epoch.epoch_id} is already draining.`);
      const at = Date.parse(event.at);
      const view = epochView(state, { now: Number.isFinite(at) ? at : Date.now() });
      if (view.status === "open") {
        errors.push(
          `Lead epoch ${epoch.epoch_id} has not reached a boundary; draining pins a boundary to the work that was already running, and there is no boundary yet.`,
        );
      }
      if (!Array.isArray(event.packages)) {
        errors.push("Draining records the packages that were active and in scope when it began.");
      } else {
        for (const id of event.packages) {
          if (!(epoch.scope?.packages ?? []).includes(id)) {
            errors.push(`${id} is not in this epoch's scope, so this epoch cannot drain it.`);
          }
        }
      }
      break;
    }

    case "lead-epoch-adjusted": {
      const epoch = state.epoch;
      if (!epoch) {
        errors.push("There is no Lead epoch to adjust.");
        break;
      }
      if (epoch.closed) {
        errors.push(
          `Lead epoch ${epoch.epoch_id} is closed. A closed epoch is never reopened; a fresh epoch is required.`,
        );
        break;
      }
      if (!ADJUSTMENT_KINDS.includes(event.kind)) {
        errors.push(`An epoch adjustment is one of ${ADJUSTMENT_KINDS.join(", ")}.`);
        break;
      }
      if (!isNonEmptyString(event.approved_by)) {
        errors.push("An epoch adjustment records who approved it.");
      }
      if (!isNonEmptyString(event.authorization)) {
        errors.push(
          "An epoch adjustment records Brian's own words, or durable evidence of them. The agent may propose; only an explicit owner message authorizes filing.",
        );
      }
      if (!isNonEmptyString(event.reason)) {
        errors.push("An epoch adjustment records why it was asked for.");
      }
      if (event.source_epoch_id !== epoch.epoch_id) {
        errors.push(`An epoch adjustment names its source epoch (${epoch.epoch_id}).`);
      }
      const at = Date.parse(event.at);
      const now = Number.isFinite(at) ? at : Date.now();
      const health = epochView(state, { now }).health;
      // The snapshot is the machine's reading. Accepting a risk never relabels
      // it: a journal that called a red epoch green would be the one lie this
      // whole mechanism exists to prevent.
      if (event.health?.color !== health.color) {
        errors.push(
          `The adjustment records the health the harness computed (${health.color}); an accepted risk is never relabelled.`,
        );
      }
      const codes = health.reasons.map((reason) => reason.code);
      if (JSON.stringify(event.health?.reason_codes ?? []) !== JSON.stringify(codes)) {
        errors.push(
          `The adjustment records the exact reason codes behind that colour: ${codes.join(", ") || "none"}.`,
        );
      }

      if (event.kind === "extend-current") {
        if (event.target_epoch_id !== epoch.epoch_id) {
          errors.push("extend-current targets the current epoch.");
        }
        if (extensions(epoch).length >= epoch.adjustment_budget) {
          errors.push(
            `Lead epoch ${epoch.epoch_id} has already used its one normal extension. A second is refused whatever its health; continue with a fresh Lead.`,
          );
        }
        if (epoch.phase !== "implementation-wave") {
          errors.push(
            `extend-current continues an execution wave. Epoch ${epoch.epoch_id} is ${epoch.phase}, and an extension never crosses into the integrated walker, cutover or closeout.`,
          );
        }
        if (health.color !== "green") {
          const accepted = Array.isArray(event.accepted_reason_codes)
            ? event.accepted_reason_codes
            : [];
          const missing = codes.filter((code) => !accepted.includes(code));
          if (missing.length > 0) {
            errors.push(
              `Health is ${health.color}. Continuing needs an explicit exception naming every current reason; ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unaccepted.`,
            );
          }
        }
        const before = epoch.scope?.packages ?? [];
        const after = Array.isArray(event.new_scope?.packages) ? event.new_scope.packages : null;
        const correcting = isNonEmptyString(event.correction_package_id);
        if (!after) {
          errors.push("extend-current records the new scope it produces.");
        } else {
          const dropped = before.filter((id) => !after.includes(id));
          const added = after.filter((id) => !before.includes(id));
          if (dropped.length > 0) {
            errors.push(`An extension never drops work already assigned (${dropped.join(", ")}).`);
          }
          if (added.length > 1) {
            errors.push(
              `A normal extension adds exactly one adjacent eligible package; this adds ${added.length} (${added.join(", ")}).`,
            );
          }
          if (added.length === 1) {
            if (!waveEligible(state, state.packages[added[0]])) {
              errors.push(
                `${added[0]} is not eligible on the approved frontier, so it is not adjacent work this epoch may absorb.`,
              );
            }
            errors.push(
              ...waveInternalRefusals(
                state,
                [
                  ...before.filter(
                    (id) => !["merged", "removed"].includes(state.packages[id]?.status),
                  ),
                  added[0],
                ],
                "The extended wave",
              ),
            );
          }
          if (added.length === 0 && !correcting) {
            errors.push(
              "A normal extension adds one adjacent eligible package or finishes one already-active correction cycle; this adds neither.",
            );
          }
          if (added.length === 1 && correcting) {
            errors.push(
              `A normal extension is one bounded unit of work: an adjacent eligible package (${added[0]}) or an already-active correction cycle (${event.correction_package_id}), never both.`,
            );
          }
        }
        if (correcting) {
          const active = activeWorkerFor(state, event.correction_package_id);
          if (!active || active.kind !== "correction") {
            errors.push(
              `${event.correction_package_id} has no already-active correction cycle to finish.`,
            );
          }
        }
        const expires = Date.parse(event.expires_at ?? "");
        if (!Number.isFinite(expires)) {
          errors.push("An extension records when it expires.");
        } else if (expires > now + EPOCH_LIMITS.extensionMs) {
          errors.push(
            `An extension runs until the named work stabilizes or ${EPOCH_LIMITS.extensionMs / 3_600_000} hours, whichever comes first.`,
          );
        }
        if (!isNonEmptyString(event.new_exit_condition)) {
          errors.push("An extension records the exit condition it produces.");
        }
      }

      if (event.kind === "recut-future") {
        // Re-cutting keeps the same session going nowhere: it changes only how
        // later waves are grouped, so it costs no extension budget and can be
        // filed at any health.
        const waves = Array.isArray(event.future_waves) ? event.future_waves : null;
        if (!waves) {
          errors.push(
            "recut-future records the proposed future waves as an array of package-id arrays.",
          );
          break;
        }
        const current = epoch.scope?.packages ?? [];
        const remaining = Object.values(state.packages)
          .filter((pkg) => !["removed", "merged"].includes(pkg.status) && !current.includes(pkg.id))
          .map((pkg) => pkg.id);
        const named = waves.flat();
        if (new Set(named).size !== named.length) {
          errors.push("A package appears in exactly one proposed wave.");
        }
        for (const id of named) {
          if (!remaining.includes(id)) {
            errors.push(
              `${id} is not a future package on the approved plan. Re-cutting regroups future waves; it never changes the approved packages, requirements, dependency DAG or acceptance criteria.`,
            );
          }
        }
        for (const id of remaining) {
          if (!named.includes(id)) {
            errors.push(`${id} is dropped by this re-cut; regrouping never removes approved work.`);
          }
        }
        for (const [position, wave] of waves.entries()) {
          const label = `Proposed wave ${position + 1}`;
          if (!Array.isArray(wave) || wave.length === 0) {
            errors.push(`${label} is an array of at least one package id.`);
            continue;
          }
          if (wave.length > EPOCH_LIMITS.wavePackages) {
            errors.push(
              `${label} holds ${wave.length} packages; an execution wave is at most ${EPOCH_LIMITS.wavePackages}.`,
            );
          }
          errors.push(...waveInternalRefusals(state, wave, label));
          for (const id of wave) {
            for (const dep of state.packages[id]?.depends_on ?? []) {
              if (state.packages[dep]?.status === "merged" || current.includes(dep)) continue;
              const depWave = waves.findIndex((candidate) => candidate.includes(dep));
              if (depWave === -1 || depWave >= position) {
                errors.push(
                  `${label} runs ${id}, which depends on ${dep}, no later than ${dep} itself; the approved dependency order is not re-cut.`,
                );
              }
            }
          }
        }
      }
      break;
    }

    case "lead-epoch-closed": {
      const epoch = state.epoch;
      if (!epoch) {
        errors.push("There is no Lead epoch to close.");
        break;
      }
      if (epoch.closed) {
        errors.push(
          `Lead epoch ${epoch.epoch_id} is already closed; a closed epoch never reopens.`,
        );
        break;
      }
      if (!isNonEmptyString(event.resume_token)) {
        errors.push("Closing an epoch issues the one-use resume token the next Lead presents.");
      } else if (
        [...state.epochHistory, epoch].some((e) => e.closed?.resume_token === event.resume_token)
      ) {
        errors.push("A resume token is issued once; reissuing a spent token is refused.");
      }
      if (!isNonEmptyString(event.reason)) errors.push("Closing an epoch records why it ended.");
      if (!isNonEmptyString(event.dossier)) {
        errors.push("Closing an epoch writes the generated resume dossier and records its path.");
      }
      if (!Number.isInteger(event.dossier_source_index)) {
        errors.push("Closing an epoch records the journal index its dossier was generated from.");
      }
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
 *   missionVisualApprovals: Array<Record<string, any>>,
 *   phaseRecycles: string[],
 *   annotations: Array<Record<string, any>>,
 *   closeout: Record<string, any> | null,
 *   reclaimed: string[],
 *   reviewInvocations: Record<string, any>,
 *   reviewRuntimes: Record<string, any>,
 *   ownerEnvironments: Record<string, any>,
 *   terminal: { at: string, state: "finalized" | "abandoned" } | null,
 *   epoch: Record<string, any> | null,
 *   epochHistory: Array<Record<string, any>>,
 *   epochPlan: { futureWaves: string[][], recut: Record<string, any> | null },
 *   resumeToken: { token: string, epoch_id: string, spent: boolean } | null,
 *   eventCount: number,
 * }} MissionState
 * @typedef {{
 *   action: string,
 *   detail: string,
 *   package_id?: string,
 *   question_id?: string,
 *   health?: Record<string, any>,
 *   current_scope?: string[],
 *   next_scope?: string[],
 *   draining?: string[],
 * }} MissionAction
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
    missionVisualApprovals: [],
    phaseRecycles: [],
    annotations: [],
    closeout: null,
    reclaimed: [],
    terminal: null,
    reviewInvocations: {},
    reviewRuntimes: {},
    ownerEnvironments: {},
    epoch: null,
    epochHistory: [],
    epochPlan: { futureWaves: [], recut: null },
    resumeToken: null,
    eventCount: 0,
  };
}

/**
 * Health evidence is accumulated as the journal replays rather than recomputed
 * from raw events later, so `validateEvent` — which sees only state — can read
 * the same colour the owner-facing surfaces do.
 */
function recordEpochSignal(state, key, entry) {
  if (!state.epoch || state.epoch.closed) return;
  state.epoch.signals[key].push(entry);
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
        if (state.epoch && !state.epoch.closed && event.lead_id !== state.epoch.lead_id) {
          recordEpochSignal(state, "sessionReplacements", {
            event_index: index,
            lead_id: event.lead_id,
          });
        }
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
            gate_passed: existing?.gate_passed ?? null,
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
        if (state.epoch && event.worker_id === state.epoch.lead_id) {
          recordEpochSignal(state, "leadFiledDelegatedEvidence", {
            event_index: index,
            package_id: event.package_id,
          });
        }
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
        pkg.gate_passed = null;
        // A dispatch has no new head to classify. Keep the evidence but mark it
        // pending so it cannot satisfy a gate until `pr-opened` records and
        // classifies the actual old-head..new-head delta.
        pkg.visual_evidence_pending = true;
        const active = activeWorkerFor(state, event.package_id);
        const scope = {
          finding_ids: event.finding_ids ?? [],
          record_only_finding_ids: event.record_only_finding_ids ?? [],
        };
        if (active?.kind === "correction" && active.worker_id === event.worker_id) {
          Object.assign(active, scope, { rescoped_at: event.at });
        } else {
          state.activeWorkers.push({
            worker_id: event.worker_id,
            package_id: event.package_id,
            dispatched_at: event.at,
            kind: "correction",
            ...scope,
          });
        }
        break;
      }
      case "worker-receipt": {
        const pkg = state.packages[event.package_id];
        const worker = activeWorkerFor(state, event.package_id);
        if (state.epoch && event.worker_id === state.epoch.lead_id) {
          recordEpochSignal(state, "leadFiledDelegatedEvidence", {
            event_index: index,
            package_id: event.package_id,
          });
        }
        pkg.receipts.push({
          at: event.at,
          worker_id: event.worker_id,
          ...event.receipt,
          ...(worker?.kind === "correction"
            ? {
                correction_scope: {
                  finding_ids: worker.finding_ids ?? [],
                  record_only_finding_ids: worker.record_only_finding_ids ?? [],
                },
              }
            : {}),
        });
        state.activeWorkers = state.activeWorkers.filter(
          (worker) => worker.package_id !== event.package_id,
        );
        // Guarded on the current status, like the review-receipt branch: a
        // receipt that arrives after the merge keeps its place in the evidence
        // above, but never regresses the package's lifecycle.
        if (pkg.status !== "merged") {
          pkg.gate_passed = null;
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
        recordEpochSignal(state, "workerAbandoned", {
          event_index: index,
          package_id: event.package_id,
        });
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
        if (previousHead !== event.head_sha) pkg.gate_passed = null;
        break;
      }
      case "review-invocation-requested":
        state.reviewInvocations[event.invocation_id] = {
          invocation_id: event.invocation_id,
          role: event.role,
          package_id: event.package_id ?? null,
          head_sha: event.head_sha,
          round: event.round,
          contract: event.contract,
          contract_hash: event.contract_hash,
          classification: event.contract?.classification ?? null,
          opened_at: event.at,
          opening_event_index: index,
          disposition: "requested",
          runtime_id: null,
          runtime_state: undefined,
          runtime_reason: null,
          capabilities_ready: null,
          agent_id: null,
          session_id: null,
          result: null,
        };
        break;
      case "review-runtime-ready": {
        const invocation = state.reviewInvocations[event.invocation_id];
        state.reviewRuntimes[event.runtime_id] = {
          runtime_id: event.runtime_id,
          invocation_id: event.invocation_id,
          role: event.role,
          state: event.state,
          reason: event.reason ?? null,
          lease_slot: event.lease_slot ?? null,
          health: event.health ?? null,
          at: event.at,
        };
        invocation.runtime_id = event.runtime_id;
        invocation.runtime_state = event.state;
        invocation.runtime_reason = event.reason ?? null;
        invocation.capabilities_ready = event.health?.capabilities_ready ?? null;
        break;
      }
      case "reviewer-dispatched":
      case "walker-dispatched": {
        const invocation = state.reviewInvocations[event.invocation_id];
        invocation.disposition = "dispatched";
        invocation.agent_id = event.agent_id;
        invocation.session_id = event.session_id;
        invocation.deterministic = event.deterministic === true;
        invocation.dispatched_at = event.at;
        break;
      }
      case "review-invocation-abandoned": {
        const invocation = state.reviewInvocations[event.invocation_id];
        invocation.disposition = "abandoned";
        invocation.abandoned = { at: event.at, reason: event.reason };
        break;
      }
      case "review-runtime-promoted": {
        const invocation = state.reviewInvocations[event.invocation_id];
        state.ownerEnvironments[event.environment_id] = {
          environment_id: event.environment_id,
          invocation_id: event.invocation_id,
          package_id: invocation.package_id,
          runtime_id: invocation.runtime_id,
          head_sha: event.head_sha,
          url: event.url,
          review_identity: event.review_identity,
          state_manifest: event.state_manifest,
          promoted_at: event.at,
        };
        const runtime = state.reviewRuntimes[invocation.runtime_id];
        if (runtime) runtime.state = "ready";
        break;
      }
      case "review-runtime-released": {
        const runtime = state.reviewRuntimes[event.runtime_id];
        runtime.state = "released";
        runtime.reclamation = event.reclamation;
        runtime.released_at = event.at;
        break;
      }
      case "review-receipt": {
        const pkg = state.packages[event.package_id];
        if (state.epoch && !state.epoch.closed) {
          const rounds = state.epoch.signals.reviewRounds;
          rounds[event.package_id] = [
            ...(rounds[event.package_id] ?? []),
            { event_index: index, round: event.receipt?.round ?? 0 },
          ];
        }
        pkg.gate_passed = null;
        pkg.review = { at: event.at, ...event.receipt };
        // LAN-179: the invocation closes with the receipt it was opened for, so
        // its runtime becomes reclaimable and a correction round has to open a
        // fresh one with a fresh reviewer.
        const invocation = state.reviewInvocations[event.receipt.invocation_id];
        if (invocation) {
          invocation.disposition = event.receipt.result === "clear" ? "completed" : "blocked";
          invocation.result = event.receipt.result;
          invocation.closed_at = event.at;
        }
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
      case "integrated-review": {
        const review = {
          at: event.at,
          event_index: index,
          mode: event.mode,
          head_sha: event.head_sha,
          result: event.result,
          jobs_completed: event.jobs_completed ?? null,
          findings: event.findings ?? [],
          package_heads: event.package_heads,
          sensitive_paths: event.sensitive_paths ?? null,
          report: event.report ?? null,
          invocation_id: event.invocation_id ?? null,
          job_results: event.job_results ?? null,
        };
        state.integratedReviews.push(review);
        const walker = state.reviewInvocations[event.invocation_id];
        if (walker) {
          walker.disposition = event.result === "clear" ? "completed" : "blocked";
          walker.result = event.result;
          walker.closed_at = event.at;
        }
        break;
      }
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
        if (event.package_heads !== undefined || event.head_sha !== undefined) {
          for (const id of Object.keys(event.package_heads ?? {})) {
            state.packages[id].gate_passed = null;
          }
          state.missionVisualApprovals.push({
            at: event.at,
            by: event.approved_by,
            evidence: event.evidence,
            head_sha: event.head_sha,
            package_heads: event.package_heads,
          });
          break;
        }
        const pkg = state.packages[event.package_id];
        pkg.gate_passed = null;
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
        recordEpochSignal(state, "leadAnnotations", {
          event_index: index,
          target_event: event.target_event,
          disposition: event.disposition,
        });
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
        for (const id of event.affected_packages) state.packages[id].gate_passed = null;
        break;
      case "owner-answer": {
        const question = state.questions[event.question_id];
        recordEpochSignal(state, "ownerAnswers", {
          event_index: index,
          question_id: event.question_id,
        });
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
      case "package-gate-passed": {
        const pkg = state.packages[event.package_id];
        pkg.gate_passed = {
          at: event.at,
          head_sha: event.head_sha,
          receipt: event.receipt,
        };
        break;
      }
      case "package-gate-invalidated":
        state.packages[event.package_id].gate_passed = null;
        break;
      case "merge-recorded": {
        const pkg = state.packages[event.package_id];
        pkg.status = "merged";
        pkg.merged = { at: event.at, event_index: index, sha: event.sha, route: event.route };
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
          state.packages[id].gate_passed = null;
        }
        break;
      case "packet-revised":
        state.packet = event.packet;
        for (const pkg of Object.values(state.packages)) pkg.driftStopped = false;
        break;
      case "mission-stopped":
        state.stopped = {
          at: event.at,
          reason: event.reason,
          detail: event.detail,
          phase: event.phase ?? null,
        };
        if (event.reason === "phase-boundary") state.phaseRecycles.push(event.phase);
        break;
      case "mission-resumed":
        state.stopped = null;
        if (state.epoch && !state.epoch.closed && event.lead_id !== state.epoch.lead_id) {
          recordEpochSignal(state, "sessionReplacements", {
            event_index: index,
            lead_id: event.lead_id,
          });
        }
        state.lead = { lead_id: event.lead_id, pid: event.pid, at: event.at };
        break;
      case "lead-epoch-opened": {
        if (state.epoch) state.epochHistory.push(state.epoch);
        if (state.resumeToken && state.resumeToken.token === event.resume_token) {
          state.resumeToken = {
            ...state.resumeToken,
            spent: true,
            spent_at: event.at,
            spent_by: event.epoch_id,
          };
        }
        state.epoch = {
          epoch_id: event.epoch_id,
          mission_id: event.mission_id ?? state.packet?.mission_id ?? null,
          lead_id: event.lead_id,
          session_identity: event.session_identity ?? null,
          context_usage_source: event.context_usage_source ?? null,
          opened_at: event.at,
          opening_event_index: index,
          opening_head: event.opening_head ?? null,
          phase: event.phase,
          scope: event.scope,
          permitted_action_classes: event.permitted_action_classes ?? [],
          exit_condition: event.exit_condition,
          adjustment_budget: EPOCH_LIMITS.adjustmentBudget,
          adjustments: [],
          dossier: event.dossier ?? null,
          dossier_source_index: event.dossier_source_index ?? null,
          bootstrapped: Boolean(event.bootstrapped),
          session_identity_reused: state.epochHistory.some(
            (epoch) => epoch.lead_id === event.lead_id,
          ),
          signals: emptyEpochSignals(),
          boundary: null,
          draining: null,
          closed: null,
        };
        // The fence moves with the assignment. Closing released it; opening
        // takes it, so there is no window in which the mission is unfenced.
        state.lead = { lead_id: event.lead_id, pid: event.pid, at: event.at };
        break;
      }
      case "lead-epoch-boundary-reached":
        state.epoch.boundary = { at: event.at, reason: event.reason, event_index: index };
        break;
      case "lead-epoch-draining":
        state.epoch.draining = {
          at: event.at,
          packages: event.packages ?? [],
          event_index: index,
        };
        state.epoch.boundary = state.epoch.boundary ?? {
          at: event.at,
          reason: "already-active in-scope work is draining",
          event_index: index,
        };
        break;
      case "lead-epoch-adjusted": {
        const adjustment = {
          at: event.at,
          event_index: index,
          kind: event.kind,
          old_scope: event.old_scope ?? null,
          new_scope: event.new_scope ?? null,
          old_exit_condition: event.old_exit_condition ?? null,
          new_exit_condition: event.new_exit_condition ?? null,
          health: event.health ?? null,
          accepted_reason_codes: event.accepted_reason_codes ?? [],
          approved_by: event.approved_by,
          authorization: event.authorization,
          reason: event.reason,
          limit: event.limit ?? null,
          expires_at: event.expires_at ?? null,
          source_epoch_id: event.source_epoch_id,
          target_epoch_id: event.target_epoch_id ?? null,
          correction_package_id: event.correction_package_id ?? null,
          future_waves: event.future_waves ?? null,
        };
        state.epoch.adjustments.push(adjustment);
        if (event.kind === "extend-current") {
          // The prior definition is not rewritten — it stays in the adjustment
          // above — but the live fence moves to what Brian authorized.
          state.epoch.scope = event.new_scope ?? state.epoch.scope;
          state.epoch.exit_condition = event.new_exit_condition ?? state.epoch.exit_condition;
          state.epoch.boundary = null;
          state.epoch.draining = null;
        } else {
          state.epochPlan = {
            futureWaves: event.future_waves ?? [],
            recut: { at: event.at, by: event.approved_by, reason: event.reason },
          };
        }
        break;
      }
      case "lead-epoch-closed":
        state.epoch.closed = {
          at: event.at,
          reason: event.reason,
          resume_token: event.resume_token,
          dossier: event.dossier ?? null,
          dossier_source_index: event.dossier_source_index ?? null,
          event_index: index,
        };
        state.resumeToken = {
          token: event.resume_token,
          epoch_id: state.epoch.epoch_id,
          phase: state.epoch.phase,
          mission_id: state.epoch.mission_id,
          issued_at: event.at,
          spent: false,
        };
        // The outgoing Lead surrenders the fence with its assignment, so the
        // fresh session is not locked out by the dead Lead's heartbeat TTL.
        state.lead = null;
        // Closing this epoch *is* the post-plan recycle. One milestone, one
        // representation: there is no second lifecycle to keep in step.
        //
        // `post-plan-boundary` counts as well as `planning`, because that is
        // the phase an existing Mission 4-shaped journal bootstraps into — and
        // an epoch whose only purpose is to hand the mission on must be able to
        // discharge the very milestone it exists for.
        if (
          ["planning", "post-plan-boundary"].includes(state.epoch.phase) &&
          state.planApproved &&
          !state.phaseRecycles.includes("plan-approved")
        ) {
          state.phaseRecycles.push("plan-approved");
        }
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

/** Project detailed journal state onto the one owner-facing package lifecycle. */
export function packageLifecycle(state, pkg) {
  if (!pkg || pkg.status === "removed") return null;
  if (state.reclaimed.includes(pkg.id)) return "reclaimed";
  if (pkg.status === "merged") return "merged";
  if (pkg.gate_passed?.head_sha === pkg.head_sha) return "gate-passed";
  if (["implemented", "reviewed", "blocked", "owner-decision"].includes(pkg.status)) {
    return "built";
  }
  if (["active", "correction"].includes(pkg.status)) return "dispatched";
  if (state.planApproved) return "approved";
  return "planned";
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
function ordinaryActions(state) {
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
  if (state.planApproved && !state.phaseRecycles.includes("plan-approved")) {
    actions.push({
      action: "recycle-lead",
      detail:
        "Plan approved. Stop at the plan-approved phase boundary; a fresh Lead resumes from the journal and reconciles GitHub before dispatch.",
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
        actions.push({
          action: "dispatch",
          package_id: pkg.id,
          detail: "Dispatch from current main when a worker slot and collision domain are free.",
        });
      }
    }
    if (pkg.status === "blocked" && pkg.review?.result === "blocked") {
      actions.push({
        action: "correction",
        package_id: pkg.id,
        detail: `Resume original worker ${pkg.worker_id}.`,
      });
    }
    if (
      ["implemented", "reviewed"].includes(pkg.status) &&
      !reviewCovers(state, pkg) &&
      pkg.pr_number
    ) {
      const invocation = Object.values(state.reviewInvocations).find(
        (candidate) =>
          candidate.role === "package-reviewer" &&
          candidate.package_id === pkg.id &&
          candidate.head_sha === pkg.head_sha &&
          ["requested", "dispatched"].includes(candidate.disposition),
      );
      if (!invocation) {
        actions.push({
          action: "package-gate",
          package_id: pkg.id,
          detail:
            "Ask the broker for a review runtime. `mission review request` classifies the exact-head diff, generates the capability and job contract, and journals it; the Lead never chooses a port or a lease.",
        });
      } else if (invocation.runtime_state !== "ready") {
        actions.push({
          action: "await-review-runtime",
          package_id: pkg.id,
          detail:
            invocation.runtime_state === undefined
              ? `Invocation ${invocation.invocation_id} has no runtime yet. Run \`mission review provision\`; if capacity is busy it records waiting-for-capacity and the review waits.`
              : `Invocation ${invocation.invocation_id} is ${invocation.runtime_state}${invocation.runtime_reason ? ` (${invocation.runtime_reason})` : ""}. Review waits for infrastructure; it is never narrowed to fit it.`,
        });
      } else if (invocation.disposition === "requested") {
        actions.push({
          action: "reviewer-dispatch",
          package_id: pkg.id,
          detail: `Runtime ${invocation.runtime_id} is healthy at ${invocation.head_sha.slice(0, 12)}. Dispatch one fresh Sonnet reviewer against invocation ${invocation.invocation_id}.`,
        });
      } else {
        actions.push({
          action: "review-receipt",
          package_id: pkg.id,
          detail: `Reviewer ${invocation.agent_id} holds invocation ${invocation.invocation_id}; file the receipt it returns, unchanged.`,
        });
      }
    }
    if (
      ["implemented", "reviewed"].includes(pkg.status) &&
      reviewCovers(state, pkg) &&
      pkg.pr_number &&
      pkg.visual !== "nonvisual" &&
      !approvalCovers(state, pkg)
    ) {
      actions.push({
        action: "owner-walkthrough",
        package_id: pkg.id,
        detail:
          "Present this issue's prepared environment, exact routes and judgments to Brian; record visual-approve at the head he checks.",
      });
    }
    if (
      ["implemented", "reviewed"].includes(pkg.status) &&
      reviewCovers(state, pkg) &&
      approvalCovers(state, pkg)
    ) {
      actions.push(
        pkg.gate_passed?.head_sha === pkg.head_sha
          ? {
              action: "request-merge",
              package_id: pkg.id,
              detail: "Publish the recorded receipt and add the mission-merge label.",
            }
          : {
              action: "merge-gate",
              package_id: pkg.id,
              detail: "Evaluate the guarded merge gate.",
            },
      );
    }
  }

  const live = packages.filter((pkg) => pkg.status !== "removed");
  const allMerged = live.length > 0 && live.every((pkg) => pkg.status === "merged");
  const smoke = finalMissionSmoke(state);
  const smokes = missionWorkflowSmokes(state);
  const walkerInvocation = Object.values(state.reviewInvocations).find(
    (candidate) =>
      candidate.role === "workflow-walker" &&
      ["requested", "dispatched"].includes(candidate.disposition),
  );
  if (allMerged && !smoke && smokes.length === 0 && !walkerInvocation) {
    actions.push({
      action: "workflow-walker",
      detail:
        "After every package is on main, run full verification once, then `mission walker request` — the contract carries every completion criterion in the packet, and the Lead cannot substitute a summary for it.",
    });
  }
  if (walkerInvocation) {
    actions.push(
      walkerInvocation.runtime_state !== "ready"
        ? {
            action: "await-walker-runtime",
            detail: `Walk invocation ${walkerInvocation.invocation_id} is ${walkerInvocation.runtime_state ?? "unprovisioned"}${walkerInvocation.runtime_reason ? ` (${walkerInvocation.runtime_reason})` : ""}. No port and no lease means the walk waits, never that it narrows.`,
          }
        : walkerInvocation.disposition === "requested"
          ? {
              action: "walker-dispatch",
              detail: `Dispatch one fresh Sonnet walker against invocation ${walkerInvocation.invocation_id}; it is distinct from every package reviewer and worker.`,
            }
          : {
              action: "walker-receipt",
              detail: `Walker ${walkerInvocation.agent_id} holds invocation ${walkerInvocation.invocation_id}; file the integrated review it returns.`,
            },
    );
  }
  if (allMerged && smoke?.result === "blocked" && smokes.length === 1) {
    actions.push({
      action: "mission-smoke-correction",
      detail:
        "Create one corrective issue/PR cycle for the smoke findings; do not reopen merged packages or their owner approvals. After it merges, re-run only the affected journeys once.",
    });
  }
  if (
    allMerged &&
    !smoke &&
    smokes.length === 1 &&
    smokes[0].result === "blocked" &&
    !walkerInvocation
  ) {
    actions.push({
      action: "workflow-walker",
      detail:
        "Request the single targeted re-walk. Its contract is derived from the blocked smoke's finding-to-job lineage and may contain only the criteria that correction affected.",
    });
  }
  if (allMerged && smokes.length >= 2 && smokes.at(-1)?.result === "blocked") {
    actions.push({
      action: "owner-adjudication",
      detail:
        "Stop automated correction. The one correction and targeted re-walk still failed; surface the blocker to Brian for disposition.",
    });
  }
  if (allMerged && finalMissionSmokeClear(state)) {
    if (!state.closeout) {
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
  for (const runtime of Object.values(state.reviewRuntimes)) {
    if (runtime.state === "released") continue;
    const owner = state.reviewInvocations[runtime.invocation_id];
    if (owner && ["requested", "dispatched"].includes(owner.disposition)) continue;
    actions.push({
      action: "release-review-runtime",
      detail: `Runtime ${runtime.runtime_id} outlived invocation ${runtime.invocation_id}. Release it and record the reclamation proof; capacity is the broker's to give back, never the Lead's to remember.`,
    });
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

/**
 * What an epoch at its boundary offers Brian: exactly three choices, and the
 * evidence behind them.
 *
 * The recommendation is fixed and is not the bot's judgement — a fresh Lead is
 * always the default, an adjustment always needs Brian, and neither the wording
 * nor the ordering changes with how confident anything feels.
 */
function boundaryActions(state, view) {
  const health = view.health;
  const codes = health.reasons.map((reason) => reason.code);
  const missionId = state.packet?.mission_id ?? "<mission-id>";
  const scope = view.scope?.packages ?? [];
  const nextScope = view.next.scope?.packages ?? [];
  const draining = view.status === "draining" ? (view.draining?.packages ?? []) : [];

  const actions = [
    {
      action: "continue-fresh-lead",
      detail: `Recommended. Epoch ${view.epoch_id} (${view.phase}) reached its boundary — ${view.boundary_reason} Health is ${health.color}${codes.length > 0 ? ` (${codes.join(", ")})` : ""}. Close it to issue the one-use resume token — \`npm run mission -- epoch close ${missionId}\` — then start a new session with a fresh LANCERS_MISSION_LEAD_ID and run \`npm run mission -- resume ${missionId} --token <token>\`. The next epoch the harness derives is ${view.next.phase}${nextScope.length > 0 ? ` over ${nextScope.join(" and ")}` : ""}.`,
      health: {
        color: health.color,
        reasons: health.reasons.map((reason) => ({
          code: reason.code,
          detail: reason.detail,
          event_index: reason.event_index,
        })),
        unknown: health.unknown,
      },
      current_scope: scope,
      next_scope: nextScope,
      draining,
    },
    {
      action: "pause-or-stop-mission",
      detail: `Pause here. \`npm run mission -- stop ${missionId} --reason owner-stop --detail <why>\` checkpoints and stops durably; the journal keeps the frontier and a fresh Lead resumes from it whenever you choose.`,
    },
    {
      action: "adjust-epoch",
      detail: `Owner approval required, and only you can authorize it. \`epoch adjust ${missionId} --extend-current\` keeps this Lead for one adjacent eligible package or one already-active correction cycle — once per epoch, green only unless you record an exception naming ${codes.length > 0 ? `the current reasons (${codes.join(", ")})` : "the current reasons"}, expiring when that work stabilizes or after ${EPOCH_LIMITS.extensionMs / 3_600_000} hours. \`--recut-future\` regroups later waves only. Neither changes the approved packages, requirements, dependency DAG or acceptance criteria, and neither crosses into the integrated walker, cutover or closeout.`,
    },
  ];

  // Work that was already running still finishes; a rotation drains it rather
  // than killing it merely to change Leads.
  const inScope = view.status === "draining" ? draining : scope;
  for (const worker of state.activeWorkers) {
    if (!inScope.includes(worker.package_id)) continue;
    actions.push({
      action: "drain",
      package_id: worker.package_id,
      detail: `Collect ${worker.worker_id}'s ${worker.kind} receipt and its exact-head evidence. No new dispatch is accepted.`,
    });
  }
  const drainable = ["package-gate", "owner-walkthrough", "merge-gate", "request-merge"];
  for (const action of ordinaryActions(state)) {
    if (
      action.package_id &&
      inScope.includes(action.package_id) &&
      drainable.includes(action.action)
    ) {
      actions.push(action);
    }
    // Reclamation is never fenced: giving a resource back is always safe.
    if (action.action === "reclaim") actions.push(action);
  }
  return actions;
}

/**
 * The executable frontier, bounded by the current Lead epoch.
 *
 * Outside a boundary this is exactly what it always was. At a boundary it
 * becomes the three owner choices plus the work that is draining, because
 * nothing else is permitted until Brian decides.
 */
/** @param {MissionState} state @returns {MissionAction[]} */
export function nextActions(state, options = {}) {
  // A finished mission owes nothing, and a stopped one owes a resume. Neither
  // is a boundary to offer Brian three choices about.
  if (!state.initialized || state.stopped || state.terminal || !state.epoch) {
    return ordinaryActions(state);
  }
  const view = epochView(state, options);
  if (view.status === "closed") {
    const missionId = state.packet?.mission_id ?? "<mission-id>";
    return [
      {
        action: "open-epoch",
        detail: `Lead epoch ${view.epoch_id} is closed (${view.boundary_reason}). A different Lead session opens the next (${view.next.phase}) epoch with the one-use token: \`npm run mission -- resume ${missionId} --token ${state.resumeToken?.spent ? "<already spent — the token is one use>" : (state.resumeToken?.token ?? "<token>")}\`.`,
      },
    ];
  }
  if (view.status !== "open") return boundaryActions(state, view);
  const actions = ordinaryActions(state);
  if (view.health.color === "yellow") {
    // Yellow is a recommendation, not a fence. The work below stays available;
    // this says plainly that a fresh Lead is the better move, and that the
    // alternative needs Brian rather than the Lead's own judgement.
    const codes = view.health.reasons.map((reason) => reason.code);
    actions.unshift({
      action: "recycle-lead",
      detail: `Health is yellow (${codes.join(", ")}). A fresh Lead is recommended. An owner-approved extension of epoch ${view.epoch_id} is available instead, but at yellow it must name every current reason as an accepted risk, and only Brian can authorize it.`,
      health: {
        color: view.health.color,
        reasons: view.health.reasons.map((reason) => ({
          code: reason.code,
          detail: reason.detail,
          event_index: reason.event_index,
        })),
        unknown: view.health.unknown,
      },
    });
  }
  return actions;
}

/**
 * The dossier for a fresh Lead, generated from reduced state at this instant.
 */
export function resumeDossier(state, { now = Date.now() } = {}) {
  const view = state.epoch ? epochView(state, { now }) : null;
  return buildResumeDossier(state, { now, epoch: view, actions: nextActions(state, { now }) });
}
